'use strict';

const assert = require('assert/strict');
const tariff = require('./market_tariff');

const implied = odds => 100 / odds;
const dinoForEdge = (odds, edge) => implied(odds) + edge;
const v16ForEdge = (odds, edge) => implied(odds) + edge;

assert.equal(tariff.MINIMUM_ODD, 1.5);
assert.equal(tariff.currentSlot(null, null), 'primary');
assert.equal(tariff.currentSlot({ minute: 30, market: '2.5_UST' }, null), 'follow');
assert.equal(tariff.currentSlot({ minute: 30 }, { minute: 45 }), null);
assert.equal(tariff.edgeValues(null, null, null).recordedEdge, null);

const primary25 = tariff.check({
    slot: 'primary', market: '2.5_UST', minute: 25, odds: 2,
    dinoProbability: dinoForEdge(2, 0), selectorProbability: 60,
});
assert.equal(primary25.eligible, true);
assert.equal(primary25.rule.id, 'P-25O');

assert.equal(tariff.check({
    slot: 'primary', market: '2.5_ALT', minute: 25, odds: 2,
    dinoProbability: 60, selectorProbability: 60,
}).eligible, false);

assert.equal(tariff.check({
    slot: 'primary', market: '2.5_UST', minute: 25, odds: 1.499,
    dinoProbability: dinoForEdge(1.499, 0), selectorProbability: 70,
}).eligible, false);

const primary35 = tariff.check({
    slot: 'primary', market: '3.5_UST', minute: 80, odds: 2,
    dinoProbability: 20, selectorProbability: v16ForEdge(2, -1),
});
assert.equal(primary35.eligible, false, 'V16 minimum remains binding before V16 EDGE');

const primaryMs1 = tariff.check({
    slot: 'primary', market: 'MS1', minute: 40, odds: 1.75,
    dinoProbability: 10, selectorProbability: v16ForEdge(1.75, 0),
});
assert.equal(primaryMs1.eligible, true);

const primary15 = tariff.check({
    slot: 'primary', market: '1.5_UST', minute: 42, odds: 1.6,
    dinoProbability: 10, selectorProbability: 65,
});
assert.equal(primary15.eligible, true);
assert.equal(primary15.rule.id, 'P-15O-SAFE');
assert.equal(tariff.check({
    slot: 'primary', market: '1.5_UST', minute: 39, odds: 1.6,
    dinoProbability: 10, selectorProbability: 65,
}).eligible, false, 'safe 1.5 OVER window starts at minute 40');

const prior = { minute: 40, market: '2.5_UST' };
const followMs2 = tariff.check({
    slot: 'follow', market: 'MS2', minute: 45, odds: 1.7,
    dinoProbability: 10, selectorProbability: v16ForEdge(1.7, 3),
    previousPrimary: prior,
});
assert.equal(followMs2.eligible, true);
assert.equal(followMs2.rule.id, 'F-MS2');

assert.equal(tariff.check({
    slot: 'follow', market: 'MS1', minute: 40, odds: 1.75,
    dinoProbability: 10, selectorProbability: v16ForEdge(1.75, 0),
    previousPrimary: prior,
}).eligible, false, 'follow minute must be strictly later');

assert.equal(tariff.check({
    slot: 'follow', market: 'MS1', minute: 45, odds: 1.75,
    dinoProbability: 10, selectorProbability: v16ForEdge(1.75, 0),
    previousPrimary: { minute: 40, market: 'MS1' },
}).eligible, false, 'follow market must differ');

assert.deepEqual(
    tariff.PRIMARY_RULES.map(rule => rule.market),
    ['0.5_UST', '2.5_UST', '3.5_UST', '1.5_UST', 'MS1', 'X']
);
assert.deepEqual(
    tariff.FOLLOW_RULES.map(rule => rule.market),
    ['4.5_UST', 'MS1', 'MS2']
);

console.log('V17 market tariff tests passed.');
