(function(){
    'use strict';
    const $=id=>document.getElementById(id),stateKey='mac-yakala-panel-workspace-v1';
    const views={today:['Bugün','Sistem durumu, tarama ve seçili sinyal görünümünün kısa özeti.'],signals:['Sinyaller','Yalnız Telegram’da başarıyla paylaşılmış kayıtlar.'],live:['Canlı maçlar','Lig kapsamı ve gerçekten gelen canlı istatistikler.'],coupons:['Kuponlar','Maç önü analizleri, manuel seçimler ve paylaşım hazırlığı.'],lab:['LAB / Denetim','Aday kayıtları ve deneyler; Telegram gönderim listesi değildir.'],system:['Sistem','Paylaşım hedefleri, çalışma saatleri, salt okunur kurallar ve günlükler.']};
    const defaults={view:'today',coupon:'banko',banko:'analysis',lab:'models',model:'v24',system:'sharing'};
    const values={view:Object.keys(views),coupon:['banko','htft'],banko:['analysis','coupons','manual','showroom','settings'],lab:['models','audit'],model:['v24','v24gemini','v24focus','v24quiet','v24selective','v24v25','oldtelegram','v22','v21','all'],system:['sharing','schedule','tariff','radar']};
    let state={...defaults},ready=false;
    function normalize(value){const result={...defaults};for(const key of Object.keys(defaults))if(values[key].includes(value?.[key]))result[key]=value[key];return result;}
    try{state=normalize(JSON.parse(localStorage.getItem(stateKey)||'null'));}catch(_){}
    function remember(){try{localStorage.setItem(stateKey,JSON.stringify(state));}catch(_){} }
    function buttons(selector,value,field){document.querySelectorAll(selector).forEach(button=>{const active=button.dataset[field]===value;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;button.classList.toggle('active',active);});}
    function show(node,visible){if(node)node.hidden=!visible;}
    function banko(){document.querySelectorAll('[data-panel-banko-pane]').forEach(node=>{const active=node.dataset.panelBankoPane===state.banko;show(node,active);if(active&&node.hasAttribute('data-panel-open'))node.open=true;});buttons('[data-panel-banko-tab]',state.banko,'panelBankoTab');}
    function models(){document.querySelectorAll('[data-panel-lab-model]').forEach(node=>show(node,state.model==='all'||node.dataset.panelLabModel===state.model));
        const picker=$('panel-lab-model');if(picker)picker.value=state.model;
        document.querySelectorAll('#section-v18-shadow .v18-comparison-grid,#section-v18-shadow .v18-table-grid').forEach(grid=>{grid.classList.toggle('panel-single-model',state.model!=='all');const panes=[...grid.children].filter(n=>n.hasAttribute('data-panel-lab-model'));if(panes.length)show(grid,panes.some(n=>!n.hidden));});}
    function apply(focus=false){
        if(!ready)return;const visible=new Set();
        if(state.view==='today'){visible.add('section-overview');visible.add('section-decision');}
        if(state.view==='signals')visible.add('section-signals');if(state.view==='live')visible.add('section-coverage');
        if(state.view==='coupons')visible.add(state.coupon==='banko'?'section-banko-coupon':'section-coupon-lab');
        if(state.view==='lab')visible.add(state.lab==='models'?'section-v18-shadow':'section-audit');
        if(state.view==='system')visible.add({sharing:'section-sharing',schedule:'section-schedule',tariff:'section-tariff',radar:'section-radar'}[state.system]);
        document.querySelectorAll('[data-panel-section]').forEach(node=>show(node,visible.has(node.id)));
        show($('panel-coupon-tabs'),state.view==='coupons');show($('panel-lab-tabs'),state.view==='lab');show($('panel-system-tabs'),state.view==='system');
        $('panel-view-title').textContent=views[state.view][0];$('panel-view-description').textContent=views[state.view][1];
        document.querySelectorAll('[data-panel-view]').forEach(button=>{const active=button.dataset.panelView===state.view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
        buttons('[data-panel-coupon-tab]',state.coupon,'panelCouponTab');buttons('[data-panel-lab-tab]',state.lab,'panelLabTab');buttons('[data-panel-system-tab]',state.system,'panelSystemTab');banko();models();
        document.documentElement.dataset.panelActiveView=state.view;
        if(focus){$('panel-view-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
    }
    function set(field,value,focus=false){if(!values[field]?.includes(value))return;state[field]=value;remember();apply(focus);}
    function closeMenu(){const nav=$('panel-view-nav');if(nav)nav.classList.remove('panel-menu-open');$('panel-menu-toggle')?.setAttribute('aria-expanded','false');}
    function openView(view,focus=true){set('view',view,focus);closeMenu();}
    function openSection(id){const map={'section-overview':['today'],'section-decision':['today'],'section-signals':['signals'],'section-coverage':['live'],'section-banko-coupon':['coupons','coupon','banko'],'section-coupon-lab':['coupons','coupon','htft'],'section-v18-shadow':['lab','lab','models'],'section-audit':['lab','lab','audit'],'section-sharing':['system','system','sharing'],'section-schedule':['system','system','schedule'],'section-tariff':['system','system','tariff'],'section-radar':['system','system','radar']},route=map[id];if(!route)return;if(route[1])state[route[1]]=route[2];openView(route[0]);}
    function tabKeys(list){list.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const choices=[...list.querySelectorAll('[role="tab"]')].filter(n=>!n.disabled),index=choices.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(event.key==='ArrowRight'?1:-1)+choices.length)%choices.length;choices[next].click();choices[next].focus();});}
    function groupModel(badge,model){const card=$(badge)?.closest('.v18-arm-card');if(card)card.dataset.panelLabModel=model;}
    function tagModels(){for(const [badge,model] of [['testlab-v24-mode-badge','v24'],['testlab-v24-gemini-mode-badge','v24gemini'],['testlab-v24-focus-mode-badge','v24focus'],['testlab-v24-quiet-mode-badge','v24quiet'],['testlab-v24-selective-mode-badge','v24selective'],['testlab-v24-v25-mode-badge','v24v25'],['testlab-old-telegram-mode-badge','oldtelegram'],['testlab-v22-mode-badge','v22'],['testlab-v21-mode-badge','v21']])groupModel(badge,model);
        for(const [id,model] of [['test-lab-v24-rules','v24'],['test-lab-v22-rules','v22'],['test-lab-v21-rules','v21']])if($(id))$(id).dataset.panelLabModel=model;
        for(const [id,model] of [['testlab-v24-rows','v24'],['testlab-v24-gemini-rows','v24gemini'],['testlab-v24-focus-rows','v24focus'],['testlab-v24-quiet-rows','v24quiet'],['testlab-v24-selective-rows','v24selective'],['testlab-v24-v25-rows','v24v25'],['testlab-v22-rows','v22'],['testlab-v21-rows','v21']]){const pane=$(id)?.closest('.v18-table-panel');if(pane)pane.dataset.panelLabModel=model;}}
    function init(){if(ready||!$('panel-view-nav'))return;ready=true;
        const main=document.querySelector('.dashboard-sections');if(main&&$('section-sharing'))main.appendChild($('section-sharing'));
        const tabs=$('panel-banko-tabs'),settings=$('panel-banko-settings');if(tabs&&settings)tabs.parentNode.insertBefore(settings,tabs.nextSibling);
        document.querySelectorAll('[data-panel-view]').forEach(button=>button.addEventListener('click',()=>openView(button.dataset.panelView)));
        for(const [selector,field,data] of [['[data-panel-coupon-tab]','coupon','panelCouponTab'],['[data-panel-banko-tab]','banko','panelBankoTab'],['[data-panel-lab-tab]','lab','panelLabTab'],['[data-panel-system-tab]','system','panelSystemTab']])document.querySelectorAll(selector).forEach(button=>button.addEventListener('click',()=>set(field,button.dataset[data])));
        document.querySelectorAll('[data-panel-shortcut]').forEach(button=>button.addEventListener('click',()=>openView(button.dataset.panelShortcut)));
        $('panel-lab-model')?.addEventListener('change',event=>set('model',event.target.value));
        $('panel-menu-toggle')?.addEventListener('click',()=>{const open=$('panel-view-nav').classList.toggle('panel-menu-open');$('panel-menu-toggle').setAttribute('aria-expanded',String(open));});
        document.querySelectorAll('.panel-tabs[role="tablist"]').forEach(tabKeys);tagModels();apply();document.documentElement.dataset.workspaceReady='true';
    }
    window.PanelWorkspace={init,openView,openSection,state:()=>({...state}),normalize};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
