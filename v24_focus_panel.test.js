'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Unique panel element IDs');
class Element {
    constructor(tagName='div'){this.tagName=tagName;this.children=[];this._text='';this.value='';this.style={};this.dataset={};this.hidden=false;this.classList={add(){},remove(){},toggle(){}};}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(v){this._text=String(v);this.children=[];}
    get options(){return this.children;}
    replaceChildren(...children){this._text='';this.children=[];children.forEach(c=>this.appendChild(c));}
    appendChild(c){c.parentNode=this;this.children.push(c);return c;}
    append(...children){children.forEach(c=>this.appendChild(c));}
    addEventListener(){} click(){this.clicked=true;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
    querySelectorAll(selector){return this.children.flatMap(c=>[...(selector===c.tagName?[c]:[]),...c.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const elements=new Map(ids.map(id=>[id,new Element()])),anchors=[];
const document={body:new Element('body'),getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],
    createElement(tag){const e=new Element(tag);if(tag==='a')anchors.push(e);return e;}};
const context=vm.createContext({document,window:{location:{protocol:'https:',origin:'https://offline.test'}},URLSearchParams,
    setInterval(){},setTimeout(){},clearTimeout(){},fetch(){throw Error('No external network in panel tests');}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'public/v23_filter_panel.js'),'utf8'),context);
for(const [,script]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))vm.runInContext(script,context);
const summary={total:2,wins:1,losses:1,hitRate:50,roi:-20,averageOdds:1.6};
const sentAt='2026-10-01T10:00:00Z';
const signal={fixtureId:20,signalType:'strong',sentAt,match:'Home <img src=x> - Away',minute:60,score:'1-1',market:'2.5_UST',goalsNeeded:1,
    dinoProbability:50,selectorV2Probability:65,v18Probability:60,edge:-12.5,v16Edge:2.5,odds:1.6,prematchMarketSupport:52,
    analysis:{focusArm:'B25_PRE52',focusArmLabel:'B · 2.5 ÜST · pre ≥ %52',eventScore:{status:'approve'}},
    settlement:{result:'W',finalScore:'2-1'}};
const data={date:'2026-10-01',filter:{date:'2026-10-01',availableDates:['2026-10-01']},
    v24Shadow:{enabled:true,summary:{overall:{total:1,wins:1,losses:0}},signals:[]},
    v24Focus:{enabled:true,summary:{overall:summary},signals:[signal],
        armSummaries:{B25_PRE52:{label:signal.analysis.focusArmLabel,summary}},
        prematchComparison:{startedAt:sentAt,legacyRecordsExcluded:3,
            baseline:{minimumPrematch:32,summary:{total:5,wins:3,losses:2,hitRate:60,roi:5}},
            candidate:{minimumPrematch:52,summary}}}};
const el=id=>elements.get(id);
assert(!elements.has('testlab-v23-card'));
assert(!elements.has('testlab-v24-guard-rows'));
data.oldTelegram={enabled:true,summary:{overall:summary},signals:[{...signal,decisionModel:'V22',signalSources:['V22'],voteCount:3}]};
context.renderTestLabHistory(data);
assert.equal(el('testlab-old-telegram-total').textContent,'2');
assert.equal(el('testlab-old-telegram-rows').children[0].children.length,10);
for(const format of ['json','csv']){
    context.downloadTestLabExport('oldtelegram',format);
    assert.match(anchors.at(-1).href,/\/api\/old-telegram-lab-history\/export/);
}
assert.match(el('testlab-v24-focus-arm-B25_PRE52').textContent,/pre ≥ %52.*2 sinyal.*1 K \/ 1 Y/);
assert.match(el('testlab-v24-focus-pre-baseline').textContent,/pre %32.*yeni dönem.*5 sinyal.*3 K \/ 2 Y/);
assert.match(el('testlab-v24-focus-pre-candidate').textContent,/pre %52.*yeni dönem.*2 sinyal.*1 K \/ 1 Y/);
assert.match(el('testlab-v24-focus-pre-note').textContent,/3 eski kayıt kıyasa katılmadı/);
assert.equal(el('testlab-v24-total').textContent,'1','New focus summaries cannot replace main V24 totals');
const cells=el('testlab-v24-focus-rows').children[0].children;
assert.equal(cells.length,15);
assert.equal(cells[2].textContent,signal.match);assert.equal(cells[2].children.length,0,'No untrusted HTML injection');
assert.equal(cells[5].textContent,signal.analysis.focusArmLabel);
assert.equal(cells[10].textContent,'%52.0');
assert.equal(cells[13].textContent,'✅ Kazandı');
for(const format of ['json','csv']){
    context.downloadTestLabExport('v24Focus',format);
    assert.match(anchors.at(-1).href,/\/api\/v24-focus-history\/export/);
    assert.match(anchors.at(-1).href,/scope=test-lab/);
}
context.renderTestLabHistory({v24Focus:{enabled:true}});
assert.match(el('testlab-v24-focus-pre-candidate').textContent,/güncel backend bekleniyor/);
console.log('V24 focus panel DOM: seventh arm, new-cohort pre32/pre52 summaries, main isolation, safe table labels and JSON/CSV exports passed.');
