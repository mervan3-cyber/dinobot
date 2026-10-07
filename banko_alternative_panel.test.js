'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
class E{
    constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.className='';this.dataset={};this.attributes={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.open=false;}
    setAttribute(k,v){this.attributes[k]=String(v);}appendChild(n){this.children.push(n);return n;}append(...nodes){nodes.forEach(n=>this.appendChild(n));}replaceChildren(...nodes){this.children=[];this.append(...nodes);}focus(){}select(){}
}
const all=e=>[e,...e.children.flatMap(all)],text=e=>all(e).map(n=>n.textContent).join(' ');
function deepFreeze(o){if(o&&typeof o==='object'){Object.values(o).forEach(deepFreeze);Object.freeze(o);}return o;}
async function run(){
    const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new E());return nodes.get(id);};
    const settings={...require('./banko_coupon').DEFAULTS},profile={last20:{games:9,scored:1.5,conceded:1},last5:{games:5,scored:1.2,conceded:1},venueSummary:{games:4,scored:1.5,conceded:1},stats:{},rows:[],players:[]};
    const main={key:'5|Over 1.5',betId:5,market:'Goals Over/Under',selection:'Over 1.5',spec:{kind:'total',direction:'over',line:1.5,period:'full',family:'goals'},odd:1.45,modelProbability:.85,dataScore:75,edgePP:16,eligible:true,reasons:[]};
    const backup={key:'8|Yes',betId:8,market:'Both Teams Score',selection:'Yes',spec:{kind:'btts',yes:true,period:'full',family:'btts'},odd:1.6,modelProbability:.78,dataScore:75,edgePP:15.5,eligible:true,reasons:[]};
    const third={...main,key:'5|Over 2.5',selection:'Over 2.5',spec:{...main.spec,line:2.5},odd:1.7,modelProbability:.7,edgePP:11};
    const blocked={...third,key:'5|Under 4.5',selection:'Under 4.5',spec:{...third.spec,direction:'under',line:4.5},modelProbability:.98,eligible:false,reasons:['Ayak oran aralığı dışında']};
    const alias={...main,key:'105|Over 1.5',betId:105,market:'Alias',spec:{family:'goals',period:'full',line:1.5,direction:'over',kind:'total'},modelProbability:.9};
    const base={fixtureId:1,match:'Home - Away',league:'League',kickoff:'2099-10-05T19:00:00Z',home:{name:'Home'},away:{name:'Away'},pick:main,profiles:{home:profile,away:profile},risks:[],reasons:[],capturedAt:'2099-10-05T08:00:00Z',oddsUpdatedAt:'2099-10-05T07:55:00Z'};
    const candidates=Array.from({length:11},(_,i)=>({...base,fixtureId:i+1,match:'Maç '+(i+1),markets:[alias,blocked,third,backup,main]}));
    candidates[1]={...candidates[1],markets:[main,blocked]};
    candidates[2]={...candidates[2],pick:null,reasons:['Yetersiz veri'],markets:[{...backup,eligible:false,reasons:['Yetersiz veri']}]};
    candidates[3]={...candidates[3],match:'<img src=x onerror=unsafe> - Away',markets:[main,{...backup,selection:'<script>unsafe</script>',spec:{kind:'btts',yes:true,period:'full',family:'btts'}}]};
    const leg={fixtureId:1,match:base.match,kickoff:base.kickoff,league:base.league,pick:main,result:{status:'pending'}};
    const coupon={id:'coupon',originalOdd:1.45,independenceModelProduct:.85,legs:[leg],check:{status:'waiting',history:[]},result:{status:'pending'}};
    const session=deepFreeze({id:'session-1',status:'complete',createdAt:base.capturedAt,settings:{...settings},coupons:[coupon],candidates});
    let state={settings:{...settings,minModelProbability:90},date:'2099-10-05',day:'2099-10-05',api:{used:17,limit:2000,reserve:1500,remaining:6000},summary:{coupons:1,candidates:11,won:0,lost:0,pending:1,profitUnits:0},sessions:[{id:session.id,createdAt:session.createdAt,status:'complete',couponCount:1}],availableDates:['2099-10-05'],session,discovery:{leagues:[]},busy:false,storageError:null,job:null};
    const requests=[],context={window:{},document:{getElementById:node,createElement:t=>new E(t),querySelectorAll:()=>[]},Date,Intl,navigator:{clipboard:{writeText:async()=>{}}},apiFetch:async(url,options)=>{requests.push({url,options});return state;},showToast:()=>{}};
    const source=fs.readFileSync('public/banko_coupon_panel.js','utf8');vm.runInNewContext(fs.readFileSync('public/banko_choices.js','utf8'),context);vm.runInNewContext(source,context);
    const button=r=>all(r).find(n=>n.className==='banko-alternative-button'),box=r=>all(r).find(n=>n.className==='banko-alternative'),rows=()=>node('banko-candidates').children;
    const click=b=>{let prevented=0,stopped=0;b.onclick({preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(prevented,1);assert.equal(stopped,1);};
    const snapshot=JSON.stringify(session);
    await context.window.fetchBankoCoupon();assert.equal(rows().length,10);assert.equal(all(node('banko-candidates')).filter(n=>n.className==='banko-alternative-button').length,10,'Every displayed analysis, not only coupon legs, gets the button');
    assert(box(rows()[0]).hidden);assert.equal(button(rows()[0]).attributes['aria-expanded'],'false');
    const before=requests.length;click(button(rows()[0]));assert.equal(requests.length,before,'Showing an alternative spends no HTTP/provider request');assert.equal(state.api.used,17);assert(rows()[0].open);assert(!box(rows()[0]).hidden);assert.equal(button(rows()[0]).attributes['aria-expanded'],'true');
    assert.match(text(box(rows()[0])),/MAÇ · KG · VAR/,'Highest eligible distinct option, not higher-scoring alias or rejected market');assert.match(text(box(rows()[0])),/1\.60.*78\.0.*75\/100.*15\.5/);assert.match(text(box(rows()[0])),/aynı veri\/oran\/model şartlarını/);assert.match(text(box(rows()[0])),/Canlı yenileme veya yeni maç önü kontrolü yapılmadı/);assert(!/sigortasıdır/.test(text(box(rows()[0]))));
    assert.equal(JSON.stringify(session),snapshot,'Deep-frozen markets, original picks, coupons and results untouched');
    click(button(rows()[0]));assert(box(rows()[0]).hidden);click(button(rows()[0]));assert.match(text(box(rows()[0])),/MAÇ · KG · VAR/,'Repeated clicks toggle the same backup, not random predictions');
    click(button(rows()[1]));assert.match(text(box(rows()[1])),/Uygun alternatif yok.*eşikler düşürülmedi/);click(button(rows()[2]));assert.match(text(box(rows()[2])),/Uygun alternatif yok.*Bu maç PAS/);
    click(button(rows()[3]));assert.match(text(box(rows()[3])),/MAÇ · KG · VAR/,'Verified spec controls the label, not untrusted provider selection text');assert(!source.includes('innerHTML'));
    context.window.bankoPage(1);assert.equal(rows().length,1);assert(button(rows()[0]));click(button(rows()[0]));assert.match(text(box(rows()[0])),/MAÇ · KG · VAR/,'Non-coupon fixture on page two has an alternative');
    context.window.bankoPage(-1);assert(!box(rows()[0]).hidden,'Open backup survives pagination');await context.window.fetchBankoCoupon();assert(!box(rows()[0]).hidden,'Open backup survives status refresh');
    node('banko-search').value='Maç 2';context.window.bankoSearch();assert.equal(rows().length,1);assert.match(text(box(rows()[0])),/Uygun alternatif yok/);node('banko-search').value='';context.window.bankoSearch();
    state={...state,session:{...session,id:'session-2'}};await context.window.fetchBankoCoupon();assert(box(rows()[0]).hidden,'Another scan must not inherit open choice state');
    let caseNumber=0;const only=(markets,pick=main,saved=settings)=>{state={...state,session:{...session,id:'case-'+(++caseNumber),settings:saved,candidates:[{...base,pick,markets}]}};};
    async function checkRejected(m,saved=settings){only([main,m],main,saved);await context.window.fetchBankoCoupon();click(button(rows()[0]));assert.match(text(box(rows()[0])),/Uygun alternatif yok/);}
    await checkRejected({...backup,modelProbability:null});await checkRejected({...backup,modelProbability:NaN});await checkRejected({...backup,modelProbability:1.2});await checkRejected({...backup,odd:1.2});await checkRejected({...backup,odd:3});await checkRejected({...backup,modelProbability:.6});await checkRejected({...backup,edgePP:-1});await checkRejected({...backup,spec:null});await checkRejected({...backup,eligible:undefined});await checkRejected({...backup,reasons:['Eksik veri']});await checkRejected({...backup,edgePP:null});await checkRejected({...backup,dataScore:null});await checkRejected(backup,{...settings,marketFamilies:['goals']});
    only([main,backup],null);await context.window.fetchBankoCoupon();click(button(rows()[0]));assert.match(text(box(rows()[0])),/Bu maç PAS/,'Even malformed legacy PAS cannot force a prediction');
    // Same probability/data score tie-break stays consistent with the main model's ranking.
    only([main,{...third,modelProbability:.78,dataScore:75},backup]);await context.window.fetchBankoCoupon();click(button(rows()[0]));assert.match(text(box(rows()[0])),/MAÇ · TOPLAM gol · 2\.5 ÜST/);
    only([main,backup]);state={...state,busy:true,job:{id:'live-wait',status:'waiting-live',processed:1,total:2,message:'Canlı bekliyor'}};await context.window.fetchBankoCoupon();const pausedRequests=requests.length;click(button(rows()[0]));assert.equal(requests.length,pausedRequests);assert.match(text(box(rows()[0])),/Yedek seçenek/,'Local alternative also works while Banko waits for live');assert(node('banko-scan').disabled);
    assert.equal(JSON.stringify(session),snapshot);assert(requests.every(r=>!r.options),'No action/settings writes were made by alternative UI');
    console.log('Banko alternatives: all analysis fixtures, distinct ranked backup, PAS/no-backup, saved thresholds, immutable coupons, zero API, pagination/refresh/version state, XSS safety and live-pause display passed.');
}
module.exports=run;
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
