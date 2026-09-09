'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { CandidateTracker } = require('./candidate_tracker');
const { SignalTracker } = require('./signal_tracker');
const { fromMac } = require('./v20_features');
const { V20Engine } = require('./v20_selector');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-v20-quality-'));
const sourcePath = path.join(__dirname, 'server.js');
const localRequire = createRequire(sourcePath);
let clock = Date.now();
class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
}
const routes = new Map();
const app = {
    use() {}, get(route, handler) { for (const p of Array.isArray(route) ? route : [route]) routes.set(p, handler); },
    post() {}, listen() {}
};
function express() { return app; }
express.static = express.json = () => () => {};
const external = {
    dotenv: { config() {} }, express, cors: () => () => {},
    axios: { create: () => ({ get() { throw new Error('Unexpected live API call'); } }) },
    'node-telegram-bot-api': class { sendMessage() { throw new Error('Unexpected Telegram call'); } },
    '@google/generative-ai': { GoogleGenerativeAI: class {} },
    child_process: { spawn() { throw new Error('Unexpected Python process'); } }
};
const context = vm.createContext({
    require: name => Object.hasOwn(external, name) ? external[name] : localRequire(name),
    __dirname: temporaryDirectory,
    process: { env: {}, platform: process.platform },
    console: { log() {}, warn() {}, error() {} },
    Date: TestDate, Buffer, URL, URLSearchParams,
    setInterval() {}, setTimeout() {}, setImmediate() {}, clearInterval() {}, clearTimeout() {}
});
vm.runInContext(fs.readFileSync(sourcePath, 'utf8') + `
globalThis.testApi = {
    enrichFixturesWithStats, tazeStatlariMacaUygula, temelStatsTam, canliVeriKalitesi,
    sinyalOncesiVerileriYenileVeDogrula, v20TazeKayitUygunMu, v20GolgeSinyaliniKaydet,
    v20TazeSonSkorDogrulaVeKaydet, v20BagimsizDenetimKayitlari, botuCalistir,
    v20ShadowTracker, candidateTracker, signalTracker, v20Engine,
    override(f) {
        if (f.apiGet) apiGet = f.apiGet;
        if (f.prepare) canliMaclariHazirla = f.prepare;
        if (f.python) yapayZekaAnaliziYap = f.python;
        if (f.evaluateLegacy) valueAnalizleriYap = f.evaluateLegacy;
        if (f.send) telegramSinyaliGonder = f.send;
        selectorV2OnAdayMi = () => false;
        golgeGucBaglamlariniTopla = async () => new Map();
        hibritGozlemAdayiniKaydet = () => null;
        labGolgeOnAdayiMi = () => false;
        tazeLabGolgeKayitlariniOlustur = () => ({});
        fixtureGonderimKaydi = () => null;
        geminiYorumuYaz = async () => 'offline';
        sinyalOncesiCanlilikDogrula = async () => true;
    }
};`, context, { filename: sourcePath });
const api = context.testApi;
let completed = 0;
const clone = value => JSON.parse(JSON.stringify(value));

