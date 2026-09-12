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
        DINO_CORE_SHADOW_ENABLED: 'false', DINO_LEGACY_V17_SHADOW_ENABLED: 'false', DINO_V20_SHADOW_ENABLED: 'false' }, platform: process.platform },
    console: { log() {}, warn() {}, error() {} }, Date, Buffer, URL, URLSearchParams,
    setInterval() {}, setTimeout() {}, setImmediate() {}, clearInterval() {}, clearTimeout() {}
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8') + `
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
    assert.equal(api.v21ShadowTracker.findSignal(101, 'strong').market, '3.5_ALT');
    assert.equal(deliveries.length, 0, 'V21-only ALT must never send Telegram');
    assert.equal(api.signalTracker.data.signals.length, 0);

    match = mac(102, '2.5_UST', 60);
    api.setup(match, dino('2.5_UST'), dino('2.5_UST', 40));
    await api.botuCalistir();
    // Dino loses one vote, but V16+V18 still approve: the 2-of-3 policy passes.
    assert.equal(api.v21ShadowTracker.hasSignal(102, 'strong'), true);
    match = mac(103, '3.5_ALT', 60);
    api.setup(match, dino('3.5_ALT'), dino('3.5_ALT', 40));
    await api.botuCalistir();
    assert.equal(api.v21ShadowTracker.hasSignal(103, 'strong'), false, 'Fresh policy failure must block the initially eligible ALT');
    match = mac(104, '3.5_ALT', 60);
    api.setup(match, dino('3.5_ALT'), dino('3.5_ALT'), false);
    await api.botuCalistir();
    assert.equal(api.v21ShadowTracker.hasSignal(104, 'strong'), false, 'Fresh validation failure must block recording');

    match = mac(105, 'MS1', 30);
    api.setup(match, dino('MS1', 55), dino('MS1', 55));
    await api.botuCalistir();
    assert.equal(api.v19ShadowTracker.findSignal(105, 'strong').market, 'MS1');
    assert.equal(deliveries.length, 0, 'V19 all-market lab is not an active 1X2 route');

    match = mac(106, '2.5_UST', 30);
    api.setup(match, dino('2.5_UST', 55), dino('2.5_UST', 55));
    await api.botuCalistir();
    assert.equal(deliveries.length, 1, 'Overlapping V19/V17 must send exactly once');
    const sent = api.signalTracker.findSignal(106, 'strong');
    assert.deepEqual(Array.from(sent.signalSources), ['V19', 'Legacy V17']);
    assert.equal(sent.prematchMarketSupport, 65);
    await api.botuCalistir();
    assert.equal(deliveries.length, 1, 'Second scan must respect the shared fixture lock');
    const candidate = api.valueAnalizleriYap(mac(107, '2.5_UST', 30), dino('2.5_UST', 55)).selections[0];
    assert.ok(candidate);
    assert.equal(await api.telegramSinyaliGonder(mac(107, 'MS1', 30), { ...candidate, market: 'MS1' }, 'offline'), false, 'Final send guard must reject wrong family even if called directly');
    assert.equal(deliveries.length, 1);

    // Shared exports always contain real (mock-delivered here) Telegram sends,
    // even if an old client still supplies the former lab scope parameter.
    let sharedExport;
    routes.get('/api/signal-history/export')({ query: { scope: 'test-lab' } }, {
        setHeader() {}, send(value) { sharedExport = JSON.parse(value); }
    });
    assert.equal(sharedExport.signals.length, 1);
    assert.equal(sharedExport.signals[0].fixtureId, 106);

    for (const slug of ['v19-independent-shadow', 'v21-consensus-shadow']) {
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
    console.log('V21 server scan/fresh recheck, V19 lab isolation, Telegram union+dedup, final family guard and exports passed (offline).');
})().catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => fs.rmSync(root, { recursive: true, force: true }));
