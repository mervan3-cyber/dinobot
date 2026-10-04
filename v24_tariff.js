'use strict';

const VERSION = 'v24-main-live-women-2026-10-05';

function freezePolicy(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezePolicy(child);
    return Object.freeze(value);
}

const MAIN_POLICY = freezePolicy({
    key: 'main',
    label: 'V24 Ana',
    version: VERSION,
    telegram: true,
    weekendOnly: false,
    validationMode: 'fresh-required',
    womenExcluded: false,
    maximumSignalsPerFixture: 1,
    priority: ['SNIPER', 'B', 'A', 'MS'],
    allowedOverMarketsByBranch: null,
    excludedNationalCompetitions: false,
    v25Joint: null,
    over: {
        minuteLow: 25,
        minuteHigh: 70,
        minimumOdd: 1.5,
        maximumOdd: 4,
        dinoMinimum: 45,
        v18Minimum: 50,
        eventScoreRequired: true,
        edgeField: 'dino',
        edgeLow: null,
        edgeHigh: 0,
        edgeInclusive: true,
        goalsNeededMaximum: 2,
        branches: {
            SNIPER: {
                score: '0-0',
                markets: ['1.5_UST'],
                goalsNeeded: 2,
                dinoMinimum: 50,
                v16Minimum: 72,
                v18Minimum: 50,
                prematchByMarket: { '1.5_UST': 75 }
            },
            B: {
                zeroZeroAllowed: false,
                goalsNeeded: 1,
                v16Minimum: 65,
                prematchByMarket: {
                    '1.5_UST': 70,
                    '2.5_UST': 32,
                    '3.5_UST': 30,
                    '4.5_UST': 25
                }
            },
            A: {
                zeroZeroAllowed: false,
                goalsNeeded: 2,
                v16Minimum: 65,
                prematchByMarket: {
                    '2.5_UST': 52,
                    '3.5_UST': 25,
                    '4.5_UST': 25
                }
            }
        }
    },
    leadingWinner: {
        enabled: true,
        minuteLow: 25,
        minuteHigh: 44,
        minimumOdd: 1.5,
        maximumOdd: 2.5,
        v16Minimum: 60,
        v16EdgeLow: 0,
        v16EdgeHigh: 5,
        eventScoreRequired: true
    },
    quietLeagueDailyLimit: null,
    excludedLeagues: []
});

function copy(value) {
    return JSON.parse(JSON.stringify(value));
}

function variant(key, label, mutate) {
    const policy = copy(MAIN_POLICY);
    policy.key = key;
    policy.label = label;
    policy.version = `${VERSION}-${key}`;
    policy.weekendOnly = true;
    // Other weekend experiments retain their previous competition scope.
    policy.telegram = false;
    policy.womenExcluded = true;
    mutate(policy);
    return freezePolicy(policy);
}

const POLICIES = freezePolicy({
    main: MAIN_POLICY,
    weekendGuard: variant('weekend-guard', 'V24 Weekend Guard', policy => {
        policy.over.branches.B.v18Minimum = 55;
        policy.leadingWinner.v16Minimum = 65;
    }),
    weekendQuiet: variant('weekend-quiet', 'V24 Weekend Quiet', policy => {
        policy.over.minuteHigh = 68;
        policy.over.branches.B.v18Minimum = 65;
        policy.leadingWinner.v16Minimum = 65;
        policy.quietLeagueDailyLimit = 1;
    }),
    geminiWeekend: variant('gemini-weekend', 'V24 Gemini Weekend', policy => {
        policy.weekendOnly = false;
        policy.womenExcluded = false;
        policy.over.minuteHigh = 68;
        policy.over.edgeLow = -12;
        policy.excludedLeagues = ['League One', 'League Two'];
    }),
    selectiveWeekend: variant('selective-weekend', 'V24 Seçici Weekend', policy => {
        policy.priority = ['SNIPER', 'A', 'B'];
        policy.allowedOverMarketsByBranch = {
            SNIPER: ['1.5_UST'],
            A: ['2.5_UST'],
            B: ['1.5_UST']
        };
        policy.leadingWinner.enabled = false;
        policy.excludedLeagues = ['League One', 'League Two', 'Eerste Divisie'];
        policy.excludedNationalCompetitions = true;
    }),
    v25JointWeekend: variant('v25-joint-weekend', 'V24 + V25 Ortak Weekend', policy => {
        policy.priority = ['SNIPER', 'A', 'B'];
        policy.allowedOverMarketsByBranch = {
            SNIPER: ['1.5_UST'],
            A: ['2.5_UST'],
            B: ['1.5_UST']
        };
        policy.leadingWinner.enabled = false;
        policy.excludedLeagues = ['League One'];
        policy.v25Joint = {
            modelVersion: 'v25-lean-runtime-2026-09-27',
            trainedThrough: '2026-09-25',
            branches: {
                A: { market: '2.5_UST', probabilityMinimum: 60, edgeLow: -5, edgeHigh: 0 },
                B: { market: '1.5_UST', probabilityMinimum: 60, edgeLow: 0, edgeHigh: 7 }
            }
        };
    })
});

