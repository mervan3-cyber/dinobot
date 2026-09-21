'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {createRequire}=require('module');
const {MINUTE}=require('./adaptive_scan');
const adaptiveModule=require('./adaptive_scan');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-adaptive-scan-')),localRequire=createRequire(path.join(__dirname,'server.js'));
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
let now=Date.parse('2026-09-21T10:00:00Z'),calls=0,releaseScan;
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
class TimedAdaptiveScan extends adaptiveModule.AdaptiveScan {
    begin(){super.begin(now);}observe(matches){super.observe(matches,now);}finish(options){super.finish(options,now);}
    providerFailure(){super.providerFailure(now);}status(options){return super.status(options,now);}
}
function boot(directory) {
    const routes=new Map(),timers=[];
    const app={use(){},get(route,fn){routes.set('GET '+route,fn);},post(route,fn){routes.set('POST '+route,fn);},listen(){}};
    function express(){return app;}express.json=express.static=()=>()=>{};
    let apiResponse=()=>({data:{response:[],errors:[]},headers:{'x-ratelimit-requests-remaining':'6000'}});
    const external={dotenv:{config(){}},express,cors:()=>()=>{},axios:{create:()=>({get:async()=>apiResponse()})},
        'node-telegram-bot-api':class{},'@google/generative-ai':{GoogleGenerativeAI:class{}},child_process:{spawn(){throw Error('No live Python');}},
        './adaptive_scan':{...adaptiveModule,AdaptiveScan:TimedAdaptiveScan}};
    const context=vm.createContext({require:n=>Object.hasOwn(external,n)?external[n]:localRequire(n),__dirname:directory,
        process:{env:{DINO_V20_SHADOW_ENABLED:'false',DINO_V19_SHADOW_ENABLED:'false',DINO_LEGACY_V17_SHADOW_ENABLED:'false'},platform:process.platform},
        console:{log(){},warn(){},error(){}},Date:Clock,Buffer,URL,URLSearchParams,
        setInterval(fn,ms){timers.push({fn,ms});return timers.length;},setTimeout(){},clearInterval(){},clearTimeout(){},setImmediate:fn=>fn()});
    vm.runInContext(source+`
      globalThis.harness={
        scan:botuCalistir,clock:masterClock,get state(){return state;},cadence:adaptiveScan,status:refreshScanCadence,load:loadData,
        setQuota(v){quotaRemaining=v;},setResultsBusy(v){isSignalResultRefreshing=v;},get scanning(){return isScanning;},
        setup(fn){canliMaclariHazirla=fn;hazirMacHalaUygunMu=()=>true;golgeGucBaglamlariniTopla=async()=>new Map();
          yapayZekaAnaliziYap=async rows=>rows.map(()=>({HATA:true}));},
        api:apiGet, diskFailure(on){if(on){this.originalSave=saveData;saveData=()=>false;}else saveData=this.originalSave;}
      };`,context);
    function request(method,url,body={}) {
        const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
        routes.get(method+' '+url)({body,query:{}},res);return res;
    }
    return {h:context.harness,request,setResponse:fn=>{apiResponse=fn;}};
}
const match={fixture_id:100,dakika:50,status_short:'2H',stats_identity_verified:true,
    home_shot:8,away_shot:4,home_sot:3,away_sot:1,home_corner:4,away_corner:2,canli_oranlar:{'1.5_UST':{oran:1.65}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
    const {h,request,setResponse}=boot(root);assert.equal(h.state.adaptiveScanEnabled,false);
    h.state.isRunning=true;h.setQuota(6000);
    h.setup(async()=>{calls++;return [match];});
    await h.scan();assert.equal(h.status().intervalMinutes,10);
    assert.equal(request('POST','/api/settings',{adaptiveScanEnabled:'false'}).code,400);
    assert.equal(request('POST','/api/settings',{adaptiveScanEnabled:true}).body.success,true);
    assert.equal(h.status().intervalMinutes,5);assert.equal(h.status().nextRunTime,now+5*MINUTE);
    now+=4*MINUTE;h.clock();await tick();assert.equal(calls,1);
    now+=MINUTE;h.clock();await tick();assert.equal(calls,2);
    assert.equal(request('POST','/api/settings',{adaptiveScanEnabled:false}).body.success,true);
    assert.equal(h.status().nextRunTime,now+10*MINUTE,'Disabling uses last scan + 10');
    request('POST','/api/settings',{adaptiveScanEnabled:true});
    h.setup(async()=>{calls++;return [];});now+=5*MINUTE;h.clock();await tick();
    assert.equal(h.status().intervalMinutes,10);assert.equal(h.status().candidateCount,0);
    h.setup(async()=>{calls++;return [match];});now+=10*MINUTE;h.clock();await tick();assert.equal(h.status().intervalMinutes,5);
    h.setQuota(1500);assert.equal(request('GET','/api/status').body.scanIntervalMinutes,10);
    h.setQuota(6000);h.setResultsBusy(true);now+=5*MINUTE;const previous=calls;h.clock();assert.equal(calls,previous);
    h.setResultsBusy(false);
    h.setup(async()=>{calls++;await new Promise(resolve=>{releaseScan=resolve;});return [match];});
    h.clock();h.clock();await tick();assert.equal(calls,previous+1);assert.equal(h.scanning,true);
    now+=8*MINUTE;h.clock();assert.equal(calls,previous+1,'No parallel scan even when deadline passes');releaseScan();await tick();
    assert.equal(h.status().nextRunTime,now+MINUTE,'Long scan has a quiet gap');
    h.state.autoScanEnabled=false;now+=MINUTE;h.clock();assert.equal(calls,previous+1);
    h.state.autoScanEnabled=true;h.state.scheduleEnabled=true;h.state.schedules=[{start:'00:00',end:'00:01',mode:'loop'}];
    h.clock();assert.equal(calls,previous+1,'Outside schedule');
    h.setup(async()=>{calls++;return [match];});h.state.schedules=[{start:'00:00',end:'23:59',mode:'single'}];h.clock();await tick();
    const singles=calls;now+=15*MINUTE;h.clock();await tick();assert.equal(calls,singles,'Single stays single');
    h.state.schedules=[{start:'00:00',end:'23:59',mode:'5 Dakikada Bir Tara'}];h.state.adaptiveScanEnabled=false;
    assert.equal(h.status().reason,'schedule_five','Explicit old program is preserved');
    h.state.scheduleEnabled=false;h.state.adaptiveScanEnabled=true;
    now+=MINUTE;setResponse(()=>{const e=Error('rate limited');e.response={status:429,headers:{'x-ratelimit-requests-remaining':'1400'}};throw e;});
    await assert.rejects(h.api('/offline',{dinoMaxAttempts:1}));assert.equal(h.status().reason,'provider_cooldown');
    now+=11*MINUTE;setResponse(()=>({data:{errors:{requests:'Too many requests'}},headers:{'x-ratelimit-requests-remaining':'6000'}}));
    await h.api('/offline');assert.equal(h.status().reason,'provider_cooldown','HTTP 200 provider rate-limit payload');
    request('POST','/api/settings',{adaptiveScanEnabled:true});
    h.diskFailure(true);const failed=request('POST','/api/settings',{adaptiveScanEnabled:false});
    assert.equal(failed.code,500);assert.equal(h.state.adaptiveScanEnabled,true);h.diskFailure(false);
    const restarted=boot(root);assert.equal(restarted.h.state.adaptiveScanEnabled,true,'Only preference survives restart');
    assert.equal(restarted.h.cadence.candidateCount,0);assert.equal(restarted.h.cadence.lastStartedAt,null);
    assert(!fs.existsSync(path.join(root,'dino_v23_goal_cache.json')),'No old LAB collector restored');
    console.log('Adaptive server: real scans/clock/settings/status, 10→5→10, no overlap, late finish, quota/429 payload, manual/auto/schedule rules, disk failure and restart passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
    if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('mac-adaptive-scan-'))fs.rmSync(root,{recursive:true,force:true});
});
