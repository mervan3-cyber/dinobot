'use strict';

const VERSION = 'v22-over-union-abc-fresh-2026-09-13';
const FILTERS = Object.freeze([
    Object.freeze({ id: 'A', label: 'Ev sahibi önde → ÜST', edgeLow: -5, edgeHigh: -2.5, prematchThreshold: 20 }),
    Object.freeze({ id: 'B', label: '2.5 ÜST · skor 1–0/0–1', edgeLow: -5, edgeHigh: -2.5, prematchThreshold: 40 }),
    Object.freeze({ id: 'C', label: 'Yalnız 1 gol gerekiyor', edgeLow: -10, edgeHigh: 5, prematchThreshold: 75 })
]);
const POLICY = Object.freeze({ version: VERSION, markets: ['UST'], minimumVotes: 3,
    probabilityThreshold: 50, minuteLow: 25, minuteHigh: 80, minimumOdd: 1.5, maximumOdd: 4,
    filters: FILTERS, combination: 'OR', edgeField: 'recordedEdge', edgeInclusive: true,
    prematchComparison: 'strict-greater-than', maximumSignalsPerFixture: 1,
    selectionOrder: 'votes-desc, odds-asc, market-asc', validationMode: 'fresh-required', telegram: false });
const finite = value => value === null || value === undefined || value === '' || typeof value === 'boolean' ||
    !Number.isFinite(Number(value)) ? null : Number(value);
const percent = value => { const n = finite(value); return n !== null && n >= 0 && n <= 100 ? n : null; };
function check(args, { preselect = false } = {}) {
    const odds = finite(args.odds), minute = finite(args.minute), pre = percent(args.prematchSupport);
    const probabilities = { dino: percent(args.dinoProbability), v16: percent(args.selectorProbability), v18: percent(args.v18Probability) };
    const votes = Object.fromEntries(Object.entries(probabilities).map(([key, value]) => [key, value !== null && value > 50]));
    const voteCount = Object.values(votes).filter(Boolean).length;
    const recordedEdge = probabilities.dino !== null && odds !== null && odds > 1
        ? Number((probabilities.dino - 100 / odds).toFixed(1)) : null;
    const market = /^(\d+\.5)_UST$/.exec(String(args.market));
    const score = /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(String(args.score));
    const home = score ? Number(score[1]) : null, away = score ? Number(score[2]) : null;
    const goalsNeeded = market && score ? Math.floor(Number(market[1])) + 1 - home - away : null;
    const reasons = [];
    if (!market) reasons.push('yalnız yarım gollü ÜST');
    if (!score) reasons.push('geçerli giriş skoru yok');
    if (goalsNeeded !== null && goalsNeeded <= 0) reasons.push('market skorla zaten sonuçlanmış');
    if (minute === null || minute < 25 || minute > 80) reasons.push('dakika 25–80 dışında');
    if (odds === null || odds < 1.5 || odds > 4) reasons.push('oran 1.50–4.00 dışında');
    if (!votes.dino) reasons.push('Dino >%50 değil veya eksik');
    if (!preselect && voteCount !== 3) reasons.push('Dino/V16/V18 üçü de >%50 olmalı');
    const matchedFilters = market && score && goalsNeeded > 0 ? FILTERS.filter(rule =>
        pre !== null && pre > rule.prematchThreshold && recordedEdge !== null &&
        recordedEdge >= rule.edgeLow && recordedEdge <= rule.edgeHigh && (
            rule.id === 'A' ? home > away : rule.id === 'B' ? Number(market[1]) === 2.5 && home + away === 1 : goalsNeeded === 1
        )).map(rule => rule.id) : [];
    if (!matchedFilters.length) reasons.push('A/B/C filtresi karşılanmadı veya Pre/EDGE eksik');
    return { eligible: reasons.length === 0, reasons, probabilities, votes, voteCount,
        odds, minute, prematchSupport: pre, recordedEdge, home, away, goalsNeeded,
        matchedFilters, rule: POLICY, slot: 'primary' };
}
module.exports = { VERSION, POLICY, FILTERS, check, canPreselect: args => check(args, { preselect: true }).eligible };
