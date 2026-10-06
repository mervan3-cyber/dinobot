'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const tariff = require('./v24_tariff');
const { createV24Lab } = require('./v24_lab');
const { createV24Router } = require('./v24_telegram_router');

const at = '2026-10-06T12:00:00.000Z';
const check = extra => tariff.winnerCheck({
    market: 'MS2', score: '0-1', minute: 30, odds: 1.6,
    v16Probability: 65, prematchSupport: 36, eventScoreStatus: 'approve', ...extra
});
assert.equal(tariff.POLICY.leadingWinner.prematchMinimum, 36);
assert.equal(check().eligible, true);
assert.equal(check().thresholds.prematch, 36);
for (const value of [35.999, null, undefined, '', false, true, NaN, Infinity, -1, 101, .36]) {
    const result = check({ prematchSupport: value });
    assert.equal(result.eligible, false, `Bad/missing/below-36 support must fail: ${value}`);
    assert(result.reasons.includes('PREMATCH_BELOW_MS_MINIMUM'));
}
for (const value of [36, '36', 40, 100]) assert(check({ prematchSupport: value }).eligible);
const preselectArgs = { market: 'MS2', score: '0-1', minute: 30, odds: 1.6, prematchSupport: 35 };
assert.equal(tariff.winnerCheck(preselectArgs, { requireEventScore: false, skipModelThresholds: true }).eligible, false);
assert.equal(tariff.winnerCheck({ ...preselectArgs, prematchSupport: 36 }, { requireEventScore: false, skipModelThresholds: true }).eligible, true);
for (const minute of [25, 44]) assert(check({ minute }).eligible);
for (const extra of [{ minute: 24 }, { minute: 45 }, { odds: 1.499 }, { odds: 2.501 },
    { odds: 1.75, v16Probability: 59.999 }, { v16Probability: 67.6 }, { v16Probability: 62.4 },
    { score: '1-1' }, { market: 'MS1' }, { eventScoreStatus: 'reject' }, { eventScoreStatus: 'insufficient' }]) {
    assert.equal(check(extra).eligible, false, 'Existing MS gates retained: ' + JSON.stringify(extra));
}
for (const probability of [62.5, 67.5]) assert(check({ v16Probability: probability }).eligible, 'Existing edge boundaries are inclusive');
assert(check({ market: 'MS1', score: '1-0' }).eligible);
for (const policy of [tariff.POLICIES.weekendQuiet, tariff.POLICIES.geminiWeekend]) {
    assert.equal(policy.leadingWinner.prematchMinimum, null, 'Comparison LAB policy unchanged');
    assert(tariff.winnerCheck({ ...preselectArgs, v16Probability: 65, eventScoreStatus: 'approve' }, { policy }).eligible);
}

const tracker = { data: { signals: [] }, recordSent(payload) { this.data.signals.push(payload); return payload; } };
const support = (mac, market) => mac.pre[market];
const common = {
    tracker, v16Model: { MODEL: { version: 'offline' }, scoreMarket: () => ({ selectorProbability: 65 }) },
    v18Model: { scoreMarket: () => ({ v18Probability: 70 }) },
    prematchSupport: support, prematchSource: () => 'offline', liveSnapshot: () => ({})
};
function match(id, score = '0-1', pre = 36) {
    const market = score === '0-1' ? 'MS2' : 'MS1';
    return {
        fixture_id: id, mac_isim: 'Home W - Away W', lig: 'Women League',
        home_team_id: 10, away_team_id: 20, skor: score, dakika: 30,
        canli_oranlar: { [market]: { oran: 1.6 } }, pre: { [market]: pre, [market === 'MS1' ? 'MS2' : 'MS1']: 99 },
        stats_validation: { status: 'passed', verifiedAt: at }, _v23EventsAt: at,
        _v23Events: [{ type: 'Goal', detail: 'Normal Goal', team: { id: score === '0-1' ? 20 : 10 },
            player: { id: 1 }, time: { elapsed: 12 } }]
    };
}
const dino = { MODEL_VARYANTI: 'live_plus_prematch', MS1: 54, MS2: 54 };
const lab = createV24Lab(common);
for (const score of ['1-0', '0-1']) {
    for (const pre of [35.999, null, undefined]) {
        const mac = match(1, score, pre);
        if (pre === undefined) delete mac.pre[tariff.leadingWinnerMarket(score)];
        assert.equal(lab.preselect(mac, dino, at), false);
        assert.equal(lab.select({ mac, dino, capturedAt: at }).selected, null);
        assert.equal(lab.record({ mac, dino, capturedAt: at }).record, null);
    }
    const mac = match(score === '1-0' ? 2 : 3, score);
    assert(lab.preselect(mac, dino, at));
    const choice = lab.select({ mac, dino, capturedAt: at });
    assert.equal(choice.selected.args.prematchSupport, 36);
    const signal = lab.record({ mac, dino, capturedAt: at }).record;
    assert(signal); assert.equal(signal.prematchMarketSupport, 36); assert.equal(signal.analysis.thresholds.prematch, 36);
    assert.equal(lab.preselect(mac, dino, at), false, 'First accepted LAB signal locks fixture');
}
assert.equal(tracker.data.signals.length, 2, 'Rejected snapshots never lock a fixture');

