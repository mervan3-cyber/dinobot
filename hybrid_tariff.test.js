'use strict';

const assert = require('assert/strict');
const tariff = require('./hybrid_tariff');

const implied = odds => 100 / odds;

assert.equal(tariff.VERSION, 'v19.0-hybrid-live-2026-09-07');
assert.equal(tariff.currentSlot(null, null), 'primary');
assert.equal(tariff.currentSlot({ minute: 30, market: 'MS1' }, null), 'follow');
assert.equal(tariff.currentSlot({ minute: 30 }, { minute: 50 }), null);

const ms1AtExceptionFloor = tariff.check({
    slot: 'primary', market: 'MS1', minute: 35, odds: 1.50,
    dinoProbability: 60, selectorProbability: implied(1.50),
});
assert.equal(ms1AtExceptionFloor.eligible, true);
assert.equal(ms1AtExceptionFloor.decisionModel, 'v16');

const ms2BelowGeneralFloor = tariff.check({
    slot: 'primary', market: 'MS2', minute: 30, odds: 1.59,
    dinoProbability: 70, selectorProbability: 70,
    v18Probability: 70, v18Edge: 7,
});
assert.equal(ms2BelowGeneralFloor.eligible, false);

const ms2V18 = tariff.check({
    slot: 'primary', market: 'MS2', minute: 30, odds: 1.70,
    dinoProbability: 60, selectorProbability: 40,
    v18Probability: 70, v18Edge: 8,
});
assert.equal(ms2V18.eligible, true);
assert.equal(ms2V18.rule.id, 'H-P-MS2-V18-EARLY');
assert.equal(ms2V18.decisionProbability, 70);

assert.equal(tariff.check({
    slot: 'primary', market: 'MS2', minute: 30, odds: 1.70,
    dinoProbability: 60, selectorProbability: 80,
    v18Probability: 75, v18Edge: 8,
}).eligible, false, 'V18 aşırı güven bölgesi dondurulmuş pencerenin dışında');

const late45 = tariff.check({
    slot: 'primary', market: '4.5_UST', minute: 65, odds: 1.75,
    dinoProbability: 60, selectorProbability: 40,
    v18Probability: 65, v18Edge: 5,
});
assert.equal(late45.eligible, true);
assert.equal(late45.decisionModel, 'v18');

const prior = { minute: 30, market: '2.5_UST' };
const followMs2 = tariff.check({
    slot: 'follow', market: 'MS2', minute: 50, odds: 1.70,
    dinoProbability: 60, selectorProbability: implied(1.70) + 3,
    v18Probability: 20, v18Edge: -20, previousPrimary: prior,
});
assert.equal(followMs2.eligible, true);
assert.equal(followMs2.decisionModel, 'v16');

assert.equal(tariff.check({
    slot: 'follow', market: 'MS2', minute: 30, odds: 1.70,
    dinoProbability: 60, selectorProbability: implied(1.70) + 3,
    previousPrimary: prior,
}).eligible, false, 'takip daha ileri dakikada olmalı');

for (const market of ['0.5_UST', '1.5_UST', '3.5_UST']) {
    assert.equal(
        tariff.PRIMARY_RULES.some(rule => rule.market === market),
        false,
        `${market} Telegram portföyünde olmamalı`
    );
    assert.equal(
        tariff.OBSERVATION_RULES.some(rule => rule.market === market),
        true,
        `${market} gözlem portföyünde kalmalı`
    );
}

assert.equal(tariff.check({
    slot: 'primary', market: '2.5_ALT', minute: 30, odds: 1.80,
    dinoProbability: 70, selectorProbability: 70,
}).eligible, false);

assert.equal(tariff.check({
    slot: 'primary', market: 'X', minute: 65, odds: 2.01,
    dinoProbability: implied(2.01) + 1, selectorProbability: 60,
}).eligible, false, '2.00 üstü oran kapalı');

const observation15 = tariff.checkObservation({
    market: '1.5_UST', minute: 42, odds: 1.70,
    dinoProbability: 65, selectorProbability: 60,
    v18Probability: 20, v18Edge: -10,
});
assert.equal(observation15.eligible, true);
assert.equal(observation15.decisionModel, 'v16');

console.log('V19 hybrid tariff tests passed.');
