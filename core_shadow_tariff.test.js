'use strict';

const assert = require('assert/strict');
const tariff = require('./core_shadow_tariff');

assert.equal(tariff.MINIMUM_ODD, 1.5);
assert.equal(tariff.MAXIMUM_ODD, 2);
assert.deepEqual(tariff.RULES.map(rule => rule.market), ['MS2', '2.5_UST']);

assert.equal(tariff.check({
    market: 'MS2', minute: 25, odds: 1.5,
    v18Probability: 65, v18Edge: 10
}).eligible, true, 'MS2 alt sınırları dahil olmalı');

assert.equal(tariff.check({
    market: 'MS2', minute: 54, odds: 2,
    v18Probability: 100, v18Edge: 100
}).eligible, true, 'MS2 üst sınırları dahil olmalı');

assert.equal(tariff.check({
    market: 'MS2', minute: 55, odds: 1.75,
    v18Probability: 75, v18Edge: 20
}).eligible, false, 'MS2 54. dakikadan sonra kapanmalı');

assert.equal(tariff.check({
    market: '2.5_UST', minute: 50, odds: 1.5,
    v18Probability: 55, v18Edge: 5
}).eligible, true, '2.5 ÜST alt sınırları dahil olmalı');

assert.equal(tariff.check({
    market: '2.5_UST', minute: 80, odds: 2,
    v18Probability: 64.9, v18Edge: 10
}).eligible, true, '2.5 ÜST üst sınırları dahil olmalı');

assert.equal(tariff.check({
    market: '2.5_UST', minute: 60, odds: 1.7,
    v18Probability: 65, v18Edge: 7
}).eligible, false, '2.5 ÜST olasılık üst sınırı 64.9 olmalı');

assert.equal(tariff.check({
    market: '2.5_UST', minute: 60, odds: 1.7,
    v18Probability: 60, v18Edge: 10.1
}).eligible, false, '2.5 ÜST edge üst sınırı 10 olmalı');

assert.equal(tariff.canPreselect({ market: 'MS2', minute: 40, odds: 1.8 }), true);
assert.equal(tariff.canPreselect({ market: 'MS2', minute: 40, odds: 2.01 }), false);
assert.equal(tariff.canPreselect({ market: '0.5_UST', minute: 40, odds: 1.8 }), false);

console.log('Two-rule core shadow tariff tests passed.');
