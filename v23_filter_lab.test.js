'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {FilterLab,evaluate,VERSION,validAudit,v22Gate,readRetired}=require('./v23_filter_lab');
const {GoalLab}=require('./v23_goal_lab'),v21=require('./v21_tariff'),v22=require('./v22_tariff');
const at='2026-09-21T21:30:00.000Z';
const mac=(id=1,extra={})=>({fixture_id:id,home_team_id:10,away_team_id:20,stats_identity_verified:true,
    stats_received_at:at,stats_validation:{status:'passed',verifiedAt:at},dakika:73,skor:'0-1',status_short:'2H',
    home_shot:4,home_sot:1,away_shot:6,away_sot:1,_v23EventsAt:at,
    _v23LiveStats:{home:{shotsInsidebox:3,shotsOutsidebox:1,blockedShots:1},away:{shotsInsidebox:4,shotsOutsidebox:2,blockedShots:0}},
    _v23Events:[{type:'Goal',detail:'Normal Goal',team:{id:20},time:{elapsed:30}}],...extra});
const signal=(m,source='v21',extra={})=>({fixtureId:m.fixture_id,signalId:`${source}-${m.fixture_id}`,tariffVersion:source==='v21'?v21.VERSION:v22.VERSION,
    sentAt:at,match:'Test <img src=x>',league:'Offline',minute:m.dakika,score:m.skor,market:'1.5_UST',odds:1.6,
    statsValidation:{status:'passed',verifiedAt:at},matchedFilters:source==='v22'?['C']:[],...extra});
const run=(source='v21',m=mac(),extra={})=>evaluate({signal:signal(m,source,extra),mac:m,sourceModel:source,matchedFilters:extra.matchedFilters||['C']});
const c=(audit,id)=>audit.controls.find(c=>c.id===id);
assert(validAudit(run(),'v21'));assert.equal(run().controls.length,3);assert.equal(run('v22').controls.length,4);
for(const source of ['v21','v22'])assert.equal(c(run(source),'event_score').status,'approve');
assert.equal(c(run(),'v21_reaction').status,'approve','4 shots / 1 SOT boundary');
for(const extra of [{home_shot:3},{home_sot:0}])assert.equal(c(run('v21',mac(1,extra)),'v21_reaction').status,'reject');
assert.equal(c(run('v21',mac(1,{skor:'1-0',away_shot:4,away_sot:1,home_shot:1,home_sot:0})),'v21_reaction').status,'approve','Trailing away, not leader');
for(const missing of [null,undefined,'',false,-1,1.5,NaN]) {
    assert.equal(c(run('v21',mac(1,{home_sot:missing})),'v21_reaction').status,'insufficient');
    assert.equal(c(run('v21',mac(1,{home_sot:missing})),'v21_score').status,'approve','Shot missing must not taint score test');
    assert.equal(c(run('v22',mac(1,{home_sot:missing})),'v22_quality').status,'insufficient');
}
assert.equal(c(run('v21',mac(1,{home_sot:5})),'v21_reaction').status,'insufficient');
for(const id of ['v21_score','v21_reaction'])assert.equal(c(run('v21',mac(1,{skor:'0-0',home_shot:null})),id).status,'reject','Definite 0-0 does not need shots');
for(const market of ['0.5_UST','2.5_UST','3.5_UST'])for(const id of ['v21_score','v21_reaction'])
    assert.equal(c(run('v21',mac(1,{skor:'0-0',dakika:80}),{market}),id).status,'unaffected','No blanket 0-0 or late veto');
for(const id of ['v22_minute','v22_quality','v22_reaction']) {
    assert.equal(c(run('v22'),id).status,'approve');
    assert.equal(c(run('v22',mac(1,{dakika:74})),id).status,'reject');
    assert.equal(c(run('v22',mac(1,{dakika:80,home_sot:null}),{matchedFilters:['A','C']}),id).status,'unaffected');
    assert.equal(c(run('v22',mac(),{matchedFilters:['B','C']}),id).status,'unaffected');
    assert.equal(c(run('v22',mac(),{matchedFilters:[]}),id).status,'insufficient');
}
assert.equal(c(run('v22',mac(1,{away_shot:7})),'v22_quality').status,'approve','SOT ratio is observation only');
assert.equal(c(run('v22',mac(1,{home_shot:2,home_sot:1,away_shot:1,away_sot:0})),'v22_quality').status,'reject','Ratio alone not enough');
assert.equal(c(run('v22',mac(1,{home_shot:0,home_sot:0,away_shot:0,away_sot:0})),'v22_quality').status,'reject','True zero is not missing; SOT<2');
assert.equal(c(run('v22'),'v22_quality').values.box.home.inside,3,'Box shots are captured as observation data');
assert.equal(v22Gate(run('v22')).eligible,true);
assert.equal(v22Gate(run('v22',mac(1,{dakika:74}))).eligible,false,'Explicit minute reject blocks V22');
assert.equal(v22Gate(run('v22',mac(1,{home_sot:0,away_sot:0}))).eligible,false,'SOT count below 2 blocks V22');
assert.equal(v22Gate(run('v22',mac(1,{home_sot:null}))).eligible,true,'Insufficient remains fail-open as frozen LAB accounting');
assert.equal(v22Gate({}).eligible,false,'Invalid audit cannot open the live gate');
assert.equal(c(run('v22',mac(1,{skor:'0-0',home_sot:0,away_sot:0}),{market:'0.5_UST'}),'v22_reaction').status,'approve','0.5 has no reaction rule');
for(const extra of [{stats_identity_verified:false},{stats_received_at:'2026-09-21T21:27:59Z'},{stats_received_at:'2026-09-21T21:31:00Z'}])
    assert.equal(c(run('v22',mac(1,extra)),'v22_quality').status,'insufficient');
