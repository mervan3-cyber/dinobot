'use strict';

// V24 Odak LAB is a prospective, Telegram-free comparison. Every arm owns an
// independent first-signal lock, while all arms reuse the same fresh fixture,
// statistics, odds and model result.
const tariff = require('./v24_tariff');
const {
    eventScoreAudit,
    isWomenCompetition,
    excludedLeague,
    isNationalCompetition
} = require('./v24_lab');

const VERSION = 'v24-focus-lab-seven-arms-b25-pre52-2026-10-01';
const REACTION_MIN_SHOTS = 4;
const REACTION_MIN_SOT = 1;

const ARMS = Object.freeze([
    Object.freeze({ key: 'SNIPER_15', label: 'Sniper 0-0 · 1.5 ÜST', branch: 'SNIPER', market: '1.5_UST', reaction: false }),
    Object.freeze({ key: 'B15', label: 'B · 1.5 ÜST', branch: 'B', market: '1.5_UST', reaction: false }),
    Object.freeze({ key: 'B15_REACTION', label: 'B · 1.5 ÜST · reaksiyon', branch: 'B', market: '1.5_UST', reaction: true }),
    Object.freeze({ key: 'B25', label: 'B · 2.5 ÜST', branch: 'B', market: '2.5_UST', reaction: false }),
    Object.freeze({ key: 'B25_PRE52', label: 'B · 2.5 ÜST · pre ≥ %52', branch: 'B', market: '2.5_UST', reaction: false, prematchMinimum: 52 }),
    Object.freeze({ key: 'B25_REACTION', label: 'B · 2.5 ÜST · reaksiyon', branch: 'B', market: '2.5_UST', reaction: true }),
    Object.freeze({ key: 'A25', label: 'A · 2.5 ÜST', branch: 'A', market: '2.5_UST', reaction: false })
]);

