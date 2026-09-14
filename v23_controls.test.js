'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {GoalLab,selectSource}=require('./v23_goal_lab'),v21=require('./v21_tariff'),v22=require('./v22_tariff');
const {evaluateControls,VERSION,DEFINITIONS}=require('./v23_controls');
const {buildProfile}=require('./v23_goal_profile');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dino-v23-controls-'));
const at='2026-09-14T10:45:00.000Z',kickoff='2026-09-14T10:00:00Z';
const profile=buildProfile(Array.from({length:12},(_,i)=>({id:i+1,at:`2026-09-${String(i+1).padStart(2,'0')}T10:00:00Z`,venue:i%2?'away':'home',gf:2,ga:2})).reverse(),
    {teamId:1,leagueId:39,season:2026,kickoff,fixtureId:999},'2026-09-14T10:05:00Z');
const clone=x=>JSON.parse(JSON.stringify(x));
const cache={get:()=>({status:'ok',profile:clone(profile)}),metadata:()=>({})};
const signal=(id,version=v21.VERSION)=>({fixtureId:id,signalId:`${version}-${id}`,tariffVersion:version,sentAt:at,
    match:'Offline',signalType:'strong',market:'0.5_UST',score:'0-0',minute:45,odds:1.6,edge:-2.5,
    dinoProbability:60,selectorV2Probability:65,v18Probability:66,prematchMarketSupport:85,matchedFilters:version===v22.VERSION?['C']:[],
    statsValidation:{status:'passed',verifiedAt:at},liveStats:{home:{shots:4},away:{shots:2}}});
const mac=id=>({fixture_id:id,home_red:0,away_red:0,dakika:45,status_short:'1H',skor:'0-0',home_team_id:1,away_team_id:2,
    stats_validation:{status:'passed',verifiedAt:at},_v23Events:[],_v23EventsAt:at});
try {
    const lab=new GoalLab({filePath:path.join(root,'history.json'),cache});
    const first=signal(1),record=lab.observe(first,mac(1));assert.equal(record.audit.controls.length,DEFINITIONS.length);
    assert.equal(record.audit.controls.find(c=>c.id==='event_score').status,'approve');
    const second=lab.observe(signal(1,v22.VERSION),mac(1));assert(second,'V22 same fixture is independent');
    assert.notEqual(record.signalId,second.signalId);assert.equal(second.assessment.status,'approve');
    assert.equal(lab.observe(signal(1),mac(1)),null);assert.equal(lab.observe(signal(1,v22.VERSION),mac(1)),null);
    first.liveStats.home.shots=999;assert.equal(record.liveStats.home.shots,4,'Frozen source values');
    let meta=lab.metadata().experiment;assert.equal(meta.uniqueEntries,1);assert.equal(meta.duplicateEntries,1);assert.equal(meta.sources.v21.baseline.total,1);assert.equal(meta.sources.v22.baseline.total,1);
    assert.equal(meta.v22Filters.C.baseline.total,1);assert.equal(meta.sharedFixtures,1);
    const a={...signal(2,v22.VERSION),minute:70,market:'4.5_UST',score:'2-1',odds:1.8,dinoProbability:52,prematchMarketSupport:25,matchedFilters:['A']};
    const lowPre=lab.observe(a,{...mac(2),skor:'2-1'});assert(lowPre);assert(!lowPre.assessment.reasons.includes('BASELINE_INVALID'),'V22 not forced through V21 Pre>50 gate');
    assert.equal(lowPre.matchedFilters[0],'A');
    assert.equal(lab.settleFixture({fixture:{id:1,status:{short:'FT'}},score:{fulltime:{home:1,away:0}}}),2,'Both source records settle');
    assert.equal(lab.settleFixture({fixture:{id:2,status:{short:'FT'}},score:{fulltime:{home:2,away:1}}}),1);
    const weak={...signal(3),minute:80,market:'2.5_UST'};lab.observe(weak,mac(3));
    lab.settleFixture({fixture:{id:3,status:{short:'FT'}},score:{fulltime:{home:3,away:0}}});
    meta=lab.metadata().experiment;
    const blend=meta.sources.v21.controls.find(c=>c.id==='goal_blend');assert.equal(blend.missedWinners,1);assert.equal(blend.avoidedLosses,0);
    assert.equal(blend.rejectOnly.total,1);assert.equal(blend.profitDifference,-0.6);
    assert.equal(meta.sources.v22.controls.find(c=>c.id==='goal_blend').avoidedLosses,1);
    assert.equal(meta.sources.v22.controls.find(c=>c.id==='goal_blend').profitDifference,1);
    assert.equal(meta.sources.v21.controls.find(c=>c.id==='after_goal').observed.total,0);
    assert.equal(meta.sources.v21.controls.find(c=>c.id==='after_goal').reject.total,0);
    const original=JSON.stringify(record.audit);lab.capture({...mac(1),_v23EventsAt:'2026-09-14T11:00:00Z'},'2026-09-14T11:00:00Z');assert.equal(JSON.stringify(record.audit),original);
    const restart=new GoalLab({filePath:lab.filePath,cache});restart.load();assert.equal(restart.data.signals.length,4);
    assert.equal(restart.observe(signal(1,v22.VERSION),mac(1)),null);
    const legacy=clone(restart.data.signals[0]);delete legacy.audit;delete legacy.sourceModel;legacy.fixtureId=50;
    restart.data.signals.push(legacy);restart.save();restart.load();assert.equal(restart.metadata().experiment.legacy.total,1);
    assert.equal(restart.metadata().experiment.sources.v21.baseline.total,2,'Old entries excluded from new controls');
    assert.equal(selectSource(restart.data.signals,'legacy').length,1);assert.equal(selectSource(restart.data.signals,'v22:A').length,1);
    assert.equal(selectSource(restart.data.signals,'v21').length,2);assert.equal(selectSource(restart.data.signals,'invalid'),null);
    const varied=clone(record);varied.fixtureId=1;varied.minute=46;varied.sentAt='2026-09-14T10:46:00Z';varied.signalId='different-entry';
    restart.data.signals.push(varied);assert.equal(restart.metadata().experiment.uniqueEntries,4,'Different entry times not collapsed');
    // Venue shortage must not disable the independent last-10 control.
    const thin=clone(profile);thin.home.n=2;thin.away.n=2;
    const assessment={status:'insufficient',reasons:['SAMPLE_TOO_SMALL'],reasonLabels:['Örneklem az'],notes:[],scoreState:'level'};
    const input={signal:signal(4),mac:mac(4),assessment,homeEntry:{profile:thin},awayEntry:{profile:thin},baseValid:true,events:null};
    const controls=evaluateControls(input).controls;
    assert.equal(controls.find(c=>c.id==='goal_recent').status,'approve');assert.equal(controls.find(c=>c.id==='goal_venue').status,'insufficient');
    assert.equal(controls.find(c=>c.id==='goal_blend').status,'insufficient');
    for(const c of controls.filter(c=>c.mode==='observation'))assert(['observed','insufficient'].includes(c.status));
    const exportText=restart.csv(restart.data.signals);assert.match(exportText,/goal_recent_karar/);assert.match(exportText,/after_substitution_degerler/);assert.match(exportText,/v22/);
    assert.equal(record.audit.version,VERSION);
    console.log('V23 independent controls: V21/V22 source locks, V22 low-Pre A, all outcomes, missed wins/avoided losses/ROI, immutable inputs, legacy isolation and independent missing data passed.');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
