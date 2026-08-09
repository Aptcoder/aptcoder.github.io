+++
title = 'I built a tiny taint analyser for Python'
date = 2026-08-09T10:51:00+01:00
draft = false
ShowToc = true
+++

As part of my bachelor's in computer science, I learnt about the risks of trusting user input without checking it first. It was a fact I knew, not a problem I'd actually felt.

That changed recently. I had to do some research into security approaches, especially the less commonly discussed ones, and while doing that I learnt about the importance of ensuring the data you process as input from users is safe for such processing and similarly that the data you display to users is safe for display. Ensuring this is typically achieved using a process of static (or dynamic) analysis called "Taint analysis"

For some more clarity, imagine a login form where the username field gets dropped straight into a SQL query without being escaped, so a crafted input can rewrite the query and dump the whole users table. Or imagine a user's bio field containing a script tag, and that field getting rendered straight into a page without being escaped first, so now that data is running in someone else's browser as if it were part of your app. Different sinks, same shape of problem: data comes from somewhere untrusted and ends up somewhere dangerous, without anyone checking what happened in between.

The two ends of that flow have names. The place data comes in from is called a **source**, and the place it ends up doing damage is called a **sink**. In the first example, the username field is the source and the SQL query is the sink; in the second, the bio field is the source and the HTML render is the sink.

That's the whole framing behind taint analysis: mark data as tainted at the sources, follow it through the program, and raise a flag if it reaches a sink without being cleaned up along the way.

In this blog post, I'll talk about building a taint analyser for a small subset of Python. It utilises Python's ast, so a basic idea of parsing and abstract syntax trees (AST) would be needed to follow this post.

## How it works

The taint analyser built uses static analysis. It iterates through the syntax tree of a program and tracks sinks and sources.

### 1. Parsing the code into a tree

To keep things simple, I used the Python ast library, which generates the semantic tree of a given Python code. Having the tree means the work is simplified to iterating the nodes in the tree to identify where sources are, note them, and flag whenever they're present at a sink. Here's what the tree generated looks like when printed, for a simple line like `x = input()`:

```python
Module(
    body=[
        Assign(
            targets=[
                Name(id='x', ctx=Store())],
            value=Call(
                func=Name(id='input', ctx=Load()),
                args=[],
                keywords=[]))],
    type_ignores=[])
```

Even without knowing the ast module, the shape is readable: an assignment node, with a target name `x`, and a value that's a call to `input`. That's the whole picture the analyser works with, just names, calls, and assignments, connected as a tree.

### 2. Marking sources and sinks

Marking the source and sink calls comes down to recognising specific function calls by name as you walk the tree. A call node in the AST doesn't just hand you a clean string like "input" though, it can be a Name (for something like input(...)) or an Attribute (for something like os.system(...)), so I wrote a small helper, call_name, that normalises both shapes into one string:

```python
def call_name(node):
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return None
```

With that in place, sources and sinks are just two sets of strings I check against:

```python
SOURCES = {"input"}
SINKS = {"eval", "exec", "system"}
```

sys.argv gets handled separately since it's not a call, it's a subscript on an attribute (sys.argv[1]), so it needs its own structural check rather than a name lookup.

### 3. The tainted set

The whole analyser really comes down to one piece of state: a set of variable names that are currently tainted. Every time I visit an assignment, I decide whether the name being assigned to belongs in that set:

```python
def visit_Assign(self, node):
    target = node.targets[0].id
    if is_tainted_expr(node.value):
        self.tainted.add(target)
    else:
        self.tainted.discard(target)
```

The discard matters as much as the add. If a variable was tainted and then gets overwritten with something clean, it needs to leave the set, otherwise, the analyser would keep flagging a variable long after it stopped being dangerous.

### 4. Is this expression tainted?

This is the one function doing most of the actual thinking. Given any expression node, it needs to answer a single question: could this evaluate to something tainted?

```python
def is_tainted_expr(node):
    if isinstance(node, ast.Call):
        if call_name(node) in SOURCES:
            return True
        return any(is_tainted_expr(arg) for arg in node.args)
    if isinstance(node, ast.Name):
        return node.id in tainted
    if isinstance(node, ast.BinOp):
        return is_tainted_expr(node.left) or is_tainted_expr(node.right)
    return False
```

Because it's recursive, it doesn't need a special case for depth. Something like eval(str(input())) isn't handled by any explicit rule for "calls wrapped in calls," it just falls out of the function calling itself: is_tainted_expr on the outer call checks its argument, which is another call, so it recurses, finds input(), and the True bubbles all the way back up.

### 5. Catching the sink

With the tainted set and is_tainted_expr in place, catching a sink is almost anticlimactic. Every time the walker hits a Call node, it checks the function name against SINKS, and if it matches, checks whether any argument is tainted:

```python
def visit_Call(self, node):
    if call_name(node) in SINKS:
        if any(is_tainted_expr(arg) for arg in node.args):
            print(f"Tainted data reaches sink at line {node.lineno}")
```