function finite(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseScore(value) {
    const match = /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(String(value || ''));
    return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

function oddsValue(mac, market) {
    const value = mac?.canli_oranlar?.[market];
    return finite(value && typeof value === 'object' ? value.oran : value);
}

function armDeliveryKey(fixtureId, armKey) {
    return `v24-focus:${Number(fixtureId)}:${armKey}`;
}

function reactionAssessment(mac) {
    const score = parseScore(mac?.skor);
    if (!score) return { status: 'insufficient', eligible: false, reason: 'SCORE_INVALID' };
    if (score.home === score.away) {
        return {
            status: 'not_applicable', eligible: false, reason: 'REACTION_TIED_SCORE',
            trailingSide: null, trailing: null
        };
    }
    const trailingSide = score.home < score.away ? 'home' : 'away';
    const shots = finite(mac?.[`${trailingSide}_shot`]);
    const shotsOnGoal = finite(mac?.[`${trailingSide}_sot`]);
    const trailing = { shots, shotsOnGoal };
    if (shots === null || shotsOnGoal === null) {
        return { status: 'insufficient', eligible: false, reason: 'REACTION_STATS_MISSING', trailingSide, trailing };
    }
    const eligible = shots >= REACTION_MIN_SHOTS && shotsOnGoal >= REACTION_MIN_SOT;
    return {
        status: eligible ? 'approve' : 'reject', eligible,
        reason: eligible ? 'REACTION_OK' : 'REACTION_LOW', trailingSide, trailing,
        thresholds: { shots: REACTION_MIN_SHOTS, shotsOnGoal: REACTION_MIN_SOT }
    };
}

function createV24FocusLab({
    tracker,
    v16Model,
    v18Model,
    prematchSupport,
    prematchSource,
    liveSnapshot,
    enabled = true,
    policy = tariff.POLICIES.main,
    source = 'V24-FOCUS'
}) {
    // The new experiment changes just one prematch gate. Model/statistics
    // evaluations remain cached by market and shared with the existing arms.
    const armPolicies = new Map(ARMS.filter(arm => arm.prematchMinimum !== undefined).map(arm => {
        const experiment = JSON.parse(JSON.stringify(policy));
        const gates = experiment.over.branches[arm.branch].prematchByMarket;
        gates[arm.market] = Math.max(gates[arm.market], arm.prematchMinimum);
        return [arm.key, experiment];
    }));

    function hasArmSignal(fixtureId, armKey) {
        const key = armDeliveryKey(fixtureId, armKey);
        return tracker.data.signals.some(signal => signal.deliveryKey === key);
    }

    function isCurrentComparisonSignal(signal) {
        return signal.tariffVersion === VERSION && signal?.analysis?.sourcePolicyVersion === policy.version;
    }

    function hasLegacyBaseline(fixtureId) {
        return tracker.data.signals.some(signal => signal.deliveryKey === armDeliveryKey(fixtureId, 'B25') &&
            !isCurrentComparisonSignal(signal));
    }

    function baseAvailable(mac, dino) {
        if (!enabled || !mac || !dino || dino.HATA || dino.MODEL_VARYANTI === 'score_only') return false;
        if (policy.womenExcluded && isWomenCompetition(mac)) return false;
        if (excludedLeague(mac, policy)) return false;
        if (policy.excludedNationalCompetitions && isNationalCompetition(mac)) return false;
        return true;
    }

    function armMatches(arm, check) {
        return check.branch === arm.branch && check.goalsNeeded > 0;
    }

    function modelInput(mac, dino, liveOnlyDino, market, eventScoreStatus) {
        const context = mac?._selectorShadowContext || null;
        const score16 = v16Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
        const score18 = v18Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
        const args = {
            market,
            score: mac?.skor,
            minute: mac?.dakika,
            odds: oddsValue(mac, market),
            dinoProbability: dino?.[market],
            prematchSupport: prematchSupport(mac, market),
            v16Probability: score16?.selectorProbability,
            v18Probability: score18?.v18Probability,
            eventScoreStatus
        };
        const check = tariff.overCheck(args, { policy, requireEventScore: eventScoreStatus !== null });
        return { check, score16, score18, args };
    }

    function evaluateArm(arm, evaluated, requireEventScore) {
        const armPolicy = armPolicies.get(arm.key);
        if (!armPolicy) return evaluated;
        return {
            ...evaluated,
            check: tariff.overCheck(evaluated.args, { policy: armPolicy, requireEventScore })
        };
    }

    function preselect(mac, dino, liveOnlyDino = null) {
        if (!baseAvailable(mac, dino)) return false;
        const cache = new Map();
        for (const arm of ARMS) {
            if (hasArmSignal(mac?.fixture_id, arm.key)) continue;
            if (arm.key === 'B25_PRE52' && hasLegacyBaseline(mac?.fixture_id)) continue;
            if (!cache.has(arm.market)) cache.set(arm.market, modelInput(mac, dino, liveOnlyDino, arm.market, null));
            const { check } = evaluateArm(arm, cache.get(arm.market), false);
            if (!check.eligible || !armMatches(arm, check)) continue;
            if (!arm.reaction || reactionAssessment(mac).eligible) return true;
        }
        return false;
    }

    function commonPayload(mac, dino, liveOnlyDino, capturedAt, arm, evaluated, eventScore, reaction) {
        const { check, score16, score18 } = evaluated;
        return {
            fixtureId: Number(mac.fixture_id),
            deliveryKey: armDeliveryKey(mac.fixture_id, arm.key),
            sentAt: capturedAt,
            telegramMessageId: null,
            match: mac.mac_isim,
            league: mac.lig,
            minute: Number(mac.dakika),
            score: mac.skor,
            market: arm.market,
            odds: check.odds,
            bookmaker: mac.canli_oranlar?.[arm.market]?.bookmaker || null,
            dinoProbability: check.probabilities.dino,
            modelVariant: 'v24_focus_shadow_fresh_only',
            liveOnlyProbability: Number.isFinite(Number(liveOnlyDino?.[arm.market]))
                ? Number(liveOnlyDino[arm.market]) : null,
            selectorV2ModelVersion: v16Model.MODEL.version,
            tariffVersion: VERSION,
            signalSources: [source],
            prematchSource: mac.prematch_source || null,
            prematchProbabilities: mac.prematch_available ? {
                home: mac.prematch_p_home,
                draw: mac.prematch_p_draw,
                away: mac.prematch_p_away
            } : null,
            prematchMarketSupport: prematchSupport(mac, arm.market),
            prematchMarketSource: prematchSource(mac, arm.market),
            statsSource: mac.stats_source || null,
            statsValidation: { ...mac.stats_validation },
            liveStats: liveSnapshot(mac),
            shadowContext: mac?._selectorShadowContext || null,
            signalType: 'strong',
            tariffSlot: 'primary',
            tariffRuleId: `V24-FOCUS-${arm.key}`,
            matchedFilters: [arm.key, arm.branch],
            goalsNeeded: check.goalsNeeded,
            edge: check.recordedEdge,
            marketProbability: check.marketProbability,
            selectorV2Probability: score16?.selectorProbability,
            selectorV2RawProbability: score16?.selectorRawProbability,
            v16Edge: check.v16Edge,
            v18Probability: score18?.v18Probability,
            v18Edge: score18?.v18Edge,
            decisionModel: 'v24-focus-consensus',
            decisionProbability: score16?.selectorProbability,
            decisionEdge: check.v16Edge,
            modelVotes: { dino: true, v16: true, v18: true },
            voteCount: 3,
            modelProbabilities: check.probabilities,
            analysis: {
                variantKey: 'focus',
                variantLabel: 'V24 Odak LAB',
                focusArm: arm.key,
                focusArmLabel: arm.label,
                focusReactionRequired: arm.reaction,
                focusPrematchMinimum: check.thresholds.prematch,
                sourcePolicyVersion: policy.version,
                reaction,
                leagueId: Number(mac?.league_id) || null,
                eventScore,
                eventScoreRequired: true,
                thresholds: check.thresholds
            }
        };
    }

    function record({ mac, dino, liveOnlyDino, capturedAt }) {
        const verifiedAt = mac?.stats_validation?.verifiedAt;
        if (mac?.stats_validation?.status !== 'passed' || !verifiedAt || !capturedAt ||
            !Number.isFinite(Date.parse(verifiedAt)) || Date.parse(verifiedAt) !== Date.parse(capturedAt) ||
            !baseAvailable(mac, dino)) {
            return { records: [], eventScore: null };
        }
        const eventScore = eventScoreAudit(mac, capturedAt);
        if (eventScore.status !== 'approve') return { records: [], eventScore };
        const cache = new Map();
        const records = [];
        for (const arm of ARMS) {
            if (hasArmSignal(mac.fixture_id, arm.key)) continue;
            if (arm.key === 'B25_PRE52' && hasLegacyBaseline(mac.fixture_id)) continue;
            if (!cache.has(arm.market)) cache.set(arm.market, modelInput(mac, dino, liveOnlyDino, arm.market, eventScore.status));
            const evaluated = evaluateArm(arm, cache.get(arm.market), true);
            if (!evaluated.check.eligible || !armMatches(arm, evaluated.check)) continue;
            const reaction = arm.reaction ? reactionAssessment(mac) : { status: 'not_required', eligible: true, reason: 'NOT_REQUIRED' };
            if (arm.reaction && !reaction.eligible) continue;
            records.push(tracker.recordSent(commonPayload(mac, dino, liveOnlyDino, capturedAt, arm, evaluated, eventScore, reaction)));
        }
        return { records, eventScore };
    }

    function metadata(signals = tracker.data.signals) {
        const armSummaries = Object.fromEntries(ARMS.map(arm => [
            arm.key,
            {
                ...arm,
                effectivePrematchMinimum: armPolicies.get(arm.key)?.over.branches[arm.branch].prematchByMarket[arm.market]
                    ?? policy.over.branches[arm.branch].prematchByMarket[arm.market],
                summary: tracker.summary(signals.filter(signal => signal?.analysis?.focusArm === arm.key)).overall
            }
        ]));
        const comparisonSignals = signals.filter(signal => isCurrentComparisonSignal(signal) &&
            ['B25', 'B25_PRE52'].includes(signal?.analysis?.focusArm));
        const comparisonSummary = armKey => tracker.summary(comparisonSignals.filter(signal => signal.analysis.focusArm === armKey)).overall;
        return {
            enabled,
            key: 'focus',
            label: 'V24 Odak LAB',
            decisionImpact: false,
            telegram: false,
            validationMode: 'fresh-required',
            tariffVersion: VERSION,
            sourcePolicyVersion: policy.version,
            policy,
            arms: ARMS,
            reactionRule: { minimumShots: REACTION_MIN_SHOTS, minimumShotsOnGoal: REACTION_MIN_SOT },
            maximumSignalsPerFixturePerArm: 1,
            maximumSignalsPerFixture: ARMS.length,
            startedAt: tracker.data.startedAt,
            summary: tracker.summary(signals),
            armSummaries,
            prematchComparison: {
                key: 'b25-pre32-vs52',
                label: 'B 2.5 ÜST · mevcut pre / pre %52 · yeni dönem',
                tariffVersion: VERSION,
                sourcePolicyVersion: policy.version,
                startedAt: comparisonSignals.map(signal => signal.sentAt).filter(value => Number.isFinite(Date.parse(value)))
                    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null,
                legacyRecordsExcluded: signals.filter(signal => ['B25', 'B25_PRE52'].includes(signal?.analysis?.focusArm) &&
                    !isCurrentComparisonSignal(signal)).length,
                baseline: { armKey: 'B25', minimumPrematch: policy.over.branches.B.prematchByMarket['2.5_UST'], summary: comparisonSummary('B25') },
                candidate: { armKey: 'B25_PRE52', minimumPrematch: armPolicies.get('B25_PRE52').over.branches.B.prematchByMarket['2.5_UST'], summary: comparisonSummary('B25_PRE52') },
                independentFirstSignalLocks: true,
                legacyBaselineFixturesExcluded: true,
                telegram: false,
                decisionImpact: false
            }
        };
    }

    return { preselect, record, metadata, reactionAssessment, arms: ARMS, policy };
}

module.exports = {
    VERSION,
    ARMS,
    REACTION_MIN_SHOTS,
    REACTION_MIN_SOT,
    reactionAssessment,
    createV24FocusLab
};