assert.equal(c(run('v22',mac(),{score:'1-0'}),'v22_minute').status,'insufficient','Entry mismatch');
assert.equal(c(run('v21',mac(1,{_v23Events:[]})),'event_score').status,'reject');
assert.equal(c(run('v21',mac(1,{_v23Events:null})),'event_score').status,'insufficient');
assert.equal(c(run('v21',mac(1,{_v23EventsAt:'2026-09-21T21:27:00Z'})),'event_score').status,'insufficient');
assert.equal(c(run('v21',mac(1,{_v23Events:[]})),'v21_reaction').status,'approve','Score check is independent, no stacked veto');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-filter-lab-'));
try {
    const filePath=path.join(root,'new.json'),lab=new FilterLab({filePath,v22GateEnabled:true});lab.load();
    assert.equal(lab.metadata().startedAt,null);assert.equal(lab.metadata().additionalApiCalls,0);
    const original=mac(),s=signal(original),before=JSON.stringify({original,s});
    lab.observe(s,original);assert.equal(JSON.stringify({original,s}),before,'No source mutation');
    assert.equal(lab.observe(s,original),null);original.home_sot=99;
    assert.equal(c(lab.data.signals[0].filterAudit,'v21_reaction').values.trailing.sot,1,'Frozen at entry');
    for(const [id,score,shots,result]of [[2,'0-0',4,'L'],[3,'0-0',4,'W'],[4,'0-1',null,'L'],[5,'0-1',4,null]]) {
        const m=mac(id,{skor:score,home_shot:shots});lab.observe(signal(m),m);
        if(result)lab.settleFixture({fixture:{id,status:{short:'FT'}},score:{fulltime:{home:result==='W'?2:0,away:0}}});
    }
    lab.settleFixture({fixture:{id:1,status:{short:'FT'}},score:{fulltime:{home:1,away:1}}});
    const meta=lab.metadata(),row=meta.filters.sources.v21.controls.find(c=>c.id==='v21_reaction');
    assert.equal(row.avoidedLosses,1);assert.equal(row.missedWinners,1);assert.equal(row.profitDifference,.4);
    assert.equal(row.retained.losses,1,'Insufficient data is retained');assert.equal(row.retained.pending,1);
    assert.equal(row.approve.total,2,'Includes pending');assert.equal(row.reject.total,2);
    assert.equal(meta.storage.archivedRecords,4);assert.equal(meta.storage.fullRecordsInMemory,1);
    const restarted=new FilterLab({filePath});restarted.load();assert.equal(restarted.disabledReason,null);
    assert.equal(restarted.observe(s,mac()),null,'Archived baseline ID still locked');
    assert.deepEqual(restarted.metadata().filters,meta.filters);
    const next=signal(mac(), 'v21',{signalId:'v21-next-entry',minute:74});
    assert(restarted.observe(next,mac(1,{dakika:74})),'Different legitimate source entry retained');
    assert(restarted.observe(signal(mac(),'v22'),mac()),'V21 and V22 are independent');
    assert.equal(restarted.export().signals[0].filterAudit.controls[2].values.trailing.sot,1);
    assert(restarted.csv(restarted.indexList()).includes('v21_reaction'));
    const invalid=signal(mac(99));invalid.statsValidation.verifiedAt='2026-09-21T20:00:00Z';
    assert.equal(restarted.observe(invalid,mac(99)),null);
    const fail=new FilterLab({filePath:path.join(root,'fail.json')});fail.save=()=>{throw Error('disk');};
    assert.equal(fail.observe(signal(mac()),mac()),null);assert.equal(fail.data.signals.length,0);assert.equal(fail.data.startedAt,null);
    const cancelled=mac(100);restarted.observe(signal(cancelled),cancelled);
    restarted.settleFixture({fixture:{id:100,status:{short:'CANC'}}});assert.equal(restarted.data.signals.at(-1).settlement.result,'VOID');
    const aet=mac(101);restarted.observe(signal(aet),aet);
    assert.equal(restarted.settleFixture({fixture:{id:101,status:{short:'AET'}},goals:{home:5,away:3}}),0);
    assert.equal(restarted.settleFixture({fixture:{id:101,status:{short:'PEN'}},score:{fulltime:{home:0,away:1}}}),1);
    const corruptPath=path.join(root,'corrupt.json');fs.writeFileSync(corruptPath,'broken');
    const broken=new FilterLab({filePath:corruptPath});broken.load();broken.maintain();
    assert.equal(broken.disabledReason,'history_unreadable');assert.equal(fs.readFileSync(corruptPath,'utf8'),'broken');
    // Existing archive export remains read-only. No collector can be reached.
    const retiredPath=path.join(root,'retired.json');const old=new GoalLab({filePath:retiredPath,cache:{get:()=>null,metadata:()=>({})}});
    old.observe({...signal(mac()),dinoProbability:60,selectorV2Probability:65,v18Probability:65,prematchMarketSupport:80},mac());
    const oldBytes=fs.readFileSync(retiredPath);const retired=readRetired(retiredPath);retired.export();
    assert(oldBytes.equals(fs.readFileSync(retiredPath)));assert.equal(retired.enabled,false);
    console.log('Entry filter LAB: all scope/boundary/missing-data rules, independent score check, pending ROI, immutable archive/restart, distinct source entries and read-only legacy export passed.');
} finally {if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('mac-filter-lab-'))fs.rmSync(root,{recursive:true,force:true});}