const POLICY = POLICIES.main;

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

function resolveOverBranch(score, market, policy = POLICY) {
    const line = parseOverMarket(market);
    if (!score || line === null) return { branch: null, goalsNeeded: null, scoreTotal: null, line };
    const scoreTotal = score.home + score.away;
    const goalsNeeded = Math.floor(line) + 1 - scoreTotal;
    let branch = null;
    if (scoreTotal === 0 && market === '1.5_UST') branch = 'SNIPER';
    else if (scoreTotal > 0 && goalsNeeded === 1) branch = 'B';
    else if (scoreTotal > 0 && goalsNeeded === 2) branch = 'A';
    if (goalsNeeded > policy.over.goalsNeededMaximum) branch = null;
    return { branch, goalsNeeded, scoreTotal, line };
}

function overCheck(args, {
    policy = POLICY,
    requireEventScore = true,
    skipModelThresholds = false
} = {}) {
    const minute = finite(args?.minute);
    const odds = finite(args?.odds);
    const score = parseScore(args?.score);
    const prematchSupport = percent(args?.prematchSupport);
    const dinoProbability = percent(args?.dinoProbability);
    const v16Probability = percent(args?.v16Probability);
    const v18Probability = percent(args?.v18Probability);
    const resolved = resolveOverBranch(score, String(args?.market || ''), policy);
    const branchPolicy = resolved.branch ? policy.over.branches[resolved.branch] : null;
    const allowedMarkets = resolved.branch && policy.allowedOverMarketsByBranch
        ? policy.allowedOverMarketsByBranch[resolved.branch]
        : null;
    const prematchMinimum = branchPolicy?.prematchByMarket?.[String(args?.market || '')] ?? null;
    const dinoMinimum = branchPolicy?.dinoMinimum ?? policy.over.dinoMinimum;
    const v16Minimum = branchPolicy?.v16Minimum ?? null;
    const v18Minimum = branchPolicy?.v18Minimum ?? policy.over.v18Minimum;
    const marketProbability = impliedProbability(odds);
    const recordedEdge = dinoProbability !== null && marketProbability !== null
        ? Number((dinoProbability - marketProbability).toFixed(1))
        : null;
    const reasons = [];

    if (resolved.line === null) reasons.push('OVER_MARKET_REQUIRED');
    if (!score) reasons.push('SCORE_INVALID');
    if (resolved.goalsNeeded !== null && resolved.goalsNeeded <= 0) reasons.push('MARKET_ALREADY_DECIDED');
    if (resolved.goalsNeeded !== null && resolved.goalsNeeded > policy.over.goalsNeededMaximum) reasons.push('MORE_THAN_TWO_GOALS_REQUIRED');
    if (!resolved.branch) reasons.push('BRANCH_NOT_RESOLVED');
    if (Array.isArray(allowedMarkets) && !allowedMarkets.includes(String(args?.market || ''))) {
        reasons.push('MARKET_NOT_ENABLED_FOR_BRANCH');
    }
    if (minute === null || minute < policy.over.minuteLow || minute > policy.over.minuteHigh) reasons.push('MINUTE_OUTSIDE');
    if (odds === null || odds < policy.over.minimumOdd || odds > policy.over.maximumOdd) reasons.push('ODDS_OUTSIDE');
    if (prematchMinimum === null) reasons.push('PREMATCH_THRESHOLD_UNDEFINED');
    else if (prematchSupport === null || prematchSupport < prematchMinimum) reasons.push('PREMATCH_BELOW_BRANCH_MARKET_MINIMUM');
    if (dinoProbability === null || dinoProbability < dinoMinimum) reasons.push('DINO_BELOW_MINIMUM');
    if (recordedEdge === null || recordedEdge > policy.over.edgeHigh ||
        (policy.over.edgeLow !== null && recordedEdge < policy.over.edgeLow)) {
        reasons.push('DINO_EDGE_OUTSIDE');
    }
    if (!skipModelThresholds) {
        if (v18Probability === null || v18Probability < v18Minimum) reasons.push('V18_BELOW_MINIMUM');
        if (v16Probability === null || v16Minimum === null || v16Probability < v16Minimum) reasons.push('V16_BELOW_MINIMUM');
    }
    if (requireEventScore && policy.over.eventScoreRequired && args?.eventScoreStatus !== 'approve') {
        reasons.push(args?.eventScoreStatus === 'reject' ? 'EVENT_SCORE_MISMATCH' : 'EVENT_SCORE_UNAVAILABLE');
    }

    return {
        eligible: reasons.length === 0,
        reasons,
        branch: resolved.branch,
        goalsNeeded: resolved.goalsNeeded,
        minute,
        odds,
        prematchSupport,
        probabilities: { dino: dinoProbability, v16: v16Probability, v18: v18Probability },
        thresholds: { dino: dinoMinimum, v16: v16Minimum, v18: v18Minimum, prematch: prematchMinimum },
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

function winnerCheck(args, {
    policy = POLICY,
    requireEventScore = true,
    skipModelThresholds = false
} = {}) {
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

    if (policy.leadingWinner.enabled === false) reasons.push('LEADING_WINNER_DISABLED');
    if (!score) reasons.push('SCORE_INVALID');
    if (!expectedMarket) reasons.push('LEADING_SIDE_REQUIRED');
    if (String(args?.market || '') !== expectedMarket) reasons.push('LEADING_MARKET_MISMATCH');
    if (minute === null || minute < policy.leadingWinner.minuteLow || minute > policy.leadingWinner.minuteHigh) reasons.push('MINUTE_OUTSIDE');
    if (odds === null || odds < policy.leadingWinner.minimumOdd || odds > policy.leadingWinner.maximumOdd) reasons.push('ODDS_OUTSIDE');
    if (!skipModelThresholds) {
        if (v16Probability === null || v16Probability < policy.leadingWinner.v16Minimum) reasons.push('V16_BELOW_MINIMUM');
        if (v16Edge === null || v16Edge < policy.leadingWinner.v16EdgeLow || v16Edge > policy.leadingWinner.v16EdgeHigh) {
            reasons.push('V16_EDGE_OUTSIDE_0_5');
        }
    }
    if (requireEventScore && policy.leadingWinner.eventScoreRequired && args?.eventScoreStatus !== 'approve') {
        reasons.push(args?.eventScoreStatus === 'reject' ? 'EVENT_SCORE_MISMATCH' : 'EVENT_SCORE_UNAVAILABLE');
    }

    return {
        eligible: reasons.length === 0,
        reasons,
        branch: 'MS',
        market: expectedMarket,
        minute,
        odds,
        v16Probability,
        marketProbability,
        v16Edge,
        thresholds: { v16: policy.leadingWinner.v16Minimum }
    };
}

module.exports = {
    VERSION,
    POLICY,
    POLICIES,
    overCheck,
    winnerCheck,
    leadingWinnerMarket,
    resolveOverBranch,
    _internal: { finite, percent, parseScore, parseOverMarket, impliedProbability }
};
