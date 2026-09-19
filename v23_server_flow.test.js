'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {createRequire}=require('module'),{EventEmitter}=require('events');
const localRequire=createRequire(path.join(__dirname,'server.js'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dino-v23-flow-')),routes=new Map(),deliveries=[];
const app={use(){},get(route,handler){for(const r of [].concat(route))routes.set(r,handler);},post(){},listen(){}};
function express(){return app;}express.json=express.static=()=>()=>{};
const external={dotenv:{config(){}},express,cors:()=>()=>{},axios:{create:()=>({get(){throw Error('Live network forbidden');}})},
    'node-telegram-bot-api':class{async sendMessage(channel,text){deliveries.push(text);return {message_id:1};}},
    '@google/generative-ai':{GoogleGenerativeAI:class{}},child_process:{spawn(){throw Error('Live Python forbidden');}},
    './dino_selector_v2':{MODEL:{version:'test16',policy:{defaultMinimumOdd:1.5}},scoreMarket:()=>({selectorProbability:65}),policyCheck:()=>({eligible:true})},
    './dino_selector_v18':{MODEL:{version:'test18'},scoreMarket:()=>({v18Probability:66,v18Edge:0})}};
const context=vm.createContext({require:name=>Object.hasOwn(external,name)?external[name]:localRequire(name),__dirname:root,
    process:{env:{TELEGRAM_BOT_TOKEN:'offline',TELEGRAM_CHANNEL_ID:'offline',DINO_CORE_SHADOW_ENABLED:'false',DINO_LEGACY_V17_SHADOW_ENABLED:'false',
        DINO_V20_SHADOW_ENABLED:'false',DINO_V19_SHADOW_ENABLED:'false'},platform:process.platform},
    console:{log(){},warn(){},error(){}},Date,Buffer,URL,URLSearchParams,setInterval(){},setTimeout(){},setImmediate(){},clearInterval(){},clearTimeout(){}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8')+`
for(const tracker of [coreShadowTracker,legacyV17ShadowTracker,v20ShadowTracker])tracker.data.startedAt='1970-01-01T00:00:00Z';
globalThis.api={botuCalistir,v21ShadowTracker,v22ShadowTracker,v23GoalLab,v23ProfileCache,signalTracker,
    enrichFixturesWithStats,
    setup(mac,p=60,valid=true){
        canliMaclariHazirla=async()=>[mac];hazirMacHalaUygunMu=()=>true;temelStatsTam=()=>true;
        golgeGucBaglamlariniTopla=async()=>new Map();
        yapayZekaAnaliziYap=async()=>[{[Object.keys(mac.canli_oranlar)[0]]:p,MODEL_VARYANTI:'live_plus_prematch'}];
        sinyalOncesiVerileriYenileVeDogrula=async()=>{
            mac.stats_validation={status:valid?'passed':'failed',verifiedAt:'2026-09-14T21:30:00.000Z'};
            return {ok:valid,verifiedAt:mac.stats_validation.verifiedAt,validation:mac.stats_validation};
        };
        sinyalOncesiCanlilikDogrula=async()=>true;geminiYorumuYaz=async()=>'offline';
    },
    async settle(fixture){apiGet=async()=>({data:{response:[fixture]}});return paylasilanSinyalSonuclariniGuncelle({manuel:true});}
};`,context);
const api=context.api;
const match=id=>({fixture_id:id,fixture_kickoff:'2026-09-14T20:30:00Z',league_id:39,season:2026,home_team_id:1,away_team_id:2,
    mac_isim:'Offline Home - Away',lig:'Offline',dakika:60,skor:'0-0',status_short:'2H',home_red:0,away_red:0,
    canli_oranlar:{'0.5_UST':{oran:1.6,bookmaker:'Offline'}},prematch_totals:{'0.5':{over:.85,under:.15}}});
class Response extends EventEmitter { constructor(){super();this.parts=[];this.headers={};this.destroyed=false;this.statusCode=200;}
    json(body){this.body=body;}send(body){this.body=body;}write(part){this.parts.push(part);return true;}end(){this.body=JSON.parse(this.parts.join(''));}
    setHeader(k,v){this.headers[k]=v;}status(v){this.statusCode=v;return this;}destroy(){this.destroyed=true;} }
async function get(route,query={}){const res=new Response();await routes.get(route)({query},res);return res;}
(async()=>{
    assert.equal(api.v23GoalLab.data.signals.length,0);assert.equal(api.v23GoalLab.metadata().startedAt,null);
    let m=match(2301);api.setup(m);await api.botuCalistir();
    assert.equal(api.v21ShadowTracker.data.signals.length,1);assert.equal(api.v23GoalLab.data.signals.length,2);
    const observation=api.v23GoalLab.data.signals[0];assert.equal(observation.assessment.status,'insufficient');
    assert.equal(observation.baselineSignalId,api.v21ShadowTracker.data.signals[0].signalId);
    assert.equal(deliveries.length,1);assert.equal(api.signalTracker.data.signals.length,1);
    assert.equal(api.v23GoalLab.data.signals[1].sourceModel,'v22');
    await api.botuCalistir();assert.equal(api.v23GoalLab.data.signals.length,2,'Repeat scan cannot rejudge either source');
    m=match(2302);api.setup(m,49);await api.botuCalistir();assert.equal(api.v23GoalLab.data.signals.length,2,'Not a source candidate');
    m=match(2303);api.setup(m,60,false);await api.botuCalistir();assert.equal(api.v23GoalLab.data.signals.length,2,'Fresh stats failed');
    m={...match(2305),dakika:70,skor:'2-1',canli_oranlar:{'4.5_UST':{oran:1.8,bookmaker:'Offline'}},prematch_totals:{'4.5':{over:.25,under:.75}}};
    api.setup(m,52);await api.botuCalistir();
    assert.equal(api.v23GoalLab.data.signals.length,3,'V22 A is observed even when V21 rejects the source');
    assert.equal(api.v21ShadowTracker.hasSignal(2305,'strong'),false);
    assert.equal(api.v23GoalLab.data.signals[2].sourceModel,'v22');
    assert.equal(api.v23GoalLab.data.signals[2].matchedFilters.join('+'),'A');
    assert.equal(deliveries.length,2,'V22 A sends independently; V23 does not veto it');
    assert.equal(api.signalTracker.data.signals[1].fixtureId,2305);
    assert(api.v23GoalLab.data.signals.every(s=>s.telegramMessageId===null),'V23 itself never sends');
    api.v23GoalLab.observe=()=>{throw Error('V23 isolated failure');};
    api.v23ProfileCache.request=()=>{throw Error('Lab history queue failure must not stop Telegram');};
    m=match(2304);api.setup(m);await api.botuCalistir();assert(api.v21ShadowTracker.hasSignal(2304,'strong'));
    assert(api.v22ShadowTracker.hasSignal(2304,'strong'),'Other labs survive V23 failure');
    assert.equal(api.signalTracker.data.signals.length,3,'History and V23 failures cannot veto active signals');
    const comparison=(await get('/api/test-lab-comparison',{date:'2026-09-15'})).body;
    assert.equal(comparison.v23Goal.summary.overall.total,3,'TSI day is UTC+3');
    assert.equal(comparison.v23Goal.experiment.sources.v21.baseline.total,1);
    assert.equal(comparison.v23Goal.experiment.sources.v22.baseline.total,2);
    assert.equal((await get('/api/test-lab-comparison',{date:'2026-09-14'})).body.v23Goal.summary.overall.total,0);
    const json=await get('/api/v23-goal-history/export',{date:'2026-09-15'});
    assert.equal(json.body.signals.length,3);assert.equal(json.body.telegram,false);
    assert.match(json.headers['Content-Disposition'],/2026-09-15.json/);
    assert.equal((await get('/api/v23-goal-history/export',{date:'2026-09-14'})).body.signals.length,0);
    assert.equal((await get('/api/v23-goal-history',{date:'nonsense'})).statusCode,400);
    assert.equal((await get('/api/v23-goal-history',{source:'invalid'})).statusCode,400);
    assert.equal((await get('/api/v23-goal-history/export',{date:'2026-09-15',source:'v21'})).body.signals.length,1);
    assert.equal((await get('/api/v23-goal-history/export',{date:'2026-09-15',source:'v22:C'})).body.signals.length,1);
    assert.equal((await get('/api/v23-goal-history/export',{date:'2026-09-15',source:'v22:A'})).body.signals[0].fixtureId,2305);
    assert.equal((await get('/api/v23-goal-history/export',{date:'2026-09-15',source:'legacy'})).body.signals.length,0);
    assert.match((await get('/api/v23-goal-history/export.csv',{date:'2026-09-15'})).body,/insufficient/);
    await api.settle({fixture:{id:2301,status:{short:'FT'}},score:{fulltime:{home:1,away:0}}});
    assert.equal(api.v23GoalLab.data.signals[0].settlement.result,'W','Even insufficient verdicts settle');
    assert.equal((await get('/api/status')).body.testLabTracking.v23Goal.summary.overall.wins,2);
    assert.equal(api.v23GoalLab.metadata().storage.archivedRecords,2);
    const archivedPage=await get('/api/test-lab-comparison',{date:'2026-09-15',limit:'1'});
    assert.equal(archivedPage.body.v23Goal.summary.overall.wins,2);
    assert.equal(archivedPage.body.v23Goal.signals.length,1);
    const archivedJson=await get('/api/v23-goal-history/export',{date:'2026-09-15',source:'v22:C'});
    assert.equal(archivedJson.body.signals[0].settlement.result,'W');
    assert(archivedJson.body.signals[0].audit.events,'Archived details must be restored, not just the compact index');
    assert.equal(archivedJson.body.signals[0].archiveRef,undefined);
    assert.match((await get('/api/v23-goal-history/export.csv',{date:'2026-09-15'})).body,/Offline Home/);
    const state=api.enrichFixturesWithStats([{fixture:{id:1,date:'2026-09-14T10:00:00Z'},league:{},teams:{home:{id:1},away:{id:2}}}])[0];
    assert.equal(state.fixture_kickoff,'2026-09-14T10:00:00Z');
    assert.equal(state._v23Events,null);
    const raw=api.enrichFixturesWithStats([{fixture:{id:1,date:'2026-09-14T10:00:00Z'},league:{},teams:{home:{id:1},away:{id:2}},events:[],_dino_fixture_received_at:'2026-09-14T10:01:00Z'}])[0];
    assert.equal(raw._v23Events.length,0);assert.equal(raw._v23EventsAt,'2026-09-14T10:01:00Z');
    assert.equal(deliveries.length,4,'Three independent signal messages plus one confirmed-win reply; exports do not send');
    const onlyV22=vm.createContext({require:context.require,__dirname:path.join(root,'v22-only'),
        process:{env:{...context.process.env,DINO_V21_SHADOW_ENABLED:'false',DINO_V22_SHADOW_ENABLED:'true'},platform:process.platform},
        console:context.console,Date,Buffer,URL,URLSearchParams,setInterval(){},setTimeout(){},setImmediate(){},clearInterval(){},clearTimeout(){}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8')+';globalThis.sourceFlags=[DINO_V21_SHADOW_ENABLED,DINO_V22_SHADOW_ENABLED,v23GoalLab.enabled];',onlyV22);
    assert.deepEqual(Array.from(onlyV22.sourceFlags),[false,true,true],'V23 stays enabled with only the V22 source enabled');
    console.log('V23 real server flow: fresh V21/V22 pairing, V22-only A, no backfill/reselection/extra Telegram, independent V21/V22 delivery, isolated failures, TSI/source exports, embedded events and dual settlement passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
