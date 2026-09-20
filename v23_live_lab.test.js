'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const live=require('./v23_live_lab'),{GoalLab}=require('./v23_goal_lab'),{SignalTracker}=require('./signal_tracker');
const {indexRecord}=require('./v23_archive'),v21=require('./v21_tariff'),v22=require('./v22_tariff');
const clone=v=>JSON.parse(JSON.stringify(v)),at=m=>new Date(Date.UTC(2026,8,20,12,m)).toISOString();
const state=(minute=60,extra={})=>({fixture_id:1,home_team_id:10,away_team_id:20,stats_identity_verified:true,
    dakika:minute,status_short:'2H',skor:'0-0',stats_received_at:at(minute),_v23EventsAt:at(minute),_v23Events:[],
    home_shot:10,away_shot:6,home_sot:3,away_sot:2,home_corner:3,away_corner:2,home_red:0,away_red:0,home_xg:1,away_xg:.5,
    _v23LiveStats:{home:{shotsInsidebox:6,shotsOutsidebox:4,blockedShots:1},away:{shotsInsidebox:3,shotsOutsidebox:3,blockedShots:1}},...extra});
const signal=(s,extra={})=>({fixtureId:s.fixture_id,signalId:'offline',tariffVersion:v21.VERSION,sourceModel:'v21',sentAt:s.stats_received_at,
    match:'Offline',minute:s.dakika,score:s.skor,market:'1.5_UST',odds:1.6,edge:-2,dinoProbability:60,selectorV2Probability:65,v18Probability:66,
    prematchMarketSupport:80,statsValidation:{status:'passed',verifiedAt:s.stats_received_at},...extra});
const get=(a,id)=>a.controls.find(c=>c.id===id);
function run(base,current=state(60),extra={}) {
    const observations=new live.LiveObservations();
    if(base)observations.capture(base,base.stats_received_at);
    observations.capture(current,current.stats_received_at);
    return live.evaluate({signal:signal(current),mac:current,observations,...extra});
}
const base=state(50,{home_shot:7,away_shot:4,home_sot:2,away_sot:1,home_corner:2,away_corner:2,home_xg:.7,away_xg:.35,
    _v23LiveStats:{home:{shotsInsidebox:4,shotsOutsidebox:3,blockedShots:1},away:{shotsInsidebox:2,shotsOutsidebox:2,blockedShots:0}}});
