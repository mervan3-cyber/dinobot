'use strict';

const { createV24Lab, eventScoreAudit } = require('./v24_lab');
const tariff = require('./v24_tariff');
const { MAX_AGE_MS } = require('./v23_events');
const { briefStatsAnalysis, VERSION } = require('./mac_yakala_telegram');

// LAB records never become a delivery queue. Only a newly selected, fresh
// candidate can build a live payload, and delivery owns its own fixture lock.
function createV24Router({ delivery, channel, baselineTracker, v16Model, v18Model,
    prematchSupport, prematchSource, liveSnapshot, now = Date.now }) {
    const locks = { get signals() {
        const activation = Date.parse(delivery.data.v24ActivatedAt);
        return [
            ...delivery.data.entries.filter(e => String(e.requestedChannel) === String(channel) && e.status !== 'declined')
                .map(e => ({ fixtureId: e.payload.fixtureId })),
            ...delivery.tracker.data.signals,
            ...(baselineTracker?.data.signals || []).filter(s => !Number.isFinite(Date.parse(s.sentAt)) || Date.parse(s.sentAt) < activation)
        ];
    } };
    const lab = createV24Lab({ tracker: { data: locks }, v16Model, v18Model,
        prematchSupport, prematchSource, liveSnapshot, policy: tariff.POLICY, source: 'V24' });
    const ready = () => Boolean(channel && !delivery.disabled && Number.isFinite(Date.parse(delivery.data.v24ActivatedAt)));
    function availability(mac, capturedAt) {
        const codes = [];
        if (!channel) codes.push('CHANNEL_MISSING');
        if (delivery.disabled) codes.push('DELIVERY_DISABLED');
        const activation = Date.parse(delivery.data.v24ActivatedAt), at = Date.parse(capturedAt);
        if (!Number.isFinite(activation)) codes.push('ACTIVATION_MISSING');
        if (!Number.isFinite(at)) codes.push('CAPTURE_TIME_INVALID');
        else if (at < activation) codes.push('BEFORE_ACTIVATION');
        if (channel && locks.signals.some(s => Number(s.fixtureId) === Number(mac.fixture_id))) codes.push('FIXTURE_LOCKED');
        return {eligible:codes.length===0, codes};
    }
    function preselect(mac, dino) {
        return ready() && lab.preselect(mac, dino, new Date(now()).toISOString());
    }
    function select({ mac, dino, liveOnlyDino, capturedAt = new Date(now()).toISOString() }) {
        if (!availability(mac, capturedAt).eligible) return [];
        const choice = lab.select({ mac, dino, liveOnlyDino, capturedAt, requireEventScore: false });
        if (!choice.selected) return [];
        const selected = choice.selected;
        return [{ market: selected.market, oran: selected.policy.odds, minimum_oran: 1.5,
            maximum_oran: selected.kind === 'winner' ? 2.5 : 4,
            choices: [{ ...selected, source: 'V24', v24Choice: choice, frozenDino: dino, frozenLiveOnlyDino: liveOnlyDino }] }];
    }
    function recordWithAudit(mac, group, analysis, capturedAt) {
        const blocked = (...codes) => ({payload: null, codes});
        if (!channel) return blocked('CHANNEL_MISSING');
        if (delivery.disabled) return blocked('DELIVERY_DISABLED');
        if (!Number.isFinite(Date.parse(delivery.data.v24ActivatedAt))) return blocked('ACTIVATION_MISSING');
        if (!ready() || delivery.hasFixture(channel, mac.fixture_id) ||
            locks.signals.some(s => Number(s.fixtureId) === Number(mac.fixture_id))) return blocked('FIXTURE_LOCKED');
        const selected = group.choices?.find(c => c.source === 'V24');
        const verifiedAt = Date.parse(mac?.stats_validation?.verifiedAt);
        const at = Date.parse(capturedAt);
        if (!selected) return blocked('V24_CHOICE_MISSING');
        if (mac.stats_validation?.status !== 'passed') return blocked('STATS_NOT_PASSED');
        if (!Number.isFinite(at)) return blocked('CAPTURE_TIME_INVALID');
        if (at < Date.parse(delivery.data.v24ActivatedAt)) return blocked('BEFORE_ACTIVATION');
        if (!Number.isFinite(verifiedAt) || verifiedAt > at || at - verifiedAt > MAX_AGE_MS) return blocked('STATS_STALE_OR_FUTURE');
        const eventScore = eventScoreAudit(mac, capturedAt);
        const isOver = selected.kind === 'over';
        const policy = isOver ? tariff.overCheck({ ...selected.args,
            score: mac.skor, minute: mac.dakika, odds: Number(group.oran),
            v16Probability: selected.score16?.selectorProbability,
            v18Probability: selected.score18?.v18Probability, eventScoreStatus: eventScore.status
        }, { requireEventScore: true }) : tariff.winnerCheck({
            market: group.market, score: mac.skor, minute: mac.dakika, odds: Number(group.oran),
            prematchSupport: prematchSupport(mac, group.market),
            v16Probability: selected.score16?.selectorProbability, eventScoreStatus: eventScore.status
        }, { requireEventScore: true });
        if (!policy.eligible || policy.branch !== selected.policy.branch) return {
            payload: null, codes: [...policy.reasons, ...(policy.branch !== selected.policy.branch ? ['BRANCH_CHANGED'] : [])], eventScore
        };
        const payload = lab.payloadForChoice({ mac, dino: selected.frozenDino,
            liveOnlyDino: selected.frozenLiveOnlyDino, capturedAt,
            choice: { selected: { ...selected, policy }, eventScore } });
        const entryAudit = payload.analysis;
        return { payload: { ...payload, modelVariant: 'v24_main_live_fresh_only', tariffVersion: VERSION,
            sourcePolicies: { V24: { version: tariff.VERSION, matchedFilters: [policy.branch] } },
            analysis: briefStatsAnalysis(payload), entryAudit }, codes: [], eventScore };
    }
    function record(mac, group, analysis, capturedAt) {
        return recordWithAudit(mac, group, analysis, capturedAt).payload;
    }
    return { preselect, select, record, recordWithAudit, availability };
}

module.exports = { createV24Router };
