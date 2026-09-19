'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {createRequire}=require('module');
const {VERSION,GoalProfileCache}=require('./v23_goal_profile');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-yakala-v23-ready-'));
const DAY=86400000,kickoff='2026-09-19T10:00:00.000Z';let now=Date.parse(kickoff)+10*60000;
class ClockDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const oldCache={version:VERSION,collectorVersion:'v23-history-collector-2026-09-18',day:'2026-09-19',calls:92,earlyCalls:80,cooldownUntil:0,entries:{}};
const cachePath=path.join(root,'dino_v23_goal_cache.json');fs.writeFileSync(cachePath,JSON.stringify(oldCache));
const localRequire=createRequire(path.join(__dirname,'server.js')),deliveries=[],timers=[];
const app={use(){},get(){},post(){},listen(_port,callback){callback();}};
function express(){return app;}express.json=express.static=()=>()=>{};
const external={dotenv:{config(){}},express,cors:()=>()=>{},axios:{create:()=>({get(){throw Error('Live API forbidden');}})},
    'node-telegram-bot-api':class{async sendMessage(channel,text){deliveries.push({channel,text});return {message_id:deliveries.length};}},
    '@google/generative-ai':{GoogleGenerativeAI:class{}},child_process:{spawn(){throw Error('Live Python forbidden');}},
    './dino_selector_v2':{MODEL:{version:'offline16',policy:{defaultMinimumOdd:1.5}},scoreMarket:()=>({selectorProbability:65}),policyCheck:()=>({eligible:true})},
    './dino_selector_v18':{MODEL:{version:'offline18'},scoreMarket:()=>({v18Probability:66,v18Edge:0})}};
