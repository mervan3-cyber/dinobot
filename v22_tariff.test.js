'use strict';
const assert = require('assert/strict');
const tariff = require('./v22_tariff');
const base = { market: '2.5_UST', score: '1-0', minute: 35, odds: 1.6,
    dinoProbability: 59, selectorProbability: 61, v18Probability: 62, prematchSupport: 55 };
const check = changes => tariff.check({ ...base, ...changes });
assert.deepEqual(check({}).matchedFilters, ['A', 'B']);
assert.deepEqual(check({ market: '3.5_UST', score: '2-0', prematchSupport: 25 }).matchedFilters, ['A']);
assert.deepEqual(check({ score: '0-1', prematchSupport: 45 }).matchedFilters, ['B']);
assert.deepEqual(check({ market: '0.5_UST', score: '0-0', prematchSupport: 80 }).matchedFilters, ['C']);
assert.deepEqual(check({ market: '1.5_UST', prematchSupport: 80 }).matchedFilters, ['A', 'C']);
for (const field of ['dinoProbability', 'selectorProbability', 'v18Probability']) {
    for (const bad of [null, undefined, '', false, 'bad', NaN, -1, 0, 50, 101]) assert.equal(check({ [field]: bad }).eligible, false, field+' '+bad);
}
for (const [changes, threshold] of [[{market:'3.5_UST',score:'2-0'},20],[{score:'0-1'},40],[{market:'0.5_UST',score:'0-0'},75]]) {
    assert.equal(check({...changes,prematchSupport:threshold}).eligible,false);
    assert.equal(check({...changes,prematchSupport:threshold+.1}).eligible,true);
}
for(const bad of [null,undefined,'',false,'bad',-1,101]) assert.equal(check({prematchSupport:bad}).eligible,false);
for(const market of ['MS1','X','MS2','2.5_ALT','2_UST','junk','-0.5_UST']) assert.equal(check({market}).eligible,false);
for(const score of [null,'','bad','-1-0','1.5-0','2-1','3-0']) assert.equal(check({score}).eligible,false);
for(const minute of [24.9,80.1,null]) assert.equal(check({minute}).eligible,false);
for(const minute of [25,80]) assert.equal(check({minute}).eligible,true);
for(const odds of [1.49,4.01,null]) assert.equal(check({odds}).eligible,false);
for(const dinoProbability of [57.5,60,57.46]) assert.equal(check({dinoProbability}).eligible,true);
for(const dinoProbability of [57.4,60.1]) assert.equal(check({dinoProbability}).eligible,false);
const c={market:'0.5_UST',score:'0-0',prematchSupport:80};
for(const dinoProbability of [52.5,67.5]) assert.equal(check({...c,dinoProbability}).eligible,true);
for(const dinoProbability of [52.4,67.6]) assert.equal(check({...c,dinoProbability}).eligible,false);
assert.equal(tariff.canPreselect({...base,selectorProbability:null,v18Probability:null}),true);
assert.equal(tariff.canPreselect({...base,dinoProbability:50}),false);
assert.equal(tariff.POLICY.telegram,false);
assert.equal(tariff.POLICY.maximumSignalsPerFixture,1);
console.log('V22 A/B/C OR, boundaries, strict pre/model votes, score and missing fields passed.');
