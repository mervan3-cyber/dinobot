'use strict';

const v19 = require('./hybrid_tariff');
const v21 = require('./v21_tariff');

function createIndependentLab({ v19Tracker, v21Tracker, v16Model, v18Model,
    prematchSupport, prematchSource, alreadyDecided, liveSnapshot,
    v19Enabled = true, v21Enabled = true }) {
    function state19(mac) {
        const primary = v19Tracker.findSignal(Number(mac.fixture_id), 'strong');
        const follow = v19Tracker.findSignal(Number(mac.fixture_id), 'surprise');
        return { primary, follow, slot: v19.currentSlot(primary, follow) };
    }
    function input(mac, dino, market, state) {
        const rawOdds = mac.canli_oranlar?.[market];
        return {
            market, slot: state?.slot || 'primary', previousPrimary: state?.primary,
            minute: mac.dakika, odds: rawOdds && typeof rawOdds === 'object' ? rawOdds.oran : rawOdds,
            dinoProbability: dino?.[market], prematchSupport: prematchSupport(mac, market)
        };
    }
    function preselect(mac, dino) {
        const state = state19(mac);
        return Object.keys(mac.canli_oranlar || {}).some(market =>
            !alreadyDecided(market, mac.skor) && (
                (v19Enabled && state.slot && v19.canPreselect(input(mac, dino, market, state))) ||
                (v21Enabled && !v21Tracker.hasSignal(Number(mac.fixture_id), 'strong') &&
                    v21.canPreselect(input(mac, dino, market)))
            )
        );
    }
    function select(kind, { mac, dino, liveOnlyDino }) {
        if (!mac || !Number.isFinite(Number(mac.fixture_id)) || Number(mac.fixture_id) <= 0 ||
            dino?.MODEL_VARYANTI === 'score_only') return null;
        const is21 = kind === 'v21';
        if (is21 ? !v21Enabled : !v19Enabled) return null;
        const state = is21 ? { slot: 'primary' } : state19(mac);
        if (!state.slot || (is21 && v21Tracker.hasSignal(Number(mac.fixture_id), 'strong'))) return null;
        const markets = is21 ? Object.keys(mac.canli_oranlar || {}) :
            (state.slot === 'primary' ? v19.PRIMARY_RULES : v19.FOLLOW_RULES).map(rule => rule.market);
        const candidates = [];
        for (const market of markets) {
            if (alreadyDecided(market, mac.skor)) continue;
            const args = input(mac, dino, market, state);
            if (!(is21 ? v21.canPreselect(args) : v19.canPreselect(args))) continue;
            const context = mac._selectorShadowContext || null;
            const score16 = v16Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
            const score18 = v18Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
            const policy = (is21 ? v21 : v19).check({ ...args,
                selectorProbability: score16?.selectorProbability,
                v18Probability: score18?.v18Probability, v18Edge: score18?.v18Edge
            });
            if (policy.eligible) candidates.push({ market, args, score16, score18, policy, state });
        }
        candidates.sort(is21 ? (a, b) =>
            b.policy.voteCount - a.policy.voteCount || Number(a.args.odds) - Number(b.args.odds) ||
            a.market.localeCompare(b.market, 'en') : (a, b) =>
            b.policy.priority - a.policy.priority || b.policy.decisionProbability - a.policy.decisionProbability ||
            Number(b.args.dinoProbability) - Number(a.args.dinoProbability) ||
            b.policy.recordedEdge - a.policy.recordedEdge);
        return candidates[0] || null;
    }
    function record(kind, args) {
        if (args.mac?.stats_validation?.status !== 'passed') return null;
        const selected = select(kind, args);
        if (!selected) return null;
        const { mac, dino, liveOnlyDino, capturedAt } = args;
        const { market, score16, score18, policy, state } = selected;
        const is21 = kind === 'v21';
        const tracker = is21 ? v21Tracker : v19Tracker;
        const odds = Number(selected.args.odds);
        return tracker.recordSent({
            fixtureId: Number(mac.fixture_id), signalType: state.slot === 'follow' ? 'surprise' : 'strong',
            sentAt: capturedAt || new Date().toISOString(), telegramMessageId: null,
            match: mac.mac_isim, league: mac.lig, minute: mac.dakika, score: mac.skor, market,
            odds, bookmaker: mac.canli_oranlar?.[market]?.bookmaker || null,
            dinoProbability: dino[market], edge: policy.recordedEdge, marketProbability: 100 / odds,
            modelVariant: `${kind}_independent_shadow_fresh_only`,
            liveOnlyProbability: liveOnlyDino?.[market] ?? null,
            selectorV2Probability: score16?.selectorProbability,
            selectorV2RawProbability: score16?.selectorRawProbability,
            selectorV2ModelVersion: v16Model.MODEL.version,
            v18Probability: score18?.v18Probability, v18Edge: score18?.v18Edge,
            decisionModel: is21 ? 'consensus' : policy.decisionModel,
            decisionProbability: is21 ? null : policy.decisionProbability,
            decisionEdge: is21 ? policy.recordedEdge : policy.decisionEdge,
            tariffVersion: is21 ? v21.VERSION : v19.VERSION,
            tariffSlot: state.slot, tariffRuleId: is21 ? 'V21-2OF3-PRE50-E1' : policy.rule.id,
            v16Edge: policy.v16Edge ?? null,
            modelVotes: is21 ? policy.votes : null, voteCount: is21 ? policy.voteCount : null,
            modelProbabilities: is21 ? policy.probabilities : null,
            signalSources: [is21 ? 'V21' : 'V19'],
            prematchSource: mac.prematch_source || null,
            prematchMarketSupport: selected.args.prematchSupport,
            prematchMarketSource: prematchSource(mac, market),
            statsSource: mac.stats_source, statsValidation: mac.stats_validation,
            liveStats: liveSnapshot(mac), shadowContext: mac._selectorShadowContext || null
        });
    }
    return { preselect, select, record };
}

// Preserve known V19 history only. Never replay unrecorded past candidates.
function importV19History(sourceTracker, targetTracker) {
    let imported = 0;
    for (const signal of sourceTracker.data.signals) {
        if (signal.tariffVersion !== v19.VERSION || targetTracker.hasSignal(signal.fixtureId, signal.signalType)) continue;
        targetTracker.data.signals.push({ ...signal, importedFromSharedHistory: true });
        imported++;
    }
    if (imported) targetTracker.save();
    return imported;
}

module.exports = { createIndependentLab, importV19History };
