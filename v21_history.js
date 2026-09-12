'use strict';
// Reporting separation only. The underlying tracker and its cross-version
// fixture locks/settlements are retained; never replay or relabel old signals.
const tariff = require('./v21_tariff');
const LEGACY_VERSION = 'v21-consensus-shadow-2026-09-12';
const LEGACY_POLICY = Object.freeze({
    version: LEGACY_VERSION, markets: ['UST', 'ALT'], minuteLow: 25, minuteHigh: 80,
    minimumOdd: 1.50, maximumOdd: 4.00, probabilityThreshold: 50,
    prematchThreshold: 50, minimumVotes: 2, edgeHigh: 1, edgeLow: null,
    edgeField: 'recordedEdge', maximumSignalsPerFixture: 1,
    selectionOrder: tariff.POLICY.selectionOrder, telegram: false
});
function select(signals, cohort = 'current') {
    return (signals || []).filter(signal => cohort === 'previous'
        ? signal.tariffVersion !== tariff.VERSION : signal.tariffVersion === tariff.VERSION);
}
function firstSentAt(signals) {
    return signals.map(signal => signal.sentAt).filter(Boolean).sort()[0] || null;
}
function metadata(signals, cohort = 'current') {
    const previous = cohort === 'previous';
    const selected = select(signals, cohort);
    const knownLegacy = previous && selected.every(signal => signal.tariffVersion === LEGACY_VERSION);
    return {
        cohort: previous ? 'previous' : 'current',
        activeTariffVersion: tariff.VERSION,
        tariffVersion: !previous ? tariff.VERSION : knownLegacy ? LEGACY_VERSION : 'previous-v21-archive',
        rules: !previous ? tariff.POLICY : knownLegacy ? LEGACY_POLICY : null,
        startedAt: firstSentAt(selected),
        archivedRecords: select(signals, 'previous').length,
        note: previous
            ? 'Önceki V21 tarifelerinin arşivi; yeni 3/3 ÜST deneyinin sonucuna dahil değildir. Kayıt başına tariffVersion korunur.'
            : 'Yalnız yeni V21: ÜST, 3/3 >%50, Pre >%50, kayıt EDGE −5…0. Eski kayıtlar değiştirilmeden ayrı tutulur; Telegram yok.'
    };
}
function summary(tracker, signals, cohort = 'current') {
    const allCohortSignals = select(tracker.data.signals, cohort);
    const selected = signals === undefined ? allCohortSignals : select(signals, cohort);
    const times = selected.flatMap(signal => [signal.sentAt, signal.settlement?.resolvedAt]).filter(Boolean).sort();
    return { ...tracker.summary(selected), startedAt: firstSentAt(allCohortSignals), updatedAt: times.at(-1) || null };
}
module.exports = { LEGACY_VERSION, LEGACY_POLICY, select, metadata, summary };
