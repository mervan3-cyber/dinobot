'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const theme=fs.readFileSync('public/panel_theme.js','utf8'),workspace=fs.readFileSync('public/panel_workspace.js','utf8'),css=fs.readFileSync('public/panel_workspace.css','utf8'),html=fs.readFileSync('index.html','utf8');
assert.equal(html,fs.readFileSync('public/index.html','utf8'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'No duplicate DOM IDs');
for(const id of ['panel-view-nav','panel-view-title','panel-menu-toggle','panel-banko-tabs','banko-showroom-section','panel-lab-model','section-signals','section-sharing','section-schedule','section-tariff','section-radar'])assert(ids.includes(id),id);
assert.equal([...html.matchAll(/data-panel-view="/g)].length,6);assert.equal([...html.matchAll(/data-panel-section(?:\s|>)/g)].length,12);
assert(html.indexOf('/panel_theme.js')<html.indexOf('<style>'));assert(html.indexOf('/panel_workspace.css')>html.indexOf('/banko_showroom.css'));
assert(!html.includes('Telegram yalnız ÜST'));assert(html.includes('Telegram V24 Ana · ÜST / MS'));
for(const source of [theme,workspace]){new vm.Script(source);assert(!/apiFetch|\bfetch\(|XMLHttpRequest|WebSocket|setInterval|innerHTML/.test(source),'Presentation helper must not make API calls, poll or interpolate HTML');}
assert(css.includes('[hidden] { display:none!important; }'));assert(css.includes('prefers-reduced-motion'));assert(css.includes('780px'));assert(!/https?:\/\//.test(css));
function runTheme(saved,blocked=false){const buttons=['light','dark'].map(value=>({dataset:{panelThemeChoice:value},attributes:{},listeners:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;}})),writes=[],events={};
    const document={documentElement:{dataset:{},style:{}},readyState:'complete',querySelectorAll:()=>buttons};const window={addEventListener:(k,fn)=>events[k]=fn};
    const localStorage={getItem:()=>{if(blocked)throw Error('Blocked');return saved;},setItem:(k,v)=>{if(blocked)throw Error('Blocked');writes.push([k,v]);}};
    vm.runInNewContext(theme,{window,document,localStorage});return {window,document,buttons,writes,events};}
let t=runTheme(null);assert.equal(t.window.PanelTheme.current(),'light');assert.equal(t.writes.length,0,'No storage write merely by opening');t.buttons[1].listeners.click();assert.equal(t.window.PanelTheme.current(),'dark');assert.equal(t.buttons[1].attributes['aria-pressed'],'true');assert.equal(t.writes.length,1);t.window.PanelTheme.set('bad');assert.equal(t.writes.length,1);
t=runTheme('dark');assert.equal(t.window.PanelTheme.current(),'dark');t.events.storage({key:'mac-yakala-panel-theme-v1',newValue:'light'});assert.equal(t.window.PanelTheme.current(),'light');assert.equal(t.writes.length,0,'Other tab event never writes back');
t=runTheme('broken');assert.equal(t.window.PanelTheme.current(),'light');t=runTheme(null,true);t.buttons[1].listeners.click();assert.equal(t.window.PanelTheme.current(),'dark','Theme still works if storage unavailable');
const context={window:{},document:{readyState:'loading',addEventListener(){},getElementById:()=>null},localStorage:{getItem:()=>'{"view":"coupons","model":"v24gemini","system":"invalid"}'}};
vm.runInNewContext(workspace,context);assert.equal(context.window.PanelWorkspace.state().view,'coupons');assert.equal(context.window.PanelWorkspace.state().system,'sharing');assert.equal(context.window.PanelWorkspace.normalize({view:'evil',banko:'showroom'}).view,'today');assert.equal(context.window.PanelWorkspace.normalize({view:'evil',banko:'showroom'}).banko,'showroom');
console.log('Panel workspace: theme defaults/persistence/blocked storage/cross-tab sync, six views, preserved unique IDs, semantic tabs, mobile CSS, no network/polling/dependencies and normalized local navigation passed.');
