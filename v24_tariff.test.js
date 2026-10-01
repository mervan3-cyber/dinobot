'use strict';

const assert = require('assert/strict');
const tariff = require('./v24_tariff');

const check = (extra = {}, policy = tariff.POLICY) => tariff.overCheck({
    market: '2.5_UST',
    score: '1-0',
    minute: 50,
    odds: 1.8,
    prematchSupport: 52,
    dinoProbability: 45,
    v16Probability: 65,
    v18Probability: 50,
    eventScoreStatus: 'approve',
    ...extra
}, { policy });

const a = check();
assert.equal(a.eligible, true);
assert.equal(a.branch, 'A');
assert.equal(a.goalsNeeded, 2);
assert.equal(a.thresholds.prematch, 52);

const b = check({ market: '1.5_UST', prematchSupport: 70, v16Probability: 65 });
assert.equal(b.eligible, true);
assert.equal(b.branch, 'B');
assert.equal(b.goalsNeeded, 1);
assert.equal(check({ market: '1.5_UST', prematchSupport: 69.9, v16Probability: 65 }).eligible, false);
assert.equal(check({ market: '1.5_UST', prematchSupport: 70, v16Probability: 64.9 }).eligible, false);

const sniper = check({
    market: '1.5_UST',
    score: '0-0',
    prematchSupport: 75,
    dinoProbability: 50,
    v16Probability: 72,
    v18Probability: 50
});
assert.equal(sniper.eligible, true);
assert.equal(sniper.branch, 'SNIPER');
assert.equal(sniper.goalsNeeded, 2);
assert.equal(check({
    market: '1.5_UST', score: '0-0', prematchSupport: 74.9,
    dinoProbability: 50, v16Probability: 72, v18Probability: 50
}).eligible, false);
assert.equal(check({ market: '2.5_UST', score: '0-0', prematchSupport: 99, v16Probability: 99 }).eligible, false);

assert.equal(check({ market: '3.5_UST' }).eligible, false, 'Üç gol gerektiren market reddedilmeli.');
assert.ok(check({ market: '3.5_UST' }).reasons.includes('MORE_THAN_TWO_GOALS_REQUIRED'));
assert.equal(check({ minute: 25 }).eligible, true);
assert.equal(check({ minute: 70 }).eligible, true);
assert.equal(check({ minute: 71 }).eligible, false);
assert.equal(check({ eventScoreStatus: 'reject' }).eligible, false);
assert.equal(check({ odds: 2, dinoProbability: 50 }).eligible, true, 'Dino EDGE sıfır dahil.');
assert.equal(check({ odds: 2, dinoProbability: 50.1 }).eligible, false, 'Pozitif Dino EDGE reddedilir.');
assert.equal(check({ odds: 1.5, dinoProbability: 45 }).eligible, true, 'Ana kolda negatif edge alt sınırı yok.');

const guardB = check({
    market: '1.5_UST', prematchSupport: 70, v16Probability: 65, v18Probability: 54.9
}, tariff.POLICIES.weekendGuard);
assert.equal(guardB.eligible, false);
assert.equal(check({
    market: '1.5_UST', prematchSupport: 70, v16Probability: 65, v18Probability: 55
}, tariff.POLICIES.weekendGuard).eligible, true);

assert.equal(check({
    market: '1.5_UST', prematchSupport: 70, v16Probability: 65, v18Probability: 65, minute: 68
}, tariff.POLICIES.weekendQuiet).eligible, true);
assert.equal(check({
    market: '1.5_UST', prematchSupport: 70, v16Probability: 65, v18Probability: 65, minute: 69
}, tariff.POLICIES.weekendQuiet).eligible, false);

assert.equal(check({ odds: 1.8, dinoProbability: 43 }, tariff.POLICIES.geminiWeekend).eligible, false,
    'Gemini Weekend Dino EDGE -12 altını reddetmeli.');
assert.equal(check({ odds: 1.8, dinoProbability: 44 }, tariff.POLICIES.geminiWeekend).eligible, false,
    'A kolunun Dino %45 ortak tabanı korunmalı.');
assert.equal(check({ odds: 1.8, dinoProbability: 45 }, tariff.POLICIES.geminiWeekend).eligible, true);

const selectiveA = check({}, tariff.POLICIES.selectiveWeekend);
assert.equal(selectiveA.eligible, true);
assert.equal(check({ market: '3.5_UST', score: '2-0', prematchSupport: 25 }, tariff.POLICIES.selectiveWeekend).eligible, false);
assert.ok(check({ market: '3.5_UST', score: '2-0', prematchSupport: 25 }, tariff.POLICIES.selectiveWeekend)
    .reasons.includes('MARKET_NOT_ENABLED_FOR_BRANCH'));
assert.deepEqual(tariff.POLICIES.selectiveWeekend.priority, ['SNIPER', 'A', 'B']);
assert.equal(tariff.POLICIES.selectiveWeekend.excludedNationalCompetitions, true);
assert.deepEqual(tariff.POLICIES.selectiveWeekend.excludedLeagues, ['League One', 'League Two', 'Eerste Divisie']);

assert.equal(check({}, tariff.POLICIES.v25JointWeekend).eligible, true,
    'V25 ortak onayı tarife sonrasındaki ayrı model kapısıdır.');
assert.deepEqual(tariff.POLICIES.v25JointWeekend.excludedLeagues, ['League One']);
assert.equal(tariff.POLICIES.v25JointWeekend.excludedNationalCompetitions, false);
assert.deepEqual(tariff.POLICIES.v25JointWeekend.v25Joint.branches.A,
    { market: '2.5_UST', probabilityMinimum: 60, edgeLow: -5, edgeHigh: 0 });
assert.deepEqual(tariff.POLICIES.v25JointWeekend.v25Joint.branches.B,
    { market: '1.5_UST', probabilityMinimum: 60, edgeLow: 0, edgeHigh: 7 });

const winner = (extra = {}, policy = tariff.POLICY) => tariff.winnerCheck({
    market: 'MS2',
    score: '0-1',
    minute: 25,
    odds: 1.75,
    v16Probability: 60,
    eventScoreStatus: 'approve',
    ...extra
}, { policy });

assert.equal(winner().eligible, true);
assert.equal(winner({ minute: 44 }).eligible, true);
assert.equal(winner({ minute: 45 }).eligible, false);
assert.equal(winner({ v16Probability: 59.9 }).eligible, false);
assert.equal(winner({ eventScoreStatus: 'reject' }).eligible, false);
assert.equal(winner({ v16Probability: 64.9 }, tariff.POLICIES.weekendGuard).eligible, false);
assert.equal(winner({ v16Probability: 65 }, tariff.POLICIES.weekendGuard).eligible, false,
    'V16 65 olsa bile EDGE +5 üzeriyse reddedilmeli.');
assert.equal(winner({ odds: 1.6, v16Probability: 65 }, tariff.POLICIES.weekendGuard).eligible, true);
assert.equal(winner({ odds: 1.6, v16Probability: 99 }, tariff.POLICIES.selectiveWeekend).eligible, false);
assert.ok(winner({ odds: 1.6, v16Probability: 99 }, tariff.POLICIES.selectiveWeekend)
    .reasons.includes('LEADING_WINNER_DISABLED'));
assert.equal(tariff.leadingWinnerMarket('2-1'), 'MS1');
assert.equal(tariff.leadingWinnerMarket('1-2'), 'MS2');
assert.equal(tariff.leadingWinnerMarket('1-1'), null);

console.log('V24 tariff: main Sniper/B/A/MS and five weekend policies passed.');