const active=run(base);
assert(live.validAudit(active));assert.equal(active.decisionImpact,false);assert.equal(active.thresholdsFitted,false);
for(const id of ['tempo10','quality','xg','combined','combined_xg'])assert.equal(get(active,id).status,'approve',id);
assert.equal(get(active,'tempo5').status,'insufficient');assert.equal(get(active,'context').values.goalsNeeded,2);
assert.equal(get(active,'quality').values.windowMinutes,10);assert.equal(get(active,'tempo10').values.totals.shot,5);
assert.equal(get(active,'tempo10').values.deltas.home.shot,3);assert.equal(get(active,'tempo10').values.deltas.away.shot,2);
const still=run(state(50));assert.equal(get(still,'tempo10').status,'reject');assert.equal(get(still,'xg').status,'reject');
assert.equal(get(still,'quality').status,'observed','Zero attempts is not a bad-shot quality verdict');assert.equal(get(still,'combined').status,'reject');
const noData=run(base,state(60,{home_shot:null}));assert.equal(get(noData,'tempo10').status,'insufficient');
assert.equal(get(noData,'tempo10').reasons[0],'FULL_STATS_MISSING');
for(const x of [null,undefined,'',false,-1,NaN])assert.equal(get(run(base,state(60,{home_sot:x})),'tempo10').status,'insufficient');
const missingOptional=run(base,state(60,{_v23LiveStats:null,home_xg:null}));
assert.equal(get(missingOptional,'tempo10').status,'approve');assert.equal(get(missingOptional,'quality').status,'insufficient');
assert.equal(get(missingOptional,'xg').status,'insufficient');assert.equal(get(missingOptional,'combined').status,'insufficient');
assert.equal(get(missingOptional,'combined_xg').status,'insufficient');
const noXg=run(base,state(60,{home_xg:null}));assert.equal(get(noXg,'combined').status,'approve');assert.equal(get(noXg,'combined_xg').status,'insufficient');
assert.equal(get(run(null),'tempo10').reasons[0],'WINDOW_WARMING');
assert.equal(get(run(state(53)),'tempo5').values.windowMinutes,7,'Never call 7 minutes 5 minutes');
assert.equal(get(run(state(58)),'tempo5').status,'insufficient');
for(const [extra,reason]of [[{stats_identity_verified:false},'STATE_INVALID'],[{away_team_id:'10'},'STATE_INVALID'],
    [{status_short:'HT'},'HALF_NOT_LIVE'],[{status_short:'1H'},'HALF_NOT_LIVE'],[{home_sot:100},'FULL_STATS_MISSING']]) {
    assert.equal(get(run(base,state(60,extra)),'tempo10').reasons[0],reason);
}
const snapshots=new live.LiveObservations();snapshots.capture(base,base.stats_received_at);
for(const statsAt of [at(57),at(61),null])assert.equal(snapshots.evidence(state(60,{stats_received_at:statsAt}),at(60)).reason,'STATS_NOT_FRESH');
assert.equal(get(run(base,state(60,{home_red:1})),'tempo10').reasons[0],'RED_CONTEXT');
assert.equal(get(run(base,state(60,{away_red:null})),'tempo10').reasons[0],'RED_CONTEXT');
assert.equal(get(run(base,state(60,{skor:'1-0'})),'tempo10').reasons[0],'STATE_CHANGED');
assert.equal(get(run(base,state(60,{home_team_id:99})),'tempo10').reasons[0],'STATE_CHANGED');
assert.equal(get(run(state(44,{status_short:'1H'}),state(54)),'tempo10').reasons[0],'WINDOW_WARMING');
assert.equal(get(run(base,state(60,{stats_received_at:at(70)})),'tempo10').reasons[0],'CLOCK_GAP');
assert.equal(get(run(base,state(60,{home_shot:6})),'tempo10').reasons[0],'STATS_CORRECTED');
assert.equal(get(run(base,state(60,{home_xg:.6})),'xg').reasons[0],'XG_CORRECTED');
const correctedBox=state(60);correctedBox._v23LiveStats.home.shotsInsidebox=3;
assert.equal(get(run(base,correctedBox),'quality').reasons[0],'BOX_CORRECTED');
const badBox=state(60);badBox._v23LiveStats.home.shotsInsidebox=99;
assert.equal(get(run(base,badBox),'quality').status,'insufficient');
for(const event of [{type:'Goal',detail:'Normal Goal'},{type:'Card',detail:'Red Card'}]) {
    const a=run(base,state(60,{_v23Events:[{...event,time:{elapsed:55}}]}));
    assert.equal(get(a,'tempo10').reasons[0],'EVENT_IN_WINDOW');
}
const substitution=run(base,state(60,{_v23Events:[{type:'subst',time:{elapsed:55}}]}));
assert.equal(get(substitution,'tempo10').status,'approve');assert.equal(get(substitution,'tempo10').values.substitutions,1);
assert.equal(get(run(base,state(60,{_v23Events:null})),'tempo10').values.eventsAvailable,false);
const timeline=new live.LiveObservations();timeline.capture(base,at(50));timeline.capture(base,at(50));timeline.capture(base,at(51));
assert.equal(timeline.metadata().snapshots,1,'Repeated provider sample is not new evidence');
assert.equal(timeline.entries.get(1).snapshots[0].events,undefined,'Do not duplicate event payloads throughout RAM ring');
timeline.capture(state(49),at(49));assert.equal(timeline.metadata().snapshots,1);
timeline.capture(state(55,{home_xg:.6}),at(55));timeline.capture(state(60),at(60));
assert.equal(get(live.evaluate({signal:signal(state()),mac:state(),observations:timeline}),'xg').reasons[0],'XG_CORRECTED','Intermediate correction detected');
const mismatch=run(base,state(),{signal:{...signal(state()),minute:59}});assert.equal(get(mismatch,'tempo10').reasons[0],'SIGNAL_MISMATCH');
const bounded=new live.LiveObservations({maxFixtures:2,maxSnapshots:3});
for(let minute=50;minute<=60;minute++)bounded.capture(state(minute),at(minute));
assert.equal(bounded.metadata().snapshots,3);
for(const id of [2,3])bounded.capture(state(60,{fixture_id:id}),at(60));assert.equal(bounded.entries.size,2);assert(!bounded.entries.has(1));
bounded.releaseFixture(2);assert.equal(bounded.entries.size,1);bounded.prune(Date.parse(at(60))+7*3600000);assert.equal(bounded.entries.size,0);
const fullBound=new live.LiveObservations({maxFixtures:9999,maxSnapshots:9999});
assert.equal(fullBound.maxFixtures,300);assert.equal(fullBound.maxSnapshots,48);

