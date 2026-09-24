'use strict';

const VERSION = 'v24-ab-dino-edge-nonpositive-leading-winner-shadow-2026-09-24';

const POLICY = Object.freeze({
    version: VERSION,
    telegram: false,
    validationMode: 'fresh-required',
    scoreZeroForbidden: true,
    over: Object.freeze({
        minuteLow: 25,
        minuteHigh: 80,
        minimumOdd: 1.5,
        maximumOdd: 4,
        prematchMinimum: 32,
        dinoMinimum: 45,
        v18Minimum: 50,
        eventScoreRequired: true,
        edgeField: 'dino',
        edgeHigh: 0,
        edgeLow: null,
        edgeInclusive: true,
        maximumSignalsPerFixture: 1,
        branchResolution: 'B overrides A when exactly one remaining goal is needed',
        A: Object.freeze({ v16Minimum: 50, goalsNeededMinimum: 2 }),
        B: Object.freeze({ v16Minimum: 60, goalsNeeded: 1 })
    }),
    leadingWinner: Object.freeze({
        minuteLow: 25,
        minuteHigh: 44,
        minimumOdd: 1.5,
        maximumOdd: 2.5,
        v16Minimum: 50,
        v16EdgeLow: 0,
        v16EdgeHigh: 5,
        eventScoreRequired: false,
        maximumSignalsPerFixture: 1
    }),
    maximumSignalsPerFixture: 2
});

function finite(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function percent(value) {
    const parsed = finite(value);
    return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function parseScore(value) {
    const match = /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(String(value || ''));
    return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

function parseOverMarket(value) {
    const match = /^(\d+\.5)_UST$/.exec(String(value || ''));
    return match ? Number(match[1]) : null;
}

function impliedProbability(odds) {
    const parsed = finite(odds);
    return parsed !== null && parsed > 1 ? 100 / parsed : null;
}

function overCheck(args, { requireEventScore = true, skipModelThresholds = false } = {}) {
    const minute = finite(args?.minute);
    const odds = finite(args?.odds);
    const score = parseScore(args?.score);
    const line = parseOverMarket(args?.market);
    const prematchSupport = percent(args?.prematchSupport);
    const dinoProbability = percent(args?.dinoProbability);
    const v16Probability = percent(args?.v16Probability);
    const v18Probability = percent(args?.v18Probability);
    const scoreTotal = score ? score.home + score.away : null;
    const goalsNeeded = line !== null && score ? Math.floor(line) + 1 - scoreTotal : null;
    const branch = goalsNeeded === 1 ? 'B' : goalsNeeded !== null && goalsNeeded >= 2 ? 'A' : null;
    const v16Minimum = branch ? POLICY.over[branch].v16Minimum : null;
    const marketProbability = impliedProbability(odds);
    const recordedEdge = dinoProbability !== null && marketProbability !== null
        ? Number((dinoProbability - marketProbability).toFixed(1))
        : null;
    const reasons = [];

    if (line === null) reasons.push('OVER_MARKET_REQUIRED');
    if (!score) reasons.push('SCORE_INVALID');
    if (scoreTotal === 0) reasons.push('ZERO_ZERO_FORBIDDEN');
    if (goalsNeeded !== null && goalsNeeded <= 0) reasons.push('MARKET_ALREADY_DECIDED');
    if (!branch) reasons.push('BRANCH_NOT_RESOLVED');
    if (minute === null || minute < POLICY.over.minuteLow || minute > POLICY.over.minuteHigh) reasons.push('MINUTE_OUTSIDE');
    if (odds === null || odds < POLICY.over.minimumOdd || odds > POLICY.over.maximumOdd) reasons.push('ODDS_OUTSIDE');
    if (prematchSupport === null || prematchSupport < POLICY.over.prematchMinimum) reasons.push('PREMATCH_BELOW_32');
    if (dinoProbability === null || dinoProbability < POLICY.over.dinoMinimum) reasons.push('DINO_BELOW_45');
    if (recordedEdge === null || recordedEdge > POLICY.over.edgeHigh) reasons.push('DINO_EDGE_POSITIVE');
    if (!skipModelThresholds) {
        if (v18Probability === null || v18Probability < POLICY.over.v18Minimum) reasons.push('V18_BELOW_50');
        if (v16Probability === null || v16Minimum === null || v16Probability < v16Minimum) {
            reasons.push(branch === 'B' ? 'V16_BELOW_60' : 'V16_BELOW_50');
        }
    }
    if (requireEventScore && args?.eventScoreStatus !== 'approve') {
        reasons.push(args?.eventScoreStatus === 'reject' ? 'EVENT_SCORE_MISMATCH' : 'EVENT_SCORE_UNAVAILABLE');
    }

    return {
        eligible: reasons.length === 0,
        reasons,
        branch,
        goalsNeeded,
        minute,
        odds,
        prematchSupport,
        probabilities: { dino: dinoProbability, v16: v16Probability, v18: v18Probability },
        thresholds: { dino: 45, v16: v16Minimum, v18: 50, prematch: 32 },
        marketProbability,
        recordedEdge,
        v16Edge: v16Probability !== null && marketProbability !== null
            ? Number((v16Probability - marketProbability).toFixed(1))
            : null
    };
}

function leadingWinnerMarket(scoreValue) {
    const score = parseScore(scoreValue);
    if (!score || score.home === score.away) return null;
    return score.home > score.away ? 'MS1' : 'MS2';
}

function winnerCheck(args, { skipModelThresholds = false } = {}) {
    const minute = finite(args?.minute);
    const odds = finite(args?.odds);
    const score = parseScore(args?.score);
    const expectedMarket = leadingWinnerMarket(args?.score);
    const v16Probability = percent(args?.v16Probability);
    const marketProbability = impliedProbability(odds);
    const v16Edge = v16Probability !== null && marketProbability !== null
        ? Number((v16Probability - marketProbability).toFixed(1))
        : null;
    const reasons = [];

    if (!score) reasons.push('SCORE_INVALID');
    if (!expectedMarket) reasons.push('LEADING_SIDE_REQUIRED');
    if (String(args?.market || '') !== expectedMarket) reasons.push('LEADING_MARKET_MISMATCH');
    if (minute === null || minute < POLICY.leadingWinner.minuteLow || minute > POLICY.leadingWinner.minuteHigh) reasons.push('MINUTE_OUTSIDE');
    if (odds === null || odds < POLICY.leadingWinner.minimumOdd || odds > POLICY.leadingWinner.maximumOdd) reasons.push('ODDS_OUTSIDE');
    if (!skipModelThresholds) {
        if (v16Probability === null || v16Probability < POLICY.leadingWinner.v16Minimum) reasons.push('V16_BELOW_50');
        if (v16Edge === null || v16Edge < POLICY.leadingWinner.v16EdgeLow || v16Edge > POLICY.leadingWinner.v16EdgeHigh) {
            reasons.push('V16_EDGE_OUTSIDE_0_5');
        }
    }

    return {
        eligible: reasons.length === 0,
        reasons,
        market: expectedMarket,
        minute,
        odds,
        v16Probability,
        marketProbability,
        v16Edge
    };
}

module.exports = {
    VERSION,
    POLICY,
    overCheck,
    winnerCheck,
    leadingWinnerMarket,
    _internal: { finite, percent, parseScore, parseOverMarket, impliedProbability }
};
