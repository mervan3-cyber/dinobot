'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {SignalTracker}=require('./signal_tracker');
const {createV22Lab}=require('./v22_lab');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dino-v22-lab-'));
try {
    const tracker=new SignalTracker({filePath:path.join(root,'v22.json')});tracker.load();
    const time='2026-09-13T10:00:00Z';
    const models={v16Model:{MODEL:{version:'test16'},scoreMarket:()=>({selectorProbability:61})},
        v18Model:{MODEL:{version:'test18'},scoreMarket:()=>({v18Probability:62,v18Edge:0})}};
    const deps={tracker,...models,prematchSupport:mac=>mac.pre,prematchSource:()=> 'test',liveSnapshot:()=>({})};
    const lab=createV22Lab(deps);
    assert.equal(lab.metadata().summary.overall.total,0);assert.equal(lab.metadata().startedAt,null);
    const mac={fixture_id:101,mac_isim:'Offline Home - Away',lig:'Offline',skor:'1-0',dakika:35,pre:55,
        canli_oranlar:{'2.5_UST':{oran:1.6}},stats_validation:{status:'passed',verifiedAt:time}};
    const args={mac,dino:{'2.5_UST':59,MODEL_VARYANTI:'live_plus_prematch'},capturedAt:time};
    assert(lab.preselect(mac,args.dino));
    assert.equal(lab.record({...args,capturedAt:'2026-09-13T09:59:00Z'}),null,'Old validation marker');
    assert.equal(lab.record({...args,mac:{...mac,stats_validation:{status:'failed',verifiedAt:time}}}),null);
    assert.equal(lab.record({...args,dino:{...args.dino,MODEL_VARYANTI:'score_only'}}),null);
    assert.equal(createV22Lab({...deps,enabled:false}).record(args),null);
    const signal=lab.record(args);assert.deepEqual(signal.matchedFilters,['A','B']);
    assert.equal(signal.goalsNeeded,2);assert.equal(signal.voteCount,3);assert.equal(signal.telegramMessageId,null);
    assert.equal(lab.record(args),null,'One common A/B/C fixture lock');
    assert.equal(lab.preselect(mac,args.dino),false);
    assert.equal(lab.metadata().summary.overall.total,1);
    assert.equal(lab.metadata().filterSummaries.A.total,1);assert.equal(lab.metadata().filterSummaries.B.total,1);
    assert.equal(lab.metadata().filterSummaries.C.total,0);
    const restarted=new SignalTracker({filePath:tracker.filePath});restarted.load();
    assert.deepEqual(restarted.findSignal(101,'strong').matchedFilters,['A','B']);
    assert.equal(createV22Lab({...deps,tracker:restarted}).record(args),null,'Restart preserves global lock');
    const fixture={fixture:{id:101,status:{short:'FT'}},goals:{home:2,away:1},score:{fulltime:{home:2,away:1}}};
    assert.equal(restarted.settleFixture(fixture),1);assert.equal(restarted.settleFixture(fixture),0);
    assert.equal(restarted.summary().overall.wins,1);
    const other=new SignalTracker({filePath:path.join(root,'v21.json')});other.load();
    other.recordSent({fixtureId:202,signalType:'strong',market:'1.5_UST',odds:1.8});
    const choices={...mac,fixture_id:202,pre:80,skor:'0-0',canli_oranlar:{'1.5_UST':{oran:1.65},'0.5_UST':{oran:1.6}}};
    const selected=lab.select({mac:choices,dino:{'0.5_UST':59,'1.5_UST':59}});
    assert.equal(selected.market,'0.5_UST','C only; unrelated V21 lock cannot block V22');
    console.log('V22 fresh timestamp, labels, persistence, restart lock, settlement and independent history passed.');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
