'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const publicPanel = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
assert.equal(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), publicPanel);
const ids = [...publicPanel.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Panel element IDs must be unique.');

// A small DOM double executes the shipped script with no browser, network,
// Telegram, timers or production history. It preserves text-node semantics.
class Element {
    constructor(tagName = 'div') {
        this.tagName = tagName;
        this.children = [];
        this.value = '';
        this.className = '';
        this.hidden = false;
        this.style = {};
        this.dataset = {};
        this.classList = { add() {}, remove() {}, toggle() {} };
        this._text = '';
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get options() { return this.children; }
    get childElementCount() { return this.children.length; }
    replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    addEventListener() {}
    click() { this.clicked = true; }
    remove() {
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [
            ...(selector === child.tagName || selector === `.${child.className}` ? [child] : []),
            ...child.querySelectorAll(selector)
        ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const elements = new Map(ids.map(id => [id, new Element()]));
const anchors = [];
const document = {
    body: new Element('body'),
    getElementById: id => elements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement(tagName) {
        const element = new Element(tagName);
        if (tagName === 'a') anchors.push(element);
        return element;
    }
};
const context = vm.createContext({
    document,
    window: { location: { protocol: 'https:', origin: 'https://offline.test' } },
    URLSearchParams,
    setInterval() {},
    setTimeout() {},
    clearTimeout() {},
    fetch() { throw new Error('Network is forbidden in panel contract tests.'); }
});
for (const [, script] of publicPanel.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    vm.runInContext(script, context);
}

const byId = id => elements.get(id);
const signal = {
    sentAt: '2026-09-09T21:15:00.000Z',
    match: 'Home <img src=x> - Away',
    minute: 57,
    market: '2.5_UST',
    v20Probability: 77.25,
    v20Edge: 8.43,
    v20ExpectedValue: 0.12,
    // Older model fields must never replace an absent independent V20 score.
    selectorV2Probability: 99,
    v18Edge: 99,
    odds: 1.61,
    decisionModel: 'v20',
    settlement: { result: 'W', finalScore: '2-1' }
};
const data = {
    filter: { date: '2026-09-10', availableDates: ['2026-09-10', '2026-09-09'] },
    v20Shadow: {
        enabled: true,
        available: true,
        modelVersion: 'v20-live-independent-test',
        policy: { minimumProbability: 0.75, minimumEdge: 0.05, minimumOdds: 1.5 },
        summary: {
            updatedAt: signal.sentAt,
            overall: { total: 2, wins: 1, losses: 1, hitRate: 50, roi: -19.5, averageOdds: 1.61 }
        },
        signals: [signal]
    }
};

async function run() {
    context.renderTestLabHistory(data);
    const cells = byId('testlab-v20-rows').children[0].children;
    assert.equal(cells.length, 10);
    assert.match(cells[0].textContent, /10\.09\.2026/);
    assert.equal(cells[1].textContent, signal.match);
    assert.equal(cells[1].children.length, 0, 'Match text must not become HTML.');
    assert.equal(cells[2].textContent, "57'");
    assert.equal(cells[3].textContent, '2.5 ÜST');
    assert.equal(cells[4].textContent, '%77.3');
    assert.equal(cells[5].textContent, '%+8.4');
    assert.equal(cells[6].textContent, '-');
    assert.equal(cells[7].textContent, '1.610');
    assert.equal(cells[8].textContent, '✅ Kazandı');
    assert.equal(cells[9].textContent, '2-1');
    assert.equal(byId('testlab-v20-total').textContent, '2');
    assert.equal(byId('testlab-v20-win-loss').textContent, '1 / 1');
    assert.equal(byId('testlab-v20-hit-rate').textContent, '%50.0');
    assert.equal(byId('testlab-v20-roi').textContent, '%-19.5');
    assert.equal(byId('testlab-v20-average-odds').textContent, '1.610');
    assert.equal(byId('test-lab-date').value, '2026-09-10');
    assert.equal(byId('test-lab-date').options.length, 3);
    assert.equal(byId('testlab-v20-mode-badge').textContent, 'DENEYSEL GÖLGE');
    assert.match(byId('test-lab-v20-rules').textContent, /olasılık ≥ %75/);
    assert.match(byId('test-lab-v20-rules').textContent, /ham EDGE ≥ %\+5/);
    assert.match(byId('test-lab-v20-rules').textContent, /oran 1\.50–4\.00/);

    context.filterTestLabTables('does not match');
    assert.equal(byId('testlab-v20-rows').children[0].hidden, true);
    context.filterTestLabTables('home');
    assert.equal(byId('testlab-v20-rows').children[0].hidden, false);

    const missing = { ...signal, v20Probability: null, v20Edge: null, odds: null, settlement: {} };
    context.renderTestLabRows('testlab-v20-rows', [missing], { probabilityOnly: true }, '');
    const missingCells = byId('testlab-v20-rows').children[0].children;
    assert.deepEqual(missingCells.slice(4, 8).map(cell => cell.textContent), ['-', '-', '-', '-']);
    assert.equal(missingCells[8].textContent, '⏳ Bekliyor');
    assert.equal(missingCells[9].textContent, '-');
    context.setTestLabSummary('testlab-v20', { overall: { averageOdds: null } });
    assert.equal(byId('testlab-v20-average-odds').textContent, '-');
    assert.equal(context.testLabEdge({ v20Edge: 0 }, true), '%+0.0');
    assert.equal(context.testLabEdge({ v20Edge: -2.5 }, true), '%-2.5');

    // Pre is visible on all Lab arms and in shared tracking; absent is not zero.
    for (const [pre, expected] of [[null, '-'], [undefined, '-'], [0, '%0.0'], [62.5, '%62.5']]) {
        context.renderTestLabRows('testlab-v21-rows', [{ ...signal,
            v20Probability: null, v20Edge: null, decisionModel: 'consensus',
            dinoProbability: 54, selectorV2Probability: 57, v18Probability: null,
            voteCount: 2, decisionProbability: null, decisionEdge: -1.6,
            prematchMarketSupport: pre
        }], { consensus: true }, '');
        const consensusCells = byId('testlab-v21-rows').children[0].children;
        assert.equal(consensusCells.length, 10);
        assert.match(consensusCells[4].textContent, /2\/3 onay/);
        assert.match(consensusCells[4].textContent, /V18 -/);
        assert.equal(consensusCells[6].textContent, expected);
        context.renderSignalHistory({ signals: [{ ...signal, prematchMarketSupport: pre }] });
        const sharedCells = byId('signal-history-rows').children[0].children;
        assert.equal(sharedCells.length, 10);
        assert.equal(sharedCells[6].textContent, expected);
    }
    context.renderTestLabHistory({ activeV19: { enabled: true }, v21Shadow: { enabled: true } });
    assert.equal(byId('testlab-v19-mode-badge'), undefined, 'Retired lab is absent, not just hidden');
    assert.equal(byId('testlab-v21-mode-badge').textContent, 'TAZE DOĞRULAMA');
    context.renderTestLabHistory({ v21Shadow: { enabled: true, archivedRecords: 129,
        startedAt: '2026-09-13T00:01:00Z', summary: {overall:{total:1,wins:0,losses:0}},
        signals: [{...signal,decisionModel:'consensus',dinoProbability:54,selectorV2Probability:57,
            v18Probability:60,voteCount:3,decisionEdge:-1.6,prematchMarketSupport:65}] } });
    assert.match(byId('testlab-v21-cohort-note').textContent,/129 eski kayıt/);
    assert.match(byId('testlab-v21-cohort-note').textContent,/İlk sinyal/);
    assert.equal(byId('testlab-v21-total').textContent,'1');
    assert.match(byId('testlab-v21-rows').children[0].children[4].textContent,/3\/3 onay/);
    for (const [arm, endpoint] of [['v22', 'v22-union-shadow'], ['v21', 'v21-consensus-shadow']]) {
        context.downloadTestLabExport(arm, 'json');
        assert.match(anchors.at(-1).href, new RegExp(`/api/${endpoint}-history/export`));
    }

    for (const [result, label] of [['L', '❌ Kaybetti'], ['PUSH', '↩️ İade'], ['VOID', '🚫 Geçersiz']]) {
        context.renderTestLabRows('testlab-v20-rows', [{ ...signal, settlement: { result, finalScore: '1-1' } }], { probabilityOnly: true }, '');
        assert.equal(byId('testlab-v20-rows').children[0].children[8].textContent, label);
    }

    context.renderTestLabHistory({});
    assert.equal(byId('testlab-v20-mode-badge').textContent, 'HAZIR DEĞİL');
    assert.match(byId('test-lab-v20-rules').textContent, /henüz hazır değil/);
    context.renderTestLabHistory({ v20Shadow: { enabled: true, available: false, reason: 'Model unavailable' } });
    assert.match(byId('test-lab-v20-rules').textContent, /Model unavailable/);
    context.renderTestLabHistory({ v20Shadow: { enabled: false, available: true } });
    assert.equal(byId('testlab-v20-mode-badge').textContent, 'KAPALI');
    assert.match(byId('test-lab-v20-rules').textContent, /gölge kapalı/);

    const requested = [];
    context.apiFetch = async endpoint => { requested.push(endpoint); return data; };
    await context.changeTestLabDate('2026-09-10');
    assert.equal(requested.at(-1), '/api/test-lab-comparison?limit=100&date=2026-09-10');
    context.downloadTestLabExport('v21','json','previous');
    assert.equal(anchors.at(-1).href,'https://offline.test/api/v21-consensus-shadow-history/export?cohort=previous',
        'Archive button includes all previous dates, not current-cohort/common-period/date filters');
    context.downloadTestLabExport('v21','json');
    assert.equal(anchors.at(-1).href,'https://offline.test/api/v21-consensus-shadow-history/export?scope=test-lab&date=2026-09-10');
    for (const [format, suffix] of [['json', '/export'], ['csv', '/export.csv']]) {
        context.downloadTestLabExport('v20', format);
        const anchor = anchors.at(-1);
        assert.equal(anchor.href, `https://offline.test/api/v20-shadow-history${suffix}?scope=test-lab&date=2026-09-10`);
        assert.equal(anchor.clicked, true);
        assert.equal(anchor.rel, 'noopener');
    }
    context.apiFetch = async endpoint => { requested.push(endpoint); return { ...data, filter: { date: null, availableDates: [] } }; };
    await context.changeTestLabDate('');
    assert.equal(requested.at(-1), '/api/test-lab-comparison?limit=100');
    context.downloadTestLabExport('v20', 'json');
    assert.equal(anchors.at(-1).href, 'https://offline.test/api/v20-shadow-history/export?scope=test-lab');

    context.apiFetch = async () => { throw new Error('Offline'); };
    await context.changeTestLabDate('2026-09-11');
    assert.equal(byId('testlab-v20-mode-badge').textContent, 'BAĞLANTI YOK');
    assert.match(byId('test-lab-updated').textContent, /son başarılı yanıttan kalmıştır/);
    assert.equal(byId('testlab-v20-rows').children[0].children[1].textContent, signal.match);
    context.apiFetch = async () => data;
    await context.fetchTestLabHistory();
    assert.equal(byId('testlab-v20-mode-badge').textContent, 'DENEYSEL GÖLGE');
    console.log('V20 panel rendering, missing data, date/export, search and offline recovery contracts passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
