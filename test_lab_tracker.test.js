'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SignalTracker } = require('./signal_tracker');
const legacyV17Tariff = require('./market_tariff');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-test-lab-tracker-'));
const trackerFor = name => new SignalTracker({
    filePath: path.join(temporaryDirectory, `${name}.json`)
});

try {
    const activeV19 = trackerFor('active-v19');
    const core = trackerFor('core');
    const legacyV17 = trackerFor('legacy-v17');
    activeV19.load();
    core.load();
    legacyV17.load();

    activeV19.recordSent({ fixtureId: 18001, signalType: 'strong', market: 'MS1', odds: 1.6 });
    const coreFirst = core.recordSent({
        fixtureId: 18001, signalType: 'strong', market: 'MS2', odds: 1.7,
        sentAt: '2026-09-08T10:00:00.000Z', tariffSlot: 'primary'
    });
    const coreDuplicate = core.recordSent({
        fixtureId: 18001, signalType: 'strong', market: '2.5_UST', odds: 1.8
    });
    assert.equal(coreDuplicate.signalId, coreFirst.signalId, 'Core maç başına tek kayıt tutmalı.');
    assert.equal(core.data.signals.length, 1);
    assert.equal(activeV19.data.signals.length, 1, 'V19 ve core kilitleri bağımsız olmalı.');

    const primary = legacyV17.recordSent({
        fixtureId: 19001, signalType: 'strong', market: '2.5_UST', minute: 30,
        odds: 1.6, tariffSlot: 'primary'
    });
    assert.equal(legacyV17Tariff.currentSlot(primary, null), 'follow');
    const follow = legacyV17.recordSent({
        fixtureId: 19001, signalType: 'surprise', market: 'MS2', minute: 48,
        odds: 1.7, tariffSlot: 'follow'
    });
    assert.equal(legacyV17Tariff.currentSlot(primary, follow), null);
    assert.equal(legacyV17.data.signals.length, 2, 'Legacy V17 ilk ve takip kaydını ayrı tutmalı.');

    const reloadedLegacy = trackerFor('legacy-v17');
    reloadedLegacy.load();
    assert.equal(reloadedLegacy.data.signals.length, 2, 'Legacy kilitleri yeniden başlatmada korunmalı.');
    assert.equal(
        legacyV17Tariff.currentSlot(
            reloadedLegacy.findSignal(19001, 'strong'),
            reloadedLegacy.findSignal(19001, 'surprise')
        ),
        null
    );

    const settled = core.settleFixture({
        fixture: { id: 18001, status: { short: 'FT' } },
        goals: { home: 0, away: 2 },
        score: { fulltime: { home: 0, away: 2 } }
    });
    assert.equal(settled, 1);
    assert.equal(core.data.signals[0].settlement.result, 'W');
    assert.equal(core.summary().overall.roi, 70);

    console.log('Test Lab tracker tests passed.');
} finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
