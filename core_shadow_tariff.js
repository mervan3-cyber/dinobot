'use strict';

// Gelecek canlı günlerde değişmeden ölçülecek iki kurallı V18 çekirdeği.
// Bu tarife yalnız Test Lab gölgesidir; Telegram kararına dokunmaz.
const VERSION = 'v20.0-two-rule-core-shadow-2026-09-08';
const MINIMUM_ODD = 1.50;
const MAXIMUM_ODD = 2.00;

const RULES = Object.freeze([
    Object.freeze({
        id: 'CORE-V18-MS2-25-54',
        market: 'MS2',
        minuteLow: 25,
        minuteHigh: 54,
        probabilityMinimum: 65,
        probabilityMaximum: 100,
        edgeLow: 10,
        edgeHigh: 100,
        minimumOdd: MINIMUM_ODD,
        maximumOdd: MAXIMUM_ODD,
        priority: 90
    }),
    Object.freeze({
        id: 'CORE-V18-25O-50-80',
        market: '2.5_UST',
        minuteLow: 50,
        minuteHigh: 80,
        probabilityMinimum: 55,
        probabilityMaximum: 64.9,
        edgeLow: 5,
        edgeHigh: 10,
        minimumOdd: MINIMUM_ODD,
        maximumOdd: MAXIMUM_ODD,
        priority: 70
    })
]);

const finite = value => (
    value === null || value === undefined || value === '' || typeof value === 'boolean'
        ? null
        : Number.isFinite(Number(value)) ? Number(value) : null
);

function ruleFor(market) {
    return RULES.find(rule => rule.market === market) || null;
}

function check({ market, minute, odds, v18Probability, v18Edge }) {
    const reasons = [];
    const rule = ruleFor(market);
    const parsedMinute = finite(minute);
    const parsedOdd = finite(odds);
    const probability = finite(v18Probability);
    const edge = finite(v18Edge);

    if (!rule) reasons.push('market iki kurallı çekirdekte yok');
    if (String(market || '').endsWith('_ALT')) reasons.push('ALT marketleri kapalı');

    if (rule) {
        if (parsedMinute === null || parsedMinute < rule.minuteLow || parsedMinute > rule.minuteHigh) {
            reasons.push(`dakika ${rule.minuteLow}-${rule.minuteHigh} dışında`);
        }
        if (parsedOdd === null || parsedOdd < rule.minimumOdd || parsedOdd > rule.maximumOdd) {
            reasons.push(`oran ${rule.minimumOdd.toFixed(2)}-${rule.maximumOdd.toFixed(2)} dışında veya eksik`);
        }
        if (
            probability === null ||
            probability < rule.probabilityMinimum ||
            probability > rule.probabilityMaximum
        ) {
            reasons.push(`V18 %${rule.probabilityMinimum}-${rule.probabilityMaximum} dışında veya eksik`);
        }
        if (edge === null || edge < rule.edgeLow || edge > rule.edgeHigh) {
            reasons.push(`v18Edge ${rule.edgeLow}…${rule.edgeHigh} dışında veya eksik`);
        }
    }

    return {
        eligible: reasons.length === 0,
        reasons,
        rule,
        priority: rule?.priority ?? -Infinity,
        decisionModel: 'v18',
        decisionProbability: probability,
        decisionEdge: edge
    };
}

// Güç bağlamı ve V18 skoru toplanmadan önce yalnız ucuz market/dakika/oran
// kapısını kontrol eder. Nihai uygunluk mutlaka check ile tekrar hesaplanır.
function canPreselect({ market, minute, odds }) {
    const rule = ruleFor(market);
    const parsedMinute = finite(minute);
    const parsedOdd = finite(odds);
    return Boolean(
        rule &&
        parsedMinute !== null &&
        parsedMinute >= rule.minuteLow &&
        parsedMinute <= rule.minuteHigh &&
        parsedOdd !== null &&
        parsedOdd >= rule.minimumOdd &&
        parsedOdd <= rule.maximumOdd
    );
}

module.exports = {
    VERSION,
    MINIMUM_ODD,
    MAXIMUM_ODD,
    RULES,
    ruleFor,
    check,
    canPreselect
};
