'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {SignalTracker}=require('./signal_tracker');
const {TelegramDelivery,formatSignal}=require('./mac_yakala_telegram');
const {createV24Router}=require('./v24_telegram_router');
const {createV24Lab}=require('./v24_lab');
const tariff=require('./v24_tariff');
const {createLegacyTelegramLab}=require('./legacy_telegram_lab');
const gate=require('./v23_entry_gate');
const originalGate=require('./v23_filter_lab');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'v24-live-transition-'));
let now=Date.parse('2026-10-05T10:00:00Z'),mode='ok';const sends=[];
const stamp=()=>new Date(now).toISOString();
function tracker(name){const t=new SignalTracker({filePath:path.join(root,name+'.json'),strict:true});t.load();return t;}
const shared=tracker('shared'),baseline=tracker('baseline'),legacyTracker=tracker('legacy');
const v16={MODEL:{version:'test16'},scoreMarket:(m,market)=>({selectorProbability:m.p16??(market.startsWith('MS')?65:74)})};
const v18={scoreMarket:()=>({v18Probability:70})};
const common={v16Model:v16,v18Model:v18,prematchSupport:m=>m.pre??80,prematchSource:()=>null,liveSnapshot:()=>({})};
function mac(id,score='1-0',market='1.5_UST',extra={}) {const goals=score.split('-').map(Number);return {
    fixture_id:id,mac_isim:'Home W - Away W',lig:'Women League',home_team_id:10,away_team_id:20,
    skor:score,dakika:30,canli_oranlar:{[market]:{oran:1.6}},
    stats_validation:{status:'passed',verifiedAt:stamp()},stats_received_at:stamp(),stats_identity_verified:true,
    home_shot:8,home_sot:2,away_shot:8,away_sot:2,
    _v23EventsAt:stamp(),_v23Events:Array.from({length:goals[0]+goals[1]},(_,i)=>({
        type:'Goal',detail:'Normal Goal',team:{id:i<goals[0]?10:20},player:{id:100+i},time:{elapsed:10+i}})),...extra};}
