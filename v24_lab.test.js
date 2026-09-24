'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SignalTracker } = require('./signal_tracker');
const { createV24Lab } = require('./v24_lab');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-v24-lab-'));
const capturedAt = '2026-09-24T10:30:10.000Z';

function mac(fixtureId, extra = {}) {
    return {
        fixture_id: fixtureId,
        mac_isim: `Home ${fixtureId} - Away ${fixtureId}`,
        lig: 'Offline',
        skor: '1-0',
        dakika: 30,
        status_short: '1H',
        home_team_id: 10,
        away_team_id: 20,
        canli_oranlar: {
            '1.5_UST': { oran: 1.8, bookmaker: 'Test' },
            '2.5_UST': { oran: 1.8, bookmaker: 'Test' },
            MS1: { oran: 2, bookmaker: 'Test' }
        },
        pre: 40,
        prematch_available: true,
        prematch_p_home: 55,
        prematch_p_draw: 25,
        prematch_p_away: 20,
        stats_source: 'test',
        stats_validation: { status: 'passed', verifiedAt: capturedAt },
        _v23EventsAt: '2026-09-24T10:30:00.000Z',
        _v23Events: [{
            type: 'Goal',
            detail: 'Normal Goal',
            team: { id: 10 },
            player: { id: 100 },
            assist: { id: 101 },
            time: { elapsed: 12 }
        }],
        ...extra
    };
}

try {
    const tracker = new SignalTracker({ filePath: path.join(root, 'v24.json') });
    tracker.load();
    const v16 = {
        MODEL: { version: 'v16-test' },
        scoreMarket: (_mac, market) => ({
            selectorProbability: market === 'MS1' ? 52 : market === '1.5_UST' ? 61 : 55,
            selectorRawProbability: 54
        })
    };
    const v18 = {
        scoreMarket: () => ({ v18Probability: 55, v18Edge: -2 })
    };
    const lab = createV24Lab({
        tracker,
        v16Model: v16,
        v18Model: v18,
        prematchSupport: current => current.pre,
        prematchSource: () => 'test',
        liveSnapshot: () => ({ home: {}, away: {} }),
        enabled: true
    });
    const dino = {
        MODEL_VARYANTI: 'live_plus_prematch',
        '1.5_UST': 46,
        '2.5_UST': 46,
        MS1: 52
    };

    assert.equal(lab.preselect(mac(1), dino), true);
    const selected = lab.select({ mac: mac(1), dino, capturedAt, requireEventScore: true });
    assert.equal(selected.over.policy.branch, 'B', 'Bir gol kalan B, aynı maçtaki A adayının önüne geçmeli.');
    assert.equal(selected.winner.market, 'MS1');
    assert.equal(selected.eventScore.status, 'approve');

    const recorded = lab.record({ mac: mac(1), dino, capturedAt });
    assert.equal(recorded.over.tariffRuleId, 'V24-B');
    assert.equal(recorded.winner.tariffRuleId, 'V24-LEADING-WINNER');
    assert.equal(recorded.over.analysis.eventScore.status, 'approve');
    assert.equal(recorded.over.signalType, 'strong');
    assert.equal(recorded.winner.signalType, 'surprise');
    assert.equal(tracker.data.signals.length, 2, 'Bir ÜST ve ondan bağımsız bir MS kaydı tutulmalı.');
    const duplicate = lab.record({ mac: mac(1), dino, capturedAt });
    assert.equal(duplicate.over, null);
    assert.equal(duplicate.winner, null);
    assert.equal(tracker.data.signals.length, 2, 'Her türde ilk uygun kayıt kilidi korunmalı.');

    const badEvents = mac(2, { _v23Events: [] });
    const badRecorded = lab.record({ mac: badEvents, dino, capturedAt });
    assert.equal(badRecorded.over, null, 'Olay/skor uyumsuzsa ÜST kaydı oluşmamalı.');
    assert.ok(badRecorded.winner, 'MS deneyi yalnız verilen beş MS kuralına bağlı kalmalı.');

    const zeroZero = mac(3, { skor: '0-0', _v23Events: [] });
    const zeroRecorded = lab.record({ mac: zeroZero, dino, capturedAt });
    assert.equal(zeroRecorded.over, null);
    assert.equal(zeroRecorded.winner, null);

    const summary = lab.metadata();
    assert.equal(summary.summary.overall.total, 3);
    assert.equal(summary.overSummary.overall.total, 1);
    assert.equal(summary.winnerSummary.overall.total, 2);
    assert.equal(summary.filterSummaries.B.total, 1);
    assert.equal(summary.filterSummaries.A.total, 0);

    const fixture = {
        fixture: { id: 1, status: { short: 'FT' } },
        score: { fulltime: { home: 2, away: 1 } },
        goals: { home: 2, away: 1 }
    };
    assert.equal(tracker.settleFixture(fixture), 2);
    assert.equal(tracker.summary().overall.wins, 2);

    const restarted = new SignalTracker({ filePath: tracker.filePath });
    restarted.load();
    assert.equal(restarted.data.signals.length, 3);
    assert.equal(createV24Lab({
        tracker: restarted,
        v16Model: v16,
        v18Model: v18,
        prematchSupport: current => current.pre,
        prematchSource: () => 'test',
        liveSnapshot: () => ({}),
        enabled: true
    }).preselect(mac(1), dino), false, 'Yeniden başlatmada iki bağımsız fixture kilidi korunmalı.');

    console.log('V24 Lab: fresh A/B selection, strict event-score gate, independent MS slot, settlement and restart locks passed.');
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}
