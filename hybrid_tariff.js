'use strict';

// V19, V17'nin başarılı canlı pencerelerini V18'in yalnız doğrulanan
// challenger pencereleriyle birleştirir. Bütün ALT marketleri kapalıdır.
// Aynı maçta en fazla bir ilk ve daha ileri dakikada farklı bir takip sinyali
// üretilebilir. 0.5/1.5/3.5 ÜST ise karar vermeden ayrı gözlemde tutulur.
const VERSION = 'v19.0-hybrid-live-2026-09-07';
const MINIMUM_ODD = 1.50;
const MAXIMUM_ODD = 2.00;

const PRIMARY_RULES = Object.freeze([
    Object.freeze({
        id: 'H-P-MS2-V18-EARLY', market: 'MS2', decisionModel: 'v18',
        minuteLow: 25, minuteHigh: 34, probabilityMinimum: 65,
        probabilityMaximum: 74.9, edgeField: 'v18Edge', edgeLow: 5,
        edgeHigh: 13, minimumOdd: 1.60, maximumOdd: MAXIMUM_ODD,
        priority: 75,
    }),
    Object.freeze({
        id: 'H-P-MS1-V16', market: 'MS1', decisionModel: 'v16',
        minuteLow: 25, minuteHigh: 54, probabilityMinimum: 55,
        probabilityMaximum: 100, edgeField: 'v16Edge', edgeLow: -2.5,
        edgeHigh: 2, minimumOdd: 1.50, maximumOdd: MAXIMUM_ODD,
        priority: 70,
    }),
    Object.freeze({
        id: 'H-P-25O-V16', market: '2.5_UST', decisionModel: 'v16',
        minuteLow: 25, minuteHigh: 34, probabilityMinimum: 50,
        probabilityMaximum: 100, edgeField: 'recordedEdge', edgeLow: -2.5,
        edgeHigh: 2, minimumOdd: 1.50, maximumOdd: MAXIMUM_ODD,
        priority: 66.7,
    }),
    Object.freeze({
        id: 'H-P-45O-V18-LATE', market: '4.5_UST', decisionModel: 'v18',
        minuteLow: 60, minuteHigh: 74, probabilityMinimum: 50,
        probabilityMaximum: 74.9, edgeField: 'v18Edge', edgeLow: 0,
        edgeHigh: 10, minimumOdd: 1.60, maximumOdd: MAXIMUM_ODD,
        priority: 60.2,
    }),
    Object.freeze({
        id: 'H-P-X-V16', market: 'X', decisionModel: 'v16',
        minuteLow: 61, minuteHigh: 70, probabilityMinimum: 50,
        probabilityMaximum: 100, edgeField: 'recordedEdge', edgeLow: 0,
        edgeHigh: 2, minimumOdd: 1.60, maximumOdd: MAXIMUM_ODD,
        priority: 54.8,
    }),
]);

const FOLLOW_RULES = Object.freeze([
    Object.freeze({
        id: 'H-F-MS2-V16', market: 'MS2', decisionModel: 'v16',
        minuteLow: 45, minuteHigh: 54, probabilityMinimum: 50,
        probabilityMaximum: 100, edgeField: 'v16Edge', edgeLow: 2,
        edgeHigh: 4, minimumOdd: 1.60, maximumOdd: MAXIMUM_ODD,
        priority: 62.3,
    }),
]);

const OBSERVATION_RULES = Object.freeze([
    Object.freeze({
        id: 'H-S-05O-V18', market: '0.5_UST', decisionModel: 'v18',
        minuteLow: 55, minuteHigh: 64, probabilityMinimum: 60,
        probabilityMaximum: 74.9, edgeField: 'v18Edge', edgeLow: 5,
        edgeHigh: 15, minimumOdd: 1.60, maximumOdd: MAXIMUM_ODD,
        priority: 60,
    }),
    Object.freeze({
        id: 'H-S-15O-V16', market: '1.5_UST', decisionModel: 'v16',
        minuteLow: 40, minuteHigh: 44, probabilityMinimum: 50,
        probabilityMaximum: 70, edgeField: 'v16Edge', edgeLow: -100,
        edgeHigh: 2.5, minimumOdd: 1.60, maximumOdd: MAXIMUM_ODD,
        priority: 55,
    }),
    Object.freeze({
        id: 'H-S-35O-V16', market: '3.5_UST', decisionModel: 'v16',
        minuteLow: 35, minuteHigh: 45, probabilityMinimum: 60,
        probabilityMaximum: 70, edgeField: 'v16Edge', edgeLow: -3.5,
        edgeHigh: -1.5, minimumOdd: 1.60, maximumOdd: MAXIMUM_ODD,
        priority: 50,
    }),
]);

const finite = value => value === null || value === undefined || value === '' || typeof value === 'boolean'
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null;

function rulesForSlot(slot) {
    return slot === 'follow' ? FOLLOW_RULES : PRIMARY_RULES;
}

function currentSlot(previousPrimary, previousFollow) {
    if (previousFollow) return null;
    return previousPrimary ? 'follow' : 'primary';
}

function edgeValues(dinoProbability, selectorProbability, v18Edge, odds) {
    const dino = finite(dinoProbability);
    const rawV16 = finite(selectorProbability);
    const v16 = rawV16 === null ? null : Number(rawV16.toFixed(1));
    const parsedV18Edge = finite(v18Edge);
    const price = finite(odds);
    const implied = price !== null && price > 1 ? 100 / price : null;
    return {
        recordedEdge: dino !== null && implied !== null
            ? Number((dino - implied).toFixed(1))
            : null,
        v16Edge: v16 !== null && implied !== null ? v16 - implied : null,
        v18Edge: parsedV18Edge,
    };
}

