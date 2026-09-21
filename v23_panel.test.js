'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
assert.equal(html,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
class Element {
    constructor(tagName='div'){this.tagName=tagName;this.children=[];this._text='';this.style={};this.dataset={};this.hidden=false;this.classList={add(){},remove(){},toggle(){}};}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(v){this._text=String(v);this.children=[];}
    get options(){return this.children;}
    replaceChildren(...children){this._text='';this.children=[];children.forEach(c=>this.appendChild(c));}
    appendChild(c){c.parentNode=this;this.children.push(c);return c;}append(...children){children.forEach(c=>this.appendChild(c));}
    addEventListener(){}click(){}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
    querySelectorAll(selector){return this.children.flatMap(c=>[...(selector===c.tagName?[c]:[]),...c.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const elements=new Map(ids.map(id=>[id,new Element()])),anchors=[];
const document={body:new Element('body'),getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],
    createElement(tag){const el=new Element(tag);if(tag==='a')anchors.push(el);return el;}};
const context=vm.createContext({document,window:{location:{protocol:'https:',origin:'https://offline.test'}},URLSearchParams,
    setInterval(){},setTimeout(){},clearTimeout(){},fetch(){throw Error('No live requests');}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'public/v23_filter_panel.js'),'utf8'),context);
for(const [,script]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))vm.runInContext(script,context);
const {FilterLab,evaluate}=require('./v23_filter_lab');
const lab=new FilterLab({filePath:'not-opened-by-panel-test'});
const at='2026-09-21T12:30:00.000Z';
for(const [source,market,score,minute,result]of [
    ['v21','1.5_UST','0-0',35,'L'],['v21','1.5_UST','0-1',61,'W'],['v21','0.5_UST','0-0',75,null],
    ['v22','0.5_UST','0-0',74,'W'],['v22','1.5_UST','0-1',73,'L'],['v22','1.5_UST','1-0',79,null]]) {
    const id=lab.data.signals.length+1;
    const s={fixtureId:id,sentAt:at,match:'Home <img src=x> - Away',minute,score,market,odds:1.6,sourceModel:source,
        matchedFilters:source==='v22'?(score==='1-0'?['A','C']:['C']):[],
        settlement:{result,profit:result==='W'?.6:result==='L'?-1:null,finalScore:result?'1-0':null}};
    const mac={fixture_id:id,dakika:minute,skor:score,status_short:'2H',stats_received_at:at,stats_identity_verified:true,
        home_shot:4,home_sot:1,away_shot:6,away_sot:1,_v23EventsAt:at,_v23Events:[]};
    s.filterAudit=evaluate({signal:s,mac,sourceModel:source,matchedFilters:s.matchedFilters});
    lab.data.signals.push(s);
}
lab.data.startedAt=at;
const data={...lab.metadata(),signals:lab.data.signals},el=id=>elements.get(id);
context.renderV23GoalLab(data);
assert.equal(el('testlab-v23-summary-rows').children.length,2);
assert.equal(el('testlab-v23-controls').children.length,2);
const tables=el('testlab-v23-controls').querySelectorAll('tbody');
assert.equal(tables[0].children.length,3);assert.equal(tables[1].children.length,4,'Only score consistency plus 2 / 3 new tests');
assert.match(el('testlab-v23-controls').textContent,/Engellenen kayıp/);
assert.match(el('testlab-v23-controls').textContent,/Kaçırılan kazanan/);
assert.match(el('testlab-v23-controls').textContent,/bekleyen/);
assert.match(el('testlab-v23-controls').textContent,/Diğer marketler aynen korunur/);
assert.match(el('testlab-v23-controls').textContent,/A\/B’den de geçenler korunur/);
assert.equal(el('testlab-v23-rows').children[0].children.length,6);
assert.equal(el('testlab-v23-rows').children[0].children[1].textContent,'Home <img src=x> - Away');
assert.equal(el('testlab-v23-rows').querySelectorAll('img').length,0);
assert.match(el('testlab-v23-rows').textContent,/Toplam 10 şut \/ 2 isabet/);
assert.match(el('testlab-v23-rows').textContent,/oran %20.0/);
assert.match(el('testlab-v23-storage').textContent,/ek API: 0/);
for(const text of ['Gol referansı','Son ~5 dakika','Yeni xG üretimi','Takım geçmişi hazır mı?'])assert(!html.includes(text),'Retired UI removed: '+text);
context.setV23Source('v21');assert.equal(el('testlab-v23-controls').children.length,1);assert.equal(el('testlab-v23-rows').children.length,3);
context.setV23Source('v22:A');assert.equal(el('testlab-v23-rows').children.length,1);
assert.match(el('testlab-v23-rows').textContent,/A\+C/);
context.filterTestLabTables('nothing');assert(el('testlab-v23-rows').children[0].hidden);
context.filterTestLabTables('home');assert(!el('testlab-v23-rows').children[0].hidden);
vm.runInContext("testLabDate='2026-09-21'",context);
for(const format of ['json','csv']) {
    context.downloadTestLabExport('v23',format);assert.match(anchors.at(-1).href,/source=v22%3AA/);assert.match(anchors.at(-1).href,/date=2026-09-21/);
    context.downloadRetiredV23(format);assert.match(anchors.at(-1).href,/v23-retired-history\/export/);assert(!anchors.at(-1).href.includes('date='));
}
context.setV23Source('all');context.renderV23GoalLab({...data,signals:[]});
assert.equal(el('testlab-v23-rows').children[0].children[0].colSpan,6);
context.renderV23GoalLab({...data,enabled:false,disabledReason:'history_unreadable'});
assert.equal(el('testlab-v23-mode').textContent,'KAPALI');assert.match(el('testlab-v23-impact').textContent,/history_unreadable/);
context.renderV23GoalLab();assert.equal(el('testlab-v23-mode').textContent,'HAZIR DEĞİL');
console.log('New filter panel DOM: exactly 2/3 independent tests + score, source/pending/ROI details, no retired clutter, escaped text, exports/search/empty/error states passed.');
