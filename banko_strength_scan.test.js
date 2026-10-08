'use strict';
const assert=require('assert/strict'),L=require('./banko_strength_lab'),{BankoCoupon}=require('./banko_coupon');
const now=new Date('2099-10-05T08:00:00Z'),date='2099-10-05',schedule=Array.from({length:4},(_,i)=>({fixture:{id:900+i,date:'2099-10-05T19:00:00Z',status:{short:'NS'}},league:{id:99,season:2099,name:'Test League',country:'Test'},teams:{home:{id:i+1,name:'Home '+i},away:{id:6-i,name:'Away '+i}}}));
const histories=[];let fid=1;for(let round=0;round<10;round++)for(let h=1;h<=6;h++)for(let a=1;a<=6;a++){if(h===a)continue;const home=h<=2?2+round%2:h>=5?round%2:1,away=a<=2?2:a>=5?0:1;
    histories.push({fixture:{id:fid,date:new Date(Date.parse('2099-10-01T12:00:00Z')-fid++*3*3600000).toISOString(),status:{short:'FT'}},teams:{home:{id:h},away:{id:a}},score:{fulltime:{home,away},halftime:{home:Math.floor(home/2),away:Math.floor(away/2)}},statistics:[h,a].map(id=>({team:{id},statistics:[{type:'Total Shots',value:10}]}))});}
async function scan(enabled){const requests=[],logs=[];let liveBusy=false,fitCalls=0,waits=0;const oldFit=L.fit;
    const apiGet=async(url,config)=>{config.dinoBeforeAttempt();assert(!liveBusy,'Never dispatch while live is busy');requests.push(url);const u=new URL(url,'https://example.invalid');let response=[];
        if(u.pathname==='/fixtures'&&u.searchParams.has('date'))response=schedule;
        else if(u.pathname==='/fixtures'&&u.searchParams.has('league'))response=histories;
        else if(u.pathname==='/fixtures'&&u.searchParams.has('ids'))response=u.searchParams.get('ids').split('-').map(Number).map(id=>histories.find(f=>f.fixture.id===id));
        else if(u.pathname==='/odds')response=[{fixture:{id:Number(u.searchParams.get('fixture'))},update:now.toISOString(),bookmakers:[{id:8,name:'Bet365',bets:[[5,'Under 4.5'],[26,'Under 3.5'],[6,'Under 1.5'],[5,'Over 1.5'],[17,'Under 1.5'],[20,'Home/Draw']].map(([id,value])=>({id,name:'Test',values:[{value,odd:'1.5'}]}))}]}];
        else if(u.pathname==='/leagues')response=[{seasons:[{year:2099,coverage:{predictions:false,injuries:false}}]}];return {data:{response,errors:[],paging:{total:1}}};};
    const b=new BankoCoupon({now:()=>now,apiGet,canRun:()=>!liveBusy,logger:s=>logs.push(s),waitForLiveTick:async()=>{const before=requests.length;waits++;assert.equal(b.data.latestJob.status,'waiting-live');await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,before,'Fit pause sends no provider request');liveBusy=false;}});b.data.settings.strengthLabEnabled=enabled;
    L.fit=async(...args)=>{fitCalls++;liveBusy=true;return oldFit(...args);};
    try{b.start('scan',date);await b.task;const s=b.status(date).session;assert.equal(s.status,'complete',s.reason);assert.equal(b.data.latestJob.status,'complete');return {b,s,requests,logs,fitCalls,waits};}finally{L.fit=oldFit;}
}
(async()=>{const off=await scan(false),on=await scan(true);assert.equal(off.fitCalls,0);assert.equal(on.fitCalls,1,'Identical league/cutoff/input/baseline fitted once within a manual scan');assert.equal(on.waits,1);assert(on.logs.some(s=>s.includes('aynı işlem kaldığı yerden devam')));
    assert.deepEqual(on.requests,off.requests,'Strength computation adds zero provider calls');assert.equal(on.s.apiUsed,off.s.apiUsed);
    const primary=s=>s.candidates.map(r=>({fixtureId:r.fixtureId,pick:r.pick,goals:r.expectedGoals,markets:r.markets}));assert.deepEqual(primary(on.s),primary(off.s),'Main predictions unchanged with shadow enabled');
    const legs=s=>s.coupons.map(c=>c.legs.map(l=>({fixtureId:l.fixtureId,pick:l.pick})));assert.deepEqual(legs(on.s),legs(off.s));assert.equal(on.s.predictionsSha256,off.s.predictionsSha256);
    assert(off.s.candidates.every(r=>!r.strengthLab));assert(on.s.candidates.every(r=>r.strengthLab?.inputHash&&r.strengthLab.expectedGoals));assert.equal(on.b.status(date).strengthComparison.fixtures,4);
    assert(on.s.candidates.every(r=>r.strengthLab.pick===null||r.strengthLab.pick.spec.kind!=='total'||r.strengthLab.pick.spec.direction!=='under'||r.strengthLab.pick.spec.period==='first'));
    const original=JSON.stringify(on.s);on.b.status(date);assert.equal(JSON.stringify(on.s),original,'Viewing comparison never reruns a fit');const count=on.requests.length;await on.b.runDueChecks();assert.equal(on.requests.length,count,'No automatic strength scans/checks at this time');
    console.log('Banko strength scan: manual integration, same provider request count/API ledger, identical main predictions/coupons/hash, live pause/resume during fit, scan-local fit reuse, shared ALT gates, passive status and no automatic LAB scans passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
