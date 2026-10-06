'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {briefStatsAnalysis,shortAnalysis,formatSignal}=require('./mac_yakala_telegram');
const {createV24Router}=require('./v24_telegram_router');
const at='2026-10-06T18:00:00.000Z';
const liveStats={home:{shots:5,shotsOnGoal:2,corners:2},away:{shots:5,shotsOnGoal:1,corners:2}};
const record={market:'2.5_UST',score:'1-0',liveStats};
assert.equal(briefStatsAnalysis(record),'Toplam 10 şut, 3 isabetli şut, 4 korner. 2.5 ÜST için 2 gol daha gerekiyor.');
assert.equal(briefStatsAnalysis({...record,market:'1.5_UST',score:'0-0'}),'Toplam 10 şut, 3 isabetli şut, 4 korner. 1.5 ÜST için 2 gol daha gerekiyor.');
assert(briefStatsAnalysis({...record,score:'1-1'}).endsWith('2.5 ÜST için 1 gol daha gerekiyor.'));
assert.equal(briefStatsAnalysis({...record,market:'MS2',score:'0-1'}),'Deplasman: 5 şut, 1 isabetli şut, 2 korner. MS2: deplasman galibiyeti seçildi.');
assert.equal(briefStatsAnalysis({...record,market:'MS1'}),'Ev sahibi: 5 şut, 2 isabetli şut, 2 korner. MS1: ev sahibi galibiyeti seçildi.');
const partial={home:{shots:5,shotsOnGoal:2,corners:null},away:{shots:5,shotsOnGoal:null,corners:2}};
assert.equal(briefStatsAnalysis({...record,liveStats:partial}),'Toplam 10 şut. 2.5 ÜST için 2 gol daha gerekiyor.','Missing side is not treated as zero');
assert.equal(briefStatsAnalysis({...record,liveStats:{}}),'Canlı şut/isabet/korner verisi eksik. 2.5 ÜST için 2 gol daha gerekiyor.');
assert.equal(briefStatsAnalysis({...record,market:'MS2',liveStats:{home:liveStats.home}}),'Seçilen tarafın şut/isabet/korner verisi eksik. MS2: deplasman galibiyeti seçildi.');
const zero={shots:0,shotsOnGoal:'0',corners:0};
assert(briefStatsAnalysis({...record,liveStats:{home:zero,away:zero}}).startsWith('Toplam 0 şut, 0 isabetli şut, 0 korner.'));
for(const bad of [null,undefined,'',' ',true,false,-1,1.5,NaN,Infinity,1001,{},[5],new Number(5),'<b>99</b>']) {
    const badStats={home:{shots:bad,shotsOnGoal:bad,corners:bad},away:liveStats.away};
    assert(briefStatsAnalysis({...record,liveStats:badStats}).startsWith('Canlı şut/isabet/korner verisi eksik.'),String(bad));
}
assert.equal(briefStatsAnalysis({...record,liveStats:{home:{shots:1,shotsOnGoal:2},away:{shots:1,shotsOnGoal:0}}}),
    'Toplam 2 şut. 2.5 ÜST için 2 gol daha gerekiyor.','Impossible shots-on-goal summary omitted, not repaired');
assert.equal(shortAnalysis('2.5 üstü ihtimalini destekliyor.','2.5_UST'),'2.5 üstü ihtimalini destekliyor.');
const long='a'.repeat(100)+'. '+'b'.repeat(100)+'.';
assert(shortAnalysis(long,'2.5_UST').length<=180,'Total cap, not per-sentence cap');
for(const sample of [record,{...record,liveStats:{home:{shots:1000,shotsOnGoal:1000,corners:1000},away:{shots:1000,shotsOnGoal:1000,corners:1000}}},
    {...record,market:'MS1'},{...record,market:'MS2'}, {...record,liveStats:{}}, {...record,score:'bad'}, {...record,market:'X'}]) {
    const text=briefStatsAnalysis(sample);
    assert(text.length<=180);assert(text.split(/(?<=[.!?])\s+/).length<=2);
    assert(!/baskı|tempo|garanti|kesin|EDGE|%|Dino/i.test(text));
    assert.equal(shortAnalysis(text,sample.market),text,'Telegram second formatting pass is stable');
}
const sends=[],shared={data:{signals:[]}};
const delivery={disabled:false,data:{v24ActivatedAt:'2026-10-05T00:00:00Z',entries:[]},tracker:shared,hasFixture:()=>false};
const router=createV24Router({delivery,channel:'offline',
    v16Model:{MODEL:{version:'offline'},scoreMarket:()=>({selectorProbability:74})},
    v18Model:{scoreMarket:()=>({v18Probability:70})},
    prematchSupport:m=>m.pre,prematchSource:()=>null,liveSnapshot:m=>m.liveStats,now:()=>Date.parse(at)});
const mac={fixture_id:1,home_team_id:10,away_team_id:20,mac_isim:'Home - Away',lig:'Test',dakika:33,skor:'1-0',
    pre:52,canli_oranlar:{'2.5_UST':{oran:1.55}},liveStats,
    stats_validation:{status:'passed',verifiedAt:at},_v23EventsAt:at,
    _v23Events:[{type:'Goal',detail:'Normal Goal',team:{id:10},player:{id:1},time:{elapsed:12}}]};
const dino={'2.5_UST':54,MODEL_VARYANTI:'live_plus_prematch'};
const group=router.select({mac,dino,capturedAt:at})[0];assert(group);
for(const raw of ['Toplam 999 şut, gol garantili!','Genel bir yorum.', '', 'a'.repeat(1000), 'EDGE %99 Dino value.']) {
    const payload=router.record(mac,group,raw,at);assert(payload);
    assert.equal(payload.analysis,briefStatsAnalysis(record),'Entry snapshot, not generated numbers');
    assert.equal(payload.entryAudit.thresholds.prematch,52);assert.equal(payload.entryAudit.eventScore.status,'approve');
    assert.equal(payload.edge,-10.5);assert.equal(payload.matchedFilters[0],'A');
    const text=formatSignal(payload);sends.push(text);
    assert(text.endsWith(payload.analysis));assert(!text.includes('999'));assert(text.includes('Model:</b> V24'));
}
assert(sends.every(text=>text===sends[0]),'Main/group/channel formatting is deterministic');
group.oran=2;assert.equal(router.record(mac,group,'Brief comment',at),null,'Final Dino edge gate unchanged');
group.oran=1.55;shared.data.signals.push({fixtureId:1});
assert.equal(router.record(mac,group,'Brief comment',at),null,'First-signal lock unchanged');
const sharing=fs.readFileSync(path.join(__dirname,'sharing_delivery.js'),'utf8');
assert(sharing.includes('formatSignal(primary.payload)'),'Mirrors use the same formatter');
console.log('Telegram brief stats: entry snapshot only, <=180 chars/two sentences, selected MS side, partial/missing/zero/invalid data, no fabricated pressure, stable formatting, original gates and shared locks passed.');
