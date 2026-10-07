'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),M=require('./banko_model'),{BankoCoupon,DEFAULTS}=require('./banko_coupon');
class E{constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.className='';this.dataset={};this.attributes={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.open=false;}setAttribute(k,v){this.attributes[k]=String(v);}appendChild(n){this.children.push(n);return n;}append(...nodes){nodes.forEach(n=>this.appendChild(n));}replaceChildren(...nodes){this.children=[];this.append(...nodes);}focus(){}select(){}}
const all=e=>[e,...e.children.flatMap(all)],text=e=>all(e).map(n=>n.textContent).join(' ');
const at='2099-10-05T08:00:00Z';class TestDate extends Date{constructor(v){super(v===undefined?at:v);}static now(){return Date.parse(at);}}
const b=new BankoCoupon({now:()=>new Date(at),getQuotaRemaining:()=>6000}),nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new E());return nodes.get(id);};
const market=(id,value,p,odd)=>({key:id+'|'+value,betId:id,market:'Provider label',selection:value,spec:M.specFor(id,value),modelProbability:p,odd,edgePP:p*100-100/odd,dataScore:80,eligible:p>=.65,reasons:p>=.65?[]:['Deneysel ham model alt sınırı altında']});
const main=market(5,'Over 1.5',.8,1.5),backup=market(8,'Yes',.75,1.6),other=market(1,'Away',.4,2);
const profile={last20:{games:20,scored:1.5,conceded:1},last5:{games:5,scored:1.5,conceded:1},venueSummary:{games:10,scored:1.5,conceded:1},stats:{},rows:[],players:[]};
const candidates=[1,2,3].map(id=>({fixtureId:id,match:'Home '+id+' - Away',league:'Test',home:{name:'Home'},away:{name:'Away'},kickoff:'2099-10-05T19:00:00Z',oddsUpdatedAt:at,capturedAt:at,pick:main,markets:[main,backup,other],profiles:{home:profile,away:profile},risks:[],reasons:[]}));
b.data.sessions=[{id:'session',date:'2099-10-05',createdAt:at,status:'complete',settings:{...DEFAULTS},candidates,coupons:[]}];
const frozen=JSON.stringify(b.data.sessions[0]),requests=[];
const context={window:{},document:{getElementById:node,createElement:t=>new E(t),querySelectorAll:()=>[]},Date:TestDate,Intl,navigator:{},showToast:()=>{},apiFetch:async(url,options)=>{
    requests.push({url,options});if(options){const input=JSON.parse(options.body);if(url.endsWith('/selection'))return b.addSelection(input);if(url.endsWith('/selection-price'))return {selection:b.updateSelectionPrice(input)};throw Error('Unexpected mutation');}
    return b.status('2099-10-05');
}};
vm.runInNewContext(fs.readFileSync('public/banko_choices.js','utf8'),context);vm.runInNewContext(fs.readFileSync('public/banko_coupon_panel.js','utf8'),context);
const rows=()=>node('banko-candidates').children,form=(row,key)=>all(row).find(n=>n.className==='banko-selection-form'&&n.dataset.bankoMarket===key),inputs=f=>all(f).filter(n=>n.tagName==='input'),save=f=>all(f).find(n=>n.tagName==='button'&&n.dataset.bankoSelection);
(async()=>{
    await context.window.fetchBankoCoupon();let f=form(rows()[0],main.key);assert(f);assert(!save(f).disabled);assert.equal(requests.length,1);
    inputs(f)[0].value='1,20';inputs(f)[0].oninput();assert(save(f).disabled);assert.match(text(f),/Girilen oran 1\.20.*aralığı dışında/);assert.equal(requests.length,1,'Typing a real price is local');
    inputs(f)[2].checked=true;inputs(f)[2].onchange();assert(!save(f).disabled);inputs(f)[1].value='<script>kupon</script>';await save(f).onclick();assert.equal(b.data.manualSelections.length,1);assert.equal(b.data.manualSelections[0].playedOdd,1.2);assert(!b.data.manualSelections[0].priceCheck.eligible);assert.match(text(node('banko-manual-list')),/<script>kupon/);assert(!fs.readFileSync('public/banko_coupon_panel.js','utf8').includes('innerHTML'));
    const alt=all(rows()[1]).find(n=>n.className==='banko-alternative-button');alt.onclick({preventDefault(){},stopPropagation(){}});f=form(rows()[1],backup.key);assert(f);await save(f).onclick();assert.equal(b.data.manualSelections[1].origin,'backup');assert.equal(b.data.manualSelections[1].playedOdd,null);
    const detail=all(rows()[2]).filter(n=>n.tagName==='details'&&n.children[0]?.textContent==='Seçim / fiyat kontrolü')[2];assert(detail);assert.equal(detail.children.length,1,'Market controls are lazy, avoiding hundreds of hidden forms');detail.open=true;detail.ontoggle();f=form(detail,other.key);assert(f);assert(save(f).disabled);inputs(f)[2].checked=true;inputs(f)[2].onchange();inputs(f)[1].value='Üç maçlı';await save(f).onclick();assert.equal(b.data.manualSelections.length,3);assert.equal(b.data.manualSelections[2].origin,'analysis');
    const card=node('banko-manual-list').children[0],edit=all(card).find(n=>n.className==='banko-manual-edit'),fields=inputs(edit);fields[0].value='1.44';fields[1].value='Düzeltilmiş';await all(edit).find(n=>n.tagName==='button').onclick();assert.equal(b.data.manualSelections[0].playedOdd,1.44);assert.equal(b.data.manualSelections[0].priceHistory.length,1);
    assert.equal(JSON.stringify(b.data.sessions[0]),frozen,'Local choices never modify saved main markets/coupons/settings');assert.equal(b.requestCount,0);
    b.busy=true;await context.window.fetchBankoCoupon();assert(all(node('banko-candidates')).filter(n=>n.dataset.bankoSelection).every(n=>n.disabled));assert(all(node('banko-manual-list')).filter(n=>n.tagName==='button').every(n=>n.disabled));
    assert(requests.filter(r=>r.options).every(r=>r.url.endsWith('/selection')||r.url.endsWith('/selection-price')));
    console.log('Banko manual panel: main/backup/all-market save, comma odds, no API while typing, explicit warning consent, editable audited price/tag, lazy controls, 3+ selections, inert text and live-busy disable passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
