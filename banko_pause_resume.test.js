'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {BankoCoupon,dayKey,RUNTIME_VERSION}=require('./banko_coupon');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const latch=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup({initialBusy=false,dispatchPause=false,firstKickoff='2099-10-05T19:00:00Z'}={}){
    const state={now:new Date('2099-10-05T08:00:00Z'),live:initialBusy,remaining:6000,sent:[],queued:[],ticks:[],triggered:false};
    const fixtures=[201,202].map((id,i)=>({fixture:{id,date:i?'2099-10-05T19:00:00Z':firstKickoff,status:{short:'NS'}},league:{id:99,season:2099,name:'Test',country:'Test'},teams:{home:{id:11+i*10,name:'Home '+i},away:{id:12+i*10,name:'Away '+i}}}));
    const histories=[];for(let t=0;t<2;t++)for(let n=0;n<20;n++){const h=11+t*10,a=12+t*10;histories.push({fixture:{id:1000+t*100+n,date:new Date(Date.parse('2099-10-03T12:00:00Z')-n*86400000).toISOString(),status:{short:'FT'}},teams:{home:{id:n%2?a:h},away:{id:n%2?h:a}},score:{fulltime:{home:2,away:1},halftime:{home:1,away:0}},statistics:[]});}
    const apiGet=async(url,config)=>{const u=new URL(url,'https://example.invalid');state.queued.push(url);
        if(dispatchPause&&!state.triggered&&u.pathname==='/odds'&&u.searchParams.get('fixture')==='202'){state.triggered=true;state.live=true;}
        config.dinoBeforeAttempt();assert.equal(state.live,false,'No Banko provider dispatch while live work is active');state.sent.push(url);let response=[];
        if(u.pathname==='/fixtures'&&u.searchParams.has('date'))response=fixtures;
        else if(u.pathname==='/fixtures'&&u.searchParams.has('league'))response=histories;
        else if(u.pathname==='/fixtures'&&u.searchParams.has('ids'))response=u.searchParams.get('ids').split('-').map(Number).map(id=>histories.find(f=>f.fixture.id===id)||{fixture:{id,status:{short:'FT'}},score:{fulltime:{home:2,away:0},halftime:{home:1,away:0}}});
        else if(u.pathname==='/fixtures'&&u.searchParams.has('id'))response=[fixtures.find(f=>f.fixture.id===Number(u.searchParams.get('id')))];
        else if(u.pathname==='/odds')response=[{fixture:{id:Number(u.searchParams.get('fixture'))},update:state.now.toISOString(),bookmakers:[{id:8,name:'Bet365',bets:[{id:5,name:'Goals Over/Under',values:[{value:'Over 1.5',odd:'1.45'}]}]}]}];
        else if(u.pathname==='/leagues')response=[{seasons:[{year:2099,coverage:{predictions:false,injuries:false,fixtures:{lineups:false}}}]}];
        return {data:{response,errors:[],paging:{total:1}}};};
    const directory=fs.mkdtempSync(path.join(__dirname,'test-temp/banko-pause-'));
    const banko=new BankoCoupon({directory,apiGet,now:()=>state.now,canRun:()=>!state.live,getQuotaRemaining:()=>state.remaining,waitForLiveTick:ms=>{assert.equal(ms,1000);const tick=latch();state.ticks.push(tick);return tick.promise;}});
    const release=async()=>{state.live=false;state.ticks.splice(0).forEach(t=>t.resolve());await banko.task;};return {banko,state,release,directory};
}
module.exports=async function(){
    {const {banko:b,state:s,release,directory}=setup({initialBusy:true});const started=b.start('scan','2099-10-05'),jobId=started.job.id;await flush();
        assert.equal(b.data.latestJob.status,'waiting-live');assert.equal(b.busy,true);assert.equal(b.data.sessions.length,1);assert.equal(s.sent.length,0);assert.equal(b.requestCount,0);const id=b.data.sessions[0].id;
        assert.throws(()=>b.start('scan','2099-10-05'));assert.throws(()=>b.settings({maxCoupons:3}));
        const reboot=new BankoCoupon({directory,apiGet:()=>{throw Error('No reboot request allowed');},now:()=>s.now});reboot.load();assert.equal(reboot.data.latestJob.status,'interrupted');assert.equal(reboot.data.sessions[0].status,'interrupted');assert.equal(reboot.busy,false);
        await release();assert.equal(b.data.latestJob.id,jobId);assert.equal(b.data.sessions.length,1);assert.equal(b.data.sessions[0].id,id);assert.equal(b.data.sessions[0].status,'complete');assert.equal(b.data.sessions[0].coupons.length,1);assert.equal(b.data.latestJob.pauseCount,1);assert.equal(b.usage[dayKey(s.now)],s.sent.length);assert.equal(b.status().runtimeVersion,RUNTIME_VERSION);
    }
    {const {banko:b,state:s,release}=setup({dispatchPause:true});b.start('scan','2099-10-05');await flush();
        const session=b.data.sessions[0],id=session.id,first=session.candidates[0].id,sent=s.sent.length,usage=b.requestCount;
        assert.equal(b.data.latestJob.status,'waiting-live');assert.equal(session.candidates.length,1);assert.equal(b.data.latestJob.processed,1);await flush();assert.equal(s.sent.length,sent);assert.equal(b.requestCount,usage,'Waiting uses no API quota');
        await release();assert.equal(b.data.sessions.length,1);assert.equal(session.id,id);assert.equal(session.candidates[0].id,first);assert.equal(session.status,'complete');assert.equal(session.candidates.length,2);assert.equal(session.coupons.length,1);
        for(const id of [201,202])assert.equal(s.sent.filter(u=>u.includes('/odds?fixture='+id)).length,1,'Sent quote is not fetched twice');assert.equal(s.queued.filter(u=>u.includes('/odds?fixture=202')).length,2,'One queue deferral, one actual request');assert.equal(b.usage[dayKey(s.now)],s.sent.length);
    }
    // Run the real unmodified server queue with a mock provider: live requests must drain during Banko's pause.
    {let live=false,first=true,tick=null;const liveDone=latch(),sent=[];
        const text=fs.readFileSync(path.join(__dirname,'server.js'),'utf8').replace(/\r/g,''),apiCode=text.match(/async function apiGet\(url, config = \{\}\) \{[\s\S]*?\n\}/)[0];
        const context={Date,setTimeout,console,providerTrouble:()=>false,adaptiveScan:{providerFailure(){}},addSystemLog(){},apiClient:{get:async url=>{sent.push(url);if(url==='/live'){await liveDone.promise;live=false;}return {data:{response:[],errors:[]},headers:{}};}}};
        vm.runInNewContext('let apiQueue=Promise.resolve(),lastApiRequestTime=0,quotaRemaining=null;const sleep=async()=>{};'+apiCode+';this.queuedApi=apiGet;',context);
        let livePromise;const b=new BankoCoupon({canRun:()=>!live,waitForLiveTick:()=>{tick=latch();return tick.promise;},apiGet:(url,cfg)=>{const p=context.queuedApi(url,cfg);if(first){first=false;live=true;livePromise=context.queuedApi('/live');}return p;}});b.data.latestJob={status:'running',message:'Queue test'};
        const promise=b.call('/odds',{fixture:1});await flush();assert.deepEqual(sent,['/live'],'Banko releases the real shared queue before waiting');assert.equal(b.requestCount,0);assert.equal(b.data.latestJob.status,'waiting-live');
        liveDone.resolve();await livePromise;tick.resolve();await promise;assert.deepEqual(sent,['/live','/odds?fixture=1']);assert.equal(b.requestCount,1);assert.equal(b.data.latestJob.status,'running');
    }
    // Genuine provider/ambiguous failures are never retried even if live work starts concurrently.
    {let live=false,sent=0;const b=new BankoCoupon({canRun:()=>!live,apiGet:async(_,c)=>{c.dinoBeforeAttempt();sent++;live=true;throw Error('SECRET_PROVIDER_URL');},waitForLiveTick:()=>{throw Error('Unexpected retry');}});await assert.rejects(b.call('/odds'),e=>!e.message.includes('SECRET')&&e.message.includes('API isteği tamamlanamadı'));assert.equal(sent,1);assert.equal(b.requestCount,1);}
    {let calls=0;const b=new BankoCoupon({apiGet:async()=>{calls++;throw Error('Unrelated queue failure');},waitForLiveTick:()=>{throw Error('Unexpected retry');}});await assert.rejects(b.call('/odds'),/kuyruğunda/);assert.equal(calls,1);assert.equal(b.requestCount,0);}
    for(const reason of ['reserve','budget','storage']){const {banko:b,state:s}=setup({initialBusy:true});b.start('scan','2099-10-05');await flush();if(reason==='reserve')s.remaining=1500;else if(reason==='budget')b.usage[dayKey(s.now)]=b.data.settings.dailyLimit;else b.storageError='Test storage error';s.ticks.splice(0).forEach(t=>t.resolve());await b.task;assert.equal(b.busy,false);assert.equal(b.data.latestJob.status,'error');assert.equal(b.data.sessions[0].status,'partial');assert.equal(s.sent.length,0,'Hard limits during a pause do not trigger API calls');}
    // Deferred pagination preserves the in-memory cursor instead of refetching page one.
    {let live=false,attempt=0,tick=null;const sent=[];const b=new BankoCoupon({canRun:()=>!live,waitForLiveTick:()=>{tick=latch();return tick.promise;},apiGet:async(url,c)=>{const page=Number(new URL(url,'https://example.invalid').searchParams.get('page'));if(page===2&&attempt++===0)live=true;c.dinoBeforeAttempt();sent.push(page);return {data:{response:[],errors:[],paging:{total:2}}};}});const p=b.odds(1);await flush();assert.deepEqual(sent,[1]);live=false;tick.resolve();await p;assert.deepEqual(sent,[1,2]);assert.equal(b.requestCount,2);}
    for(const started of [false,true]){const {banko:b,state:s,release}=setup({dispatchPause:true,firstKickoff:started?'2099-10-05T14:00:00Z':'2099-10-05T19:00:00Z'});b.start('scan','2099-10-05');await flush();assert(b.data.sessions[0].candidates[0].pick);s.now=new Date('2099-10-05T15:00:00Z');await release();const row=b.data.sessions[0].candidates[0];assert.equal(row.pick,null,'Stale quote/started match is not published after resuming');assert(row.markets[0].reasons.some(r=>r.includes('eski/geçersiz')));if(started)assert(row.markets[0].reasons.some(r=>r.includes('Maç başlamış')));assert.equal(s.sent.filter(u=>u.includes('/odds?fixture=201')).length,1,'Final time check spends no extra API');assert.equal(b.data.sessions[0].status,'complete');}
    // Exact-budget finalization is allowed; only further provider dispatches must stop.
    {const {banko:b,state:s,release}=setup({initialBusy:true});const p=b.waitForLive();await flush();b.usage[dayKey(s.now)]=b.data.settings.dailyLimit;await release();await p;assert.equal(b.requestCount,0);await assert.rejects(b.call('/odds'),/bütçesi doldu/);}
    // Manual result checks can queue behind live work and preserve frozen coupon picks.
    {const {banko:b,state:s,release}=setup();b.start('scan','2099-10-05');await b.task;const session=b.data.sessions[0],before=JSON.stringify(session.coupons.map(c=>c.legs.map(l=>l.pick)));s.now=new Date('2099-10-05T22:00:00Z');s.live=true;const count=s.sent.length;b.start('results','2099-10-05',session.id);await flush();assert.equal(b.data.latestJob.status,'waiting-live');assert.equal(s.sent.length,count);await release();assert.equal(session.coupons[0].result.status,'won');assert.equal(JSON.stringify(session.coupons.map(c=>c.legs.map(l=>l.pick))),before);}
    console.log('Banko pause/resume: initial/mid-scan/real shared-queue race, stable session/cursor/quota, pagination, no provider retries, hard limits, stale quotes/kickoffs, restart safety and manual results passed.');
};
