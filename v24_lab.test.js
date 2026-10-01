'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SignalTracker } = require('./signal_tracker');
const tariff = require('./v24_tariff');
const { createV24Lab } = require('./v24_lab');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-v24-lab-'));
const saturday = '2026-09-26T10:30:10.000Z';
const monday = '2026-09-28T10:30:10.000Z';

function mac(fixtureId, capturedAt = saturday, extra = {}) {
    return {
        fixture_id: fixtureId,
        mac_isim: `Home ${fixtureId} - Away ${fixtureId}`,
        lig: 'Test League',
        league_id: 900,
        league_country: 'Test',
        skor: '1-0',
        dakika: 30,
        status_short: '1H',
        home_team_id: 10,
        home_team_name: `Home ${fixtureId}`,
        away_team_id: 20,
        away_team_name: `Away ${fixtureId}`,
        canli_oranlar: {
            '1.5_UST': { oran: 1.8, bookmaker: 'Test' },
            '2.5_UST': { oran: 1.8, bookmaker: 'Test' },
            MS1: { oran: 1.6, bookmaker: 'Test' }
        },
        preByMarket: { '1.5_UST': 70, '2.5_UST': 52, MS1: 50 },
        prematch_available: true,
        prematch_p_home: 55,
        prematch_p_draw: 25,
        prematch_p_away: 20,
        stats_source: 'test',
        stats_validation: { status: 'passed', verifiedAt: capturedAt },
        _v23EventsAt: new Date(Date.parse(capturedAt) - 10000).toISOString(),
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

const v16 = {
    MODEL: { version: 'v16-test' },
    scoreMarket: (_mac, market) => ({
        selectorProbability: market === '1.5_UST' ? (_mac.skor === '0-0' ? 72 : 65) :
            market === '2.5_UST' ? 65 : 65,
        selectorRawProbability: 64
    })
};
const v18 = { scoreMarket: () => ({ v18Probability: 65, v18Edge: -2 }) };
const dino = {
    MODEL_VARYANTI: 'live_plus_prematch',
    '1.5_UST': 50,
    '2.5_UST': 45,
    MS1: 65
};

function makeLab(name, policy = tariff.POLICY, v25Scorer = null) {
    const tracker = new SignalTracker({ filePath: path.join(root, `${name}.json`) });
    tracker.load();
    const lab = createV24Lab({
        tracker,
        v16Model: v16,
        v18Model: v18,
        prematchSupport: (current, market) => current.preByMarket?.[market],
        prematchSource: () => 'test',
        liveSnapshot: () => ({ home: {}, away: {} }),
        v25Scorer,
        enabled: true,
        policy,
        source: name
    });
    return { tracker, lab };
}

try {
    const main = makeLab('main');
    assert.equal(main.lab.preselect(mac(1), dino, saturday), true);
    const selected = main.lab.select({ mac: mac(1), dino, capturedAt: saturday, requireEventScore: true });
    assert.equal(selected.selected.policy.branch, 'B', 'B, aynı andaki A ve MS adayından önce gelmeli.');

    const recorded = main.lab.record({ mac: mac(1), dino, capturedAt: saturday });
    assert.equal(recorded.record.tariffRuleId, 'V24-main-B');
    assert.equal(recorded.record.analysis.eventScore.status, 'approve');
    assert.equal(main.tracker.data.signals.length, 1, 'ÜST ve MS ortak tek fixture kilidini paylaşmalı.');
    assert.equal(main.lab.record({ mac: mac(1), dino, capturedAt: saturday }).record, null);

    const badEvents = mac(2, saturday, { _v23Events: [] });
    assert.equal(main.lab.record({ mac: badEvents, dino, capturedAt: saturday }).record, null,
        'Olay/skor uyumsuzluğu MS dahil bütün V24 kararını kapatmalı.');

    const sniperMac = mac(3, saturday, {
        skor: '0-0',
        _v23Events: [],
        preByMarket: { '1.5_UST': 75 },
        canli_oranlar: { '1.5_UST': { oran: 1.8, bookmaker: 'Test' } }
    });
    const sniper = main.lab.record({ mac: sniperMac, dino, capturedAt: saturday });
    assert.equal(sniper.record.matchedFilters[0], 'SNIPER');
    assert.equal(sniper.record.goalsNeeded, 2);

    const women = mac(4, saturday, { lig: 'UEFA Europa Cup - Women' });
    assert.equal(main.lab.preselect(women, dino, saturday), false);

    const guard = makeLab('guard', tariff.POLICIES.weekendGuard);
    assert.equal(guard.lab.record({ mac: mac(10), dino, capturedAt: saturday }).record.matchedFilters[0], 'B');
    assert.equal(guard.lab.record({ mac: mac(11, monday), dino, capturedAt: monday }).record, null,
        'Hafta sonu kolu hafta içinde kayıt üretmemeli.');

    const quiet = makeLab('quiet', tariff.POLICIES.weekendQuiet);
    assert.ok(quiet.lab.record({ mac: mac(20), dino, capturedAt: saturday }).record);
    assert.equal(quiet.lab.record({ mac: mac(21), dino, capturedAt: saturday }).record, null,
        'Quiet aynı league ID için aynı Türkiye gününde yalnız ilk sinyali almalı.');
    assert.ok(quiet.lab.record({
        mac: mac(22, saturday, { league_id: 901 }),
        dino,
        capturedAt: saturday
    }).record);

    const gemini = makeLab('gemini', tariff.POLICIES.geminiWeekend);
    assert.equal(gemini.lab.record({
        mac: mac(30, saturday, { lig: 'League One', league_country: 'England' }),
        dino,
        capturedAt: saturday
    }).record, null);
    assert.ok(gemini.lab.record({
        mac: mac(31, saturday, { lig: 'Premier League', league_country: 'England' }),
        dino,
        capturedAt: saturday
    }).record, 'Premier League Gemini Weekend kara listesinde değildir.');

    const selective = makeLab('selective', tariff.POLICIES.selectiveWeekend);
    const selectiveRecord = selective.lab.record({ mac: mac(40), dino, capturedAt: saturday }).record;
    assert.equal(selectiveRecord.matchedFilters[0], 'A', 'Seçici guard A kolunu B kolundan önce almalı.');
    assert.equal(selectiveRecord.market, '2.5_UST');
    for (const [fixtureId, lig, leagueCountry] of [
        [41, 'League One', 'England'],
        [42, 'League Two', 'England'],
        [43, 'Eerste Divisie', 'Netherlands'],
        [44, 'International Friendlies', 'World']
    ]) {
        assert.equal(selective.lab.record({
            mac: mac(fixtureId, saturday, { lig, league_country: leagueCountry }), dino, capturedAt: saturday
        }).record, null, `${lig} Seçici Weekend içinde kapanmalı.`);
    }
    assert.ok(selective.lab.record({
        mac: mac(45, saturday, { lig: 'Friendlies Clubs', league_country: 'World' }), dino, capturedAt: saturday
    }).record, 'Kulüp hazırlık maçı milli maç olarak yanlış sınıflanmamalı.');

    const rejectingV25 = { checkJoint: () => ({ eligible: false, reasons: ['TEST_REJECT'], score: null }) };
    const jointRejected = makeLab('joint-rejected', tariff.POLICIES.v25JointWeekend, rejectingV25);
    assert.equal(jointRejected.lab.record({ mac: mac(50), dino, capturedAt: saturday }).record, null,
        'A/B, V25 ortak onayı olmadan kaydedilmemeli.');

    const approvingV25 = { checkJoint: (input, rule) => ({
        eligible: true, reasons: [], rule,
        score: { modelVersion: 'v25-test', trainedThrough: '2026-09-25', probability: 66, rawProbability: 64, edge: -2 }
    }) };
    const joint = makeLab('joint', tariff.POLICIES.v25JointWeekend, approvingV25);
    const jointRecord = joint.lab.record({ mac: mac(51), dino, capturedAt: saturday }).record;
    assert.equal(jointRecord.matchedFilters[0], 'A');
    assert.equal(jointRecord.v25Probability, 66);
    assert.equal(jointRecord.v25Edge, -2);
    assert.equal(jointRecord.v25JointEligible, true);
    assert.ok(joint.lab.record({
        mac: mac(52, saturday, { lig: 'League Two', league_country: 'England' }), dino, capturedAt: saturday
    }).record, 'League Two ortak guardda otomatik kapanmamalı; V25 geçirebilmeli.');
    assert.ok(joint.lab.record({
        mac: mac(53, saturday, { lig: 'International Friendlies', league_country: 'World' }), dino, capturedAt: saturday
    }).record, 'Milli maç ortak guardda otomatik kapanmamalı; V25 geçirebilmeli.');
    assert.equal(joint.lab.record({
        mac: mac(54, saturday, { lig: 'League One', league_country: 'England' }), dino, capturedAt: saturday
    }).record, null, 'League One ortak guardda daima kapalı olmalı.');

    const fixture = {
        fixture: { id: 1, status: { short: 'FT' } },
        score: { fulltime: { home: 2, away: 1 } },
        goals: { home: 2, away: 1 }
    };
    assert.equal(main.tracker.settleFixture(fixture), 1);
    assert.equal(main.tracker.summary().overall.wins, 1);
    assert.equal(main.lab.metadata().maximumSignalsPerFixture, 1);
    assert.equal(main.lab.metadata().filterSummaries.SNIPER.total, 1);

    console.log('V24 Lab: global first-signal lock, event gate, Sniper and five weekend variants passed.');
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}
