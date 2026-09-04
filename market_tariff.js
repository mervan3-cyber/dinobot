'use strict';

const VERSION = 'v17.1-weekend-frozen-2026-09-04';
const MINIMUM_ODD = 1.50;

// These windows were frozen after replaying 29 August–3 September.  They are
// deliberately market-specific; a single global V16 or EDGE limit is not used.
const PRIMARY_RULES = Object.freeze([
    Object.freeze({
        id: 'P-05O', market: '0.5_UST', minuteLow: 45, minuteHigh: 74,
        v16Minimum: 50, edgeField: 'recordedEdge', edgeLow: -10, edgeHigh: -5,
        priority: 46.8,
    }),
    Object.freeze({
        id: 'P-25O', market: '2.5_UST', minuteLow: 25, minuteHigh: 34,
        v16Minimum: 50, edgeField: 'recordedEdge', edgeLow: -2.5, edgeHigh: 2,
        priority: 66.7,
    }),
    Object.freeze({
        id: 'P-35O', market: '3.5_UST', minuteLow: 25, minuteHigh: 80,
        v16Minimum: 60, edgeField: 'v16Edge', edgeLow: -10, edgeHigh: 0,
        priority: 81.6,
    }),
    Object.freeze({
        id: 'P-15O-SAFE', market: '1.5_UST', minuteLow: 40, minuteHigh: 44,
        v16Minimum: 50, edgeField: 'v16Edge', edgeLow: -100, edgeHigh: 4,
        priority: 60.8,
    }),
    Object.freeze({
        id: 'P-MS1', market: 'MS1', minuteLow: 25, minuteHigh: 54,
        v16Minimum: 55, edgeField: 'v16Edge', edgeLow: -2.5, edgeHigh: 2,
        priority: 56.7,
    }),
    Object.freeze({
        id: 'P-X', market: 'X', minuteLow: 61, minuteHigh: 70,
        v16Minimum: 50, edgeField: 'recordedEdge', edgeLow: 0, edgeHigh: 2,
        priority: 54.8,
    }),
]);

const FOLLOW_RULES = Object.freeze([
    Object.freeze({
        id: 'F-45O', market: '4.5_UST', minuteLow: 25, minuteHigh: 54,
        v16Minimum: 55, edgeField: 'recordedEdge', edgeLow: -10, edgeHigh: -5,
        priority: 56.6,
    }),
    Object.freeze({
        id: 'F-MS1', market: 'MS1', minuteLow: 25, minuteHigh: 54,
        v16Minimum: 55, edgeField: 'v16Edge', edgeLow: -2.5, edgeHigh: 2,
        priority: 56.7,
    }),
    Object.freeze({
        id: 'F-MS2', market: 'MS2', minuteLow: 45, minuteHigh: 54,
        v16Minimum: 50, edgeField: 'v16Edge', edgeLow: 2, edgeHigh: 4,
        priority: 62.3,
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

function edgeValues(dinoProbability, selectorProbability, odds) {
    const dino = finite(dinoProbability);
    const rawV16 = finite(selectorProbability);
    const v16 = rawV16 === null ? null : Number(rawV16.toFixed(1));
    const price = finite(odds);
    const implied = price !== null && price > 1 ? 100 / price : null;
    return {
        // Candidate history stores the Dino EDGE rounded to one decimal.  Use
        // the same value here so live decisions reproduce the frozen replay.
        recordedEdge: dino !== null && implied !== null
            ? Number((dino - implied).toFixed(1))
            : null,
        v16Edge: v16 !== null && implied !== null ? v16 - implied : null,
    };
}

function findRule(slot, market) {
    return rulesForSlot(slot).find(rule => rule.market === market) || null;
}

function check({
    slot,
    market,
    minute,
    odds,
    dinoProbability,
    selectorProbability,
    previousPrimary = null,
}) {
    const reasons = [];
    const rule = findRule(slot, market);
    const parsedMinute = finite(minute);
    const parsedOdd = finite(odds);
    const rawV16 = finite(selectorProbability);
    const parsedV16 = rawV16 === null ? null : Number(rawV16.toFixed(1));
    const edges = edgeValues(dinoProbability, selectorProbability, odds);

    if (!rule) reasons.push('market bu sinyal yuvasının dondurulmuş haritasında yok');
    if (String(market || '').endsWith('_ALT')) reasons.push('ALT marketleri kapalı');
    if (parsedOdd === null || parsedOdd < MINIMUM_ODD) {
        reasons.push(`oran ${MINIMUM_ODD.toFixed(2)} altında veya eksik`);
    }

    if (rule) {
        if (parsedMinute === null || parsedMinute < rule.minuteLow || parsedMinute > rule.minuteHigh) {
            reasons.push(`dakika ${rule.minuteLow}-${rule.minuteHigh} dışında`);
        }
        if (parsedV16 === null || parsedV16 < rule.v16Minimum) {
            reasons.push(`V16 %${rule.v16Minimum} altında veya eksik`);
        }
        const edge = edges[rule.edgeField];
        if (edge === null || edge < rule.edgeLow || edge > rule.edgeHigh) {
            reasons.push(`${rule.edgeField} ${rule.edgeLow}…${rule.edgeHigh} dışında`);
        }
    }

    if (slot === 'follow') {
        const previousMinute = finite(previousPrimary?.minute);
        if (!previousPrimary) reasons.push('önceki ilk sinyal bulunamadı');
        if (previousPrimary?.market && previousPrimary.market === market) {
            reasons.push('takip sinyali ilk sinyalle aynı market olamaz');
        }
        if (previousMinute === null || parsedMinute === null || parsedMinute <= previousMinute) {
            reasons.push('takip sinyali daha ileri bir maç dakikasında olmalı');
        }
    }

    return {
        eligible: reasons.length === 0,
        reasons,
        slot,
        rule,
        priority: rule?.priority ?? -Infinity,
        ...edges,
    };
}

// Cheap preselection before optional API power context calls.  Final eligibility
// is always recalculated later with the complete V16 score.
function canPreselect({ slot, market, minute, odds, dinoProbability, previousPrimary = null }) {
    const rule = findRule(slot, market);
    const parsedMinute = finite(minute);
    const parsedOdd = finite(odds);
    if (!rule || String(market || '').endsWith('_ALT')) return false;
    if (parsedMinute === null || parsedMinute < rule.minuteLow || parsedMinute > rule.minuteHigh) return false;
    if (parsedOdd === null || parsedOdd < MINIMUM_ODD) return false;
    if (slot === 'follow') {
        const previousMinute = finite(previousPrimary?.minute);
        if (!previousPrimary || previousPrimary?.market === market) return false;
        if (previousMinute === null || parsedMinute <= previousMinute) return false;
    }
    if (rule.edgeField === 'recordedEdge') {
        const edge = edgeValues(dinoProbability, null, parsedOdd).recordedEdge;
        if (edge === null || edge < rule.edgeLow || edge > rule.edgeHigh) return false;
    }
    return true;
}

module.exports = {
    VERSION,
    MINIMUM_ODD,
    PRIMARY_RULES,
    FOLLOW_RULES,
    currentSlot,
    edgeValues,
    findRule,
    check,
    canPreselect,
};
