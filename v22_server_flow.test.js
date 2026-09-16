'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {createRequire}=require('module');
const localRequire=createRequire(path.join(__dirname,'server.js'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dino-v22-flow-'));
const routes=new Map(),deliveries=[],xDeliveries=[];
const app={use(){},get(route,handler){for(const r of [].concat(route))routes.set(r,handler);},post(){},listen(){}};
function express(){return app;}express.json=express.static=()=>()=>{};
const scores={v16:61,v18:62};
const external={dotenv:{config(){}},express,cors:()=>()=>{},
    axios:{create:()=>({get(){throw Error('Live network forbidden');}})},
    'node-telegram-bot-api':class{async sendMessage(channel,text,options){deliveries.push({channel,text,options});return {message_id:deliveries.length};}},
    './x_publisher':{createXPublisher:()=>async payload=>{xDeliveries.push(payload);return {id:String(500+xDeliveries.length)};}},
    '@google/generative-ai':{GoogleGenerativeAI:class{}},child_process:{spawn(){throw Error('Live Python forbidden');}},
    './dino_selector_v2':{MODEL:{version:'test16',policy:{defaultMinimumOdd:1.5}},scoreMarket:()=>({selectorProbability:scores.v16,selectorRawProbability:scores.v16}),policyCheck:()=>({eligible:true})},
    './dino_selector_v18':{MODEL:{version:'test18'},scoreMarket:()=>({v18Probability:scores.v18,v18Edge:0})}};
const context=vm.createContext({require:name=>Object.hasOwn(external,name)?external[name]:localRequire(name),__dirname:root,
    process:{env:{TELEGRAM_BOT_TOKEN:'offline',TELEGRAM_CHANNEL_ID:'offline',DINO_CORE_SHADOW_ENABLED:'false',
        TELEGRAM_EXTRA_CHAT_ID:'-1002',X_API_KEY:'offline',X_API_SECRET:'offline',X_ACCESS_TOKEN:'offline',X_ACCESS_TOKEN_SECRET:'offline',
        DINO_LEGACY_V17_SHADOW_ENABLED:'false',DINO_V20_SHADOW_ENABLED:'false',DINO_V19_SHADOW_ENABLED:'false'},platform:process.platform},
    console:{log(){},warn(){},error(){}},Date,Buffer,URL,URLSearchParams,
    setInterval(){},setTimeout(){},setImmediate(){},clearInterval(){},clearTimeout(){}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8')+`
for(const tracker of [coreShadowTracker,legacyV17ShadowTracker,v20ShadowTracker])tracker.data.startedAt='1970-01-01T00:00:00Z';
globalThis.api={botuCalistir,v21ShadowTracker,v22ShadowTracker,v22Lab,signalTracker,sharingSettings,sharingDelivery,
    setup(mac,initial,fresh,onVerify,valid=true){
        let calls=0;
        canliMaclariHazirla=async()=>[mac];hazirMacHalaUygunMu=()=>true;temelStatsTam=()=>true;
        golgeGucBaglamlariniTopla=async()=>new Map();
        yapayZekaAnaliziYap=async()=>[calls++?fresh:initial];
        sinyalOncesiVerileriYenileVeDogrula=async()=>{
            if(onVerify)onVerify(mac);
            mac.stats_validation={status:valid?'passed':'failed',verifiedAt:'2026-09-13T10:00:00.000Z'};
            return {ok:valid,verifiedAt:mac.stats_validation.verifiedAt,validation:mac.stats_validation};
        };
        sinyalOncesiCanlilikDogrula=async()=>true;geminiYorumuYaz=async()=>'offline';
    },
    async settle(fixture){
        apiGet=async()=>({data:{response:[fixture]}});
        return await paylasilanSinyalSonuclariniGuncelle({manuel:true});
    }
};`,context);
const api=context.api;
const dino=(market,p)=>({[market]:p,MODEL_VARYANTI:'live_plus_prematch'});
function mac(id,market='0.5_UST',score='0-0',minute=65,pre=.85){return {fixture_id:id,mac_isim:'Offline Home - Away',lig:'Offline',
    dakika:minute,skor:score,status_short:minute>45?'2H':'1H',canli_oranlar:{[market]:{oran:1.6,bookmaker:'Offline'}},
    prematch_totals:{[parseFloat(market).toFixed(1)]:{over:pre,under:1-pre}}};}
function get(route,query={}){let body,headers={};const handler=routes.get(route);assert(handler,'Missing route '+route);
    handler({query},{json(v){body=v;},send(v){body=v;},setHeader(k,v){headers[k]=v;},status(){return this;}});return {body,headers};}
(async()=>{
    assert.equal(api.v22Lab.metadata().startedAt,null);
    let match=mac(2201);api.setup(match,dino('0.5_UST',55.5),dino('0.5_UST',55.5));await api.botuCalistir();
    assert.equal(api.v22ShadowTracker.data.signals.length,1,'V22-only C triggers fresh path');
    assert.deepEqual(Array.from(api.v22ShadowTracker.data.signals[0].matchedFilters),['C']);
    assert.equal(api.v21ShadowTracker.hasSignal(2201,'strong'),false);
    assert.equal(deliveries.length,1);await api.botuCalistir();assert.equal(api.v22ShadowTracker.data.signals.length,1);
    match=mac(2202,'2.5_UST','0-0',60,.65);api.setup(match,dino('2.5_UST',61.5),dino('2.5_UST',61.5));await api.botuCalistir();
    assert(api.v21ShadowTracker.hasSignal(2202,'strong'),'V21 alone remains active');
    assert(!api.v22ShadowTracker.hasSignal(2202,'strong'));
    match=mac(2203,'3.5_UST','2-0',45,.55);api.setup(match,dino('3.5_UST',59),dino('3.5_UST',59));await api.botuCalistir();
    assert(api.v21ShadowTracker.hasSignal(2203,'strong'));assert(api.v22ShadowTracker.hasSignal(2203,'strong'),'Independent V21/V22 locks');
    for(const [id,freshP,onVerify,valid] of [
        [2210,49,null,true],[2211,55.5,m=>m.skor='1-0',true],
        [2212,55.5,m=>m.canli_oranlar['0.5_UST'].oran=1.1,true],[2213,55.5,null,false],
        [2214,55.5,()=>scores.v18=50,true]
    ]){
        scores.v18=62;match=mac(id);api.setup(match,dino('0.5_UST',55.5),dino('0.5_UST',freshP),onVerify,valid);
        await api.botuCalistir();assert(!api.v22ShadowTracker.hasSignal(id,'strong'),'Fresh rejection '+id);
    }
    scores.v18=62;
    const v21Before=JSON.stringify(api.v21ShadowTracker.data.signals);
    // A+B overlap must persist as one record and both tags, without a Telegram path.
    match=mac(2220,'2.5_UST','1-0',45,.45);api.setup(match,dino('2.5_UST',59),dino('2.5_UST',59));await api.botuCalistir();
    assert.deepEqual(Array.from(api.v22ShadowTracker.findSignal(2220,'strong').matchedFilters),['A','B']);
    assert.equal(JSON.stringify(api.v21ShadowTracker.data.signals),v21Before,'V22 does not mutate V21');
    assert.equal(deliveries.length,4,'V22-only, V21-only and combined candidates all send independently');
    const beforeStart=get('/api/test-lab-comparison').body.comparisonStartedAt;
    const status=get('/api/status').body.testLabTracking;
    assert.equal(status.v22Shadow.telegram,false);assert.equal(status.v21Shadow.policy.edgeHigh,0);
    assert.equal(status.v22Shadow.summary.overall.total,3);
    const comparison=get('/api/test-lab-comparison',{date:'2026-09-13'}).body;
    assert.equal(comparison.v22Shadow.signals.length,3);assert.equal(comparison.v22Shadow.filterSummaries.A.total,2);
    assert.equal(comparison.v22Shadow.filterSummaries.B.total,1);assert.equal(comparison.v22Shadow.filterSummaries.C.total,1);
    assert.equal(get('/api/test-lab-comparison',{date:'2026-09-12'}).body.v22Shadow.signals.length,0,'No backfill');
    assert.equal(get('/api/test-lab-comparison').body.comparisonStartedAt,beforeStart,'New V22 does not reset comparison period');
    const route='/api/v22-union-shadow-history';
    const exported=JSON.parse(get(route+'/export',{date:'2026-09-13',scope:'test-lab'}).body);
    assert.equal(exported.signals.length,3);assert.equal(exported.telegram,false);assert.equal(exported.rules.combination,'OR');
    assert.equal(exported.filterSummaries.A.total,2);assert(exported.signals.every(s=>s.matchedFilters.length&&s.voteCount===3));
    const csv=get(route+'/export.csv',{date:'2026-09-13'}).body;
    assert.match(csv,/"matched_filters","goals_needed"/);assert.match(csv,/A\+B/);
    const lines=csv.trim().split('\n');assert(lines.every(line=>line.split(',').length===lines[0].split(',').length));
    // A file containing only V22 pending fixtures still participates in result refresh.
    const fixture={fixture:{id:2201,status:{short:'FT'}},goals:{home:1,away:0},score:{fulltime:{home:1,away:0}}};
    await api.settle(fixture);
    assert.equal(api.v22ShadowTracker.findSignal(2201,'strong').settlement.result,'W');
    assert.equal(api.v22Lab.metadata().filterSummaries.C.wins,1);
    const persisted=JSON.parse(fs.readFileSync(path.join(root,'dino_v22_union_shadow_history.json'),'utf8'));
    assert.equal(persisted.signals.length,3);assert.equal(persisted.signals[0].settlement.result,'W');
    assert.equal(deliveries.length,5,'One reply for the one settled winner');assert.equal(api.signalTracker.data.signals.length,4);
    // Production scan path: same fixture and same market at two different minutes.
    match=mac(2230,'1.5_UST','0-0',35,.8);
    api.setup(match,dino('1.5_UST',60),dino('1.5_UST',60));await api.botuCalistir();
    let entries=api.signalTracker.data.signals.filter(s=>s.fixtureId===2230);
    assert.equal(entries.length,1);assert.deepEqual(Array.from(entries[0].signalSources),['V21']);
    match=mac(2230,'1.5_UST','1-0',60,.8);
    api.setup(match,dino('1.5_UST',54),dino('1.5_UST',54));await api.botuCalistir();
    entries=api.signalTracker.data.signals.filter(s=>s.fixtureId===2230);
    assert.equal(entries.length,2);assert.deepEqual(Array.from(entries,s=>s.minute),[35,60]);
    assert.deepEqual(Array.from(entries[1].signalSources),['V22']);
    assert.equal(deliveries.length,7);await api.botuCalistir();assert.equal(deliveries.length,7);
    assert(api.v21ShadowTracker.hasSignal(2230,'strong'));assert(api.v22ShadowTracker.hasSignal(2230,'strong'));
    // Actual server hook fans out only acknowledged primary signals; lab/stat counts stay independent.
    api.sharingSettings.update({revision:0,extraTelegram:true,x:true});
    match=mac(2240,'0.5_UST','0-0',65,.85);
    api.setup(match,dino('0.5_UST',55.5),dino('0.5_UST',55.5));await api.botuCalistir();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(deliveries.length,9);assert.equal(xDeliveries.length,1);
    assert.equal(deliveries[7].channel,'offline');assert.equal(deliveries[8].channel,'-1002');assert.equal(deliveries[7].text,deliveries[8].text);
    assert.equal(api.signalTracker.data.signals.filter(s=>s.fixtureId===2240).length,1);
    api.signalTracker.data.signals.find(s=>s.fixtureId===2240).settlement={result:'W'};
    await api.sharingDelivery.flushWins();assert.equal(deliveries.length,10);assert.equal(xDeliveries.length,1,'No X result posts');
    assert.equal(JSON.parse(deliveries[9].options.reply_parameters).message_id,9);
    api.sharingSettings.update({revision:1,extraTelegram:false});
    match=mac(2241,'0.5_UST','0-0',65,.85);
    api.setup(match,dino('0.5_UST',55.5),dino('0.5_UST',55.5));await api.botuCalistir();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(deliveries.length,11,'Disabling extra group leaves primary active');assert.equal(xDeliveries.length,2,'X remains independent');
    console.log('V22 server fresh flow, V21 preservation, independent Telegram including same market 35/60 minutes, API/date/CSV and settlement passed (offline).');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