const delivery = {
    disabled: false, data: { v24ActivatedAt: '2026-10-05T00:00:00Z', entries: [] },
    tracker: { data: { signals: [] } }, hasFixture: () => false
};
const router = createV24Router({ ...common, delivery, channel: 'offline', now: () => Date.parse(at) });
for (const score of ['1-0', '0-1']) {
    const mac = match(10, score, 40), market = tariff.leadingWinnerMarket(score);
    const group = router.select({ mac, dino, capturedAt: at })[0]; assert(group);
    for (const current of [35.999, null, undefined]) {
        mac.pre[market] = current;
        assert.equal(router.record(mac, group, 'Offline test', at), null, 'Final check uses current selected-side prematch');
    }
    mac.pre[market] = 36;
    const payload = router.record(mac, group, 'Offline test', at); assert(payload);
    assert.equal(payload.prematchMarketSupport, 36); assert.equal(payload.entryAudit.thresholds.prematch, 36);
    assert.equal(group.choices[0].args.prematchSupport, 40, 'Initial input not rewritten');
    assert.equal(payload.sourcePolicies.V24.version, tariff.VERSION);
    const initialLow = match(11, score, 35); assert.equal(router.preselect(initialLow, dino), false);
    assert.deepEqual(router.select({ mac: initialLow, dino, capturedAt: at }), []);
    delivery.tracker.data.signals.push({ fixtureId: 10 });
    assert.equal(router.record(mac, group, 'Offline test', at), null, 'Shared first-signal lock retained');
    delivery.tracker.data.signals.length = 0;
}
const zeroOver = tariff.overCheck({ market: '0.5_UST', score: '0-0', minute: 30, odds: 1.6,
    dinoProbability: 60, v16Probability: 100, v18Probability: 100, prematchSupport: 100, eventScoreStatus: 'approve' });
assert.equal(zeroOver.eligible, false, '0.5 UST remains disabled');

const html = fs.readFileSync('public/index.html', 'utf8');
assert.equal(html, fs.readFileSync('index.html', 'utf8'));
assert(html.includes('Pre ≥ %36')); assert(html.includes('MS 25–44 ve pre ≥ %36'));
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
const numberFunction = html.slice(html.indexOf('        function testLabNumber('), html.indexOf('        function testLabEdge('));
const rowFunction = html.slice(html.indexOf('        function renderV24Rows('), html.indexOf('        function setTestLabModeBadge('));
class Element { constructor() { this.children = []; this.textContent = ''; this.style = {}; }
    replaceChildren() { this.children = []; }
    appendChild(node) { this.children.push(node); } }
const body = new Element();
const ctx = vm.createContext({ document: { getElementById: () => body, createElement: () => new Element() },
    formatDateTime: () => at, formatHistoryDateLabel: x => x, formatPercent: x => x === null ? '-' : '%' + x,
    testLabEdge: () => '%2.5', marketDisplayName: x => x,
    signalResultInfo: () => ({ className: 'pending', text: 'Bekliyor' }) });
vm.runInContext(numberFunction + rowFunction, ctx);
const signal = { signalType: 'surprise', market: 'MS2', prematchMarketSupport: 36, odds: 1.6,
    v16Edge: 2.5, selectorV2Probability: 65, analysis: { thresholds: { prematch: 36 } } };
ctx.renderV24Rows('offline', [signal], null);
assert.equal(body.children[0].children[10].textContent, '%36 · min %36');
ctx.renderV24Rows('offline', [{ ...signal, analysis: { thresholds: { prematch: null } } }], null);
assert.equal(body.children.at(-1).children[10].textContent, '%36 · yalnız veri', 'Comparison/old entries do not acquire a retroactive gate');
ctx.renderV24Rows('offline', [{ ...signal, analysis: undefined }], null);
assert.equal(body.children.at(-1).children[10].textContent, '%36 · yalnız veri');
ctx.renderV24Rows('offline', [{ ...signal, signalType: 'strong', market: '1.5_UST' }], null);
assert.equal(body.children.at(-1).children[10].textContent, '%36', 'Over display unchanged');

console.log('V24 MS pre36: inclusive/missing/selected-side gates, Ana LAB/preselection, final Telegram drift, locks, unchanged 0.5 and comparison LABs, entry-time panel labels passed.');
