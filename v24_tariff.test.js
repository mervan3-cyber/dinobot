'use strict';

const assert = require('assert/strict');
const tariff = require('./v24_tariff');

const over = extra => tariff.overCheck({
    market: '2.5_UST',
    score: '1-0',
    minute: 50,
    odds: 1.8,
    prematchSupport: 32,
    dinoProbability: 45,
    v16Probability: 50,
    v18Probability: 50,
    eventScoreStatus: 'approve',
    ...extra
});

assert.equal(over().eligible, true, 'A eşikleri dahil olmalı.');
assert.equal(over().branch, 'A');
assert.equal(over().goalsNeeded, 2);
assert.equal(over({ score: '0-0' }).eligible, false, '0-0 bütün ÜST kollarında yasak.');
assert.ok(over({ score: '0-0' }).reasons.includes('ZERO_ZERO_FORBIDDEN'));
assert.equal(over({ market: '1.5_UST', v16Probability: 59.9 }).eligible, false, 'B V16 %60 altını reddetmeli.');
assert.equal(over({ market: '1.5_UST', v16Probability: 60 }).eligible, true, 'B V16 %60 dahil geçmeli.');
assert.equal(over({ market: '1.5_UST', v16Probability: 60 }).branch, 'B');
assert.equal(over({ eventScoreStatus: 'reject' }).eligible, false, 'Skor/olay uyumsuzluğu ÜST sinyalini reddetmeli.');
assert.equal(over({ eventScoreStatus: 'insufficient' }).eligible, false, 'Olay listesi eksikse ÜST filtresi kapalı kalmalı.');
assert.equal(over({ prematchSupport: 31.9 }).eligible, false);
assert.equal(over({ dinoProbability: 44.9 }).eligible, false);
assert.equal(over({ v18Probability: 49.9 }).eligible, false);
assert.equal(over({ v16Probability: 49.9 }).eligible, false);
assert.equal(over({ odds: 2, dinoProbability: 50 }).eligible, true, 'Dino EDGE %0 dahil geçmeli.');
assert.equal(over({ odds: 2, dinoProbability: 50.1 }).eligible, false, 'Pozitif Dino EDGE reddedilmeli.');
assert.ok(over({ odds: 2, dinoProbability: 50.1 }).reasons.includes('DINO_EDGE_POSITIVE'));
assert.equal(over({ odds: 1.5, dinoProbability: 45 }).eligible, true, 'Negatif Dino EDGE için alt sınır olmamalı.');

const winner = extra => tariff.winnerCheck({
    market: 'MS2',
    score: '0-1',
    minute: 25,
    odds: 2,
    v16Probability: 50,
    ...extra
});

assert.equal(winner().eligible, true, 'MS2 alt dakika, alt V16 ve EDGE 0 dahil geçmeli.');
assert.equal(winner({ minute: 44, v16Probability: 55 }).eligible, true, '44. dakika ve EDGE +5 dahil geçmeli.');
assert.equal(winner({ minute: 45 }).eligible, false);
assert.equal(winner({ odds: 2.51 }).eligible, false);
assert.equal(winner({ v16Probability: 55.1 }).eligible, false, 'EDGE +5 üstü reddedilmeli.');
assert.equal(winner({ market: 'MS1' }).eligible, false, 'Skorda önde olmayan taraf seçilemez.');
assert.equal(tariff.leadingWinnerMarket('2-1'), 'MS1');
assert.equal(tariff.leadingWinnerMarket('1-2'), 'MS2');
assert.equal(tariff.leadingWinnerMarket('1-1'), null);

console.log('V24 tariff: A/B thresholds, 0-0 ban, event-score gate and leading-side MS bounds passed.');
