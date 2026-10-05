'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {BankoCoupon,DEFAULTS,schemaSettings,validDay,dayKey}=require('./banko_coupon');
assert.equal(DEFAULTS.dailyLimit,2000);assert.throws(()=>validDay('2026-02-30'));assert.throws(()=>schemaSettings({dailyLimit:-1}));assert.throws(()=>schemaSettings({dailyLimit:null}));assert.throws(()=>schemaSettings({minLegOdd:1.2}));assert.throws(()=>schemaSettings({maxCoupons:3}));assert.throws(()=>schemaSettings({allowedLeagueIds:[1,'2']}));assert.throws(()=>schemaSettings({marketFamilies:[]}));
let now=new Date('2099-10-05T08:00:00Z'),liveBusy=false,remaining=6000,finished=false,callCount=0;const calls=[];
const fixtures=[201,202].map((id,i)=>({fixture:{id,date:'2099-10-05T19:00:00Z',status:{short:'NS'}},league:{id:99,season:2099,name:'Test League',country:'Test'},teams:{home:{id:i?21:11,name:i?'C':'A'},away:{id:i?22:12,name:i?'D':'B'}}}));
const history=[];for(let team=0;team<2;team++)for(let n=0;n<20;n++){const h=team?21:11,a=team?22:12;history.push({fixture:{id:1000+team*100+n,date:new Date(Date.parse('2099-10-03T12:00:00Z')-n*86400000).toISOString(),status:{short:'FT'}},teams:{home:{id:n%2?a:h,name:'Home'},away:{id:n%2?h:a,name:'Away'}},score:{fulltime:{home:2,away:1},halftime:{home:1,away:0}},statistics:[h,a].map(id=>({team:{id},statistics:[{type:'Total Shots',value:12},{type:'Shots on Goal',value:4},{type:'Corner Kicks',value:4}]}))});}
const mock=async(url,config)=>{config.dinoBeforeAttempt();callCount++;const u=new URL(url,'https://example.invalid');calls.push(u);let response=[];
    if(u.pathname==='/fixtures'&&u.searchParams.has('date'))response=fixtures;
    else if(u.pathname==='/fixtures'&&u.searchParams.has('league'))response=history;
    else if(u.pathname==='/fixtures'&&u.searchParams.has('ids'))response=u.searchParams.get('ids').split('-').map(Number).map(id=>history.find(f=>f.fixture.id===id)||{...fixtures.find(f=>f.fixture.id===id),fixture:{id,status:{short:'FT'}},score:{fulltime:{home:finished?2:0,away:0},halftime:{home:0,away:0}}});
    else if(u.pathname==='/fixtures'&&u.searchParams.has('id'))response=[fixtures.find(f=>f.fixture.id===Number(u.searchParams.get('id')))];
    else if(u.pathname==='/odds'){const id=Number(u.searchParams.get('fixture'));response=[{fixture:{id},update:now.toISOString(),bookmakers:[{id:8,name:'Bet365',bets:[{id:5,name:'Goals Over/Under',values:[{value:'Over 1.5',odd:'1.45'}]},{id:80,name:'Cards',values:[{value:'Over 3.5',odd:'1.5'}]}]}]}];}
    else if(u.pathname==='/leagues')response=[{seasons:[{year:2099,coverage:{predictions:false,injuries:false,fixtures:{lineups:true,statistics_fixtures:true}}}]}];
    return {data:{response,errors:[],paging:{total:1}}};};
