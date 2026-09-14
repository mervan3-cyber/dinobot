'use strict';
const assert=require('assert/strict');
const {evaluate,poissonTail,POLICY}=require('./v23_goal_policy');
function profile(gf=2,ga=2){ const group={n:10,goalsFor:gf,goalsAgainst:ga,failedToScoreRate:0.2,cleanSheetRate:0.2};
    return {id:'sample',cutoff:'2026-09-14T10:00:00Z',latestMatchAt:'2026-09-11T10:00:00Z',
        last5:{...group,n:5},last10:{...group},home:{...group,n:5},away:{...group,n:5}}; }
const signal={score:'0-0',market:'0.5_UST',minute:45,odds:1.6,dinoProbability:60,selectorV2Probability:65,v18Probability:66,prematchMarketSupport:60};
const base={signal,mac:{home_red:0,away_red:0},homeEntry:{status:'ok',profile:profile()},awayEntry:{status:'ok',profile:profile()}};
const check=patch=>evaluate({...structuredClone(base),...patch});
const approved=check({}); assert.equal(approved.status,'approve');assert.equal(approved.goalsNeeded,1);
assert.equal(approved.expectedGoals90,4);assert.equal(approved.expectedRemainingGoals,2);
assert(Math.abs(approved.remainingProbability-(1-Math.exp(-2)))<1e-12);
assert.equal(check({signal:{...signal,market:'2.5_UST',minute:80}}).status,'reject');
assert.equal(check({signal:{...signal,score:'1-0',market:'0.5_UST'}}).status,'insufficient');
for(const pre of [null,50,49]) assert.equal(check({signal:{...signal,prematchMarketSupport:pre}}).status,'insufficient');
for(const mac of [{home_red:1,away_red:0},{home_red:0,away_red:1},{home_red:null,away_red:0},{home_red:false,away_red:0}])
    assert.equal(check({mac}).status,'insufficient');
assert.equal(check({homeEntry:{status:'profile_not_ready',profile:null}}).status,'insufficient');
for(const change of [p=>p.last10.n=9,p=>p.home.n=4,p=>p.last10.goalsFor=null,p=>p.latestMatchAt='2026-01-01',p=>p.home.goalsAgainst=-1]) {
    const p=profile();change(p);assert.equal(check({homeEntry:{status:'ok',profile:p}}).status,'insufficient');
}
// One prolific side can provide all additional goals; neither side is individually required to score.
assert.equal(check({homeEntry:{status:'ok',profile:profile(0,3)},awayEntry:{status:'ok',profile:profile(3,0)}}).status,'approve');
const h=profile();h.last5.failedToScoreRate=0.6;
assert(check({homeEntry:{status:'ok',profile:h}}).notes.includes('HOME_FAILED_TO_SCORE_3_OF_LAST_5'));
// Scoreline affects needed goals, not an unvalidated +10/+20% paper coefficient.
const tied=check({signal:{...signal,score:'1-1',market:'2.5_UST'}}),leading=check({signal:{...signal,score:'2-0',market:'2.5_UST'}});
assert.equal(tied.remainingProbability,leading.remainingProbability);assert.notEqual(tied.scoreState,leading.scoreState);
assert.equal(poissonTail(0,1),0);assert.equal(poissonTail(-1,1),null);
assert.equal(POLICY.addedTimeMinutes,0);assert.equal(POLICY.calibrated,false);assert.equal(POLICY.minimumRemainingProbability,0.5);
assert(approved.notes.includes('PRE_ALREADY_IN_BASELINE_NOT_AN_INDEPENDENT_VOTE'));
console.log('V23 policy: frozen reference, exact remaining-goal/time calculation, missing/pre/card/sample safeguards and no naive paper coefficients passed.');
