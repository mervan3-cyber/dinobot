'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
assert.equal(html,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
class Element {
    constructor(tagName='div'){this.tagName=tagName;this.children=[];this._text='';this.value='';this.style={};this.dataset={};this.hidden=false;this.classList={add(){},remove(){},toggle(){}};}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(v){this._text=String(v);this.children=[];}
    get options(){return this.children;}
    replaceChildren(...children){this._text='';this.children=[];children.forEach(c=>this.appendChild(c));}
    appendChild(c){c.parentNode=this;this.children.push(c);return c;}
    append(...children){children.forEach(c=>this.appendChild(c));}
    addEventListener(){}click(){this.clicked=true;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
    querySelectorAll(selector){return this.children.flatMap(c=>[...(selector===c.tagName||selector===`.${c.className}`?[c]:[]),...c.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const elements=new Map(ids.map(id=>[id,new Element()])),anchors=[];
const document={body:new Element('body'),getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],
    createElement(tag){const e=new Element(tag);if(tag==='a')anchors.push(e);return e;}};
const context=vm.createContext({document,window:{location:{protocol:'https:',origin:'https://offline.test'}},URLSearchParams,
    setInterval(){},setTimeout(){},clearTimeout(){},fetch(){throw Error('Live network forbidden');}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'public/v23_filter_panel.js'),'utf8'),context);
for(const [,script]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))vm.runInContext(script,context);
const signal={sentAt:'2026-09-13T10:00:00Z',match:'Home <img src=x> - Away',minute:35,score:'1-0',market:'2.5_UST',
    matchedFilters:['A','B'],goalsNeeded:2,dinoProbability:59,selectorV2Probability:61,v18Probability:62,voteCount:3,
    decisionModel:'consensus',decisionEdge:-3.5,prematchMarketSupport:45,odds:1.6,settlement:{result:'W',finalScore:'2-1'}};
const data={filter:{date:'2026-09-13',availableDates:['2026-09-13']},
    v21Shadow:{enabled:true,summary:{overall:{total:8,wins:6,losses:2}},signals:[]},
    v22Shadow:{enabled:true,startedAt:signal.sentAt,summary:{updatedAt:signal.sentAt,overall:{total:1,wins:1,losses:0,hitRate:100,roi:60,averageOdds:1.6}},
        signals:[signal],filterSummaries:{A:{total:1,wins:1,losses:0,hitRate:100},B:{total:1,wins:1,losses:0,hitRate:100},C:{total:0}}}};
const el=id=>elements.get(id);
context.renderTestLabHistory(data);
const cells=el('testlab-v22-rows').children[0].children;
assert.equal(cells.length,13);assert.equal(cells[1].textContent,signal.match);assert.equal(cells[1].children.length,0,'No HTML injection');
assert.equal(cells[3].textContent,'1-0');assert.equal(cells[4].textContent,'A + B');assert.equal(cells[5].textContent,'2');
assert.equal(cells[6].textContent,'2.5 ÜST');assert.match(cells[7].textContent,/3\/3 onay/);assert.match(cells[7].textContent,/V18 %62/);
assert.equal(cells[8].textContent,'%-3.5');assert.equal(cells[9].textContent,'%45.0');assert.equal(cells[10].textContent,'1.600');
assert.equal(cells[11].textContent,'✅ Kazandı');assert.equal(cells[12].textContent,'2-1');
assert.equal(el('testlab-v21-total').textContent,'8');assert.equal(el('testlab-v22-total').textContent,'1');
assert.match(el('testlab-v22-filter-A').textContent,/1 sinyal/);assert.match(el('testlab-v22-filter-C').textContent,/0 sinyal/);
context.filterTestLabTables('no-such-match');assert.equal(el('testlab-v22-rows').children[0].hidden,true);
context.filterTestLabTables('home');assert.equal(el('testlab-v22-rows').children[0].hidden,false);
context.renderTestLabRows('testlab-v22-rows',[],{label:'V22',v22:true},'2026-09-13');assert.equal(el('testlab-v22-rows').children[0].children[0].colSpan,13);
(async()=>{
    context.apiFetch=async()=>data;await context.changeTestLabDate('2026-09-13');
    for(const format of ['json','csv']){
        context.downloadTestLabExport('v22',format);const href=anchors.at(-1).href;
        assert.match(href,/\/api\/v22-union-shadow-history\/export/);assert.match(href,/scope=test-lab/);assert.match(href,/date=2026-09-13/);
    }
    context.downloadTestLabExport('v21','json','previous');assert.match(anchors.at(-1).href,/cohort=previous/);
    context.renderTestLabHistory({v22Shadow:{enabled:false}});assert.equal(el('testlab-v22-mode-badge').textContent,'KAPALI');
    context.renderTestLabHistory({});assert.equal(el('testlab-v22-mode-badge').textContent,'HAZIR DEĞİL');
    assert.match(el('testlab-v22-start-note').textContent,/geçmiş sonuçlar aktarılmaz/);
    console.log('V22 rendered DOM, A/B labels, score/model/pre columns, search/date/export, empty/disabled states and V21 preservation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