fs.mkdirSync(path.join(__dirname,'test-temp'),{recursive:true});
const dir=fs.mkdtempSync(path.join(__dirname,'test-temp/banko-safety-'));
(async()=>{
    const b=new BankoCoupon({directory:dir,apiGet:mock,now:()=>now,canRun:()=>!liveBusy,getQuotaRemaining:()=>remaining});b.load();
    assert.equal(callCount,0,'No startup API calls');await b.runDueChecks();assert.equal(callCount,0,'No automatic scans/results without saved coupons');
    assert.throws(()=>b.start('scan','2099-10-04'));assert.throws(()=>b.start('scan','2099-10-14'));assert.throws(()=>b.start('results','2099-10-05'));
    b.start('scan','2099-10-05');assert.throws(()=>b.start('scan','2099-10-05'));assert.throws(()=>b.settings({dailyLimit:100}));await b.task;
    const first=b.status('2099-10-05').session;assert.equal(first.status,'complete',first.reason);assert.equal(first.coupons.length,1);assert.equal(first.coupons[0].legs.length,2);assert.equal(first.coupons[0].originalOdd,1.45*1.45);assert.equal(first.candidates[0].markets.find(m=>m.betId===80).eligible,false);
    assert.equal(b.usage[dayKey(now)],callCount);assert.equal(first.inputCutoffDay,'2099-10-04');assert(first.candidates.every(r=>r.profiles.home.rows.every(h=>Date.parse(h.date)+3*3600000<Date.parse('2099-10-05T00:00:00+03:00'))));
    const before=JSON.stringify(first.coupons.map(c=>c.legs.map(l=>l.pick))),beforeHash=first.predictionsSha256;
    const countBeforeCheck=callCount;b.start('check','2099-10-05',first.id);await b.task;const checked=b.status('2099-10-05',first.id).session;assert.equal(checked.coupons[0].check.status,'warning','Unknown injuries / missing lineup must not be green approval');assert(callCount>countBeforeCheck);assert.equal(JSON.stringify(checked.coupons.map(c=>c.legs.map(l=>l.pick))),before);assert.equal(checked.predictionsSha256,beforeHash);
    b.start('scan','2099-10-05');await b.task;assert.equal(b.data.sessions.length,2);assert.equal(b.data.sessions[0].id,first.id);assert.equal(b.data.sessions[0].predictionsSha256,beforeHash,'Rescan keeps original frozen coupon');
    const c1=b.status('2099-10-05',first.id).session;assert.equal(c1.id,first.id);
    const reload=new BankoCoupon({directory:dir,apiGet:mock,now:()=>now,canRun:()=>!liveBusy,getQuotaRemaining:()=>remaining});reload.load();assert.equal(reload.usage[dayKey(now)],b.usage[dayKey(now)]);assert.equal(reload.data.sessions.length,2,'Restart preserves budget and all versions');
    liveBusy=true;assert.throws(()=>reload.start('scan','2099-10-05'));liveBusy=false;remaining=1500;assert.throws(()=>reload.start('scan','2099-10-05'));remaining=6000;
    now=new Date('2099-10-05T18:00:00Z');const beforeAuto=callCount;await reload.runDueChecks();assert(callCount>beforeAuto);const afterAuto=callCount;await reload.runDueChecks();assert.equal(callCount,afterAuto,'Automatic selected checks are once-only');
    now=new Date('2099-10-05T22:00:00Z');finished=true;reload.start('results','2099-10-05',first.id);await reload.task;const settled=reload.status('2099-10-05',first.id).session;assert.equal(settled.coupons[0].result.status,'won');assert.equal(settled.coupons[0].result.profitUnits,1.45*1.45-1);assert.equal(settled.predictionsSha256,beforeHash);const countSettled=callCount;reload.start('results','2099-10-05',first.id);await reload.task;assert.equal(callCount,countSettled,'Settled results are not repeatedly queried');
    const capped=new BankoCoupon({apiGet:mock,now:()=>now});capped.data.settings.dailyLimit=20;capped.usage[dayKey(now)]=20;assert.throws(()=>capped.start('discover','2099-10-06'));assert.equal(callCount,countSettled);
    const damaged=fs.mkdtempSync(path.join(__dirname,'test-temp/banko-corrupt-')),file=path.join(damaged,'dino_banko_coupon_v1.json');fs.writeFileSync(file,'broken');const corrupt=new BankoCoupon({directory:damaged,apiGet:mock,now:()=>now});corrupt.load();assert(corrupt.storageError);assert.throws(()=>corrupt.start('scan','2099-10-06'));assert.equal(fs.readFileSync(file,'utf8'),'broken');
    assert(calls.every(u=>!u.pathname.includes('telegram')));assert(!fs.readFileSync('banko_coupon.js','utf8').includes('sendMessage'));
    const hash=crypto.createHash('sha256').update(JSON.stringify(settled.coupons.map(c=>c.legs.map(l=>({fixtureId:l.fixtureId,pick:l.pick}))))).digest('hex');assert.equal(hash,beforeHash);
    console.log('Banko service: mocked scan/check/results, persistent 2000 ceiling, restart, cache, queue dispatch quota, overlap/live/reserve protection, frozen revisions, once-only precheck, manual results and corrupt-file preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