const context=vm.createContext({require:name=>Object.hasOwn(external,name)?external[name]:localRequire(name),__dirname:root,
    process:{env:{TELEGRAM_BOT_TOKEN:'offline',TELEGRAM_CHANNEL_ID:'offline',DINO_V23_HISTORY_DAILY_LIMIT:'300',
        DINO_CORE_SHADOW_ENABLED:'false',DINO_LEGACY_V17_SHADOW_ENABLED:'false',DINO_V20_SHADOW_ENABLED:'false',DINO_V19_SHADOW_ENABLED:'false'},platform:process.platform},
    console:{log(){},warn(){},error(){}},Date:ClockDate,Buffer,URL,URLSearchParams,
    setInterval(fn,ms){timers.push({fn,ms});return timers.length;},setTimeout(){},setImmediate(){},clearInterval(){},clearTimeout(){}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8')+`
globalThis.api={cache:v23ProfileCache,lab:v23GoalLab,state,v21:v21ShadowTracker,v22:v22ShadowTracker,
    early:v23ErkenGecmisHazirla,pump:v23ArkaPlanGecmisTurunuCalistir,scan:botuCalistir,
    flags({running=true,auto=true,scanning=false,refreshing=false,quota=6000}={}){
        state.isRunning=running;state.autoScanEnabled=auto;isScanning=scanning;isSignalResultRefreshing=refreshing;quotaRemaining=quota;
    },coverage(league,supported){leagueCoverageCache.set(coverageKey(league,2026),{supported});},
    setup(mac){
        canliMaclariHazirla=async()=>[mac];hazirMacHalaUygunMu=()=>true;temelStatsTam=()=>true;
        golgeGucBaglamlariniTopla=async()=>new Map();
        yapayZekaAnaliziYap=async()=>[{'0.5_UST':60,MODEL_VARYANTI:'live_plus_prematch'}];
        sinyalOncesiVerileriYenileVeDogrula=async()=>{
            mac.stats_validation={status:'passed',verifiedAt:new Date().toISOString()};
            return {ok:true,verifiedAt:mac.stats_validation.verifiedAt,validation:mac.stats_validation};
        };
        sinyalOncesiCanlilikDogrula=async()=>true;geminiYorumuYaz=async()=>'offline';
    }
};`,context);
const api=context.api;api.cache.now=()=>now;
const fixture=(id,home=10,away=11,league=39)=>({fixture:{id,date:kickoff,status:{short:'1H',elapsed:10}},
    league:{id:league,season:2026},teams:{home:{id:home,name:'Home '+id},away:{id:away,name:'Away '+id}}});
const mac=(f,minute)=>({fixture_id:f.fixture.id,fixture_kickoff:kickoff,league_id:f.league.id,season:2026,
    home_team_id:f.teams.home.id,away_team_id:f.teams.away.id,mac_isim:'Offline '+f.fixture.id,lig:'Offline',
    dakika:minute,skor:'0-0',status_short:minute>45?'2H':'1H',home_red:0,away_red:0,
    canli_oranlar:{'0.5_UST':{oran:1.6,bookmaker:'Offline'}},prematch_totals:{'0.5':{over:.85,under:.15}}});
const oddMap=fixtures=>new Map(fixtures.map(f=>[f.fixture.id,{'0.5_UST':{oran:1.6}}]));
let calls=0;
api.cache.fetchApi=async url=>{
    calls++;const q=new URL(url,'https://offline.invalid').searchParams,team=Number(q.get('team')),league=Number(q.get('league')),season=Number(q.get('season'));
    return {data:{errors:[],response:Array.from({length:12},(_,i)=>({
        fixture:{id:team*100+i,date:new Date(Date.parse(kickoff)-(i+1)*DAY).toISOString(),status:{short:'FT'}},
        league:{id:league,season},teams:{home:{id:i%2?999:team},away:{id:i%2?team:999}},
        score:{fulltime:{home:team<20?2:1,away:team<20?2:0}}
    }))}};
};
(async()=>{
    assert.equal(api.cache.data.calls,92,'Total spent quota is not erased');
    assert.equal(api.cache.data.earlyCalls,0,'Unclassified old requests do not become early requests');
    assert.equal(api.cache.metadata().inheritedUnclassifiedCalls,92);
    assert(timers.some(t=>t.ms===60000&&t.fn.name==='v23ArkaPlanGecmisTurunuCalistir'),'Background pump registered independently of 10-minute scan');
    const win=fixture(9001),lose=fixture(9002,20,21),unknown=fixture(9003,30,31,40),unsupported=fixture(9004,40,41,41);
    api.flags();api.coverage(41,false);
    const earlyFixtures=[win,lose,unknown,unsupported];
    api.early(earlyFixtures,oddMap(earlyFixtures));
    assert.equal(api.cache.queue.size,6,'Unknown league coverage can prepare; explicitly unsupported cannot');
    api.early([fixture(9005)],new Map());assert.equal(api.cache.queue.size,6,'No odds cannot enter');
    for(const flags of [{running:false},{auto:false},{scanning:true},{refreshing:true},{quota:1499}]){
        api.flags(flags);await api.pump();assert.equal(calls,0,'Background yields to existing safety/active work');
    }
    api.flags();await api.pump();
    assert.equal(calls,6);assert.equal(api.cache.data.calls,98);assert.equal(api.cache.data.earlyCalls,6);
    assert.equal(api.cache.metadata().readyFixturePairs,3,'Both teams prepared, not just 3 unrelated profiles');
    const persisted=new GoalProfileCache({filePath:cachePath,fetchApi:api.cache.fetchApi,now:()=>now,maxCallsPerDay:300});persisted.load();
    assert.equal(persisted.data.calls,98);assert.equal(persisted.data.earlyCalls,6,'Restart cannot reset the new early counter');
    const futures=Array.from({length:5},(_,i)=>fixture(9100+i,100+i*2,101+i*2));
    api.early(futures,oddMap(futures));await api.pump();assert.equal(calls,12);assert.equal(api.cache.queue.size,4);
    await api.pump();assert.equal(calls,16);assert.equal(api.cache.queue.size,0,'Additional batches drain without another signal scan');
    assert.equal(deliveries.length,0,'Preparation itself never posts a signal');

    now=Date.parse(kickoff)+25*60000;api.setup(mac(win,25));await api.scan();
    assert.equal(api.lab.data.signals.length,2);assert(api.lab.data.signals.every(s=>s.assessment.status==='approve'));
    assert.equal(api.lab.metadata().experiment.sources.v21.controls.find(c=>c.id==='goal_blend').approve.total,1);
    assert.equal(api.lab.metadata().experiment.sources.v22.controls.find(c=>c.id==='goal_blend').approve.total,1);
    assert.equal(deliveries.length,1,'V21/V22 exact shared entry still posts once');
    now=Date.parse(kickoff)+80*60000;api.setup(mac(lose,80));await api.scan();
    assert.equal(api.lab.data.signals.length,4);assert(api.lab.data.signals.slice(2).every(s=>s.assessment.status==='reject'));
    assert.equal(deliveries.length,2,'Lab rejects must not stop either source Telegram message');
    assert.equal(api.lab.metadata().profileCoverage.bothAtEntry,4);assert.equal(api.lab.metadata().profileCoverage.judgedAtEntry,4);
    assert.equal(Object.keys(api.lab.export().profiles).length,4,'Export carries the exact used team profiles');

    // A match first encountered at a signal cannot be honestly judged using a
    // later fetch. Preserve those decisions, and explicitly report their gap.
    const cold=fixture(9999,800,801);api.setup(mac(cold,80));await api.scan();
    const coldRecords=api.lab.data.signals.filter(s=>s.fixtureId===9999);
    assert.equal(coldRecords.length,2);assert(coldRecords.every(s=>s.assessment.status==='insufficient'));
    const frozen=JSON.stringify(coldRecords);api.cache.request(mac(cold,80));await api.pump();
    assert.equal(JSON.stringify(api.lab.data.signals.filter(s=>s.fixtureId===9999)),frozen,'No retrospective lab success is fabricated');
    assert.equal(api.lab.metadata().profileCoverage.noneAtEntry,2);assert.equal(deliveries.length,3);
    assert.equal(api.lab.metadata().experiment.sources.v21.controls.find(c=>c.id==='goal_blend').reject.total,1);
    assert.equal(api.lab.metadata().experiment.sources.v22.controls.find(c=>c.id==='goal_blend').reject.total,1);

    // An in-flight slow history fetch must not become an await/gate for Telegram.
    const normalFetch=api.cache.fetchApi;let release,finished=false;
    api.cache.fetchApi=async url=>{await new Promise(resolve=>{release=resolve;});finished=true;api.cache.fetchApi=normalFetch;return normalFetch(url);};
    api.cache.request(mac(fixture(8888,810,811),80));const slowPump=api.pump();
    assert.equal(typeof release,'function');api.setup(mac(fixture(8889,820,821),80));
    let timeout;
    try {
        await Promise.race([api.scan(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Signal waited for lab history')),2000);})]);
        assert.equal(finished,false);assert.equal(deliveries.length,4,'Telegram completes while history is still pending');
    } finally {clearTimeout(timeout);release();await slowPump;}

    // A busy candidate queue cannot starve early pairs across repeated batches.
    const fairTeams=[];const fair=new GoalProfileCache({filePath:path.join(root,'fair.json'),now:()=>now,maxCallsPerDay:300,maxCallsPerWarm:2,
        fetchApi:async url=>{fairTeams.push(Number(new URL(url,'https://offline.invalid').searchParams.get('team')));return normalFetch(url);}});
    fair.save=()=>{};
    for(let i=0;i<5;i++)fair.request(mac(fixture(7000+i,100+i*2,101+i*2),80),{priority:100});
    fair.request(mac(fixture(7999,700,701),80),{priority:10});await fair.warm();await fair.warm();
    assert.deepEqual(fairTeams.slice(0,4),[100,101,700,701],'First candidate pair, then reserved early pair');

    let keepGoing=true,stoppedCalls=0;
    const stop=new GoalProfileCache({filePath:path.join(root,'stop.json'),now:()=>now,fetchApi:async url=>{
        stoppedCalls++;keepGoing=false;return normalFetch(url);
    }});stop.save=()=>{};stop.request(mac(fixture(6000,600,601),80));await stop.warm({canContinue:()=>keepGoing});
    assert.equal(stoppedCalls,1,'Stopping during a batch prevents further history requests');
    assert.equal(stop.queue.size,1);

    // Saturated early subbudget must be visible instead of claiming ready/idle.
    const diagnostic=new GoalProfileCache({filePath:path.join(root,'diagnostic.json'),now:()=>now,fetchApi:async()=>{throw Error('must not fetch');},maxCallsPerDay:300});
    diagnostic.save=()=>{};diagnostic.data.day='2026-09-19';diagnostic.data.calls=100;diagnostic.data.earlyCalls=75;
    diagnostic.request(mac(fixture(8000),80),{priority:10});await diagnostic.warm();
    assert.equal(diagnostic.metadata().waitReason,'early_budget_exhausted');assert.equal(diagnostic.data.calls,100);
    now+=DAY;await diagnostic.warm();assert.equal(diagnostic.data.calls,0);assert.equal(diagnostic.data.earlyCalls,0);
    assert.equal(diagnostic.data.inheritedUnclassifiedCalls,0,'UTC rollover resets measured and inherited classifications together');
    console.log('V23 READY end-to-end: 92-spent migration, measured restart counters, unknown coverage, minute pump, active-work guards, paired profiles BEFORE signal, real V21+V22 approve/reject tables, exports, Telegram unaffected, immutable cold records and visible subbudget passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
    const resolved=path.resolve(root),base=path.resolve(os.tmpdir());
    if(path.dirname(resolved)===base&&path.basename(resolved).startsWith('mac-yakala-v23-ready-'))fs.rmSync(resolved,{recursive:true,force:true});
});
