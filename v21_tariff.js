'use strict';

const VERSION = 'v21-over-consensus-3of3-edge-m5-0-2026-09-13';
const POLICY = Object.freeze({
    version: VERSION, markets: ['UST'], minuteLow: 25, minuteHigh: 80,
    minimumOdd: 1.50, maximumOdd: 4.00, probabilityThreshold: 50,
    prematchThreshold: 50, minimumVotes: 3, edgeHigh: 0,
    edgeField: 'recordedEdge', edgeLow: -5, maximumSignalsPerFixture: 1,
    selectionOrder: 'votes-desc, odds-asc, market-asc', telegram: false
});
const finite = value => value === null || value === undefined || value === '' ||
    typeof value === 'boolean' || !Number.isFinite(Number(value)) ? null : Number(value);
const percent = value => {
    const n = finite(value);
    return n !== null && n >= 0 && n <= 100 ? n : null;
};

function inspect(args) {
    const odds = finite(args.odds);
    const dino = percent(args.dinoProbability);
    const probabilities = {
        dino, v16: percent(args.selectorProbability), v18: percent(args.v18Probability)
    };
    const votes = Object.fromEntries(Object.entries(probabilities).map(
        ([model, value]) => [model, value !== null && value > POLICY.probabilityThreshold]
    ));
    return {
        probabilities, votes, voteCount: Object.values(votes).filter(Boolean).length,
        // Same one-decimal EDGE shown in the full-stat audit. Not the V18 native EDGE.
        recordedEdge: dino !== null && odds !== null && odds > 1
            ? Number((dino - 100 / odds).toFixed(1)) : null,
        prematchSupport: percent(args.prematchSupport), odds, minute: finite(args.minute)
    };
}

function check(args, { preselect = false } = {}) {
    const values = inspect(args);
    const reasons = [];
    if (!/^\d+\.5_UST$/.test(String(args.market))) reasons.push('yalnız yarım gollü ÜST');
    if (values.minute === null || values.minute < POLICY.minuteLow || values.minute > POLICY.minuteHigh)
        reasons.push('dakika 25–80 dışında');
    if (values.odds === null || values.odds < POLICY.minimumOdd || values.odds > POLICY.maximumOdd)
        reasons.push('oran 1.50–4.00 dışında');
    if (values.prematchSupport === null || values.prematchSupport <= POLICY.prematchThreshold)
        reasons.push('Pre destek %50 üzerinde değil veya eksik');
    if (values.recordedEdge === null || values.recordedEdge < POLICY.edgeLow || values.recordedEdge > POLICY.edgeHigh)
        reasons.push('kayıt EDGE −5…0 dışında veya eksik');
    // Dino is now mandatory; reject cheaply before requesting fresh stats/models.
    if (!values.votes.dino) reasons.push('Dino %50 üzerinde değil veya eksik');
    if (!preselect && values.voteCount < POLICY.minimumVotes)
        reasons.push('Dino/V16/V18 modellerinin üçü de %50 üzerinde değil veya eksik');
    return { ...values, eligible: !reasons.length, reasons, rule: POLICY, slot: 'primary' };
}

module.exports = { VERSION, POLICY, check, finite, canPreselect: args => check(args, { preselect: true }).eligible };
