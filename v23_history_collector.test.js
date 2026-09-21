'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), os = require('os');
const {GoalProfileCache, VERSION, COLLECTOR_VERSION, failure, DAY} = require('./v23_goal_profile');
const start = Date.parse('2026-09-18T10:20:00Z'); let now = start, passed = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-yakala-v23-regression-'));
const match = (id=1) => ({fixture_id:900000+id,fixture_kickoff:'2026-09-18T10:00:00Z',league_id:39,season:2026,home_team_id:2*id,away_team_id:2*id+1});
function payload(team, n=12, homes=6, season=2026) {
    return {errors:[],paging:{current:1,total:1},response:Array.from({length:n},(_,i)=>({
        fixture:{id:10000+i+(season===2025?1000:0),date:new Date(start-(i+1+(season===2025?100:0))*DAY).toISOString(),status:{short:'FT'}},
        league:{id:39,season},teams:{home:{id:i<homes?team:77777},away:{id:i<homes?77777:team}},score:{fulltime:{home:2,away:1}}
    }))};
}
const readQuery = url => new URL(url,'https://offline.invalid').searchParams;
const success = async url => {const q=readQuery(url);return {data:payload(Number(q.get('team')),12,6,Number(q.get('season')))};};
function cache(fetchApi=success, options={}) {
    const c=new GoalProfileCache({filePath:path.join(tmp,`cache-${passed}.json`),fetchApi,now:()=>now,...options});
    c.save=()=>{};return c;
}
async function test(name, fn) {now=start;await fn();passed++;console.log(`PASS ${name}`);}
(async()=>{
    await test('paired date range, same competition, before kickoff, no extra network retry',async()=>{
        const c=cache(async(url,config)=>{const q=readQuery(url);assert.equal(q.get('from'),'2025-09-18');assert.equal(q.get('to'),'2026-09-18');
            assert.equal(q.get('status'),'FT');assert.equal(q.get('league'),'39');assert.equal(config.dinoMaxAttempts,1);return success(url);});
        c.request(match());await c.warm();assert.equal(c.data.calls,2);assert.equal(c.get(match(),'home',new Date(now).toISOString()).profile.last10.n,10);
    });
    await test('use only relevant venue to decide whether previous season is needed',async()=>{
        const c=cache(async url=>{const q=readQuery(url);assert.equal(q.get('season'),'2026');return {data:payload(Number(q.get('team')),10,Number(q.get('team'))===2?8:2)};});
        c.request(match());await c.warm();assert.equal(c.data.calls,2);assert.equal(c.metadata().readyProfiles,2);
    });
    await test('previous season failure retains current venue and last5 data',async()=>{
        const c=cache(async url=>{const q=readQuery(url);if(q.get('season')==='2025')throw Error('timeout');
            return {data:payload(Number(q.get('team')),8,Number(q.get('team'))===2?6:2)};});
        c.request(match());await c.warm();const e=c.get(match(),'home',new Date(now).toISOString());
        assert.equal(e.status,'partial');assert.equal(e.profile.last5.n,5);assert.equal(e.profile.home.n,6);
        assert.equal(e.error.phase,'previous_season');assert.equal(c.metadata().partialProfiles,2);assert.equal(c.metadata().failedProfiles,0);
    });
    await test('deferred fallback resumes after batch limit, without current-season refetch',async()=>{
        let priorCalls=0;const c=cache(async url=>{const q=readQuery(url),team=Number(q.get('team')),season=Number(q.get('season'));
            if(season===2025)priorCalls++;return {data:payload(team,team===13&&season===2026?4:12,team===13&&season===2026?2:6,season)};});
        for(let i=1;i<=6;i++)c.request(match(i));await c.warm();assert.equal(c.data.calls,12);assert.equal(priorCalls,0);
        assert.equal(c.get(match(6),'away',new Date(now).toISOString()).status,'partial');
        await c.warm();assert.equal(c.data.calls,13);assert.equal(priorCalls,1);assert.equal(c.get(match(6),'away',new Date(now).toISOString()).profile.last10.n,10);
    });
    await test('priority selects real candidate before early warm traffic',async()=>{
        const teams=[];const c=cache(async url=>{teams.push(Number(readQuery(url).get('team')));return success(url);},{maxCallsPerDay:4});
        for(let i=1;i<=30;i++)c.request(match(i),{priority:10});c.request(match(99),{priority:100});await c.warm();
        assert.deepEqual(teams.slice(0,2),[198,199]);assert.equal(c.data.earlyCalls,1);assert.equal(c.data.calls,3);
    });
    await test('full quota does not prevent stale cleanup or queue admission',async()=>{
        const c=cache();for(let i=1;i<=100;i++)c.request(match(i));c.data.day='2026-09-18';c.data.calls=80;
        now+=7*3600000;await c.warm();assert.equal(c.queue.size,0);assert.equal(c.prunedRequests,200);
        const fresh={...match(999),fixture_kickoff:'2026-09-18T17:00:00Z'};c.request(fresh);assert.equal(c.queue.size,2);
        assert.equal(c.get(fresh,'home',new Date(now).toISOString()).status,'daily_budget_exhausted');
    });
    await test('high priority replaces low priority work in full queue; bounded memory',async()=>{
        const c=cache();for(let i=1;i<=100;i++)c.request(match(i),{priority:10});c.request(match(999),{priority:100});
        assert.equal(c.queue.size,200);assert.equal(c.droppedRequests,2);assert([...c.queue.values()].some(x=>x.teamId===1998));
        c.request(match(888),{priority:10});assert.equal(c.queue.size,200);assert.equal(c.droppedRequests,4);
        c.cancelFixture(900999);assert.equal(c.queue.size,198);
    });
    await test('provider parameter error is visible and triggers fail-fast cooldown',async()=>{
        const logs=[];const c=cache(async()=>({data:{response:[],errors:{from:'The from field is required.'}}}),{logger:m=>logs.push(m)});
        c.request(match());await c.warm();assert.equal(c.data.calls,1);assert.equal(c.metadata().waitReason,'provider_parameters');
        assert.match(c.metadata().lastErrors[0].message,/from field is required/);assert.equal(c.metadata().failedProfiles,1);
        await c.warm();assert.equal(c.data.calls,1);assert.match(logs[0],/provider_parameters/);
    });
    await test('HTTP and payload rate limit responses both back off',async()=>{
        for(const transport of ['http','body']){const c=cache(async()=>{if(transport==='http')throw {response:{status:429,data:{errors:{rateLimit:'Too many requests'}}}};
            return {data:{errors:{rateLimit:'Too many requests'},response:[]}};});c.request(match());await c.warm();await c.warm();
            assert.equal(c.data.calls,1);assert.equal(c.metadata().waitReason,'rate_limited');assert.equal(c.get(match(),'home',new Date(now).toISOString()).status,'rate_limited');}
    });
    await test('credentials, URLs and headers never enter diagnostics',async()=>{
        const secret='SENSITIVE_API_TOKEN_12345678901234567890';
        const detail=failure({response:{status:403,data:{errors:{token:secret,access:`token=${secret} https://example.test/?key=${secret}`}},headers:{authorization:secret}},config:{headers:{secret}}});
        assert(!JSON.stringify(detail).includes(secret));assert(!JSON.stringify(detail).includes('https://'));assert.equal(detail.code,'provider_access');
    });
    await test('failed entries are counted separately, and retry budget is bounded',async()=>{
        const c=cache(async()=>{throw Error('timeout');});
        for(let i=0;i<5;i++){c.request(match());await c.warm();now+=10*60000;}
        assert.equal(c.data.calls,6);assert.equal(c.metadata().readyProfiles,0);assert.equal(c.metadata().failedProfiles,2);
    });
    await test('live work and API reserve stop background fetch without removing existing profiles',async()=>{
        let allow=true;const c=cache(success,{canFetch:()=>allow,blockReason:()=>allow?null:'api_quota_reserve'});c.request(match());await c.warm();
        allow=false;c.request(match(99));await c.warm();assert.equal(c.data.calls,2);assert.equal(c.get(match(),'home',new Date(now).toISOString()).status,'ok');
        assert.equal(c.get(match(99),'home',new Date(now).toISOString()).status,'api_quota_reserve');
    });
    await test('as-of guard prevents later profile from filling an earlier signal',async()=>{
        const c=cache();c.request(match());const signalAt=new Date(now-1).toISOString();await c.warm();
        assert.equal(c.get(match(),'home',signalAt).status,'profile_not_available_at_signal');
    });
    await test('migration preserves history file, valid data and consumed quota',async()=>{
        const c=cache();c.request(match());await c.warm();const keys=Object.keys(c.data.entries),valid=JSON.stringify(c.data.entries[keys[0]]);
        c.data.entries[keys[1]]={status:'profile_fetch_failed',games:[],fetchedAt:new Date(now).toISOString(),expiresAt:now+100000};
        delete c.data.collectorVersion;c.data.calls=79;c.data.day='2026-09-18';
        const file=path.join(tmp,'legacy.json'),bytes=JSON.stringify(c.data);fs.writeFileSync(file,bytes);
        const loaded=new GoalProfileCache({filePath:file,fetchApi:success,now:()=>now});loaded.load();
        assert.equal(loaded.disabled,false);assert.equal(loaded.data.calls,79);assert.equal(JSON.stringify(loaded.data.entries[keys[0]]),valid);
        assert.equal(loaded.data.entries[keys[1]].expiresAt,0);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(loaded.data.collectorVersion,COLLECTOR_VERSION);
        loaded.request(match());await loaded.warm();assert.equal(loaded.data.calls,80);
        const restart=new GoalProfileCache({filePath:file,fetchApi:success,now:()=>now});restart.load();assert.equal(restart.data.calls,80);
    });
    await test('malformed cache is preserved and disabled, not reset',async()=>{
        const file=path.join(tmp,'broken.json'),bytes=JSON.stringify({version:VERSION,calls:0,cooldownUntil:0,entries:{bad:{games:null}}});
        fs.writeFileSync(file,bytes);const c=new GoalProfileCache({filePath:file,fetchApi:success});c.load();assert(c.disabled);await c.warm();assert.equal(fs.readFileSync(file,'utf8'),bytes);
    });
    await test('old incomplete successful cache is retained but can be completed',async()=>{
        const c=cache();c.request(match());await c.warm();delete c.data.collectorVersion;
        const key=Object.keys(c.data.entries)[0];c.data.entries[key].games=c.data.entries[key].games.slice(0,4);
        const file=path.join(tmp,'old-partial.json');fs.writeFileSync(file,JSON.stringify(c.data));
        const loaded=new GoalProfileCache({filePath:file,fetchApi:success,now:()=>now});loaded.load();
        assert.equal(loaded.data.entries[key].games.length,4);assert.equal(loaded.data.entries[key].status,'partial');
        loaded.request(match());await loaded.warm();assert.equal(loaded.data.calls,3);assert.equal(loaded.get(match(),'home',new Date(now).toISOString()).profile.last10.n,10);
    });
    const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
    assert.doesNotMatch(server,/v23ProfileCache|v23ErkenGecmisHazirla|new GoalProfileCache/,'Retired collector stays disconnected from runtime');
    console.log(`V23 collector: ${passed} regression scenarios passed; no live requests.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
    const resolved=path.resolve(tmp),base=path.resolve(os.tmpdir());
    if(path.dirname(resolved)===base&&path.basename(resolved).startsWith('mac-yakala-v23-regression-'))fs.rmSync(resolved,{recursive:true,force:true});
});
