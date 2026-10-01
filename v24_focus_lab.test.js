'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SignalTracker } = require('./signal_tracker');
const { createV24FocusLab, reactionAssessment, VERSION, ARMS } = require('./v24_focus_lab');
const tariff = require('./v24_tariff');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-v24-focus-'));
const capturedAt = '2026-09-28T10:30:10.000Z';

function goals(count) {
    return Array.from({ length: count }, (_, index) => ({
        type: 'Goal', detail: 'Normal Goal', team: { id: index % 2 ? 20 : 10 },
        time: { elapsed: 5 + index * 5 }
    }));
}

function mac(fixtureId, score = '1-0', extra = {}) {
    const total = score.split('-').reduce((sum, value) => sum + Number(value), 0);
    return {
        fixture_id: fixtureId,
        mac_isim: `Home ${fixtureId} - Away ${fixtureId}`,
        lig: 'Test League', league_id: 900, league_country: 'Test',
        skor: score, dakika: 30, status_short: '1H',
        home_team_id: 10, away_team_id: 20,
        home_team_name: `Home ${fixtureId}`, away_team_name: `Away ${fixtureId}`,
        home_shot: 7, home_sot: 2, away_shot: 4, away_sot: 1,
        canli_oranlar: {
            '1.5_UST': { oran: 1.8, bookmaker: 'Test' },
            '2.5_UST': { oran: 1.8, bookmaker: 'Test' }
        },
        preByMarket: { '1.5_UST': 75, '2.5_UST': 52 },
        prematch_available: true,
        stats_source: 'test',
        stats_validation: { status: 'passed', verifiedAt: capturedAt },
        _v23EventsAt: new Date(Date.parse(capturedAt) - 10000).toISOString(),
        _v23Events: goals(total),
        ...extra
    };
}

const v16 = {
    MODEL: { version: 'v16-test' },
    scoreMarket: (_mac, market) => ({
        selectorProbability: _mac.skor === '0-0' ? 72 : 65,
        selectorRawProbability: 64
    })
};
const v18 = { scoreMarket: () => ({ v18Probability: 65, v18Edge: -2 }) };
const dino = { MODEL_VARYANTI: 'live_plus_prematch', '1.5_UST': 50, '2.5_UST': 45 };

const tracker = new SignalTracker({ filePath: path.join(root, 'focus.json') });
tracker.load();
const lab = createV24FocusLab({
    tracker, v16Model: v16, v18Model: v18,
    prematchSupport: (current, market) => current.preByMarket?.[market],
    prematchSource: () => 'test',
    liveSnapshot: current => ({
        home: { shots: current.home_shot, shotsOnGoal: current.home_sot },
        away: { shots: current.away_shot, shotsOnGoal: current.away_sot }
    })
});

