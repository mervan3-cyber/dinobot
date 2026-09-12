'use strict';
const assert = require('assert/strict');
const v21 = require('./v21_tariff');
const active = require('./active_tariff');
const v19 = require('./hybrid_tariff');
const v17 = require('./market_tariff');

const candidate = { market: '2.5_UST', minute: 45, odds: 1.8,
    dinoProbability: 54, selectorProbability: 57, v18Probability: 60, prematchSupport: 62 };
assert.equal(v21.check(candidate).eligible, true);
assert.equal(v21.check(candidate).voteCount, 3);
for (const field of ['prematchSupport', 'dinoProbability', 'selectorProbability', 'v18Probability']) {
    assert.equal(v21.check({ ...candidate, [field]: 50 }).eligible, false, `${field}: exactly 50 is not above 50`);
    for (const missing of [null, undefined, '', true, NaN, Infinity, -1, 101])
        assert.equal(v21.check({ ...candidate, [field]: missing }).eligible, false, `${field}: missing/invalid cannot approve`);
}
const under = { ...candidate, market: '3.5_ALT', v18Probability: null };
assert.equal(v21.check(under).eligible, false, 'ALT is excluded; missing V18 is not fabricated');
assert.deepEqual(v21.check(under).votes, { dino: true, v16: true, v18: false });
assert.equal(v21.check({ ...under, dinoProbability: 50 }).eligible, false);
const edgeBoundary = { ...candidate, odds: 1.6, dinoProbability: 62.5 };
assert.equal(v21.check(edgeBoundary).eligible, true, '0 inclusive');
assert.equal(v21.check({ ...edgeBoundary, dinoProbability: 57.5 }).eligible, true, '-5 inclusive');
assert.equal(v21.check({ ...edgeBoundary, dinoProbability: 57.4 }).eligible, false, '-5.1 rejected');
assert.equal(v21.check({ ...edgeBoundary, dinoProbability: 62.6 }).eligible, false, '+0.1 rejected');
assert.equal(v21.check({ ...edgeBoundary, dinoProbability: 62.54 }).recordedEdge, 0, 'Same rounded EDGE as full-stat');
assert.equal(v21.check({ ...candidate, dinoProbability: 0, v18Probability: 60 }).eligible, false);
assert.equal(v21.canPreselect({ ...candidate, dinoProbability: 50 }), false, 'Mandatory Dino checked before fresh requests');
for (const market of ['MS1', 'X', 'MS2', '2_UST', 'ANY', '0.5_ALT', '2.5_ALT', '4.5_ALT']) assert.equal(v21.check({ ...candidate, market }).eligible, false);
for (const minute of [24, 81, null]) assert.equal(v21.check({ ...candidate, minute }).eligible, false);
for (const minute of [25, 80]) assert.equal(v21.check({ ...candidate, minute }).eligible, true);
for (const odds of [1.49, 4.01, null]) assert.equal(v21.check({ ...candidate, odds }).eligible, false);
assert.equal(v21.check({ ...candidate, odds: 1.5, dinoProbability: 63 }).eligible, true);
assert.equal(v21.check({ ...candidate, odds: 4 }).reasons.includes('oran 1.50–4.00 dışında'), false, 'Odds cap stays 4 even though other gates make high odds ineligible');
assert.equal(v21.check({ ...candidate, prematchSupport: 99 }).eligible, true, 'No new pre ceiling');
assert.equal(v21.canPreselect({ ...candidate, selectorProbability: null }), true, 'Cheap gate does not decide model votes');
assert.equal(v21.check({ ...candidate, v18Probability: 47 }).eligible, false, 'Former 2-of-3 signal no longer passes');
assert.equal(v21.check({ ...candidate, v18Probability: 50.001 }).eligible, true, 'Strict >50 on raw model values');
assert.equal(v21.check({ ...candidate, dinoProbability: 51, odds: 2 }).eligible, false, 'Former +1 boundary no longer passes');

const overlap = { slot: 'primary', market: '2.5_UST', minute: 30, odds: 1.8,
    dinoProbability: 55, selectorProbability: 60, v18Probability: 60, v18Edge: 5 };
assert.equal(active.check(overlap).eligible, true);
assert.deepEqual(active.check(overlap).signalSources, ['V19', 'Legacy V17']);
assert.equal(active.check(overlap).rule.id, 'H-P-25O-V16');
assert.equal(active.currentSlot({}, null), null, 'One shared Telegram fixture lock');
assert.equal(active.currentSlot(null, {}), null);
const legacyOnly = { ...overlap, odds: 2.5, dinoProbability: 40 };
assert.equal(active.check(legacyOnly).eligible, true, 'Do not apply V19 odds cap to V17');
assert.deepEqual(active.check(legacyOnly).signalSources, ['Legacy V17']);
assert.equal(active.check(legacyOnly).maximumOdd, null);
const late = { ...overlap, market: '4.5_UST', minute: 65, v18Edge: 5 };
assert.equal(active.check(late).eligible, true);
assert.deepEqual(active.check(late).signalSources, ['V19']);
for (const market of ['MS1', 'X', 'MS2', '2.5_ALT', '0.5_UST', '1.5_UST', '3.5_UST']) {
    assert.equal(active.check({ ...overlap, market }).eligible, false);
    assert.equal(active.canPreselect({ ...overlap, market }), false);
}
assert.equal(active.check({ ...overlap, slot: 'follow' }).eligible, false);
for (const market of ['MS1', 'MS2', 'X']) assert.ok(v19.PRIMARY_RULES.some(rule => rule.market === market));
assert.ok(v17.PRIMARY_RULES.some(rule => rule.market === '0.5_UST'));
assert.equal(v19.checkObservation, undefined);
assert.equal(v19.OBSERVATION_RULES, undefined);
console.log('V21 thresholds, missing-data votes, EDGE limits, Telegram union and retained lab policies passed.');
