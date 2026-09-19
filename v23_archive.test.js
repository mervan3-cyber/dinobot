'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {EventEmitter}=require('events');
const {GoalLab,selectSource}=require('./v23_goal_lab');
const {GoalProfileCache,buildProfile}=require('./v23_goal_profile');
const {VERSION}=require('./v23_goal_policy');
const baseline=require('./v21_tariff'),v22=require('./v22_tariff');
const {streamJson}=require('./v23_export');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-yakala-v23-archive-'));
const at='2026-09-19T21:45:00.000Z',kickoff='2026-09-19T21:00:00.000Z';
const copy=x=>JSON.parse(JSON.stringify(x));
const profile=buildProfile(Array.from({length:40},(_,i)=>({id:i+100,at:new Date(Date.parse(kickoff)-(i+1)*86400000).toISOString(),
    season:2026,venue:i%2?'home':'away',gf:2,ga:2})),{teamId:1,leagueId:39,season:2026,kickoff,fixtureId:1},kickoff);
let released=[];
const cache={get:()=>({status:'ok',profile}),metadata:()=>({cachedTeams:1}),releaseFixture:id=>released.push(id)};
const newLab=name=>new GoalLab({filePath:path.join(root,`${name}.json`),cache});
const signal=(id,source='v21')=>({fixtureId:id,signalId:`${source}-${id}`,tariffVersion:source==='v21'?baseline.VERSION:v22.VERSION,
    sentAt:at,match:'Offline Home - Away',league:'Offline',market:'0.5_UST',score:'0-0',minute:45,
    odds:1.6,edge:-2.5,dinoProbability:60,selectorV2Probability:65,v18Probability:66,prematchMarketSupport:85,
    matchedFilters:source==='v22'?['C']:[],statsValidation:{status:'passed',verifiedAt:at},liveStats:{home:{shots:5},away:{shots:8}}});
const mac=id=>({fixture_id:id,dakika:45,skor:'0-0',status_short:'1H',home_red:0,away_red:0,
    _v23Events:[],_v23EventsAt:at,home_team_id:1,away_team_id:2,stats_validation:{status:'passed',verifiedAt:at}});
