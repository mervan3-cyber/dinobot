'use strict';

const tariff = require('./v24_tariff');
const { normalize, MAX_AGE_MS } = require('./v23_events');

const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

function oddsValue(mac, market) {
    const value = mac?.canli_oranlar?.[market];
    const parsed = Number(value && typeof value === 'object' ? value.oran : value);
    return Number.isFinite(parsed) ? parsed : null;
}

function eventScoreAudit(mac, capturedAt) {
    const at = time(capturedAt);
    const eventsAt = time(mac?._v23EventsAt);
    const score = /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(String(mac?.skor || ''));
    if (at === null || eventsAt === null || eventsAt > at || at - eventsAt > MAX_AGE_MS || !score) {
        return { status: 'insufficient', reason: 'EVENT_SCORE_UNAVAILABLE', eventsAt: mac?._v23EventsAt || null };
    }
    const parsed = normalize(mac?._v23Events, mac, mac?._v23EventsAt);
    if (parsed.status !== 'ok') {
        return { status: 'insufficient', reason: parsed.reason || 'EVENT_SCORE_UNAVAILABLE', eventsAt: mac?._v23EventsAt || null };
    }
    const goalCount = parsed.events.filter(event => event.type === 'goal' && !event.cancelled).length;
    const scoreTotal = Number(score[1]) + Number(score[2]);
    return {
        status: goalCount === scoreTotal ? 'approve' : 'reject',
        reason: goalCount === scoreTotal ? 'EVENT_SCORE_MATCH' : 'EVENT_SCORE_MISMATCH',
        goalCount,
        scoreTotal,
        eventsAt: mac._v23EventsAt
    };
}

