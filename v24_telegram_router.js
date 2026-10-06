'use strict';

const { createV24Lab, eventScoreAudit } = require('./v24_lab');
const tariff = require('./v24_tariff');
const { MAX_AGE_MS } = require('./v23_events');
const { shortAnalysis, VERSION } = require('./mac_yakala_telegram');

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
    function preselect(mac, dino) {
        return ready() && lab.preselect(mac, dino, new Date(now()).toISOString());
    }
    function select({ mac, dino, liveOnlyDino, capturedAt = new Date(now()).toISOString() }) {
        if (!ready() || Date.parse(capturedAt) < Date.parse(delivery.data.v24ActivatedAt)) return [];
        const choice = lab.select({ mac, dino, liveOnlyDino, capturedAt, requireEventScore: false });
        if (!choice.selected) return [];
        const selected = choice.selected;
        return [{ market: selected.market, oran: selected.policy.odds, minimum_oran: 1.5,
            maximum_oran: selected.kind === 'winner' ? 2.5 : 4,
            choices: [{ ...selected, source: 'V24', v24Choice: choice, frozenDino: dino, frozenLiveOnlyDino: liveOnlyDino }] }];
    }
    function record(mac, group, analysis, capturedAt) {
        if (!ready() || delivery.hasFixture(channel, mac.fixture_id) ||
            locks.signals.some(s => Number(s.fixtureId) === Number(mac.fixture_id))) return null;
        const selected = group.choices?.find(c => c.source === 'V24');
        const verifiedAt = Date.parse(mac?.stats_validation?.verifiedAt);
        const at = Date.parse(capturedAt);
        if (!selected || mac.stats_validation?.status !== 'passed' || !Number.isFinite(at) ||
            at < Date.parse(delivery.data.v24ActivatedAt) || !Number.isFinite(verifiedAt) || verifiedAt > at || at - verifiedAt > MAX_AGE_MS) return null;
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
        if (!policy.eligible || policy.branch !== selected.policy.branch) return null;
        const payload = lab.payloadForChoice({ mac, dino: selected.frozenDino,
            liveOnlyDino: selected.frozenLiveOnlyDino, capturedAt,
            choice: { selected: { ...selected, policy }, eventScore } });
        const entryAudit = payload.analysis;
        return { ...payload, modelVariant: 'v24_main_live_fresh_only', tariffVersion: VERSION,
            sourcePolicies: { V24: { version: tariff.VERSION, matchedFilters: [policy.branch] } },
            analysis: shortAnalysis(analysis, group.market), entryAudit };
    }
    return { preselect, select, record };
}

module.exports = { createV24Router };
