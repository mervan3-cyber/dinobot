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
const {comparison,DEFINITIONS,VERSION}=require('./v23_controls'),{SignalTracker}=require('./signal_tracker');
const tracker=new SignalTracker({filePath:'not-opened-by-this-test'});
const controls=DEFINITIONS.map(d=>({...d,status:d.id==='goal_recent'?'reject':d.mode==='observation'?'observed':'approve',
    reasons:['TEST_REASON'],reasonLabels:['<img src=x> test reason'],values:d.id==='after_goal'?{tag:'SOT_OBSERVED',windowMinutes:4,deltas:{home:{shot:2,sot:1,corner:0},away:{shot:0,sot:0,corner:0}}}:{remainingProbability:0.6}}));
const newSignal={...signal,fixtureId:1,sourceModel:'v21',audit:{version:VERSION,controls},assessment:{...signal.assessment,status:'approve'}};
const paired={...newSignal,sourceModel:'v22',matchedFilters:['A'],settlement:{result:'L'}};
const experiment=comparison([newSignal,paired],rows=>tracker.summary(rows));
context.renderV23GoalLab({...data,experiment,signals:[newSignal,paired],eventCapture:{cachedFixtures:2}});
assert.equal(el('testlab-v23-mode').textContent,'SİNYAL ELENMEZ');
assert.equal(el('testlab-v23-controls').children.length,2,'Independent V21/V22 sections');
assert.equal(el('testlab-v23-summary-rows').children.length,4,'Separate sources, union and legacy');
assert.match(el('testlab-v23-controls').textContent,/Gereksiz eleyeceği kazanan: 1/);
assert.match(el('testlab-v23-controls').textContent,/Önleyebileceği kayıp: 1/);
assert.match(el('testlab-v23-controls').textContent,/Veto eşiği yok/);
assert.match(el('testlab-v23-rows').textContent,/Pencer|Ölçüm penceresi/);
assert.equal(el('testlab-v23-rows').querySelectorAll('img').length,0,'Audit reasons cannot inject HTML');
context.setV23Source('v22:A');assert.equal(el('testlab-v23-controls').children.length,1);assert.equal(el('testlab-v23-rows').children.length,1);
assert.match(el('testlab-v23-rows').children[0].children[0].textContent,/V22 · A/);
context.downloadTestLabExport('v23','json');assert.match(anchors.at(-1).href,/source=v22%3AA/);assert.match(anchors.at(-1).href,/date=2026-09-15/);
context.setV23Source('v21');assert.match(el('testlab-v23-rows').children[0].children[0].textContent,/V21/);
context.setV23Source('v22:C');assert.equal(el('testlab-v23-rows').children[0].children[0].colSpan,10);
context.setV23Source('legacy');assert.equal(el('testlab-v23-controls').children.length,0);
context.setV23Source('all');context.renderV23GoalLab({...data,experiment:comparison([],rows=>tracker.summary(rows)),signals:[]});
assert.equal(el('testlab-v23-controls').children.length,2,'Empty arms remain visible');
assert.match(el('testlab-v23-cohort').textContent,/ilk yeni sinyal bekleniyor/);
console.log('V23 panel DOM: legacy compatibility, independent source/control metrics, reasons and measured values, safe text, A/B/C filter, source/date exports and empty states passed.');
context.renderV23ProfileStatus({enabled:true,readyProfiles:2,partialProfiles:1,failedProfiles:3,expiredProfiles:5,queued:4,callsToday:80,maxCallsPerDay:80,waitReason:'daily_budget_exhausted',lastErrors:[{teamId:1,at:'2026-09-18T10:00:00Z',phase:'current_season',code:'provider_parameters',message:'<img src=x> from required'}]},{});
assert.match(el('testlab-v23-cache').textContent,/Hazır: 2 · Kısmi: 1 · Hatalı: 3/);
assert.match(el('testlab-v23-cache').textContent,/Lab günlük bütçesi doldu/);
assert.match(el('testlab-v23-fetch-errors').textContent,/from required/);
assert.equal(el('testlab-v23-fetch-errors').querySelectorAll('img').length,0);
context.renderV23ProfileStatus({enabled:true,readyProfiles:3,partialProfiles:0,queued:37,callsToday:92,maxCallsPerDay:300,
    earlyCallsToday:0,earlyCallsLimit:75,inheritedUnclassifiedCalls:92,readyFixturePairs:1,lastErrors:[],
    fixtures:[{match:'<img src=x> Home - Away',home:{status:'ok'},away:{status:'profile_not_ready'},closedAt:null}]},{},
    {total:15,bothAtEntry:2,oneAtEntry:1,noneAtEntry:12,judgedAtEntry:1,newCollectorRecords:3});