try {
    const scoreOne = lab.record({ mac: mac(1), dino, capturedAt });
    assert.deepEqual(scoreOne.records.map(row => row.analysis.focusArm), ['B15', 'B15_REACTION', 'A25']);
    assert.equal(new Set(scoreOne.records.map(row => row.fixtureId)).size, 1,
        'Aynı fixture bağımsız odak kollarında karşılaştırılabilmeli.');

    const sniper = lab.record({ mac: mac(2, '0-0'), dino, capturedAt });
    assert.deepEqual(sniper.records.map(row => row.analysis.focusArm), ['SNIPER_15']);

    const scoreTwoLead = lab.record({ mac: mac(3, '2-0'), dino, capturedAt });
    assert.deepEqual(scoreTwoLead.records.map(row => row.analysis.focusArm), ['B25', 'B25_PRE52', 'B25_REACTION']);
    assert.equal(scoreTwoLead.records[2].analysis.reaction.trailingSide, 'away');
    assert.equal(scoreTwoLead.records[0].analysis.thresholds.prematch, 32);
    assert.equal(scoreTwoLead.records[1].analysis.thresholds.prematch, 52);

    const scoreTwoTie = lab.record({ mac: mac(4, '1-1'), dino, capturedAt });
    assert.deepEqual(scoreTwoTie.records.map(row => row.analysis.focusArm), ['B25', 'B25_PRE52'],
        '1-1 durumunda gerideki takım olmadığı için reaksiyon kolu kayıt üretmemeli.');
    assert.equal(reactionAssessment(mac(4, '1-1')).status, 'not_applicable');

    const lowReaction = mac(5, '1-0', { away_shot: 3, away_sot: 1 });
    assert.deepEqual(lab.record({ mac: lowReaction, dino, capturedAt }).records.map(row => row.analysis.focusArm),
        ['B15', 'A25']);
    const laterReaction = mac(5, '1-0', { away_shot: 4, away_sot: 1 });
    assert.deepEqual(lab.record({ mac: laterReaction, dino, capturedAt }).records.map(row => row.analysis.focusArm),
        ['B15_REACTION'], 'Reaksiyon kolu kendi ilk uygun anını daha sonra kilitleyebilmeli.');

    const missingReaction = mac(6, '1-0', { away_shot: null });
    assert.deepEqual(lab.record({ mac: missingReaction, dino, capturedAt }).records.map(row => row.analysis.focusArm),
        ['B15', 'A25'], 'Eksik reaksiyon verisi onay sayılmamalı.');

    const below52 = mac(8, '1-1', { preByMarket: { '2.5_UST': 51.99 } });
    assert.deepEqual(lab.record({ mac: below52, dino, capturedAt }).records.map(row => row.analysis.focusArm), ['B25']);
    assert.equal(lab.preselect(below52, dino), false, 'B25 base lock must not bypass the candidate gate');
    const at52 = mac(8, '1-1', { preByMarket: { '2.5_UST': 52 } });
    assert.equal(lab.preselect(at52, dino), true, 'Independent pre52 arm can trigger after base already locked');
    const later52 = lab.record({ mac: at52, dino, capturedAt });
    assert.deepEqual(later52.records.map(row => row.analysis.focusArm), ['B25_PRE52']);
    assert.equal(later52.records[0].analysis.sourcePolicyVersion, tariff.POLICY.version);
    assert.equal(lab.record({ mac: at52, dino, capturedAt }).records.length, 0);
    const badEvents = mac(9, '1-1', { _v23Events: [] });
    assert.equal(lab.record({ mac: badEvents, dino, capturedAt }).records.length, 0);
    assert.equal(lab.record({ mac: mac(10, '1-1', { stats_validation: { status: 'passed', verifiedAt: '2026-09-28T10:29:10.000Z' } }), dino, capturedAt }).records.length, 0);
    const metadata = lab.metadata();
    assert.equal(ARMS.length, 7);
    assert.equal(metadata.armSummaries.B15.summary.total, 3);
    assert.equal(metadata.armSummaries.B25_PRE52.effectivePrematchMinimum, 52);
    assert.equal(metadata.prematchComparison.baseline.summary.total, 3);
    assert.equal(metadata.prematchComparison.candidate.summary.total, 3);
    const old = { ...scoreTwoLead.records[0], fixtureId: 90, deliveryKey: 'v24-focus:90:B25', tariffVersion: 'old-focus', analysis: { focusArm: 'B25' } };
    tracker.data.signals.push(old);
    assert.equal(lab.record({ mac: mac(90, '1-1'), dino, capturedAt }).records.length, 0, 'Do not compare a legacy base entry to a new candidate entry');
    assert.equal(lab.metadata().prematchComparison.legacyRecordsExcluded, 1);
    assert.equal(lab.metadata().prematchComparison.baseline.summary.total, 3);
    assert.equal(old.tariffVersion, 'old-focus', 'Old history must not be rewritten');
    const candidateSignal = later52.records[0];
    tracker.settleFixture({ fixture: { id: 8, status: { short: 'FT' } }, goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } } });
    assert.equal(candidateSignal.settlement.result, 'W');
    assert.equal(lab.metadata().prematchComparison.candidate.summary.wins, 1);
    const restored = new SignalTracker({ filePath: path.join(root, 'focus.json') });
    restored.load();
    const restoredLab = createV24FocusLab({ tracker: restored, v16Model: v16, v18Model: v18,
        prematchSupport: (current, market) => current.preByMarket?.[market], prematchSource: () => 'test', liveSnapshot: () => ({}) });
    assert.equal(restoredLab.metadata().prematchComparison.candidate.summary.wins, 1, 'Comparison must survive restart');
    assert.equal(restoredLab.record({ mac: at52, dino, capturedAt }).records.length, 0, 'Independent arm key must survive restart');
    let calls16 = 0, calls18 = 0;
    const countedLab = createV24FocusLab({ tracker: restored,
        v16Model: { ...v16, scoreMarket: (...args) => { calls16++; return v16.scoreMarket(...args); } },
        v18Model: { scoreMarket: (...args) => { calls18++; return v18.scoreMarket(...args); } },
        prematchSupport: (current, market) => current.preByMarket?.[market], prematchSource: () => 'test', liveSnapshot: () => ({}) });
    assert.equal(countedLab.record({ mac: mac(11, '2-0'), dino, capturedAt }).records.length, 3);
    assert.equal(calls16, 2, 'V16 evaluated once for each market, not once per arm');
    assert.equal(calls18, 2, 'V18 evaluated once for each market, not once per arm');
    assert.equal(lab.metadata().maximumSignalsPerFixturePerArm, 1);
    assert.equal(lab.metadata().telegram, false);
    assert.equal(lab.metadata().tariffVersion, VERSION);
    console.log('V24 Odak LAB: seven independent arms, pre52 inclusive boundary/later entry, existing reactions, settlement and legacy-free comparison passed.');
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}
