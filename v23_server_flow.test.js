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
globalThis.api={botuCalistir,v21ShadowTracker,v22ShadowTracker,v23GoalLab,signalTracker,
    enrichFixturesWithStats, tazeStatlariMacaUygula,
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
    stats_identity_verified:true,stats_received_at:'2026-09-14T21:30:00.000Z',home_shot:10,away_shot:8,home_sot:4,away_sot:3,
    _v23LiveStats:{home:{shotsInsidebox:6,shotsOutsidebox:4,blockedShots:1},away:{shotsInsidebox:3,shotsOutsidebox:5,blockedShots:2}},
    _v23EventsAt:'2026-09-14T21:30:00.000Z',_v23Events:[],canli_oranlar:{'0.5_UST':{oran:1.6,bookmaker:'Offline'}},prematch_totals:{'0.5':{over:.85,under:.15}}});
class Response extends EventEmitter { constructor(){super();this.parts=[];this.headers={};this.destroyed=false;this.statusCode=200;}
    json(body){this.body=body;}send(body){this.body=body;}write(part){this.parts.push(part);return true;}end(){this.body=JSON.parse(this.parts.join(''));}
    setHeader(k,v){this.headers[k]=v;}status(v){this.statusCode=v;return this;}destroy(){this.destroyed=true;} }
