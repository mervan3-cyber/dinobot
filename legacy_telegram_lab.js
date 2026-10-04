'use strict';

const { createRouter } = require('./mac_yakala_telegram');
const { evaluate, v22Gate } = require('./v23_entry_gate');

const VERSION = 'legacy-telegram-lab-2026-10-05';
function createLegacyTelegramLab({ tracker, v16Model, v18Model, prematchSupport,
    prematchSource, alreadyDecided, liveSnapshot, v21Enabled = false, v22Enabled = true, gateEnabled = true }) {
    // Same former source-level locks, but a separate local tracker and no send API.
    const delivery = { hasSource: (_channel, source, fixtureId) => tracker.data.signals.some(s =>
        Number(s.fixtureId) === Number(fixtureId) && s.signalSources?.includes(source)) };
    const router = createRouter({ delivery, channel: 'LAB-only', v16Model, v18Model,
        prematchSupport, prematchSource, alreadyDecided, liveSnapshot, v21Enabled, v22Enabled });
    function record({ mac, dino, liveOnlyDino, capturedAt }) {
        if (mac?.stats_validation?.status !== 'passed' || !Number.isFinite(Date.parse(capturedAt)) ||
            Date.parse(mac.stats_validation.verifiedAt) !== Date.parse(capturedAt)) return [];
        const records = [];
        for (const group of router.select({ mac, dino, liveOnlyDino })) {
            let gate = null;
            group.choices = group.choices.filter(choice => {
                if (choice.source !== 'V22' || !gateEnabled) return true;
                const audit = evaluate({ signal: { fixtureId: mac.fixture_id, minute: mac.dakika,
                    score: mac.skor, market: group.market, sentAt: capturedAt }, mac,
                    sourceModel: 'v22', matchedFilters: choice.policy.matchedFilters || [] });
                gate = v22Gate(audit);
                return gate.eligible;
            });
            if (!group.choices.length) continue;
            const payload = router.record(mac, group, '', capturedAt);
            if (!payload) continue;
            records.push(tracker.recordSent({ ...payload,
                deliveryKey: `legacy-lab:${mac.fixture_id}:${payload.signalSources.join('+')}`,
                tariffVersion: VERSION, modelVariant: 'legacy_telegram_lab_fresh_only',
                analysis: { legacyTelegram: true, telegram: false, sourcePolicies: payload.sourcePolicies,
                    v22Gate: gate, gateEnabled }, telegramMessageId: null }));
        }
        return records;
    }
    function metadata(signals = tracker.data.signals) {
        return { enabled: v21Enabled || v22Enabled, label: 'Eski Telegram LAB', telegram: false,
            decisionImpact: false, validationMode: 'fresh-required', tariffVersion: VERSION,
            startedAt: tracker.data.startedAt, sourceModels: [v22Enabled && 'V22', v21Enabled && 'V21'].filter(Boolean),
            v22GateEnabled: gateEnabled, summary: tracker.summary(signals) };
    }
    return { preselect: router.preselect, select: router.select, record, metadata };
}
module.exports = { createLegacyTelegramLab, VERSION };
