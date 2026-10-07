(function(){
    'use strict';
    const key='mac-yakala-panel-theme-v1',html=document.documentElement;
    const valid=value=>value==='light'||value==='dark';
    function stored(){try{const value=localStorage.getItem(key);return valid(value)?value:'light';}catch(_){return 'light';}}
    function sync(){document.querySelectorAll('[data-panel-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.panelThemeChoice===html.dataset.panelTheme)));}
    function set(value,remember=true){if(!valid(value))return;html.dataset.panelTheme=value;html.style.colorScheme=value;sync();if(remember)try{localStorage.setItem(key,value);}catch(_){} }
    set(stored(),false);
    function bind(){document.querySelectorAll('[data-panel-theme-choice]').forEach(button=>button.addEventListener('click',()=>set(button.dataset.panelThemeChoice)));sync();}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
    window.addEventListener('storage',event=>{if(event.key===key)set(valid(event.newValue)?event.newValue:'light',false);});
    window.PanelTheme={set,current:()=>html.dataset.panelTheme};
})();
