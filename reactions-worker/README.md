# Reactions Worker

Tiny Cloudflare Worker that stores anonymous emoji reaction counts per post in a
KV namespace. Powers the reactions bar rendered by `layouts/partials/reactions.html`.

## One-time deploy

Requires a (free) Cloudflare account.

```sh
cd reactions-worker
npx wrangler login                          # opens browser to authorize
npx wrangler kv namespace create REACTIONS  # prints an id="..."
```

Paste the printed id into `wrangler.toml` (replace `REPLACE_WITH_KV_NAMESPACE_ID`), then:

```sh
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g. `https://reactions.<subdomain>.workers.dev`.

## Wire it into the site

Set that URL as `params.reactions.apiURL` in `hugo.yml`. The emoji list in
`params.reactions.emojis` must match `ALLOWED_EMOJIS` in `src/index.js`.

## Local testing

```sh
npx wrangler dev        # serves the API on http://localhost:8787
```

While testing, set `ALLOWED_ORIGIN = "*"` in `wrangler.toml` (or point
`apiURL` at `http://localhost:8787` in a local Hugo build) so the browser
isn't blocked by CORS.

## Notes

- Counts are read-modify-write on KV, which is eventually consistent. Concurrent
  reactions on the *same* post can occasionally lose an increment — fine for a
  personal blog. For strict atomicity, switch to a Durable Object.
- Abuse control is client-side: the reactions bar records a reaction per emoji
  per post in the visitor's `localStorage`. This deters accidental double-clicks
  but is not spam-proof. Add per-IP rate limiting in the Worker if needed.