const dino=m=>({MODEL_VARYANTI:'live_plus_prematch',...Object.fromEntries(Object.keys(m.canli_oranlar).map(k=>[k,54]))});
const send=async(channel,text)=>{sends.push(text);if(mode==='timeout')throw Error('timeout');if(mode==='400')throw Object.assign(Error('declined'),{response:{body:{error_code:400}}});return {message_id:sends.length,chat:{id:channel}};};
let delivery=new TelegramDelivery({filePath:path.join(root,'ledger.json'),tracker:shared,send,now:()=>now,liveSource:'V24'});delivery.load();
let router=createV24Router({delivery,channel:'offline',baselineTracker:baseline,...common,now:()=>now});
const choose=m=>router.select({mac:m,dino:dino(m)});
const payload=(m,g=choose(m)[0])=>router.record(m,g,'2.5 üstü ihtimalini destekliyor.',stamp());
(async()=>{
    const activation=delivery.data.v24ActivatedAt;
    for(const [id,score,market,branch]of [[1,'0-0','1.5_UST','SNIPER'],[2,'1-0','1.5_UST','B'],[3,'0-1','2.5_UST','A'],[4,'0-1','MS2','MS']]) {
        const m=mac(id,score,market);const groups=choose(m);assert.equal(groups.length,1);
        const p=payload(m,groups[0]);assert.equal(p.matchedFilters[0],branch);assert.equal(p.entryAudit.eventScore.status,'approve');
        assert.equal(await delivery.publish('offline',p),true);assert.equal(choose(m).length,0);
        assert(!sends.at(-1).includes('Öncelikli'));assert(sends.at(-1).includes('Model:</b> V24'));
        assert(shared.data.signals.at(-1).entryAudit);
    }
    assert.equal(sends.length,4);assert(formatSignal(shared.data.signals[0]).includes('1.5 ÜST'));
    const same=mac(1,'1-0','MS1');assert.equal(choose(same).length,0,'One shared lock across over and winner branches');
    for(const minute of [24,71,80])assert.equal(choose(mac(20+minute,'1-0','1.5_UST',{dakika:minute})).length,0);
    assert.equal(choose(mac(100,'1-0','1.5_UST',{dakika:70})).length,1);
    const drift=mac(101);let g=choose(drift)[0];g.oran=2;assert.equal(payload(drift,g),null,'Positive final Dino edge vetoes over');
    const late=mac(102);g=choose(late)[0];late.dakika=71;assert.equal(payload(late,g),null,'Final minute must remain <=70');
    const winner=mac(103,'1-0','MS1');g=choose(winner)[0];g.oran=2.5;assert.equal(payload(winner,g),null,'Final MS edge also rechecked');
    const mismatch=mac(104);mismatch._v23Events=[];assert.equal(payload(mismatch),null);
    const stale=mac(105);stale.stats_validation.verifiedAt=new Date(now-1200000).toISOString();assert.equal(payload(stale),null);
    baseline.recordSent({fixtureId:200,signalType:'strong',sentAt:new Date(now-1000).toISOString(),market:'1.5_UST',odds:1.6});
    assert.equal(choose(mac(200)).length,0,'Old LAB entries cannot be replayed into live Telegram');
    baseline.recordSent({fixtureId:201,signalType:'strong',sentAt:stamp(),market:'1.5_UST',odds:1.6});
    assert.equal(choose(mac(201)).length,1,'A concurrent new LAB record does not consume the live lock');
    const old={...shared.data.signals[0],fixtureId:202,signalSources:['V22']};
    assert.equal(await delivery.publish('offline',old),false,'Old environment flags cannot restore old live writes');
    delivery.data.entries.push({key:'old-uncertain',requestedChannel:'offline',status:'uncertain',payload:old});delivery.save();
    assert.equal(choose(mac(202)).length,0,'Prior uncertain source delivery blocks V24 for that fixture');
    mode='timeout';const uncertain=mac(203);assert.equal(await delivery.publish('offline',payload(uncertain)),false);
    mode='ok';assert.equal(choose(uncertain).length,0);
    mode='400';let retry=mac(204);assert.equal(await delivery.publish('offline',payload(retry)),false);
    mode='ok';retry=mac(204);assert.equal(await delivery.publish('offline',payload(retry)),true,'Explicit rejection allows a new fresh candidate');
    now+=1000;delivery=new TelegramDelivery({filePath:path.join(root,'ledger.json'),tracker:shared,send,now:()=>now,liveSource:'V24'});delivery.load();
    router=createV24Router({delivery,channel:'offline',baselineTracker:baseline,...common,now:()=>now});
    assert.equal(delivery.data.v24ActivatedAt,activation);assert.equal(choose(mac(1)).length,0);assert.equal(choose(mac(203)).length,0);
    const gemTracker=tracker('gem');const gem=createV24Lab({tracker:gemTracker,...common,policy:tariff.POLICIES.geminiWeekend});
    assert.equal(tariff.POLICIES.geminiWeekend.weekendOnly,false);assert.equal(tariff.POLICIES.geminiWeekend.womenExcluded,false);
    assert(gem.record({mac:mac(300),dino:dino(mac(300)),capturedAt:stamp()}).record,'Gemini women work on Monday');
    assert.equal(tariff.POLICIES.weekendQuiet.weekendOnly,true);assert.equal(tariff.POLICIES.weekendQuiet.womenExcluded,true);
    for(const minute of [25,68])assert(gem.preselect(mac(301+minute,'1-0','1.5_UST',{dakika:minute}),dino(mac(0)),stamp()));
    assert.equal(gem.preselect(mac(370,'1-0','1.5_UST',{dakika:69}),dino(mac(0)),stamp()),false);
    const legacy=createLegacyTelegramLab({tracker:legacyTracker,...common,alreadyDecided:()=>false});
    let lm=mac(400,'0-0','0.5_UST',{home_sot:0,away_sot:0});
    assert.equal(legacy.record({mac:lm,dino:dino(lm),capturedAt:stamp()}).length,0,'Old quality gate retained');
    lm=mac(400,'0-0','0.5_UST');assert.equal(legacy.record({mac:lm,dino:dino(lm),capturedAt:stamp()}).length,1);
    assert.equal(legacy.record({mac:lm,dino:dino(lm),capturedAt:stamp()}).length,0,'Legacy owns independent first approved source lock');
    assert.equal(legacy.metadata().telegram,false);
    for(const [score,market,minute,sot,routes]of [['1-0','1.5_UST',70,0,['C']],['0-0','0.5_UST',74,0,['C']],['1-0','2.5_UST',30,0,['A','B']],['1-0','1.5_UST',70,2,['C']]]) {
        const m=mac(500,score,market,{dakika:minute,home_sot:sot,away_sot:sot});
        const args={signal:{fixtureId:500,score,market,minute,sentAt:stamp()},mac:m,sourceModel:'v22',matchedFilters:routes};
        assert.deepEqual(gate.evaluate(args),originalGate.evaluate(args));
        assert.deepEqual(gate.v22Gate(gate.evaluate(args)),originalGate.v22Gate(originalGate.evaluate(args)));
    }
    const live=shared.data.signals.find(s=>s.fixtureId===4);assert.equal(live.market,'MS2');
    shared.settleFixture({fixture:{id:4,status:{short:'FT'}},score:{fulltime:{home:0,away:2}}});
    assert.equal(shared.data.signals.find(s=>s.fixtureId===4).settlement.result,'W');
    const ledgerBytes=fs.readFileSync(delivery.filePath);assert(ledgerBytes.includes(Buffer.from('v24ActivatedAt')));
    console.log('V24 live transition: four arms, women, final minute/odds/edge/event gates, activation/no-backfill, shared fixture/restart/uncertain locks, legacy gate parity, weekday Gemini and MS settlement passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
    if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('v24-live-transition-'))fs.rmSync(root,{recursive:true,force:true});
});