That's the whole loop: mark at the source, track through assignment, check at the sink. Everything else in the analyser is really about deciding what counts as "tracking" when the code gets less straightforward than a single assignment, which is where the harder decisions come in.

## The decisions that actually mattered

### 1. if/else: taking the union of both branches

The tainted set works fine as long as code runs top to bottom in a straight line. The moment you hit an if, that stops being true, because now there are two possible futures, and by the time you reach the code after the if, you don't actually know which one happened.

```python
if something:
    x = input()
else:
    x = "safe"
print(x)
```

Is x tainted at that print? Depends entirely on which branch ran, and a static analyser never runs the code, so it can't know. I had to pick a rule anyway, and the rule I picked was: assume the worst. Walk both branches, and whatever ends up tainted in either one stays tainted after the if. In the example above, x is tainted in the if branch and clean in the else, so after merging, x is tainted, and the analyser flags the print.

That's technically wrong here, since if the else branch is the one that actually ran, x was never dangerous. But wrong in that specific direction is the safer kind of wrong. I'd rather the analyser nag me about something that turns out to be fine than stay quiet about something that turns out not to be. Getting this backward, dropping a warning because one branch happened to be clean, is how a real taint analyser misses a real bug.

### 2. Function calls: not looking inside them

The other decision was about what happens when tainted data gets passed into a function. The honest answer is: nothing happens. I don't look inside the function at all.

```python
def wrap(val):
    return val

x = input()
y = wrap(x)
eval(y)
```

A proper analyser would follow x into wrap, see that val comes back out unchanged as the return value, and figure out that y is tainted too. Mine doesn't do any of that. It treats every function call as a black box, and a black box that touched tainted data stays tainted going forward, no matter what actually happens inside.

This was less a design decision and more a line I drew to keep the project finishable. Actually tracking taint through a function call means tracking it across the call boundary, into the function's own scope, through its own returns, back out again, and doing that for functions that might be defined anywhere in the file, called in any order, maybe even recursively. That's a real feature, not an afternoon's work, and it was outside what I set out to build. So the rule became: taint in, taint out, no exceptions, and I didn't try to reason about what happens in between.

## Where it's wrong on purpose

### 1. False positive: the sanitiser that isn't

Once the analyser was working, I went looking for ways to break it, and the first one I found came from something that looks like good practice:

```python
x = input()
x = sanitize(x)
eval(x)
```

To a person reading this, sanitize is clearly meant to make x safe again, and if it actually does its job, the eval on the next line is fine. But the analyser has no idea what sanitize does. It's a function call, and per the rule from the section above, taint in, taint out, no exceptions. x goes in tainted, so x comes out tainted, and the analyser flags this exactly the same way it would flag eval(input()) directly.

This is a false positive, and it's a direct consequence of the black-box decision, not a separate bug. The analyser isn't wrong about what it can see; it genuinely cannot tell the difference between a function that sanitises its input and one that does nothing at all, or one that makes things worse. Fixing this properly means the analyser would need to know, ahead of time, which functions are sanitisers, which is its own can of worms since that list would have to be hand-maintained and would immediately be out of date the moment someone wrote a new one.

### 2. False negative: the loop that never runs

The second one is worse, because it's not the analyser being overly cautious; it's the analyser missing something real.

```python
x = "safe"
for i in range(0):
    x = input()
eval(x)
```

Here, the loop body never executes, so x really is safe by the time it reaches eval. But I don't handle loops at all in this analyser; loops were one of the things I explicitly cut to keep the scope small. So this snippet either gets skipped entirely or handled in a way that has nothing to do with what the loop would actually do at runtime, and either way, the analyser isn't reasoning about it correctly.

The reason I'd call this the worst of the two problems is what each one costs you. A false positive wastes your time: you get flagged on something safe, you check it, you move on. A false negative costs you nothing, right up until the moment it costs you everything, because the whole point of a taint analyser is to be the thing that catches what you missed, and a tool that stays quiet about a real problem is worse than no tool at all, since it gives you false confidence instead of no confidence.

## What I got out of it

Working on this project was my introduction to static analysis. Actually building it taught me that protecting a system doesn't always mean catching a mistake the moment you write it, sometimes it means going back over code that already exists and catching the problem proactively, before it's ever run against something that matters. A natural next step from here is dynamic analysis, which looks at the states of a program as it actually runs rather than reasoning about it ahead of time. There's a whole space of program-analysis techniques past this one too, mutation testing being one I ran into while researching this. I hope you found this as interesting as I did.

## Further reads/references

- [Taint Analysis: Key Concepts Explained](https://www.qt.io/software-insights/taint-analysis-key-concepts-explained)
- [Static vs Dynamic Code Analysis](https://vfunction.com/blog/static-vs-dynamic-code-analysis/)
- [Python ast documentation](https://docs.python.org/3/library/ast.html)