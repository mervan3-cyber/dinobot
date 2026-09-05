'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SignalTracker } = require('./signal_tracker');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-v18-shadow-test-'));
const historyFileA = path.join(temporaryDirectory, 'history-a.json');
const historyFileB = path.join(temporaryDirectory, 'history-b.json');

try {
    const tracker = new SignalTracker({ filePath: historyFileA });
    const trackerB = new SignalTracker({ filePath: historyFileB });
    tracker.load();
    trackerB.load();
    assert.ok(tracker.data.startedAt, 'Gölge karşılaştırma başlangıcı kaydedilmedi.');

    const first = tracker.recordSent({
        fixtureId: 18001,
        signalType: 'strong',
        sentAt: '2026-09-05T10:00:00.000Z',
        match: 'Test Home - Test Away',
        minute: 45,
        score: '0-0',
        market: '2.5_UST',
        selectorV2Probability: 71,
        edge: 7,
        odds: 1.6,
        tariffSlot: 'primary'
    });
    const duplicate = tracker.recordSent({
        fixtureId: 18001,
        signalType: 'strong',
        market: '0.5_UST',
        odds: 1.8
    });
    assert.equal(first.signalId, duplicate.signalId, 'Maç başına tek V18 kilidi çalışmadı.');
    assert.equal(tracker.data.signals.length, 1, 'Aynı fixture için ikinci kayıt oluştu.');

    const independentB = trackerB.recordSent({
        fixtureId: 18001,
        signalType: 'strong',
        sentAt: '2026-09-05T10:00:00.000Z',
        match: 'Test Home - Test Away',
        minute: 45,
        score: '0-0',
        market: 'MS2',
        selectorV2Probability: 72,
        edge: 11,
        odds: 1.7,
        tariffSlot: 'primary'
    });
    assert.notEqual(first.signalId, independentB.signalId, 'A ve B farklı kayıt kimliği kullanmalı.');
    assert.equal(trackerB.data.signals.length, 1, 'B kolu A kilidinden bağımsız kayıt tutmalı.');

    const reloaded = new SignalTracker({ filePath: historyFileA });
    reloaded.load();
    assert.equal(reloaded.data.startedAt, tracker.data.startedAt, 'Başlangıç zamanı yeniden yüklemede değişti.');
    assert.equal(reloaded.unresolvedFixtureIds().length, 1);

    const settled = reloaded.settleFixture({
        fixture: { id: 18001, status: { short: 'FT' } },
        goals: { home: 2, away: 1 },
        score: { fulltime: { home: 2, away: 1 } }
    });
    assert.equal(settled, 1);
    assert.equal(reloaded.data.signals[0].settlement.result, 'W');
    assert.ok(Math.abs(reloaded.data.signals[0].settlement.profit - 0.6) < 1e-9);
    assert.equal(reloaded.summary().overall.wins, 1);
    assert.equal(reloaded.summary().overall.roi, 60);
    assert.equal(reloaded.summary().overall.averageOdds, 1.6);

    console.log('V18 shadow tracker tests passed.');
} finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
