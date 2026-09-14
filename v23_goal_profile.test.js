'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {GoalProfileCache,identity,parseFixtures,buildProfile,DAY}=require('./v23_goal_profile');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dino-v23-profiles-'));
const kickoff='2026-09-14T10:00:00.000Z';
const mac={fixture_id:900,fixture_kickoff:kickoff,league_id:39,season:2026,home_team_id:1,away_team_id:2};
function row(id,teamId,daysAgo,home=true) { return {fixture:{id,date:new Date(Date.parse(kickoff)-daysAgo*DAY).toISOString(),status:{short:'FT'}},
    league:{id:39,season:2026},teams:{home:{id:home?teamId:99},away:{id:home?99:teamId}},score:{fulltime:{home:2,away:1}}}; }
function payload(teamId) { return {errors:[],paging:{current:1,total:1},response:Array.from({length:12},(_,i)=>row(100+i,teamId,i+1,i%2===0))}; }
(async()=>{
    const info=identity(mac,'home'); assert.equal(identity({...mac,fixture_kickoff:null},'home'),null);
    const original=payload(1), noisy=structuredClone(original);
    noisy.response.push(row(900,1,4),row(888,1,-1),row(887,1,0.1),row(886,1,400));
    noisy.response.push({...row(889,1,1),score:{fulltime:{home:null,away:null}}});
    noisy.response.push({...row(890,1,1),fixture:{...row(890,1,1).fixture,status:{short:'AET'}}});
    const games=parseFixtures(noisy,info); assert.equal(games.length,12); assert.equal(games[0].id,100);
    const profile=buildProfile(games,info,'2026-09-14T10:01:00Z');
    assert.equal(profile.last5.n,5);assert.equal(profile.last10.n,10);assert.equal(profile.home.n,6);assert.equal(profile.away.n,6);
    assert.equal(profile.home.goalsFor,2);assert.equal(profile.away.goalsFor,1);assert.equal(profile.last10.goalsFor,1.5);
    assert.throws(()=>parseFixtures({...original,paging:{total:2}},info));
    assert.throws(()=>parseFixtures({...original,errors:{plan:'denied'}},info));
    assert.throws(()=>parseFixtures(payload(77),info));
    assert.throws(()=>parseFixtures({...original,response:[{...original.response[0],league:{id:40,season:2026}}]},info));
    const duplicate=structuredClone(original);duplicate.response.push({...original.response[0],score:{fulltime:{home:7,away:1}}});
    assert.throws(()=>parseFixtures(duplicate,info));
    let now=Date.parse(kickoff)+60000,calls=[],canFetch=false;
    const cache=new GoalProfileCache({filePath:path.join(root,'cache.json'),now:()=>now,canFetch:()=>canFetch,maxCallsPerDay:2,
        fetchApi:async(url,config)=>{calls.push(url);assert.equal(config.dinoMaxAttempts,1);assert.equal(config.timeout,6000);
            const q=new URL(url,'https://offline').searchParams;assert.equal(q.get('to'),'2026-09-14');assert.equal(q.get('status'),'FT');
            return {data:payload(Number(q.get('team')))};}});
    cache.load();cache.request(mac);cache.request(mac);assert.equal(cache.queue.size,2);
    assert.equal(cache.get(mac,'home',new Date(now).toISOString()).status,'profile_not_ready');
    await cache.warm();assert.equal(calls.length,0,'No fetch during scan/quota reservation');
    canFetch=true;await Promise.all([cache.warm(),cache.warm()]);assert.equal(calls.length,2,'Deduplicated concurrent warm');
    assert.equal(cache.get(mac,'home',new Date(now-1).toISOString()).status,'profile_not_available_at_signal');
    assert.equal(cache.get(mac,'home',new Date(now).toISOString()).profile.last10.n,10);
    cache.request(mac);await cache.warm();assert.equal(calls.length,2,'Cache hit');
    const restart=new GoalProfileCache({filePath:cache.filePath,fetchApi:cache.fetchApi,now:()=>now,maxCallsPerDay:2});restart.load();
    restart.request({...mac,home_team_id:3,away_team_id:4});await restart.warm();assert.equal(calls.length,2,'Daily limit persists');
    now+=DAY; restart.request({...mac,fixture_id:999,fixture_kickoff:new Date(Date.parse(kickoff)+DAY).toISOString(),home_team_id:3,away_team_id:4});
    // Request mock expects original cutoff: errors must be cached, never thrown into scan.
    await restart.warm();assert.equal(restart.data.calls,2,'UTC daily cap resets');
    let throttledCalls=0;const throttled=new GoalProfileCache({filePath:path.join(root,'429.json'),now:()=>Date.parse(kickoff)+60000,
        fetchApi:async()=>{throttledCalls++;throw {response:{status:429}};}});
    throttled.request(mac);await throttled.warm();await throttled.warm();assert.equal(throttledCalls,1);
    assert.equal(throttled.get(mac,'home','2026-09-14T10:02:00Z').status,'rate_limited');
    const cacheBytes=fs.readFileSync(cache.filePath,'utf8');
    let fallbackCalls=0;
    const fallback=new GoalProfileCache({filePath:path.join(root,'fallback.json'),now:()=>Date.parse(kickoff)+60000,
        fetchApi:async url=>{fallbackCalls++;const q=new URL(url,'https://offline').searchParams;
            const season=Number(q.get('season')),team=Number(q.get('team'));
            const p=payload(team);p.response=p.response.slice(0,season===2026?4:12).map((r,i)=>({
                ...r,league:{id:39,season},fixture:{...r.fixture,id:r.fixture.id+(season===2025?500:0),
                    date:new Date(Date.parse(kickoff)-(season===2025?100+i:i+1)*DAY).toISOString()}}));
            return {data:p};}});
    fallback.request(mac);await fallback.warm();assert.equal(fallbackCalls,4,'At most two season requests per team');
    const merged=fallback.get(mac,'home','2026-09-14T10:02:00Z').profile;
    assert.equal(merged.seasonOverall.n,4);assert.equal(merged.last10.n,10);assert.equal(merged.home.n,8);
    assert.deepEqual(merged.seasonsIncluded,[2026,2025]);
    // Invalid file is preserved rather than reset or replaced with an empty history.
    const invalid=new GoalProfileCache({filePath:__filename,fetchApi:async()=>{throw Error('never');}});invalid.load();
    assert(invalid.disabled);invalid.request(mac);await invalid.warm();assert.equal(invalid.queue.size,0);
    assert.equal(fs.readFileSync(cache.filePath,'utf8'),cacheBytes);
    console.log('V23 profiles: as-of exclusion, FT/identity/season, venue/last5/10, bounded warm, quota/restart/429 and no retrospective backfill passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
