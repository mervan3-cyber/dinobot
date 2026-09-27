'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SignalTracker } = require('./signal_tracker');
const { createV24FocusLab, reactionAssessment } = require('./v24_focus_lab');

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
        preByMarket: { '1.5_UST': 72, '2.5_UST': 52 },
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
        selectorProbability: _mac.skor === '0-0' ? 72 : market === '1.5_UST' ? 60 : 65,
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
    assert.deepEqual(scoreTwoLead.records.map(row => row.analysis.focusArm), ['B25', 'B25_REACTION']);
    assert.equal(scoreTwoLead.records[1].analysis.reaction.trailingSide, 'away');

    const scoreTwoTie = lab.record({ mac: mac(4, '1-1'), dino, capturedAt });
    assert.deepEqual(scoreTwoTie.records.map(row => row.analysis.focusArm), ['B25'],
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

    assert.equal(lab.metadata().armSummaries.B15.summary.total, 3);
    assert.equal(lab.metadata().maximumSignalsPerFixturePerArm, 1);
    assert.equal(lab.metadata().telegram, false);
    console.log('V24 Odak LAB: six independent arms, reaction boundaries, tie/missing handling and per-arm locks passed.');
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}