function teamStats(id, name, shots, sot, corners, optional = true) {
    const statistics = [
        { type: 'Total Shots', value: shots }, { type: 'Shots on Goal', value: sot },
        { type: 'Corner Kicks', value: corners }
    ];
    if (optional) statistics.push({ type: 'Ball Possession', value: '55%' }, { type: 'expected_goals', value: 1.2 });
    return { team: { id, name }, statistics };
}
function fixture(id, optional = true) {
    return {
        fixture: { id, status: { elapsed: 55, short: '2H', long: 'Second Half' } },
        teams: { home: { id: 101, name: 'Home FC' }, away: { id: 202, name: 'Away FC' } },
        league: { id: 9, name: 'Offline League', season: 2026 }, goals: { home: 0, away: 0 },
        statistics: [teamStats(101, 'Home FC', 10, 4, 4, optional), teamStats(202, 'Away FC', 8, 2, 3, optional)]
    };
}
function match(id) {
    const mac = api.enrichFixturesWithStats([fixture(id)])[0];
    mac.canli_oranlar = { MS1: { oran: 2, bookmaker: 'Offline' } };
    mac.observation_completed_at = new Date(clock).toISOString();
    return mac;
}
function score(mac, at = mac.observation_completed_at, probability = 80) {
    const odds = Number(mac.canli_oranlar.MS1.oran);
    const selected = { market: 'MS1', odds, probability, edgeRaw: probability - 100 / odds, ev: probability / 100 * odds - 1, eligible: true };
    return { available: true, modelVersion: 'offline-v20', scores: [selected], selected, snapshot: fromMac(mac, at, mac._selectorShadowContext || null) };
}
function provider(id, { finalChange, optional = false, freshOdds = 2, freshStatistics, failFinal = false } = {}) {
    let fixturesRead = 0;
    const calls = [];
    api.override({ apiGet: async (url, options) => {
        calls.push({ url, options });
        clock += 10;
        if (url === `/fixtures?id=${id}`) {
            fixturesRead++;
            if (fixturesRead > 1 && failFinal) throw new Error('offline final fixture failure');
            const f = fixture(id, optional);
            if (fixturesRead > 1 && finalChange) finalChange(f);
            return { data: { response: [f] } };
        }
        if (url === `/fixtures/statistics?fixture=${id}`) return { data: { response: freshStatistics || fixture(id, optional).statistics } };
        if (url === '/odds/live') return { data: { response: [{ fixture: { id }, odds: [{ name: 'Match Winner', values: [{ value: 'Home', odd: freshOdds }] }] }] } };
        throw new Error(`Unexpected offline request: ${url}`);
    } });
    return calls;
}
async function fresh(id, options) {
    const mac = match(id);
    const calls = provider(id, options);
    const validation = await api.sinyalOncesiVerileriYenileVeDogrula(mac);
    assert.equal(validation.ok, true, validation.reason);
    return { mac, calls, evaluation: score(mac), capturedAt: validation.verifiedAt };
}
async function test(name, run) {
    await run();
    completed++;
    console.log(`ok ${completed} - ${name}`);
}

