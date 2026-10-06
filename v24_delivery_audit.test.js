'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {withDeliveryView,deliveryCheck}=require('./v24_delivery_audit');
const at='2026-10-06T20:00:00Z',later='2026-10-06T20:00:20Z';
const signal={fixtureId:1,market:'2.5_UST',sentAt:at,signalType:'strong',analysis:{eventScore:{status:'approve'}}};
const context={channel:'offline',sharedSignals:[],entries:[],candidates:[]};
const read=(s=signal,c=context)=>withDeliveryView([s],c)[0].deliveryView;
assert.equal(read().status,'unknown','Event/score approval and a LAB result do not prove delivery');
for(const id of [null,undefined,0,-1,'bad'])assert.equal(read(signal,{...context,sharedSignals:[{...signal,telegramMessageId:id}]}).status,'unknown');
assert.equal(read(signal,{...context,sharedSignals:[{...signal,telegramMessageId:9}]}).status,'sent');
const entry={requestedChannel:'offline',createdAt:later,payload:signal,status:'sent',messageId:9};
assert.equal(read(signal,{...context,entries:[entry]}).status,'sent');
assert.equal(read(signal,{...context,entries:[{...entry,requestedChannel:'other'}]}).status,'unknown');
assert.equal(read(signal,{...context,entries:[{...entry,payload:{...signal,market:'3.5_UST'}}]}).status,'other_market');
for(const status of ['sending','uncertain'])assert.equal(read(signal,{...context,entries:[{...entry,status,messageId:null}]}).status,'uncertain');
assert.equal(read(signal,{...context,entries:[{...entry,status:'declined',messageId:null}]}).status,'declined');
const audit=deliveryCheck({status:'blocked',stage:'final-live',codes:['FINAL_SCORE_CHANGED'],checkedAt:later});
const candidate={fixtureId:1,market:'2.5_UST',liveDeliveryCheck:audit};
assert.equal(read(signal,{...context,candidates:[candidate]}).status,'blocked');
assert.match(read(signal,{...context,candidates:[candidate]}).reason,/skor değişti/);
assert.equal(read(signal,{...context,candidates:[{...candidate,liveDeliveryCheck:{...audit,checkedAt:'2026-10-05T00:00:00Z'}}]}).status,'unknown');
assert.equal(read(signal,{...context,candidates:[{...candidate,market:'1.5_UST'}]}).status,'unknown');
const newer={...candidate,liveDeliveryCheck:{...audit,checkedAt:'2026-10-06T20:06:00Z',reason:'Later check'}};
assert.equal(read(signal,{...context,candidates:[newer,candidate]}).reason,'Later check');
assert.equal(read(signal,{...context,entries:[entry],candidates:[newer]}).status,'sent','Actual receipt beats a later observation');
const snapshot=JSON.stringify({signal,context,candidate});read(signal,{...context,candidates:[candidate]});
assert.equal(JSON.stringify({signal,context,candidate}),snapshot,'Read-only annotations never rewrite stored evidence');

const html=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
assert.equal(html,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'));
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
const numberFn=html.slice(html.indexOf('        function testLabNumber('),html.indexOf('        function testLabEdge('));
const rowFn=html.slice(html.indexOf('        function renderV24Rows('),html.indexOf('        function setTestLabModeBadge('));
class Element{constructor(){this.children=[];this.style={};this.textContent='';}replaceChildren(){this.children=[];}appendChild(v){this.children.push(v);}}
const table=new Element();
const vmContext=vm.createContext({document:{getElementById:()=>table,createElement:()=>new Element()},
    formatDateTime:x=>x,formatHistoryDateLabel:x=>x,formatPercent:x=>x==null?'-':'%'+x,testLabEdge:()=>'-',
    marketDisplayName:x=>x,signalResultInfo:()=>({className:'pending',text:'Bekliyor'})});
vm.runInContext(numberFn+rowFn,vmContext);
vmContext.renderV24Rows('table',withDeliveryView([signal],{...context,candidates:[candidate]}),null);
assert.equal(table.children[0].children.length,15,'No extra wide panel column');
const cell=table.children[0].children[11];assert.match(cell.textContent,/TG: Son kontrol reddi/);assert.match(cell.title,/skor değişti/);
vmContext.renderV24Rows('table',[signal],null);assert(!table.children[0].children[11].textContent.includes('TG:'),'Comparison LABs stay untouched');
console.log('V24 delivery view: receipt-only sent state, other market/channel, uncertain/declined safety, old unknown reasons, latest immutable audit and safe compact panel rendering passed.');
