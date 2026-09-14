'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {GoalLab}=require('./v23_goal_lab'),baseline=require('./v21_tariff');
const {buildProfile}=require('./v23_goal_profile');
const {streamJson}=require('./v23_export'),{EventEmitter}=require('events');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dino-v23-history-'));
const at='2026-09-14T10:45:00.000Z',kickoff='2026-09-14T10:00:00.000Z';
const info={teamId:1,leagueId:39,season:2026,kickoff,fixtureId:900};
const profile=buildProfile(Array.from({length:12},(_,i)=>({id:i+1,at:`2026-09-${String(i+1).padStart(2,'0')}T10:00:00Z`,venue:i%2?'away':'home',gf:2,ga:2})).reverse(),info,'2026-09-14T10:05:00Z');
let ready=true;
const cache={get:()=>ready?{status:'ok',profile}:{status:'profile_not_ready',profile:null},metadata:()=>({cachedTeams:1})};
const signal=id=>({fixtureId:id,signalId:`v21-${id}`,tariffVersion:baseline.VERSION,sentAt:at,
    match:'=SUM(A1:A2) <img src=x>',league:'Offline',signalType:'strong',market:'0.5_UST',score:'0-0',minute:45,
    odds:1.6,edge:-2.5,dinoProbability:60,selectorV2Probability:65,v18Probability:66,prematchMarketSupport:60,
    statsValidation:{status:'passed',verifiedAt:at}});
const mac=id=>({fixture_id:id,home_red:0,away_red:0,stats_validation:{status:'passed',verifiedAt:at}});
(async()=>{
    const lab=new GoalLab({filePath:path.join(root,'history.json'),cache});lab.load();assert.equal(lab.metadata().startedAt,null);
    const s=signal(1),before=JSON.stringify(s),record=lab.observe(s,mac(1));
    assert.equal(record.assessment.status,'approve');assert.equal(record.observationOnly,true);assert.equal(record.telegramMessageId,null);
    assert.equal(JSON.stringify(s),before,'Baseline untouched');assert.equal(lab.observe(s,mac(1)),null);
    assert.equal(lab.observe({...signal(2),sentAt:'2026-09-14T10:44:00Z'},mac(2)),null);
    assert.equal(lab.observe(signal(2),{...mac(2),stats_validation:{status:'failed',verifiedAt:at}}),null);
    assert.equal(lab.observe({...signal(2),tariffVersion:'old'},mac(2)),null);
    assert.equal(lab.observe(signal(2),mac(99)),null);
    ready=false;const missing=lab.observe(signal(2),mac(2));assert.equal(missing.assessment.status,'insufficient');
    ready=true;assert.equal(lab.observe(signal(2),mac(2)),null,'No after-the-fact enrichment/reselection');
    lab.observe({...signal(3),minute:80,market:'2.5_UST'},mac(3));
    lab.observe({...signal(4),minute:80,market:'2.5_UST'},mac(4));
    assert.equal(lab.data.signals[2].assessment.status,'reject');
    const restarted=new GoalLab({filePath:lab.filePath,cache});restarted.load();
    assert.equal(restarted.observe(signal(1),mac(1)),null);assert.equal(restarted.data.signals.length,4);
    for(const [id,home,away] of [[1,1,0],[2,0,0],[3,1,0],[4,2,1]]) {
        const fixture={fixture:{id,status:{short:'FT'}},score:{fulltime:{home,away}}};
        assert.equal(restarted.settleFixture(fixture),1);assert.equal(restarted.settleFixture(fixture),0);
    }
    const meta=restarted.metadata();assert.equal(meta.summary.overall.wins,2);assert.equal(meta.summary.overall.losses,2);
    assert.equal(meta.groups.approve.total,1);assert.equal(meta.groups.insufficient.losses,1);
    assert.equal(meta.avoidedLosses,1);assert.equal(meta.missedWinners,1);assert.equal(meta.retainedPercent,25);
    assert.equal(meta.comparableBaseline.total,3);assert.equal(meta.assessedCoverage,75);assert.equal(meta.groups.approve.roi,60);
    assert.equal(meta.groups.reject.roi,-20); // win +0.6, loss -1, divided by 2 stakes
    const exported=restarted.export();assert.equal(Object.keys(exported.profiles).length,1,'Profiles deduplicated');
    assert.equal(restarted.export([restarted.data.signals[1]]).signals.length,1);
    assert.equal(Object.keys(restarted.export([restarted.data.signals[1]]).profiles).length,0,'Date subset carries only referenced profiles');
    assert(restarted.csv(exported.signals).includes("'=SUM"),'CSV formula injection escaped');
    class Response extends EventEmitter {
        constructor(){super();this.parts=[];this.destroyed=false;this.count=0;}
        write(chunk){this.parts.push(chunk);if(++this.count%2===0){setImmediate(()=>this.emit('drain'));return false;}return true;}
        end(){this.ended=true;}
    }
    const res=new Response();await streamJson(res,exported);assert(res.ended);assert.deepEqual(JSON.parse(res.parts.join('')),exported);
    const closed=new Response();closed.destroyed=true;await assert.rejects(streamJson(closed,exported));
    restarted.observe(signal(5),mac(5));
    assert.equal(restarted.settleFixture({fixture:{id:5,status:{short:'AET'}},goals:{home:1,away:0}}),0,'No extra time fallback');
    assert.equal(restarted.settleFixture({fixture:{id:5,status:{short:'PEN'}},score:{fulltime:{home:0,away:0}},goals:{home:1,away:0}}),1);
    assert.equal(restarted.findSignal(5,'strong').settlement.result,'L');
    restarted.observe(signal(6),mac(6));assert.equal(restarted.settleFixture({fixture:{id:6,status:{short:'CANC'}}}),1);
    assert.equal(restarted.findSignal(6,'strong').settlement.result,'VOID');
    const off=new GoalLab({filePath:path.join(root,'off.json'),cache,enabled:false});assert.equal(off.observe(signal(8),mac(8)),null);
    const limited=new GoalLab({filePath:path.join(root,'limited.json'),cache,maxRecords:1});limited.observe(signal(8),mac(8));
    assert.equal(limited.observe(signal(9),mac(9)),null);assert.equal(limited.data.signals.length,1,'No silent trimming');
    const broken=new GoalLab({filePath:__filename,cache});broken.load();assert.equal(broken.disabledReason,'history_unreadable');
    assert.equal(broken.observe(signal(9),mac(9)),null);
    const writeFail=new GoalLab({filePath:path.join(root,'fail.json'),cache});writeFail.save=()=>{throw Error('disk');};
    assert.equal(writeFail.observe(signal(10),mac(10)),null);assert.equal(writeFail.data.signals.length,0);
    const retry=new GoalLab({filePath:path.join(root,'retry.json'),cache});retry.observe(signal(11),mac(11));
    const originalSave=retry.save.bind(retry);retry.save=()=>{throw Error('transient disk');};
    const final={fixture:{id:11,status:{short:'FT'}},score:{fulltime:{home:1,away:0}}};
    assert.throws(()=>retry.settleFixture(final));assert.equal(retry.findSignal(11,'strong').settlement.result,null);
    retry.save=originalSave;assert.equal(retry.settleFixture(final),1,'Persistence failure remains retryable');
    console.log('V23 lab: pairing, immutability, all verdicts/results, cold-cache freeze, restart, ROI, caps, CSV and streamed JSON passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
