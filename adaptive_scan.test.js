'use strict';
const assert=require('assert/strict');
const {AdaptiveScan,isCandidate,providerTrouble,MINUTE}=require('./adaptive_scan');
const now=Date.parse('2026-09-21T10:00:00Z');
const match={fixture_id:1,dakika:50,status_short:'2H',stats_identity_verified:true,
    home_shot:8,away_shot:4,home_sot:3,away_sot:1,home_corner:4,away_corner:2,canli_oranlar:{'1.5_UST':{oran:1.65}}};
assert(isCandidate(match));assert(isCandidate({...match,dakika:25,status_short:'1H'}));assert(isCandidate({...match,dakika:80}));
for(const patch of [{dakika:24},{dakika:81},{status_short:'FT'},{status_short:'HT'},{stats_identity_verified:false},
    {home_shot:null},{home_sot:false},{away_corner:''},{away_corner:-1},{home_sot:9},{canli_oranlar:{}},
    {canli_oranlar:{'1.5_UST':{oran:Infinity}}},{fixture_id:null}])
    assert(!isCandidate({...match,...patch}),JSON.stringify(patch));
const scan=new AdaptiveScan(),opts={enabled:true,running:true,auto:true,quota:6000};
assert.equal(scan.status(opts,now).intervalMinutes,10);assert.equal(scan.status(opts,now).nextRunTime,0);
scan.begin(now);scan.observe([match,match],now);scan.finish({},now+MINUTE);
assert.equal(scan.status(opts,now+MINUTE).candidateCount,1);
assert.equal(scan.status(opts,now+MINUTE).nextRunTime,now+5*MINUTE);
assert.equal(scan.status({...opts,enabled:false},now+MINUTE).nextRunTime,now+10*MINUTE);
assert.equal(scan.status({...opts,quota:1500},now+MINUTE).reason,'quota_reserve');
for(const quota of [null,undefined,NaN,-1])assert.equal(scan.status({...opts,quota},now+MINUTE).intervalMinutes,10);
assert.equal(scan.status({...opts,quota:1501},now+MINUTE).intervalMinutes,5);
for(const patch of [{running:false},{auto:false},{schedule:null},{schedule:{mode:'single'}}])assert.equal(scan.status({...opts,...patch},now+MINUTE).nextRunTime,0);
assert.equal(scan.status({...opts,enabled:false,schedule:{mode:'5 Dakikada Bir Tara'}},now+MINUTE).reason,'schedule_five');
assert.equal(scan.status(opts,now+13*MINUTE).reason,'stale_candidates');
scan.observe([],now+5*MINUTE);assert.equal(scan.status(opts,now+5*MINUTE).intervalMinutes,10);
scan.observe([match],now+5*MINUTE);scan.providerFailure(now+5*MINUTE);
assert.equal(scan.status(opts,now+6*MINUTE).reason,'provider_cooldown');
assert.equal(scan.status(opts,now+15*MINUTE).intervalMinutes,5);
scan.finish({failed:true},now+16*MINUTE);assert.equal(scan.candidateCount,0);
scan.resetClock();assert.equal(scan.lastStartedAt,null);assert.equal(scan.status(opts,now+16*MINUTE).nextRunTime,0);
scan.begin(now+20*MINUTE);scan.observe([match],now+20*MINUTE);scan.finish({},now+28*MINUTE);
assert.equal(scan.status(opts,now+28*MINUTE).nextRunTime,now+29*MINUTE,'Long scan never triggers instant catch-up');
assert(providerTrouble({data:{errors:{requests:'Too many requests'}}}));assert(!providerTrouble({data:{errors:[]}}));
console.log('Adaptive cadence: candidate gates, 25/80, 5/10 transitions, inclusive reserve, unknown quota, cooldown, expiry, schedules and long-scan gap passed.');