const fixture=(id,short='FT',home=1,away=0)=>({fixture:{id,status:{short}},score:{fulltime:{home,away}}});
const fields=['summary','groups','experiment','avoidedLosses','missedWinners','retainedPercent','assessedCoverage','comparableBaseline','profileCoverage'];
function comparable(meta) {const picked=Object.fromEntries(fields.map(k=>[k,copy(meta[k])]));delete picked.summary.updatedAt;return picked;}
class Response extends EventEmitter {
    constructor(onFirst){super();this.parts=[];this.count=0;this.destroyed=false;this.onFirst=onFirst;}
    write(text){this.parts.push(text);if(++this.count===1)this.onFirst?.();setImmediate(()=>this.emit('drain'));return false;}
    end(){this.ended=true;}
}
(async()=>{
    const lab=newLab('history');
    for(const [id,source] of [[1,'v21'],[1,'v22'],[2,'v21']])assert(lab.observe(signal(id,source),mac(id)));
    const frozen=copy(lab.data.signals[0].audit);
    assert(lab.events.entries.has(1));
    assert.equal(lab.settleFixture(fixture(1,'2H')),0,'A live winning score is not final');
    assert.equal(lab.metadata().storage.archivedRecords,0);
    assert.equal(lab.settleFixture(fixture(1)),2);
    assert.deepEqual(released,[1]);assert(!lab.events.entries.has(1));assert(lab.events.entries.has(2));
    assert.equal(lab.metadata().storage.archivedRecords,2);assert.equal(lab.metadata().storage.fullRecordsInMemory,1);
    assert.equal(lab.data.signals[0].audit.events,undefined);assert.equal(lab.data.signals[0].liveStats,undefined);
    assert.equal(Object.keys(lab.data.profiles).length,1,'A profile shared with an active signal remains');
    assert.deepEqual(lab.list(10).find(s=>s.signalId==='v23-v21-1').audit,frozen,'Full frozen evidence is rehydrated');
    assert.equal(lab.settleFixture(fixture(1)),0);assert.equal(lab.observe(signal(1),mac(1)),null,'Archive keeps dedup locks');
    const beforeRestart=lab.export();const restarted=new GoalLab({filePath:lab.filePath,cache});restarted.load();
    assert.equal(restarted.disabledReason,null);assert.deepEqual(restarted.export().signals,beforeRestart.signals);
    assert.deepEqual(restarted.export().profiles,beforeRestart.profiles);assert.deepEqual(comparable(restarted.metadata()),comparable(lab.metadata()));
    assert.equal(restarted.observe(signal(1),mac(1)),null);assert.deepEqual(restarted.unresolvedFixtureIds(),[2]);
    const allExport=restarted.export(), streamed=new Response();await streamJson(streamed,restarted.exportStream());
    assert.deepEqual(JSON.parse(streamed.parts.join('')),allExport,'Streamed export matches normal export under backpressure');
    const pendingSnapshot=copy(restarted.export()), midStream=new Response(()=>restarted.settleFixture(fixture(2,'FT',0,0)));
    await streamJson(midStream,restarted.exportStream());
    assert.deepEqual(JSON.parse(midStream.parts.join('')),pendingSnapshot,'A settlement mid-download cannot mix report timestamps');
    assert.equal(Object.keys(restarted.data.profiles).length,0,'All completed profile evidence leaves RAM');
    assert.equal(restarted.metadata().storage.fullRecordsInMemory,0);
    assert.equal(restarted.export(selectSource(restarted.indexList(),'v22:C')).signals.length,1);
    assert.deepEqual(restarted.export(selectSource(restarted.indexList(),'v22:C')).profiles,beforeRestart.profiles);
    assert.equal(restarted.csv(restarted.indexList()),restarted.csv(restarted.export().signals),'CSV measurements survive eviction');

    // Legacy migration: all detailed results and comparison math must stay exact.
    const legacy=newLab('legacy');legacy.data=copy({...lab.data,version:VERSION,signals:restarted.export().signals,profiles:beforeRestart.profiles});
    const oneOld=copy(legacy.data.signals[0]);delete oneOld.audit;delete oneOld.sourceModel;oneOld.fixtureId=88;oneOld.signalId='legacy-88';
    legacy.data.signals.push(oneOld);legacy.save();const oldBytes=fs.readFileSync(legacy.filePath), oldMeta=comparable(legacy.metadata()),oldCSV=legacy.csv(legacy.data.signals);
    const migrated=new GoalLab({filePath:legacy.filePath,cache});migrated.load();
    assert.equal(migrated.disabledReason,null);assert.equal(migrated.metadata().storage.archivedRecords,4);
    assert(fs.readFileSync(`${legacy.filePath}.pre-archive.bak`).equals(oldBytes));
    assert.notEqual(JSON.parse(fs.readFileSync(legacy.filePath)).version,VERSION,'Old code must not interpret compact rows as full records');
    assert.deepEqual(migrated.export().signals,legacy.data.signals);assert.deepEqual(comparable(migrated.metadata()),oldMeta);
    assert.equal(migrated.csv(migrated.indexList()),oldCSV);assert.equal(selectSource(migrated.indexList(),'legacy').length,1);
    const reads=migrated.archive.read.bind(migrated.archive);let diskReads=0;migrated.archive.read=s=>{diskReads++;return reads(s);};
    migrated.metadata();migrated.indexList();assert.equal(diskReads,0,'Dashboard aggregates never load the evidence history');
    migrated.list(1);assert.equal(diskReads,1,'Only visible detail rows are hydrated');

    // Archive write or compact-index commit failure cannot evict the only copy.
    for(const failAt of ['archive','index']){
        const broken=newLab(`fail-${failAt}`);broken.data=copy(legacy.data);broken.save();const persisted=fs.readFileSync(broken.filePath);
        const write=broken.archive.write.bind(broken.archive),save=broken.save.bind(broken);
        if(failAt==='archive')broken.archive.write=()=>{throw Error('offline ENOSPC');};else broken.save=()=>{throw Error('offline index write');};
        broken.archiveSettled();assert.equal(broken.archiveError,'archive_write_failed');
        assert(fs.readFileSync(broken.filePath).equals(persisted));assert(broken.data.signals.every(s=>!s.archiveRef));
        assert.deepEqual(broken.export().signals,legacy.data.signals);
        broken.archive.write=write;broken.save=save;broken.archiveSettled();assert.equal(broken.archiveError,null);
        assert.equal(broken.metadata().storage.archivedRecords,4,'Retry safely reuses already written immutable evidence');
    }
    const ref=migrated.data.signals[0],archiveFile=migrated.archive.file(ref.archiveRef),valid=fs.readFileSync(archiveFile),indexBytes=fs.readFileSync(migrated.filePath);
    fs.writeFileSync(archiveFile,'broken');
    const corrupt=new GoalLab({filePath:migrated.filePath,cache});corrupt.load();assert.equal(corrupt.disabledReason,'history_unreadable');
    assert.equal(corrupt.observe(signal(99),mac(99)),null);assert(fs.readFileSync(migrated.filePath).equals(indexBytes));
    assert.throws(()=>migrated.export());fs.writeFileSync(archiveFile,valid);
    assert.throws(()=>migrated.archive.file({...ref.archiveRef,day:'../../escape'}));

    // Finished temporary profiles must not trigger extra calls or change budgets.
    let now=Date.parse(at),requests=0,complete;
    const cache2=new GoalProfileCache({filePath:path.join(root,'cache.json'),now:()=>now,maxCallsPerDay:1000,
        fetchApi:()=>{requests++;return new Promise(resolve=>{complete=resolve;});}});
    const target={...mac(9),fixture_kickoff:kickoff,league_id:39,season:2026};
    cache2.request(target);const running=cache2.warm();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(requests,1);cache2.releaseFixture(9);complete({data:{errors:[],response:[]}});await running;
    assert.equal(requests,1);assert.equal(cache2.data.calls,1);assert.equal(cache2.maxCallsPerDay,1000);
    assert.equal(cache2.queue.size,0);assert.equal(cache2.targets.size,0);assert.equal(Object.keys(cache2.data.entries).length,0,'Late response cannot restore a finished match');
    cache2.data.entries.expired={games:[],expiresAt:now-1};cache2.data.entries.fresh={games:[],expiresAt:now+1000};
    cache2.pruneExpired();assert.equal(cache2.data.entries.expired,undefined);assert(cache2.data.entries.fresh);assert.equal(requests,1);
    cache2.request(target);cache2.request({...target,fixture_id:10,away_team_id:3});
    const homeKey=[...cache2.queue].find(([,info])=>info.teamId===1)[0];cache2.data.entries[homeKey]={games:[],expiresAt:now+1000};
    cache2.releaseFixture(9);assert(cache2.data.entries[homeKey],'A shared active team profile is protected');

    // Deterministic retained-payload size check, NOT a claim about production RSS.
    const bulk=newLab('bulk'),template=copy(legacy.data.signals[0]);
    template.audit.events.largeOfflineEvidence='synthetic-'.repeat(6000);
    bulk.data={version:VERSION,startedAt:at,updatedAt:at,signals:Array.from({length:120},(_,i)=>({...copy(template),fixtureId:10000+i,signalId:`offline-${i}`})),profiles:beforeRestart.profiles};
    bulk.save();const beforeBytes=Buffer.byteLength(JSON.stringify(bulk.data));bulk.archiveSettled();
    const afterBytes=Buffer.byteLength(JSON.stringify(bulk.data));assert(afterBytes<beforeBytes*.15);assert.equal(bulk.metadata().storage.archivedRecords,120);
    console.log(`V23 archive: migration, exact evidence/ROI, independent sources, restart dedup, pending results, durable failure/retry, corrupt-file protection, streaming snapshot, cache cancellation and quota preservation passed. Synthetic retained JSON: ${beforeBytes} -> ${afterBytes} bytes (not RSS).`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