assert.match(el('testlab-v23-cache').textContent,/Erken hazırlık: 0\/75/);
assert.match(el('testlab-v23-cache').textContent,/iki tarafı hazır: 1/);
assert.match(el('testlab-v23-profile-coverage').textContent,/iki takım geçmişi bulunan: 2\/15/);
assert.match(el('testlab-v23-profile-coverage').textContent,/Gol hesabı yapılabilen: 1/);
assert.match(el('testlab-v23-pairs').textContent,/Ev: Hazır/);
assert.equal(el('testlab-v23-pairs').querySelectorAll('img').length,0);
context.renderV23ProfileStatus({enabled:true,waitReason:'early_budget_exhausted'},{});
assert.match(el('testlab-v23-cache').textContent,/Erken hazırlık alt bütçesi doldu/);
assert.match(el('testlab-v23-profile-coverage').textContent,/eski raporda/);
context.renderV23ProfileStatus({}, {}, null, {archivedRecords:17,fullRecordsInMemory:3,compactIndexRecords:20,error:null});
assert.match(el('testlab-v23-profile-coverage').textContent,/17 kayıt diskte/);
assert.match(el('testlab-v23-profile-coverage').textContent,/RAM'de tam kayıt: 3/);
context.renderV23ProfileStatus({}, {}, null, {error:'archive_write_failed'});
assert.match(el('testlab-v23-profile-coverage').textContent,/tam kayıtlar korundu/);
// Prospective live experiment is separate, including decisions before settlement.
const liveLab=require('./v23_live_lab');
const liveAudit=liveLab.unavailable(signal.sentAt);
liveAudit.controls[0]={...liveAudit.controls[0],status:'approve',reasonLabels:['<img src=x> live reason'],
    values:{windowMinutes:7,goalsNeeded:1,totals:{shot:4,sot:2,corner:0,xg:null},per10:{shot:5.71,sot:2.86,xg:null},deltas:{home:{shot:3,sot:1},away:{shot:1,sot:1}}}};
const liveSignal={...newSignal,audit:{...newSignal.audit,live:liveAudit},settlement:{result:null}};
const liveData={...data,experiment:comparison([liveSignal],r=>tracker.summary(r)),liveExperiment:liveLab.comparison([liveSignal],r=>tracker.summary(r)),
    liveCapture:{cachedFixtures:2,snapshots:8},signals:[liveSignal]};
context.renderV23GoalLab(liveData);
assert.equal(el('testlab-v23-controls').children.length,3,'Old controls plus separate prospective live block');
assert.match(el('testlab-v23-controls').textContent,/Yeni API isteği: 0/);
assert.match(el('testlab-v23-controls').textContent,/1 · 0 \/ 0 · 1 bekleyen/,'Approval visible while outcome still pending');
assert.match(el('testlab-v23-controls').textContent,/V22 · yalnız C/);
assert.match(el('testlab-v23-rows').textContent,/Gerçek pencere: 7 dk/);
assert.match(el('testlab-v23-rows').textContent,/xG \+yok/,'Missing xG never displayed as zero');
assert.equal(el('testlab-v23-rows').querySelectorAll('img').length,0);assert.equal(el('testlab-v23-controls').querySelectorAll('img').length,0);
context.setV23Source('v21');assert.match(el('testlab-v23-controls').textContent,/Canlı üretim deneyi/);
context.setV23Source('v22:C');assert.match(el('testlab-v23-controls').textContent,/V22 · yalnız C/);
context.setV23Source('legacy');assert.equal(el('testlab-v23-controls').children.length,0);
context.setV23Source('all');context.renderV23GoalLab({...data,experiment,signals:[newSignal]});
assert.equal(el('testlab-v23-controls').children.length,2,'Older exports work without new live metadata');
console.log('Live LAB panel: separate cohort, pending approvals, exact observed minutes, missing xG, source filters and safe text passed.');