async function get(route,query={}){const res=new Response();await routes.get(route)({query},res);return res;}
(async()=>{
    assert.equal(api.v23GoalLab.data.signals.length,0);
    api.setup(match(2301));await api.botuCalistir();
    assert.equal(api.v23GoalLab.data.signals.length,2);
    assert.equal(deliveries.length,1,'Same-entry V21/V22 combined delivery unchanged');
    const first=api.v23GoalLab.data.signals[0];
    assert.equal(first.baselineSignalId,api.v21ShadowTracker.data.signals[0].signalId);
    assert(first.filterAudit);assert.equal(first.audit,undefined,'No retired audit computed');
    assert.equal(first.filterAudit.controls.find(c=>c.id==='event_score').status,'approve');
    assert.equal(first.filterAudit.controls.find(c=>c.id==='v21_score').status,'unaffected');
    await api.botuCalistir();assert.equal(api.v23GoalLab.data.signals.length,2);
    api.setup({...match(2302),dakika:75});await api.botuCalistir();
    const late=api.v23GoalLab.data.signals.find(s=>s.fixtureId===2302&&s.sourceModel==='v22');
    assert.equal(late.filterAudit.controls.find(c=>c.id==='v22_minute').status,'reject');
    assert.equal(deliveries.length,2,'Independent V21 still sends when V22 is rejected');
    assert.deepEqual(api.signalTracker.data.signals.find(s=>s.fixtureId===2302).signalSources,['V21'],'Only V22 source is removed');
    const zero={...match(2303),canli_oranlar:{'1.5_UST':{oran:1.6}},prematch_totals:{'1.5':{over:.85,under:.15}}};
    api.setup(zero);await api.botuCalistir();
    assert.equal(api.v23GoalLab.data.signals.at(-1).filterAudit.controls.find(c=>c.id==='v21_score').status,'reject');
    assert.equal(deliveries.length,3,'0-0 1.5 rejection is LAB-only');
    api.setup({...match(2304),skor:'1-0',dakika:78,canli_oranlar:{'1.5_UST':{oran:1.6}},prematch_totals:{'1.5':{over:.85,under:.15}}});
    await api.botuCalistir();
    const protectedEntry=api.v23GoalLab.data.signals.find(s=>s.fixtureId===2304&&s.sourceModel==='v22');
    assert.equal(protectedEntry.matchedFilters.join('+'),'A+C');
    assert.equal(protectedEntry.filterAudit.controls.find(c=>c.id==='v22_minute').status,'unaffected');
    assert.equal(deliveries.length,4);
    api.setup(match(2305),49);await api.botuCalistir();
    api.setup(match(2306),60,false);await api.botuCalistir();
    assert.equal(api.v23GoalLab.data.signals.length,7,'No new record for source/fresh validation failures');
    api.v23GoalLab.observe=()=>{throw Error('isolated LAB failure');};
    api.setup(match(2307));await api.botuCalistir();assert.equal(deliveries.length,5);
    assert(api.v21ShadowTracker.hasSignal(2307,'strong'));assert(api.v22ShadowTracker.hasSignal(2307,'strong'));
    const comparison=(await get('/api/test-lab-comparison',{date:'2026-09-15'})).body;
    assert.equal(comparison.v23Goal.summary.overall.total,7);
    assert.equal(comparison.v23Goal.filters.sources.v21.baseline.total,4);
    assert.equal(comparison.v23Goal.filters.sources.v22.baseline.total,3);
    assert.equal(comparison.v23Goal.filters.sources.v22.controls.find(c=>c.id==='v22_minute').reject.pending,1);
    assert.equal((await get('/api/test-lab-comparison',{date:'2026-09-14'})).body.v23Goal.summary.overall.total,0);
    for(const [source,count]of [['all',7],['v21',4],['v22:C',3],['v22:A',1]]) {
        const json=await get('/api/v23-goal-history/export',{date:'2026-09-15',source});
        assert.equal(json.body.signals.length,count);assert.equal(json.body.decisionImpact,true);
        assert.equal(json.body.liveGate.source,'v22');assert.equal(json.body.liveGate.v21DecisionImpact,false);
        assert.equal(json.body.additionalApiCalls,0);assert.equal(Object.keys(json.body.profiles).length,0);
    }
    assert.equal((await get('/api/v23-goal-history',{date:'nonsense'})).statusCode,400);
    assert.equal((await get('/api/v23-goal-history',{source:'invalid'})).statusCode,400);
    assert.equal((await get('/api/v23-goal-history',{source:'legacy'})).statusCode,400,'Retired archive is separate');
    const retired=await get('/api/v23-retired-history/export');
    assert.equal(retired.body.retired,true);assert.equal(retired.body.enabled,false);
    assert(!fs.existsSync(path.join(root,'dino_v23_goal_cache.json')),'No retired collector file created');
    assert(!fs.existsSync(path.join(root,'dino_v23_goal_history.json')),'No retired history written');
    assert(fs.existsSync(path.join(root,'dino_v23_filter_history_v2.json')));
    await api.settle({fixture:{id:2301,status:{short:'FT'}},score:{fulltime:{home:1,away:0}}});
    assert.equal(api.v23GoalLab.metadata().storage.archivedRecords,2);
    assert.equal((await get('/api/status')).body.testLabTracking.v23Goal.summary.overall.wins,2);
    const exported=await get('/api/v23-goal-history/export',{source:'v22:C'});
    const settled=exported.body.signals.find(s=>s.fixtureId===2301);
    assert.equal(settled.settlement.result,'W');
    assert.equal(settled.filterAudit.controls.find(c=>c.id==='v22_quality').values.totalShots,18);
    assert.equal(settled.liveStats.home.shotsInsideBox,6,'Box shots are persisted without a new request');
    assert.equal(settled.archiveRef,undefined);
    const paged=await get('/api/test-lab-comparison',{date:'2026-09-15',limit:'1'});
    assert.equal(paged.body.v23Goal.signals.length,1);assert.equal(paged.body.v23Goal.summary.overall.total,7);
    assert.match((await get('/api/v23-goal-history/export.csv')).body,/v22_quality/);
    assert.equal(deliveries.length,6,'Five signals plus one win reply; exports send nothing');
    const onlyV22=vm.createContext({require:context.require,__dirname:path.join(root,'v22-only'),
        process:{env:{...context.process.env,DINO_V21_SHADOW_ENABLED:'false'},platform:process.platform},
        console:context.console,Date,Buffer,URL,URLSearchParams,setInterval(){},setTimeout(){},setImmediate(){},clearInterval(){},clearTimeout(){}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8')+';globalThis.labEnabled=v23GoalLab.enabled;',onlyV22);
    assert.equal(onlyV22.labEnabled,true);
    console.log('V23 V22 live gate: V21 isolation, V22 explicit veto, A+C protection, observations, exports, archive and result flow passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
    if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('dino-v23-flow-'))fs.rmSync(root,{recursive:true,force:true});
});