// Outcome arithmetic, missing-data pass-through, disjoint sources and exact-entry union.
const tracker=new SignalTracker({filePath:'not-used'}),rows=[];
for(const [id,result,verdict]of [[1,'W','approve'],[2,'L','reject'],[3,'W','reject'],[4,'L','insufficient'],[5,null,'approve']]) {
    const a=clone(active);for(const c of a.controls)c.status=verdict;
    rows.push({...signal(state()),fixtureId:id,audit:{live:a},settlement:{result,profit:result==='W'?.6:result==='L'?-1:null},sourceModel:'v21'});
}
rows.push({...clone(rows[0]),sourceModel:'v22',matchedFilters:['C']});
rows.push({...clone(rows[1]),fixtureId:6,sourceModel:'v22',matchedFilters:['A','C']});
const summary=live.comparison([...rows,{...signal(state()),audit:{},sourceModel:'v21'}],r=>tracker.summary(r));
const control=summary.sources.v21.controls.find(c=>c.id==='tempo10');
assert.equal(summary.oldRecordsExcluded,1);assert.equal(summary.uniqueEntries,6);assert.equal(summary.sourceRecords,7);
assert.equal(control.approve.total,2);assert.equal(control.approve.pending,1);assert.equal(control.missedWinners,1);assert.equal(control.avoidedLosses,1);
assert.equal(control.profitDifference,.4);assert.equal(control.rejectOnly.losses,1,'Insufficient loss is retained');
assert.equal(summary.focus.v21ZeroZero.baseline.total,5);assert.equal(summary.focus.v22COnly.baseline.total,1);assert.equal(summary.v22Filters.C.baseline.total,2);

// Real storage/settlement and restart: never retrofill earlier decisions.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-live-lab-'));
const cache={get:()=>null,metadata:()=>({})};
try {
    const lab=new GoalLab({filePath:path.join(root,'history.json'),cache});
    lab.capture(base,base.stats_received_at);
    const current=state(),s=signal(current);current.stats_validation={status:'passed',verifiedAt:s.sentAt};
    const before=JSON.stringify(s),record=lab.observe(s,current);assert.equal(JSON.stringify(s),before);
    assert.equal(get(record.audit.live,'tempo10').status,'approve');
    const auditJSON=JSON.stringify(record.audit.live);current.home_shot=999;lab.capture(current,at(61));
    assert.equal(JSON.stringify(record.audit.live),auditJSON,'Frozen evidence is independent of later mutations');
    const index=indexRecord({...record,settlement:{result:'W',profit:.6}},{format:'test'});
    assert.equal(index.audit.live.evidence,undefined);assert.equal(index.audit.live.controls[0].values.totals,undefined);
    const modelReport=lab.metadata().liveExperiment;
    lab.settleFixture({fixture:{id:1,status:{short:'FT'}},score:{fulltime:{home:2,away:0}}});
    assert.equal(lab.data.signals[0].audit.live.evidence,undefined);assert.equal(lab.live.entries.size,0);
    assert.equal(JSON.stringify(lab.export().signals[0].audit.live),auditJSON);
    assert(lab.csv(lab.data.signals).includes('CanliDeneySurumu'));assert(lab.csv(lab.data.signals).includes('live_tempo10_karar'));
    const restart=new GoalLab({filePath:lab.filePath,cache});restart.load();assert.equal(restart.disabledReason,null);
    assert.deepEqual(restart.metadata().liveExperiment,lab.metadata().liveExperiment);
    assert.equal(restart.metadata().liveExperiment.sources.v21.baseline.wins,1);assert.equal(modelReport.sources.v21.baseline.pending,1);
    assert.equal(restart.live.entries.size,0);assert.equal(restart.observe(s,current),null);
    const next=state(60,{fixture_id:2,stats_validation:{status:'passed',verifiedAt:at(60)}});
    const cold=restart.observe(signal(next),next);assert.equal(get(cold.audit.live,'tempo10').reasons[0],'WINDOW_WARMING');
    restart.capture({...base,fixture_id:2},base.stats_received_at);
    assert.equal(get(cold.audit.live,'tempo10').status,'insufficient','Later evidence cannot backfill an old record');
    assert.equal(restart.observe(signal(next),next),null);
    const third=state(60,{fixture_id:3,stats_validation:{status:'passed',verifiedAt:at(60)}});
    restart.live.evidence=()=>{throw Error('offline failure');};
    const failure=restart.observe(signal(third,{tariffVersion:v22.VERSION}),third);
    assert(failure);assert.equal(get(failure.audit.live,'tempo10').reasons[0],'EVALUATION_ERROR');
    // Legacy indices must not be rewritten by the new optional field.
    const old=clone(record);delete old.audit.live;
    const oldIndex=indexRecord(old,{format:'legacy'});assert(!Object.hasOwn(oldIndex.audit,'live'));
    assert.equal(live.comparison([old],r=>tracker.summary(r)).sourceRecords,0);
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log('Live LAB: frozen hypotheses, actual windows, missing/zero, optional xG/box, correction/identity/phase/event guards, bounded RAM, ROI/pending/source cohorts, archive/restart and no backfill passed. No live requests.');
