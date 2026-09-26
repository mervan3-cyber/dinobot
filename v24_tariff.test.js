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

const b = check({ market: '1.5_UST', prematchSupport: 70, v16Probability: 60 });
assert.equal(b.eligible, true);
assert.equal(b.branch, 'B');
assert.equal(b.goalsNeeded, 1);
assert.equal(check({ market: '1.5_UST', prematchSupport: 69.9, v16Probability: 60 }).eligible, false);
assert.equal(check({ market: '1.5_UST', prematchSupport: 70, v16Probability: 59.9 }).eligible, false);

const sniper = check({
    market: '1.5_UST',
    score: '0-0',
    prematchSupport: 72,
    dinoProbability: 50,
    v16Probability: 72,
    v18Probability: 50
});
assert.equal(sniper.eligible, true);
assert.equal(sniper.branch, 'SNIPER');
assert.equal(sniper.goalsNeeded, 2);
assert.equal(check({
    market: '1.5_UST', score: '0-0', prematchSupport: 71.9,
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
    market: '1.5_UST', prematchSupport: 70, v16Probability: 60, v18Probability: 54.9
}, tariff.POLICIES.weekendGuard);
assert.equal(guardB.eligible, false);
assert.equal(check({
    market: '1.5_UST', prematchSupport: 70, v16Probability: 60, v18Probability: 55
}, tariff.POLICIES.weekendGuard).eligible, true);

assert.equal(check({
    market: '1.5_UST', prematchSupport: 70, v16Probability: 60, v18Probability: 65, minute: 68
}, tariff.POLICIES.weekendQuiet).eligible, true);
assert.equal(check({
    market: '1.5_UST', prematchSupport: 70, v16Probability: 60, v18Probability: 65, minute: 69
}, tariff.POLICIES.weekendQuiet).eligible, false);

assert.equal(check({ odds: 1.8, dinoProbability: 43 }, tariff.POLICIES.geminiWeekend).eligible, false,
    'Gemini Weekend Dino EDGE -12 altını reddetmeli.');
assert.equal(check({ odds: 1.8, dinoProbability: 44 }, tariff.POLICIES.geminiWeekend).eligible, false,
    'A kolunun Dino %45 ortak tabanı korunmalı.');
assert.equal(check({ odds: 1.8, dinoProbability: 45 }, tariff.POLICIES.geminiWeekend).eligible, true);

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
assert.equal(tariff.leadingWinnerMarket('2-1'), 'MS1');
assert.equal(tariff.leadingWinnerMarket('1-2'), 'MS2');
assert.equal(tariff.leadingWinnerMarket('1-1'), null);

console.log('V24 tariff: main Sniper/B/A/MS and three weekend policies passed.');