function createV24Lab({
    tracker,
    v16Model,
    v18Model,
    prematchSupport,
    prematchSource,
    liveSnapshot,
    enabled = true
}) {
    function modelInput(mac, dino, market) {
        return {
            market,
            score: mac?.skor,
            minute: mac?.dakika,
            odds: oddsValue(mac, market),
            dinoProbability: dino?.[market],
            prematchSupport: prematchSupport(mac, market)
        };
    }

    function unlocked(mac, signalType) {
        const fixtureId = Number(mac?.fixture_id);
        return Number.isFinite(fixtureId) && fixtureId > 0 && !tracker.hasSignal(fixtureId, signalType);
    }

    function baseAvailable(mac, dino) {
        return enabled && mac && dino && !dino.HATA && dino.MODEL_VARYANTI !== 'score_only';
    }

    function preselect(mac, dino) {
        if (!baseAvailable(mac, dino)) return false;
        if (unlocked(mac, 'strong')) {
            for (const market of Object.keys(mac?.canli_oranlar || {})) {
                const policy = tariff.overCheck({
                    ...modelInput(mac, dino, market),
                    v16Probability: 100,
                    v18Probability: 100,
                    eventScoreStatus: 'approve'
                }, { requireEventScore: false, skipModelThresholds: true });
                if (policy.eligible) return true;
            }
        }
        if (unlocked(mac, 'surprise')) {
            const market = tariff.leadingWinnerMarket(mac?.skor);
            if (market) {
                const policy = tariff.winnerCheck({
                    market,
                    score: mac?.skor,
                    minute: mac?.dakika,
                    odds: oddsValue(mac, market),
                    v16Probability: 100
                }, { skipModelThresholds: true });
                if (policy.eligible) return true;
            }
        }
        return false;
    }

    function select({ mac, dino, liveOnlyDino, capturedAt = null, requireEventScore = false }) {
        if (!baseAvailable(mac, dino)) return { over: null, winner: null, eventScore: null };
        const context = mac?._selectorShadowContext || null;
        const eventScore = requireEventScore ? eventScoreAudit(mac, capturedAt) : { status: 'approve', reason: 'PRESELECTION_ONLY' };
        const overCandidates = [];

        if (unlocked(mac, 'strong')) {
            for (const market of Object.keys(mac?.canli_oranlar || {})) {
                if (!/^(\d+\.5)_UST$/.test(market)) continue;
                const args = modelInput(mac, dino, market);
                const score16 = v16Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
                const score18 = v18Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
                const policy = tariff.overCheck({
                    ...args,
                    v16Probability: score16?.selectorProbability,
                    v18Probability: score18?.v18Probability,
                    eventScoreStatus: eventScore.status
                }, { requireEventScore });
                if (policy.eligible) overCandidates.push({ market, args, score16, score18, policy });
            }
        }

        overCandidates.sort((left, right) =>
            Number(right.policy.branch === 'B') - Number(left.policy.branch === 'B') ||
            Number(right.policy.probabilities.v16) - Number(left.policy.probabilities.v16) ||
            Number(right.policy.probabilities.v18) - Number(left.policy.probabilities.v18) ||
            Number(right.policy.probabilities.dino) - Number(left.policy.probabilities.dino) ||
            Number(left.policy.odds) - Number(right.policy.odds) ||
            left.market.localeCompare(right.market, 'en')
        );

        let winner = null;
        if (unlocked(mac, 'surprise')) {
            const market = tariff.leadingWinnerMarket(mac?.skor);
            if (market) {
                const score16 = v16Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
                const policy = tariff.winnerCheck({
                    market,
                    score: mac?.skor,
                    minute: mac?.dakika,
                    odds: oddsValue(mac, market),
                    v16Probability: score16?.selectorProbability
                });
                if (policy.eligible) winner = { market, score16, policy };
            }
        }

        return { over: overCandidates[0] || null, winner, eventScore };
    }

    function commonPayload(mac, dino, liveOnlyDino, capturedAt, market, odds) {
        return {
            fixtureId: Number(mac.fixture_id),
            sentAt: capturedAt,
            telegramMessageId: null,
            match: mac.mac_isim,
            league: mac.lig,
            minute: Number(mac.dakika),
            score: mac.skor,
            market,
            odds,
            bookmaker: mac.canli_oranlar?.[market]?.bookmaker || null,
            dinoProbability: Number.isFinite(Number(dino?.[market])) ? Number(dino[market]) : null,
            modelVariant: 'v24_shadow_fresh_only',
            liveOnlyProbability: Number.isFinite(Number(liveOnlyDino?.[market])) ? Number(liveOnlyDino[market]) : null,
            selectorV2ModelVersion: v16Model.MODEL.version,
            tariffVersion: tariff.VERSION,
            signalSources: ['V24'],
            prematchSource: mac.prematch_source || null,
            prematchProbabilities: mac.prematch_available ? {
                home: mac.prematch_p_home,
                draw: mac.prematch_p_draw,
                away: mac.prematch_p_away
            } : null,
            prematchMarketSupport: prematchSupport(mac, market),
            prematchMarketSource: prematchSource(mac, market),
            statsSource: mac.stats_source || null,
            statsValidation: { ...mac.stats_validation },
            liveStats: liveSnapshot(mac),
            shadowContext: contextOrNull(mac)
        };
    }

    function contextOrNull(mac) {
        return mac?._selectorShadowContext || null;
    }

    function record({ mac, dino, liveOnlyDino, capturedAt }) {
        const verifiedAt = mac?.stats_validation?.verifiedAt;
        if (mac?.stats_validation?.status !== 'passed' || !verifiedAt || !capturedAt ||
            !Number.isFinite(Date.parse(verifiedAt)) || Date.parse(verifiedAt) !== Date.parse(capturedAt)) {
            return { over: null, winner: null, eventScore: null };
        }

        const selected = select({ mac, dino, liveOnlyDino, capturedAt, requireEventScore: true });
        let overRecord = null;
        let winnerRecord = null;

        if (selected.over) {
            const { market, score16, score18, policy } = selected.over;
            overRecord = tracker.recordSent({
                ...commonPayload(mac, dino, liveOnlyDino, capturedAt, market, policy.odds),
                signalType: 'strong',
                tariffSlot: 'primary',
                tariffRuleId: `V24-${policy.branch}`,
                matchedFilters: [policy.branch],
                goalsNeeded: policy.goalsNeeded,
                edge: policy.recordedEdge,
                marketProbability: policy.marketProbability,
                selectorV2Probability: score16.selectorProbability,
                selectorV2RawProbability: score16.selectorRawProbability,
                v16Edge: policy.v16Edge,
                v18Probability: score18.v18Probability,
                v18Edge: score18.v18Edge,
                decisionModel: 'v24-consensus',
                decisionProbability: score16.selectorProbability,
                decisionEdge: policy.v16Edge,
                modelVotes: { dino: true, v16: true, v18: true },
                voteCount: 3,
                modelProbabilities: policy.probabilities,
                analysis: { eventScore: selected.eventScore, eventScoreRequired: true, thresholds: policy.thresholds }
            });
        }

        if (selected.winner) {
            const { market, score16, policy } = selected.winner;
            winnerRecord = tracker.recordSent({
                ...commonPayload(mac, dino, liveOnlyDino, capturedAt, market, policy.odds),
                signalType: 'surprise',
                tariffSlot: 'follow',
                tariffRuleId: 'V24-LEADING-WINNER',
                matchedFilters: ['MS'],
                edge: policy.v16Edge,
                marketProbability: policy.marketProbability,
                selectorV2Probability: score16.selectorProbability,
                selectorV2RawProbability: score16.selectorRawProbability,
                v16Edge: policy.v16Edge,
                v18Probability: null,
                v18Edge: null,
                decisionModel: 'v16',
                decisionProbability: score16.selectorProbability,
                decisionEdge: policy.v16Edge,
                modelVotes: { v16: true },
                voteCount: 1,
                modelProbabilities: { v16: score16.selectorProbability },
                analysis: { eventScore: selected.eventScore, eventScoreRequired: false }
            });
        }

        return { over: overRecord, winner: winnerRecord, eventScore: selected.eventScore };
    }

    function metadata(signals = tracker.data.signals) {
        const overSignals = signals.filter(signal => signal.signalType === 'strong');
        const winnerSignals = signals.filter(signal => signal.signalType === 'surprise');
        const byBranch = Object.fromEntries(['A', 'B'].map(branch => [branch, {
            label: branch === 'A' ? 'A · diğer açık ÜST çizgileri' : 'B · yalnız 1 gol gerekiyor',
            ...tracker.summary(overSignals.filter(signal => signal.matchedFilters?.includes(branch))).overall
        }]));
        return {
            enabled,
            label: 'V24 · A/B ÜST + öndeki taraf MS',
            decisionImpact: false,
            telegram: false,
            validationMode: 'fresh-required',
            tariffVersion: tariff.VERSION,
            policy: tariff.POLICY,
            maximumSignalsPerFixture: 2,
            maximumOverSignalsPerFixture: 1,
            maximumWinnerSignalsPerFixture: 1,
            startedAt: tracker.data.startedAt,
            summary: tracker.summary(signals),
            overSummary: tracker.summary(overSignals),
            winnerSummary: tracker.summary(winnerSignals),
            filterSummaries: byBranch
        };
    }

    return { preselect, select, record, metadata, eventScoreAudit };
}

module.exports = { createV24Lab, eventScoreAudit };
