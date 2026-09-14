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
for(const [,script]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))vm.runInContext(script,context);
const signal={sentAt:'2026-09-14T21:30:00Z',match:'Home <img src=x> - Away',minute:60,score:'0-0',market:'0.5_UST',odds:1.6,
    dinoProbability:60,selectorV2Probability:65,v18Probability:66,prematchMarketSupport:80,edge:-2.5,
    assessment:{status:'reject',goalsNeeded:1,remainingProbability:0.4,reasonLabels:['Referans destek düşük'],noteLabels:['Kart yok']},
    settlement:{result:'W',finalScore:'1-0'}};
const data={enabled:true,summary:{overall:{total:3,wins:1,losses:1,pending:1}},groups:{approve:{total:1},reject:{total:1,wins:1},insufficient:{total:1}},
    avoidedLosses:0,missedWinners:1,retainedPercent:33.3,assessedCoverage:66.7,
    cache:{cachedTeams:2,queued:0,callsToday:2,maxCallsPerDay:80,enabled:true},signals:[signal]};
context.renderV23GoalLab(data);const el=id=>elements.get(id);
assert.equal(el('testlab-v23-summary-rows').children.length,5);
const cells=el('testlab-v23-rows').children[0].children;assert.equal(cells.length,10);
assert.equal(cells[1].textContent,signal.match);assert.equal(cells[1].children.length,0,'No markup injection');
assert.match(cells[4].textContent,/%60.0 \/ %65.0 \/ %66.0/);assert.equal(cells[6].textContent,'1');
assert.equal(cells[7].textContent,'%40.0');assert.match(cells[8].textContent,/Ret/);assert.equal(cells[8].title,'Kart yok');
assert.match(cells[9].textContent,/Kazandı \/ 1-0/);assert.match(el('testlab-v23-impact').textContent,/Kaçırılan kazanan: 1/);
context.filterTestLabTables('nothing');assert(el('testlab-v23-rows').children[0].hidden);
context.filterTestLabTables('home');assert(!el('testlab-v23-rows').children[0].hidden);
vm.runInContext("testLabDate='2026-09-15'",context);
for(const format of ['json','csv']) { context.downloadTestLabExport('v23',format);assert.match(anchors.at(-1).href,/\/api\/v23-goal-history\/export/);assert.match(anchors.at(-1).href,/date=2026-09-15/); }
context.renderV23GoalLab({...data,signals:[{...signal,assessment:{status:'insufficient',goalsNeeded:null,remainingProbability:null}}]});
assert.equal(el('testlab-v23-rows').children[0].children[7].textContent,'-','Missing reference is not zero');
context.renderV23GoalLab({enabled:false,disabledReason:'history_unreadable'});assert.equal(el('testlab-v23-mode').textContent,'KAPALI');
assert.match(el('testlab-v23-impact').textContent,/history_unreadable/);assert.equal(el('testlab-v23-rows').children[0].children[0].colSpan,10);
context.renderV23GoalLab();assert.equal(el('testlab-v23-mode').textContent,'HAZIR DEĞİL');
console.log('V23 panel DOM: paired/approved/rejected/insufficient metrics, reasons/model/pre columns, safe text, search/date/export and empty/error states passed.');
