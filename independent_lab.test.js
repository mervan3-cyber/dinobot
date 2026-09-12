'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SignalTracker } = require('./signal_tracker');
const { createIndependentLab, importV19History } = require('./independent_lab');
const v19 = require('./hybrid_tariff');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-v21-lab-'));
const tracker = name => { const t = new SignalTracker({ filePath: path.join(temp, name + '.json') }); t.load(); return t; };
try {
    const shared = tracker('shared'), v19Tracker = tracker('v19'), v21Tracker = tracker('v21');
    const v16Model = { MODEL: { version: 'offline16' }, scoreMarket: (mac, market) => ({ selectorProbability: mac.p16?.[market] ?? 57 }) };
    const v18Model = { MODEL: { version: 'offline18' }, scoreMarket: (mac, market) => market.endsWith('_ALT') ? null : ({ v18Probability: mac.p18?.[market] ?? 60, v18Edge: 8 }) };
    const options = { v19Tracker, v21Tracker, v16Model, v18Model,
        prematchSupport: mac => mac.pre ?? 65, prematchSource: () => 'offline-line',
        alreadyDecided: (market, score) => Number(market.split('_')[0]) < score.split('-').map(Number).reduce((a, b) => a + b),
        liveSnapshot: () => ({ home: { shots: 4 }, away: { shots: 3 } }) };
    const lab = createIndependentLab(options);
    const mac = { fixture_id: 1, dakika: 30, skor: '0-0', mac_isim: 'Offline - Test',
        canli_oranlar: { MS1: { oran: 1.8 }, '2.5_UST': { oran: 1.8 } },
        stats_validation: { status: 'passed' } };
    const dino = { MS1: 55, '2.5_UST': 55, MODEL_VARYANTI: 'live_plus_prematch' };
    assert.equal(lab.preselect(mac, dino), true);
    assert.equal(lab.select('v19', { mac, dino }).market, 'MS1', 'V19 all-market priority is independent of Telegram OVER policy');
    assert.equal(lab.select('v21', { mac, dino }).market, '2.5_UST');
    const failed = { ...mac, stats_validation: { status: 'failed' } };
    assert.equal(lab.record('v21', { mac: failed, dino }), null);
    assert.equal(lab.record('v19', { mac: failed, dino }), null);
    assert.equal(v21Tracker.data.signals.length, 0);
    const record21 = lab.record('v21', { mac, dino });
    const record19 = lab.record('v19', { mac, dino });
    assert.equal(record21.market, '2.5_UST');
    assert.equal(record21.prematchMarketSupport, 65);
    assert.equal(record21.voteCount, 3);
    assert.equal(record21.decisionProbability, null, 'A consensus vote is not a calibrated probability');
    assert.equal(record19.market, 'MS1');
    assert.equal(shared.data.signals.length, 0, 'Lab must not populate shared Telegram history');
    assert.equal(lab.record('v21', { mac, dino }), null);
    const resumed21 = tracker('v21');
    assert.equal(createIndependentLab({ ...options, v21Tracker: resumed21 }).record('v21', { mac, dino }), null);
    assert.equal(resumed21.data.signals[0].voteCount, 3);
    const underMac = { ...mac, fixture_id: 2, dakika: 60, canli_oranlar: { '3.5_ALT': { oran: 1.8 } } };
    const under = lab.record('v21', { mac: underMac, dino: { '3.5_ALT': 54 } });
    assert.equal(under, null, 'New V21 never records ALT');
    const archivedUnder = v21Tracker.recordSent({ fixtureId: 2, signalType: 'strong', market: '3.5_ALT',
        odds: 1.8, tariffVersion: 'v21-consensus-shadow-2026-09-12' });
    v21Tracker.settleFixture({ fixture: { id: 2, status: { short: 'FT' } }, goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } } });
    assert.equal(archivedUnder.settlement.result, 'W', 'Old ALT continues settling without being relabelled');
    const resumedArchive = tracker('v21');
    assert.equal(createIndependentLab({ ...options, v21Tracker: resumedArchive }).record('v21', {
        mac: { ...mac, fixture_id: 2 }, dino }), null, 'Old version keeps fixture lock after restart');
    assert.equal(lab.select('v21', { mac: { ...underMac, fixture_id: 3, skor: '4-0' }, dino: { '3.5_ALT': 54 } }), null);
    assert.equal(lab.select('v21', { mac: { ...mac, fixture_id: 3 }, dino: { ...dino, MODEL_VARYANTI: 'score_only' } }), null);
    // Deterministic choice is fixed before observing any settlement.
    const multiple = { ...mac, fixture_id: 4, dakika: 45,
        canli_oranlar: { '3.5_ALT': { oran: 1.5 }, '2.5_UST': { oran: 1.8 }, '1.5_UST': { oran: 1.7 } } };
    assert.equal(lab.select('v21', { mac: multiple, dino: { '3.5_ALT': 54, '2.5_UST': 54, '1.5_UST': 54 } }).market, '1.5_UST');
    const historic = shared.recordSent({ fixtureId: 99, market: 'X', odds: 1.8, signalType: 'strong', tariffVersion: v19.VERSION });
    shared.recordSent({ fixtureId: 100, market: '2.5_UST', odds: 1.8, signalType: 'strong', tariffVersion: 'different-router' });
    assert.equal(importV19History(shared, v19Tracker), 1);
    assert.equal(importV19History(shared, v19Tracker), 0);
    assert.equal(v19Tracker.findSignal(99, 'strong').signalId, historic.signalId);
    assert.equal(v19Tracker.findSignal(99, 'strong').importedFromSharedHistory, true);
    assert.equal(v19Tracker.hasSignal(100, 'strong'), false);
    assert.equal(shared.data.signals.length, 2);
    console.log('Independent V19/V21 fresh validation, priority, archived ALT settlement, cross-version restart locks and history import passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
