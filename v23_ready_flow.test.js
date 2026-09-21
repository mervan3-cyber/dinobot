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
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.doesNotMatch(source,/v23ProfileCache|new GoalProfileCache|v23GecmisKuyrugunaEkle|v23ErkenGecmisHazirla|v23GoalLab\.capture/);
const oldHistoryPath=path.join(root,'dino_v23_goal_history.json');
fs.writeFileSync(oldHistoryPath,'old history must never be loaded at boot');
const cacheBytes=fs.readFileSync(cachePath),historyBytes=fs.readFileSync(oldHistoryPath);
vm.runInContext(source+`
globalThis.api={lab:v23GoalLab,maintenance:v23YerelArsivBakimi,scan:botuCalistir,
  setup(){canliMaclariHazirla=async()=>[];state.isRunning=true;state.autoScanEnabled=true;},
  setApiTrap(){apiGet=async()=>{throw Error('No API call is allowed in LAB maintenance');};}
};`,context);
(async()=>{
    const api=context.api;assert.equal(api.lab.disabledReason,null,'Broken retired files cannot disable the new LAB');
    assert.equal(api.lab.events.entries,undefined);assert.equal(api.lab.live.entries,undefined,'No timelines instantiated');
    assert.equal(api.lab.metadata().retiredExperiments.historyRequests,false);
    assert.equal(api.lab.metadata().additionalApiCalls,0);
    api.setApiTrap();for(let i=0;i<3;i++)api.maintenance();
    api.setup();await api.scan();
    assert(cacheBytes.equals(fs.readFileSync(cachePath)));assert(historyBytes.equals(fs.readFileSync(oldHistoryPath)));
    const localTimers=timers.filter(t=>t.fn.name==='v23YerelArsivBakimi');assert.equal(localTimers.length,1);
    localTimers[0].fn();assert.equal(deliveries.length,0);
    assert.equal(api.lab.data.signals.length,0,'Existing source or retired records are never replayed');
    console.log('Retired LAB shutdown: old cache/history untouched, no collectors/timelines/queues, maintenance zero API and empty scans produce no replay passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
    if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('mac-yakala-v23-ready-'))fs.rmSync(root,{recursive:true,force:true});
});
