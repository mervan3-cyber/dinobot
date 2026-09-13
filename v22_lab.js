'use strict';
const tariff = require('./v22_tariff');

function createV22Lab({ tracker, v16Model, v18Model, prematchSupport, prematchSource,
    liveSnapshot, enabled = true }) {
    function input(mac, dino, market) {
        const value = mac.canli_oranlar?.[market];
        return { market, score: mac.skor, minute: mac.dakika,
            odds: value && typeof value === 'object' ? value.oran : value,
            dinoProbability: dino?.[market], prematchSupport: prematchSupport(mac, market) };
    }
    function available(mac, dino) {
        return enabled && mac && Number.isFinite(Number(mac.fixture_id)) && Number(mac.fixture_id) > 0 &&
            dino && !dino.HATA && dino.MODEL_VARYANTI !== 'score_only' &&
            !tracker.hasSignal(Number(mac.fixture_id), 'strong');
    }
    function preselect(mac, dino) {
        return Boolean(available(mac, dino) && Object.keys(mac.canli_oranlar || {})
            .some(market => tariff.canPreselect(input(mac, dino, market))));
    }
    function select({ mac, dino, liveOnlyDino }) {
        if (!available(mac, dino)) return null;
        const candidates = [];
        for (const market of Object.keys(mac.canli_oranlar || {})) {
            const args = input(mac, dino, market);
            if (!tariff.canPreselect(args)) continue;
            const context = mac._selectorShadowContext || null;
            const score16 = v16Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
            const score18 = v18Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
            const policy = tariff.check({ ...args, selectorProbability: score16?.selectorProbability, v18Probability: score18?.v18Probability });
            if (policy.eligible) candidates.push({ market, args, score16, score18, policy });
        }
        candidates.sort((a, b) => b.policy.voteCount - a.policy.voteCount || a.policy.odds - b.policy.odds || a.market.localeCompare(b.market, 'en'));
        return candidates[0] || null;
    }
    function record({ mac, dino, liveOnlyDino, capturedAt }) {
        const verifiedAt = mac?.stats_validation?.verifiedAt;
        // This method is called only after the shared fresh model rerun. Require
        // the same observation timestamp, not a passed marker from a prior scan.
        if (mac?.stats_validation?.status !== 'passed' || !verifiedAt || !capturedAt ||
            !Number.isFinite(Date.parse(verifiedAt)) || Date.parse(verifiedAt) !== Date.parse(capturedAt)) return null;
        const selected = select({ mac, dino, liveOnlyDino });
        if (!selected) return null;
        const { market, args, score16, score18, policy } = selected;
        return tracker.recordSent({
            fixtureId: Number(mac.fixture_id), signalType: 'strong', sentAt: capturedAt, telegramMessageId: null,
            match: mac.mac_isim, league: mac.lig, minute: policy.minute, score: mac.skor, market,
            odds: policy.odds, bookmaker: mac.canli_oranlar?.[market]?.bookmaker || null,
            dinoProbability: policy.probabilities.dino, edge: policy.recordedEdge, marketProbability: 100 / policy.odds,
            modelVariant: 'v22_union_shadow_fresh_only', liveOnlyProbability: liveOnlyDino?.[market] ?? null,
            selectorV2Probability: score16.selectorProbability, selectorV2RawProbability: score16.selectorRawProbability,
            selectorV2ModelVersion: v16Model.MODEL.version, v18Probability: score18.v18Probability, v18Edge: score18.v18Edge,
            decisionModel: 'consensus', decisionEdge: policy.recordedEdge,
            tariffVersion: tariff.VERSION, tariffSlot: 'primary', tariffRuleId: `V22-${policy.matchedFilters.join('+')}`,
            matchedFilters: policy.matchedFilters, goalsNeeded: policy.goalsNeeded,
            modelVotes: policy.votes, voteCount: policy.voteCount, modelProbabilities: policy.probabilities,
            signalSources: ['V22'], prematchSource: mac.prematch_source || null,
            prematchMarketSupport: args.prematchSupport, prematchMarketSource: prematchSource(mac, market),
            statsSource: mac.stats_source, statsValidation: { ...mac.stats_validation },
            liveStats: liveSnapshot(mac), shadowContext: mac._selectorShadowContext || null
        });
    }
    function metadata(signals = tracker.data.signals) {
        const startedAt = tracker.data.signals.map(s => s.sentAt).filter(Boolean).sort()[0] || null;
        return { enabled, label: 'V22 · ÜST · A/B/C', decisionImpact: false, telegram: false,
            validationMode: 'fresh-required', tariffVersion: tariff.VERSION, policy: tariff.POLICY,
            maximumSignalsPerFixture: 1, startedAt,
            summary: { ...tracker.summary(signals), startedAt },
            filterSummaries: Object.fromEntries(tariff.FILTERS.map(rule => [rule.id, {
                label: rule.label, ...tracker.summary(signals.filter(s => s.matchedFilters?.includes(rule.id))).overall
            }])) };
    }
    return { preselect, select, record, metadata };
}
module.exports = { createV22Lab };