(async () => {
    await test('team identity survives reversed order; ambiguous, unknown and conflicting IDs fail closed', () => {
        const f = fixture(91001);
        f.statistics.reverse();
        const mapped = api.enrichFixturesWithStats([f])[0];
        assert.equal(mapped.home_shot, 10);
        assert.equal(mapped.away_shot, 8);
        assert.equal(mapped.stats_identity_verified, true);
        for (const mutate of [
            f => { f.statistics.forEach(s => { s.team = {}; }); },
            f => { f.statistics.push(clone(f.statistics[0])); },
            f => { f.statistics[0].team.id = 999; }
        ]) {
            const bad = fixture(91002); mutate(bad);
            const row = api.enrichFixturesWithStats([bad])[0];
            assert.equal(row.stats_identity_verified, false);
            assert.equal(api.temelStatsTam(row), false);
        }
        const namesOnly = fixture(91003);
        namesOnly.statistics.forEach(s => { delete s.team.id; });
        assert.equal(api.enrichFixturesWithStats([namesOnly])[0].stats_identity_verified, true);
    });

    await test('fresh response overwrites missing optional stats with null and captures source times/odds', async () => {
        const { mac, calls } = await fresh(91004, { freshOdds: 1.8 });
        assert.equal(mac.home_xg, null);
        assert.equal(mac.away_possession, null);
        assert.equal(mac.canli_oranlar.MS1.oran, 1.8);
        const quality = api.canliVeriKalitesi(mac);
        assert.equal(quality.optionalObserved.home_xg, false);
        assert.equal(quality.teamMapping.identityVerified, true);
        assert.equal(quality.observationDurationMs, 30);
        assert.equal(quality.liveSourceSkewMs, 20);
        assert.equal(calls.length, 3);
    });

    await test('fresh cumulative regression is rejected before fetching odds', async () => {
        const mac = match(91005);
        const stats = fixture(91005).statistics;
        stats[0].statistics[0].value = 9;
        const calls = provider(91005, { freshStatistics: stats });
        const validation = await api.sinyalOncesiVerileriYenileVeDogrula(mac);
        assert.equal(validation.ok, false);
        assert.match(validation.reason, /azaldı/);
        assert.equal(calls.length, 2);
    });

    await test('V20 needs the final fixture poll, records once, and persists independently after restart', async () => {
        const data = await fresh(91006);
        assert.equal(api.v20GolgeSinyaliniKaydet(data), null);
        const record = await api.v20TazeSonSkorDogrulaVeKaydet(data);
        assert.ok(record);
        assert.equal(record.statsValidation.v20FinalFixture.status, 'passed');
        assert.equal(record.telegramMessageId, null);
        assert.equal(record.dinoProbability, null);
        assert.equal(record.decisionProbability, 80);
        assert.equal(api.signalTracker.data.signals.length, 0);
        assert.equal(api.v20GolgeSinyaliniKaydet(data).signalId, record.signalId);
        assert.equal(api.v20ShadowTracker.data.signals.length, 1);
        const restarted = new SignalTracker({ filePath: api.v20ShadowTracker.filePath });
        restarted.load();
        assert.equal(restarted.hasSignal(91006, 'strong'), true);
        assert.ok(fs.existsSync(path.join(temporaryDirectory, 'dino_v20_shadow_history.json')));
    });

    await test('missing validation, identity, stale acquisition, skew, changed snapshot, closed odds and ALT cannot record', async () => {
        const original = await fresh(91007);
        for (const mutate of [
            d => { d.mac.stats_validation.status = 'failed'; },
            d => { d.mac.stats_validation.liveOddsRefreshed = false; },
            d => { d.mac.stats_identity_verified = false; },
            d => { d.mac.stats_received_at = null; },
            d => { d.mac.observation_started_at = new Date(clock - 31000).toISOString(); },
            d => { d.mac.observation_started_at = new Date(clock - 25000).toISOString(); d.mac.fixture_request_started_at = d.mac.observation_started_at; d.mac.fixture_received_at = d.mac.observation_started_at; },
            d => { d.mac.home_sot = 5; },
            d => { d.mac.canli_oranlar.MS1.oran = 1.2; },
            d => { d.evaluation.selected.market = '2.5_ALT'; },
            d => { d.mac.status_short = 'FT'; }
        ]) {
            const data = clone(original); mutate(data);
            assert.equal(api.v20TazeKayitUygunMu(data.mac, data.evaluation, data.capturedAt, false), false);
            assert.equal(await api.v20TazeSonSkorDogrulaVeKaydet(data), null);
        }
    });

    await test('score/status/team changes and an unavailable final fixture reject only V20', async () => {
        let id = 91008;
        for (const options of [
            { finalChange: f => { f.goals.home = 1; } },
            { finalChange: f => { f.fixture.status.short = 'FT'; } },
            { finalChange: f => { f.teams.home.id = 999; } },
            { failFinal: true }
        ]) {
            const data = await fresh(id++, options);
            assert.equal(await api.v20TazeSonSkorDogrulaVeKaydet(data), null);
            assert.equal(data.mac.stats_validation.status, 'passed', 'V20 guard must not change legacy validation');
        }
    });

    await test('V20 persistence failure is contained', async () => {
        const data = await fresh(91012);
        const originalRecord = api.v20ShadowTracker.recordSent;
        api.v20ShadowTracker.recordSent = () => { throw new Error('offline disk full'); };
        try { assert.equal(await api.v20TazeSonSkorDogrulaVeKaydet(data), null); }
        finally { api.v20ShadowTracker.recordSent = originalRecord; }
    });

    await test('actual V20 artifact scores are independent of Dino/V16/V18 probability fields', () => {
        const raw = match(91013);
        const altered = clone(raw);
        Object.assign(altered, {
            dinoProbability: 99, selectorV2Probability: 0, v18Probability: 100,
            probability: 100, edge: 999, MODEL_VARYANTI: 'score_only',
            MS1: 100, MS2: 0, LIVE_ONLY: { MS1: 99, MS2: 1 }
        });
        const first = new V20Engine().evaluate(raw, null, raw.observation_completed_at);
        const second = new V20Engine().evaluate(altered, null, raw.observation_completed_at);
        assert.equal(first.available, true);
        assert.deepEqual(second.scores, first.scores);
        assert.deepEqual(second.selected, first.selected);
    });

    await test('V20 runs after missing/misaligned/throwing legacy batches and retains initial + fresh training rows', async () => {
        let id = 91020;
        for (const python of [async () => [], async () => null, async () => { throw new Error('offline Python failure'); }]) {
            const mac = match(id);
            provider(id);
            let sends = 0;
            api.v20Engine.evaluate = (m, c, at) => score(m, at);
            api.override({ prepare: async () => [mac], python, send: async () => { sends++; return true; } });
            await api.botuCalistir();
            assert.equal(api.v20ShadowTracker.hasSignal(id, 'strong'), true);
            assert.equal(sends, 0);
            const rows = api.candidateTracker.data.records.filter(r => r.fixtureId === id);
            assert.equal(rows.length, 2);
            assert.equal(rows[0].decision, 'model_error');
            assert.equal(rows[1].decision, 'v20_fresh_shadow');
            assert.ok(rows.every(r => r.market === 'MS1' && r.dinoProbability == null));
            id++;
        }
    });

    await test('V20-only refresh cannot add a V19 send when legacy changes its mind on fresh data', async () => {
        const id = 91025;
        const mac = match(id);
        provider(id);
        let evaluations = 0, sends = 0;
        api.override({
            prepare: async () => [mac], python: async rows => rows.map(() => ({ MODEL_VARYANTI: 'live_only', MS1: 10 })),
            evaluateLegacy: (m, d, options) => {
                evaluations++;
                const rows = api.v20BagimsizDenetimKayitlari({ mac: m, evaluation: score(m), scanId: options.scanId, decision: 'legacy_rejected' });
                return { auditRecords: rows, selections: evaluations === 1 ? [] : [{ market: 'MS1', sinyal_turu: 'strong', auditRecord: rows[0] }] };
            },
            send: async () => { sends++; return true; }
        });
        await api.botuCalistir();
        assert.equal(evaluations, 2);
        assert.equal(api.v20ShadowTracker.hasSignal(id, 'strong'), true);
        assert.equal(sends, 0);
    });

    await test('a V20-only final-check rejection does not suppress an already eligible V19 branch', async () => {
        const id = 91026;
        const mac = match(id);
        provider(id, { finalChange: f => { f.goals.home = 1; } });
        let sends = 0;
        api.override({
            prepare: async () => [mac], python: async rows => rows.map(() => ({ MODEL_VARYANTI: 'live_only', MS1: 80 })),
            evaluateLegacy: (m, d, options) => {
                const rows = api.v20BagimsizDenetimKayitlari({ mac: m, evaluation: score(m), scanId: options.scanId, decision: 'legacy_eligible' });
                return { auditRecords: rows, selections: [{ market: 'MS1', sinyal_turu: 'strong', auditRecord: rows[0] }] };
            },
            send: async () => { sends++; return true; }
        });
        await api.botuCalistir();
        assert.equal(api.v20ShadowTracker.hasSignal(id, 'strong'), false);
        assert.equal(sends, 1, 'Legacy still reaches its own mocked final check and send');
    });

    await test('daily archive keeps all moments/context beyond ring cap and appends settlements', () => {
        const dir = path.join(temporaryDirectory, 'archive-check');
        const tracker = new CandidateTracker({ filePath: path.join(dir, 'history.json'), maxRecords: 1000, snapshotArchiveDirectory: path.join(dir, 'daily') });
        const at = '2026-09-08T21:30:00.000Z';
        const records = Array.from({ length: 1001 }, (_, i) => ({
            recordId: `record-${i}`, scanId: `scan-${i}`, capturedAt: at,
            fixtureId: 99001, market: 'MS1', odds: 2, statsComplete: true,
            liveStats: { home: { shots: i }, away: {} },
            shadowContext: { marker: i }, snapshotContext: { liveOdds: { MS1: { oran: 2 } }, dataQuality: { observationCompletedAt: at } }
        }));
        assert.equal(tracker.recordBatch(records), 1001);
        assert.equal(tracker.data.records.length, 1000);
        const file = path.join(dir, 'daily', 'v20-training-2026-09-09.jsonl');
        const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
        assert.equal(lines.length, 1001);
        assert.equal(lines[0].shadowContext.marker, 0);
        assert.equal(lines[1000].shadowContext.marker, 1000);
        const before = fs.readFileSync(file, 'utf8');
        const final = fixture(99001); final.fixture.status.short = 'FT'; final.goals = { home: 1, away: 0 };
        assert.equal(tracker.settleFixture(final), 1000);
        assert.ok(fs.readFileSync(file, 'utf8').startsWith(before));
        const allRows = fs.readdirSync(path.join(dir, 'daily')).flatMap(name => fs.readFileSync(path.join(dir, 'daily', name), 'utf8').trim().split('\n').map(JSON.parse));
        assert.equal(allRows.filter(r => r.recordType === 'settlement').length, 1);
        tracker.settleFixture(final);
        assert.equal(fs.readFileSync(file, 'utf8').startsWith(before), true);
    });

    console.log(`V20 data quality and backend behavior: ${completed} checks passed; no live API, Python or Telegram calls.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    assert.equal(path.dirname(temporaryDirectory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporaryDirectory).startsWith('dino-v20-quality-'));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});
