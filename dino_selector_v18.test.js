'use strict';

const assert = require('assert/strict');
const path = require('path');
const v18 = require('./dino_selector_v18');
const v18BTariff = v18.loadTariff(path.join(__dirname, 'market_tariff_v18_b.json'));

assert.equal(v18.MODEL.trainingThrough, '2026-09-04');
assert.equal(v18.TARIFF.status, 'challenger-not-production');
assert.equal(v18.TARIFF.altMarketsEnabled, false);
assert.equal(v18.TARIFF.followPolicy.maximumSignalsPerFixture, 1);
assert.deepEqual(v18.TARIFF.portfolioMarkets, ['0.5_UST', '2.5_UST', 'MS2', 'X']);
assert.equal(v18BTariff.status, 'challenger-shadow-only');
assert.equal(v18BTariff.altMarketsEnabled, false);
assert.equal(v18BTariff.followPolicy.maximumSignalsPerFixture, 1);
assert.deepEqual(
    v18BTariff.portfolioMarkets,
    ['0.5_UST', '2.5_UST', 'MS2', 'X', '4.5_UST']
);

const baseMatch = {
    dakika: 45,
    skor: '0-0',
    home_shot: 7,
    away_shot: 6,
    home_sot: 2,
    away_sot: 2,
    home_corner: 3,
    away_corner: 2,
    home_possession: 52,
    away_possession: 48,
    home_yellow: 1,
    away_yellow: 1,
    home_red: 0,
    away_red: 0,
    home_fouls: 6,
    away_fouls: 7,
    home_offsides: 1,
    away_offsides: 1,
    home_saves: 2,
    away_saves: 2,
    prematch_p_home: 0.4,
    prematch_p_draw: 0.3,
    prematch_p_away: 0.3,
    prematch_totals: {
        '0.5': { over: 0.9, under: 0.1 },
        '2.5': { over: 0.55, under: 0.45 }
    },
    canli_oranlar: {
        '0.5_UST': { oran: 1.55 },
        '0.5_ALT': { oran: 2.4 },
        '2.5_UST': { oran: 1.8 },
        '2.5_ALT': { oran: 2.0 },
        MS1: { oran: 2.4 },
        X: { oran: 3.0 },
        MS2: { oran: 3.1 }
    }
};
const dino = { '0.5_UST': 70, '2.5_UST': 58, MS1: 42, X: 31, MS2: 35 };
const liveOnly = { '0.5_UST': 68, '2.5_UST': 56, MS1: 40, X: 30, MS2: 34 };

for (const market of v18.TARIFF.portfolioMarkets) {
    const score = v18.scoreMarket(baseMatch, market, dino, liveOnly, null);
    assert.ok(score, `${market} skoru oluşmalı`);
    assert.ok(Number.isFinite(score.v18Probability));
    assert.ok(Number.isFinite(score.v18Edge));
}

assert.equal(
    v18.scoreMarket({ ...baseMatch, skor: '1-0' }, '0.5_UST', dino, liveOnly, null),
    null,
    'Zaten gerçekleşmiş ÜST marketi yeniden tahmin edilmemeli'
);

const rule = v18.TARIFF.primaryRules.find(item => item.market === '2.5_UST');
assert.equal(v18.checkRule(
    { dakika: 50 },
    { odds: 1.6, v18Probability: 65, v18Edge: 7 },
    rule
).eligible, true);
assert.equal(v18.checkRule(
    { dakika: 50 },
    { odds: 1.6, v18Probability: 65, v18Edge: -1 },
    rule
).eligible, false, 'V18 tarifesinde negatif edge seçilmemeli');

const b45 = v18.ruleFor('4.5_UST', v18BTariff);
assert.equal(v18.checkRule(
    { dakika: 60 },
    { odds: 1.5, v18Probability: 50, v18Edge: 0 },
    b45
).eligible, true, 'V18-B 4.5 ÜST alt sınırları dahil olmalı');
assert.equal(v18.checkRule(
    { dakika: 59 },
    { odds: 1.8, v18Probability: 70, v18Edge: 5 },
    b45
).eligible, false, 'V18-B 4.5 ÜST 60. dakikadan önce açılmamalı');

const bMs2 = v18.ruleFor('MS2', v18BTariff);
assert.equal(v18.checkRule(
    { dakika: 54 },
    { odds: 1.7, v18Probability: 65, v18Edge: 10 },
    bMs2
).eligible, true, 'V18-B MS2 genişletilmiş aralığı çalışmalı');
assert.equal(v18.checkRule(
    { dakika: 54 },
    { odds: 1.7, v18Probability: 70, v18Edge: 9.9 },
    bMs2
).eligible, false, 'V18-B MS2 için sıkı +10 EDGE korunmalı');

console.log('V18 shadow runtime tests passed.');
