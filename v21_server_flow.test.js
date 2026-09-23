'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-v21-flow-'));
const localRequire = createRequire(path.join(__dirname, 'server.js'));
const routes = new Map();
const app = { use() {}, get(route, handler) { for (const item of [].concat(route)) routes.set(item, handler); }, post() {}, listen() {} };
function express() { return app; }
express.static = express.json = () => () => {};
const deliveries = [];
const score16 = { MODEL: { version: 'offline16', policy: { defaultMinimumOdd: 1.5 } }, scoreMarket: () => ({ selectorProbability: 57, selectorRawProbability: 57 }), policyCheck: () => ({ eligible: true }) };
const score18 = { MODEL: { version: 'offline18' }, scoreMarket: (mac, market) => market.endsWith('_ALT') ? null : ({ v18Probability: 60, v18Edge: 5 }) };
const external = {
    dotenv: { config() {} }, express, cors: () => () => {},
    axios: { create: () => ({ get() { throw Error('Live network forbidden'); } }) },
    'node-telegram-bot-api': class { async sendMessage(channel, text) { deliveries.push({ channel, text }); return { message_id: deliveries.length }; } },
    '@google/generative-ai': { GoogleGenerativeAI: class {} },
    child_process: { spawn() { throw Error('Live Python forbidden'); } },
    './dino_selector_v2': score16, './dino_selector_v18': score18
};
const context = vm.createContext({
    require: name => Object.hasOwn(external, name) ? external[name] : localRequire(name),
    __dirname: root, process: { env: { TELEGRAM_BOT_TOKEN: 'offline', TELEGRAM_CHANNEL_ID: 'offline',
        MAC_YAKALA_V21_TELEGRAM_ENABLED: 'true', DINO_CORE_SHADOW_ENABLED: 'false', DINO_LEGACY_V17_SHADOW_ENABLED: 'false', DINO_V20_SHADOW_ENABLED: 'false' }, platform: process.platform },
    console: { log() {}, warn() {}, error() {} }, Date, Buffer, URL, URLSearchParams,
    setInterval() {}, setTimeout() {}, setImmediate() {}, clearInterval() {}, clearTimeout() {}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8') + `
// This fixture explicitly tests all cohort records, including fixed dates below.
// Do not let the wall-clock startup time silently exclude those fixture records.
for (const tracker of [coreShadowTracker, legacyV17ShadowTracker, v20ShadowTracker]) {
    tracker.data.startedAt = '1970-01-01T00:00:00.000Z';
}
globalThis.api = { botuCalistir, valueAnalizleriYap, telegramSinyaliGonder, signalTracker, v19ShadowTracker, v21ShadowTracker,
    setup(mac, initial, fresh, valid = true) {
        let pythonCalls = 0;
        canliMaclariHazirla = async () => [mac];
        hazirMacHalaUygunMu = () => true;
        temelStatsTam = () => true;
        golgeGucBaglamlariniTopla = async () => new Map();
        yapayZekaAnaliziYap = async () => [pythonCalls++ ? fresh : initial];
        sinyalOncesiVerileriYenileVeDogrula = async () => {
            mac.stats_validation = { status: valid ? 'passed' : 'failed', verifiedAt: new Date().toISOString() };
            return { ok: valid, verifiedAt: mac.stats_validation.verifiedAt, validation: mac.stats_validation };
        };
        sinyalOncesiCanlilikDogrula = async () => true;
        geminiYorumuYaz = async () => 'offline';
    }
};`, context);
const api = context.api;
const dino = (market, probability = 54) => ({ [market]: probability, MODEL_VARYANTI: 'live_plus_prematch' });
const mac = (fixture_id, market, minute) => ({ fixture_id, mac_isim: 'Offline A - Offline B', lig: 'Fixture only',
    dakika: minute, skor: '0-0', status_short: minute > 45 ? '2H' : '1H',
    canli_oranlar: { [market]: { oran: 1.8, bookmaker: 'Offline' } },
    prematch_totals: { '2.5': { over: .65, under: .35 }, '3.5': { over: .35, under: .65 } }, prematch_p_home: .6 });

(async () => {
    let match = mac(101, '3.5_ALT', 60);
    api.setup(match, dino('3.5_ALT'), dino('3.5_ALT'));
    await api.botuCalistir();
    assert.equal(api.v21ShadowTracker.hasSignal(101, 'strong'), false, 'ALT excluded from new V21');
    assert.equal(deliveries.length, 0, 'ALT must never send Telegram');
    assert.equal(api.signalTracker.data.signals.length, 0);

    match = mac(108, '2.5_UST', 60);
    api.setup(match, dino('2.5_UST'), dino('2.5_UST'));
    await api.botuCalistir();
    assert.equal(api.v21ShadowTracker.findSignal(108, 'strong').voteCount, 3);
    assert.equal(api.v21ShadowTracker.findSignal(108, 'strong').tariffRuleId, 'V21-3OF3-PRE50-EM5-E0');
    assert.equal(deliveries.length, 1, 'V21-only OVER sends independently and stays in lab');

    match = mac(102, '2.5_UST', 60);
    api.setup(match, dino('2.5_UST'), dino('2.5_UST', 40));
    await api.botuCalistir();
    assert.equal(api.v21ShadowTracker.hasSignal(102, 'strong'), false, 'Fresh 2-of-3 cannot pass the new 3-of-3 rule');
    match = mac(103, '3.5_ALT', 60);
    api.setup(match, dino('3.5_ALT'), dino('3.5_ALT', 40));
    await api.botuCalistir();
    assert.equal(api.v21ShadowTracker.hasSignal(103, 'strong'), false, 'Fresh policy failure must block the initially eligible ALT');
    match = mac(104, '2.5_UST', 60);
    api.setup(match, dino('2.5_UST'), dino('2.5_UST'), false);
    await api.botuCalistir();
    assert.equal(api.v21ShadowTracker.hasSignal(104, 'strong'), false, 'Fresh validation failure must block recording');
    for (const [id, freshProbability] of [[109, 55.7], [110, 50.4]]) {
        match = mac(id, '2.5_UST', 60);
        api.setup(match, dino('2.5_UST'), dino('2.5_UST', freshProbability));
        await api.botuCalistir();
        assert.equal(api.v21ShadowTracker.hasSignal(id, 'strong'), false, 'Fresh EDGE outside -5/0 blocks initial approval');
    }

    match = mac(105, 'MS1', 30);
    api.setup(match, dino('MS1', 55), dino('MS1', 55));
    await api.botuCalistir();
    assert.equal(api.v19ShadowTracker.findSignal(105, 'strong'), null, 'Retired V19 has no lab work');
    assert.equal(deliveries.length, 1, 'V19 1X2 remains retired');

    match = mac(106, '2.5_UST', 30);
    api.setup(match, dino('2.5_UST', 55), dino('2.5_UST', 55));
    await api.botuCalistir();
    assert.equal(deliveries.length, 2, 'New V21 signal sends without V19/V17');
    const sent = api.signalTracker.findSignal(106, 'strong');
    assert.deepEqual(Array.from(sent.signalSources), ['V21']);
    assert.equal(sent.prematchMarketSupport, 65);
    await api.botuCalistir();
    assert.equal(deliveries.length, 2, 'Second scan respects V21 source lock');
    const candidate = { market: '2.5_UST', tarife_yuvasi: 'primary' };
    assert.ok(candidate);
    assert.equal(await api.telegramSinyaliGonder(mac(107, 'MS1', 30), { ...candidate, market: 'MS1' }, 'offline'), false, 'Final send guard must reject wrong family even if called directly');
    assert.equal(deliveries.length, 2);

    // Shared exports always contain real (mock-delivered here) Telegram sends,
    // even if an old client still supplies the former lab scope parameter.
    let sharedExport;
    routes.get('/api/signal-history/export')({ query: { scope: 'test-lab' } }, {
        setHeader() {}, send(value) { sharedExport = JSON.parse(value); }
    });
    assert.equal(sharedExport.signals.length, 2);
    assert.equal(sharedExport.signals[0].fixtureId, 106);

    for (const slug of ['v21-consensus-shadow']) {
        let body;
        const response = { setHeader() {}, send(value) { body = value; }, status() { return this; }, json(value) { body = value; } };
        routes.get(`/api/${slug}-history/export`)({ query: {} }, response);
        assert.equal(JSON.parse(body).telegram, false);
        routes.get(`/api/${slug}-history/export.csv`)({ query: {} }, response);
        assert.match(body, /prematch_market_support/);
        assert.match(body, /vote_count/);
        const lines = body.trim().split('\n');
        assert.ok(lines.length > 1);
        assert.equal(lines[0].split(',').length, lines[1].split(',').length, 'CSV columns must align');
    }

    // Old and new rules on the SAME calendar day must not mix in summary/list/export.
    const policy = localRequire('./v21_tariff');
    const oldVersion = localRequire('./v21_history').LEGACY_VERSION;
    const archived = api.v21ShadowTracker.recordSent({ fixtureId: 901, signalType: 'strong',
        sentAt: '2026-09-13T00:00:00Z', market: '3.5_ALT', odds: 1.8, tariffVersion: oldVersion });
    api.v21ShadowTracker.recordSent({ fixtureId: 902, signalType: 'strong',
        sentAt: '2026-09-13T00:01:00Z', market: '2.5_UST', odds: 1.8, tariffVersion: policy.VERSION });
    function get(route, query={}) {
        let body, headers={};
        routes.get(route)({query},{json(v){body=v;},send(v){body=v;},setHeader(k,v){headers[k]=v;},status(){return this;}});
        return { body, headers };
    }
    const historyPath='/api/v21-consensus-shadow-history';
    const current = JSON.parse(get(historyPath+'/export').body);
    assert(current.signals.every(s=>s.tariffVersion===policy.VERSION));
    assert(!current.signals.some(s=>s.fixtureId===901));
    assert.equal(current.rules.minimumVotes,3);
    const previous = get(historyPath+'/export',{cohort:'previous'});
    const oldExport=JSON.parse(previous.body);
    assert.equal(oldExport.signals.length,1);
    assert.equal(oldExport.signals[0].signalId,archived.signalId);
    assert.equal(oldExport.rules.minimumVotes,2);
    assert.equal(oldExport.tariffVersion,oldVersion);
    assert.equal(oldExport.summary.overall.total,1);
    assert.match(previous.headers['Content-Disposition'],/-previous-/);
    for(const cohort of ['current','previous']) {
        const dated=get(historyPath,{date:'2026-09-13',cohort}).body;
        assert(dated.signals.every(s=>cohort==='current'?s.tariffVersion===policy.VERSION:s.tariffVersion!==policy.VERSION));
        const csv=get(historyPath+'/export.csv',{cohort}).body;
        assert.equal(csv.includes(oldVersion),cohort==='previous');
    }
    const comparison=get('/api/test-lab-comparison').body.v21Shadow;
    assert(comparison.signals.every(s=>s.tariffVersion===policy.VERSION));
    assert.equal(comparison.archivedRecords,1);
    assert.equal(comparison.summary.overall.total,current.signals.length);
    const status=get('/api/status').body.testLabTracking.v21Shadow;
    assert.equal(status.summary.overall.total,current.signals.length);
    assert.equal(api.v21ShadowTracker.hasSignal(901,'strong'),true,'Reporting filters do not erase fixture locks');
    assert.equal(api.v21ShadowTracker.data.signals.find(s=>s.fixtureId===901).tariffVersion,oldVersion);
    console.log('V21 server scan/fresh recheck, V19 retirement, independent Telegram+dedup, final family guard and exports passed (offline).');
})().catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => fs.rmSync(root, { recursive: true, force: true }));
