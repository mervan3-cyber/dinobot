'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {deliveryCheck}=require('./v24_delivery_audit');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const body=source.slice(source.indexOf('function gecerliGolOlaylariniAyikla('),source.indexOf('async function telegramSinyaliGonder('));
assert(body.includes('async function sinyalOncesiCanlilikDogrula('));
let options={},calls=[],waits=[];
const goal=minute=>({type:'Goal',detail:'Normal Goal',time:{elapsed:minute}});
const ctx=vm.createContext({deliveryCheck,Date,console,
    STALE_GOAL_GUARD:{enabled:true,confirmationDelayMs:12000,maximumOddDrift:.03,recentGoalCooldownMinutes:2},
    TELEGRAM_MIN_MINUTE:25,TELEGRAM_MAX_MINUTE:80,ACTIVE_MIN_SIGNAL_ODD:1.5,
    normalizeText:v=>String(v||'').toLowerCase(),addSystemLog(){},sleep:async ms=>waits.push(ms),
    canliFixtureUygunMu:(f,low,high)=>['1H','2H'].includes(f?.fixture?.status?.short)&&f.fixture.status.elapsed>=low&&f.fixture.status.elapsed<=high,
    parseLiveOdds:v=>v.odds,
    apiGet:async url=>{
        calls.push(url);
        if(url==='/fixtures?id=1'){
            if(options.fixtureFail)throw Error('offline provider failure');
            return {data:{response:options.missingFixture?[]:[{fixture:{id:options.wrongId?2:1,status:{short:options.status||'1H',elapsed:options.minute??44}},
                goals:{home:options.home??0,away:options.missingScore?null:options.away??1}}]}};
        }
        if(url==='/odds/live'){
            if(options.oddsFail)throw Error('offline provider failure');
            return {odds:new Map(options.noOdds?[]:[[1,options.closedMarket?{}:{'2.5_UST':{oran:options.odd??1.55}}]])};
        }
        if(url==='/fixtures/events?fixture=1'){
            if(options.eventsFail)throw Error('offline provider failure');
            return {data:{response:options.events??[goal(12)]}};
        }
        throw Error('Unexpected API call '+url);
    }});
vm.runInContext(body,ctx);
async function check(config,code,expected=false){
    options=config;calls=[];waits=[];
    const mac={fixture_id:1,mac_isim:'Offline',skor:'0-1',dakika:44,_v23Events:[goal(12)],_v23EventsAt:new Date().toISOString()};
    const group={market:'2.5_UST',oran:1.55,minimum_oran:1.5,maximum_oran:4};
    const result=await ctx.sinyalOncesiCanlilikDogrula(mac,[group]);
    assert.equal(result,expected,JSON.stringify(config));assert.deepEqual(waits,[12000],'Safety delay is retained');
    assert.equal(calls.length,3,'Exactly the existing fixture/odds/events requests; no extra requests');
    assert.deepEqual([...mac._v24FinalGateAudit.codes],code?[code]:[]);
    assert.equal(mac._v24FinalGateAudit.status,expected?'approved':'blocked');
    assert.equal(mac.skor,'0-1','A rejected final score cannot overwrite the frozen entry');
    return {mac,group};
}
(async()=>{
    await check({},null,true);
    await check({minute:81},'FINAL_NOT_LIVE');await check({status:'FT'},'FINAL_NOT_LIVE');
    await check({missingFixture:true},'FINAL_NOT_LIVE');await check({missingScore:true},'FINAL_SCORE_UNAVAILABLE');
    await check({away:2},'FINAL_SCORE_CHANGED');await check({wrongId:true},'FINAL_FIXTURE_MISMATCH');
    await check({noOdds:true},'FINAL_ODDS_UNAVAILABLE');await check({closedMarket:true},'FINAL_ODDS_UNAVAILABLE');
    await check({odd:1.49},'FINAL_ODDS_OUTSIDE');await check({odd:4.1},'FINAL_ODDS_OUTSIDE');
    await check({odd:1.59},'FINAL_ODDS_DRIFT');
    const small=await check({odd:1.56},null,true);assert.equal(small.group.oran,1.56,'Final actual odds are retained');
    await check({events:[goal(12),goal(30)]},'FINAL_EVENTS_AHEAD');
    await check({events:[goal(42)]},'FINAL_RECENT_GOAL');await check({events:[goal(43)]},'FINAL_RECENT_GOAL');
    await check({events:[goal(41)]},null,true);
    await check({events:[goal(12),{...goal(43),detail:'Disallowed Goal'}]},null,true);
    await check({fixtureFail:true},'FINAL_VERIFICATION_UNAVAILABLE');await check({oddsFail:true},'FINAL_VERIFICATION_UNAVAILABLE');
    await check({eventsFail:true},null,true); // Router still checks the existing fresh cached event/score audit.
    const late=await check({minute:71},null,true);assert.equal(late.mac.dakika,71); // Stricter V24 tariff rejects this subsequently.
    console.log('Real final live gate: safety delay, three unchanged requests, live state, identity, score, odds limits/drift, goal cooldown, event consistency, provider failures and diagnostic codes passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
