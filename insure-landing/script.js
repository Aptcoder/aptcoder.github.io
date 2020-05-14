console.log("emi ni milz")
let btn_state = 0;
let menu_btn = document.querySelector('#menu-btn');
let menu = document.querySelector('#mobile-menu')


let setMenuButtonState = function(e){
    if(btn_state === 1){
        menu.style.visibility = 'hidden';
        menu_btn.setAttribute('src','./images/icon-hamburger.svg')
        btn_state = 0;
    }
    else if(btn_state === 0 ){
        menu.style.visibility = 'visible';
        menu_btn.setAttribute('src','./images/icon-close.svg')
        btn_state = 1;
    }
    console.log(e)
    console.log(btn_state)
    
}

menu_btn.addEventListener('click',setMenuButtonState)