function findRule(slot, market) {
    return rulesForSlot(slot).find(rule => rule.market === market) || null;
}

function findObservationRule(market) {
    return OBSERVATION_RULES.find(rule => rule.market === market) || null;
}

function evaluateRule({
    rule,
    market,
    minute,
    odds,
    dinoProbability,
    selectorProbability,
    v18Probability,
    v18Edge,
}) {
    const reasons = [];
    const parsedMinute = finite(minute);
    const parsedOdd = finite(odds);
    const rawV16 = finite(selectorProbability);
    const parsedV16 = rawV16 === null ? null : Number(rawV16.toFixed(1));
    const parsedV18 = finite(v18Probability);
    const edges = edgeValues(dinoProbability, selectorProbability, v18Edge, odds);

    if (!rule) reasons.push('market bu sinyal yuvasının hibrit haritasında yok');
    if (String(market || '').endsWith('_ALT')) reasons.push('ALT marketleri kapalı');

    if (rule) {
        if (parsedMinute === null || parsedMinute < rule.minuteLow || parsedMinute > rule.minuteHigh) {
            reasons.push(`dakika ${rule.minuteLow}-${rule.minuteHigh} dışında`);
        }
        if (
            parsedOdd === null ||
            parsedOdd < rule.minimumOdd ||
            parsedOdd > rule.maximumOdd
        ) {
            reasons.push(`oran ${rule.minimumOdd.toFixed(2)}-${rule.maximumOdd.toFixed(2)} dışında veya eksik`);
        }

        const probability = rule.decisionModel === 'v18' ? parsedV18 : parsedV16;
        if (
            probability === null ||
            probability < rule.probabilityMinimum ||
            probability > rule.probabilityMaximum
        ) {
            reasons.push(
                `${rule.decisionModel.toUpperCase()} %${rule.probabilityMinimum}-${rule.probabilityMaximum} dışında veya eksik`
            );
        }

        const decisionEdge = edges[rule.edgeField];
        if (decisionEdge === null || decisionEdge < rule.edgeLow || decisionEdge > rule.edgeHigh) {
            reasons.push(`${rule.edgeField} ${rule.edgeLow}…${rule.edgeHigh} dışında`);
        }
    }

    const decisionProbability = rule?.decisionModel === 'v18' ? parsedV18 : parsedV16;
    const decisionEdge = rule ? edges[rule.edgeField] : null;
    return {
        eligible: reasons.length === 0,
        reasons,
        rule,
        priority: rule?.priority ?? -Infinity,
        decisionModel: rule?.decisionModel || null,
        decisionProbability,
        decisionEdge,
        minimumOdd: rule?.minimumOdd ?? MINIMUM_ODD,
        maximumOdd: rule?.maximumOdd ?? MAXIMUM_ODD,
        ...edges,
    };
}

function check({
    slot,
    market,
    minute,
    odds,
    dinoProbability,
    selectorProbability,
    v18Probability,
    v18Edge,
    previousPrimary = null,
}) {
    const result = evaluateRule({
        rule: findRule(slot, market),
        market,
        minute,
        odds,
        dinoProbability,
        selectorProbability,
        v18Probability,
        v18Edge,
    });
    result.slot = slot;

    if (slot === 'follow') {
        const parsedMinute = finite(minute);
        const previousMinute = finite(previousPrimary?.minute);
        if (!previousPrimary) result.reasons.push('önceki ilk sinyal bulunamadı');
        if (previousPrimary?.market && previousPrimary.market === market) {
            result.reasons.push('takip sinyali ilk sinyalle aynı market olamaz');
        }
        if (previousMinute === null || parsedMinute === null || parsedMinute <= previousMinute) {
            result.reasons.push('takip sinyali daha ileri bir maç dakikasında olmalı');
        }
        result.eligible = result.reasons.length === 0;
    }

    return result;
}

function checkObservation(args) {
    return {
        ...evaluateRule({ ...args, rule: findObservationRule(args.market) }),
        slot: 'observation',
    };
}

// V18 puanı güç bağlamı toplandıktan sonra hesaplanabildiği için ucuz ön seçim
// yalnız dakika/oran/market kapısını kontrol eder. Nihai karar daima check ile
// tüm olasılık ve EDGE koşulları üzerinden yeniden verilir.
function canPreselect({ slot, market, minute, odds, dinoProbability, previousPrimary = null }) {
    const rule = findRule(slot, market);
    const parsedMinute = finite(minute);
    const parsedOdd = finite(odds);
    if (!rule || String(market || '').endsWith('_ALT')) return false;
    if (parsedMinute === null || parsedMinute < rule.minuteLow || parsedMinute > rule.minuteHigh) return false;
    if (parsedOdd === null || parsedOdd < rule.minimumOdd || parsedOdd > rule.maximumOdd) return false;
    if (slot === 'follow') {
        const previousMinute = finite(previousPrimary?.minute);
        if (!previousPrimary || previousPrimary?.market === market) return false;
        if (previousMinute === null || parsedMinute <= previousMinute) return false;
    }
    if (rule.edgeField === 'recordedEdge') {
        const edge = edgeValues(dinoProbability, null, null, parsedOdd).recordedEdge;
        if (edge === null || edge < rule.edgeLow || edge > rule.edgeHigh) return false;
    }
    return true;
}

module.exports = {
    VERSION,
    MINIMUM_ODD,
    MAXIMUM_ODD,
    PRIMARY_RULES,
    FOLLOW_RULES,
    OBSERVATION_RULES,
    currentSlot,
    edgeValues,
    findRule,
    findObservationRule,
    check,
    checkObservation,
    canPreselect,
};
