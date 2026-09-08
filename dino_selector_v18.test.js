'use strict';

const assert = require('assert/strict');
const v18 = require('./dino_selector_v18');

assert.equal(v18.MODEL.trainingThrough, '2026-09-04');

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
        '1.5_UST': { oran: 1.65 },
        '2.5_UST': { oran: 1.8 },
        '2.5_ALT': { oran: 2.0 },
        '3.5_UST': { oran: 1.7 },
        '4.5_UST': { oran: 1.9 },
        MS1: { oran: 2.4 },
        X: { oran: 3.0 },
        MS2: { oran: 3.1 }
    }
};
const dino = {
    '0.5_UST': 70, '1.5_UST': 64, '2.5_UST': 58, '3.5_UST': 52,
    '4.5_UST': 45, MS1: 42, X: 31, MS2: 35
};
const liveOnly = {
    '0.5_UST': 68, '1.5_UST': 62, '2.5_UST': 56, '3.5_UST': 50,
    '4.5_UST': 43, MS1: 40, X: 30, MS2: 34
};

for (const market of ['0.5_UST', '1.5_UST', '2.5_UST', '3.5_UST', '4.5_UST', 'MS1', 'X', 'MS2']) {
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
assert.equal(
    v18.scoreMarket({ ...baseMatch, skor: '2-1' }, '2.5_UST', dino, liveOnly, null),
    null,
    'Gerçekleşmiş 2.5 ÜST marketi Test Lab sinyali olmamalı'
);

console.log('V18 scoring runtime tests passed.');
