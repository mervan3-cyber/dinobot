'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const publicPanel = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const rootPanel = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert.equal(rootPanel, publicPanel, 'Kök ve public panel dosyaları birebir aynı olmalı.');
assert.doesNotMatch(publicPanel, /V18-A|V18-B|v18-shadow-comparison|v18-a-shadow|v18-b-shadow/);

for (const requiredText of [
    '/api/test-lab-comparison',
    '/api/test-lab-results/refresh',
    'TAZE DOĞRULAMA',
    '/api/v21-consensus-shadow-history',
    'Pre destek',
    'V21 · ÜST · 3/3',
    '−5 ≤ Kayıt EDGE ≤ 0',
    'Eski V21 JSON',
    'testlab-v21-cohort-note',
    '/api/v24-shadow-history',
    'V24 Ana · Sniper/B/A/MS',
    'id="testlab-v24-rows"',
    'Sniper · 0-0 · 1.5 ÜST',
    'B · tam 1 gol',
    'A · tam 2 gol',
    'V16 EDGE %0…+5',
    'Eski Telegram LAB',
    'Weekend Quiet',
    'Gemini V24 · her gün',
    '/api/old-telegram-lab-history',
    '/api/v24-weekend-quiet-history',
    '/api/v24-gemini-weekend-history',
    'Seçici Weekend',
    'V24 + V25 Ortak Weekend',
    '/api/v24-selective-weekend-history',
    '/api/v24-v25-joint-weekend-history',
    '/api/v24-focus-history',
    'V24 Odak LAB · 7 bağımsız kol',
    'testlab-v24-focus-arm-B25_PRE52',
    'testlab-v24-focus-pre-baseline',
    'testlab-v24-focus-pre-candidate',
    'Pre ≥ %75 · V16 ≥ %72',
    'B · tam 1 gol · V16 ≥ %65',
    'id="testlab-v24-focus-rows"',
    'B 1.5 reaksiyon',
    'B 2.5 reaksiyon',
    'A yalnız 2.5 ÜST',
    'id="testlab-v24-selective-rows"',
    'id="testlab-v24-v25-rows"',
    'V25 ≥ %60',
    'renderV24Rows',
    'scope: "test-lab"'
]) {
    assert.match(publicPanel, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const scripts = [...publicPanel.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert.doesNotMatch(publicPanel,/id="testlab-v23-card"|id="testlab-v24-guard-|v23_filter_panel\.js|\/api\/v24-weekend-guard-history/);
assert.doesNotMatch(publicPanel, /id="testlab-(core|v19)-(rows|total|mode-badge)"|Dino Operations|Yeni [Çç]ekirdek/);
assert.doesNotMatch(publicPanel, /id="testlab-(v17|v20)-(rows|total|mode-badge)"|\/api\/v17-legacy-shadow-history|\/api\/v20-shadow-history/);
assert.match(publicPanel, /Maç Yakala/);
assert.doesNotMatch(publicPanel, /HAM GÖZLEM|hybrid-observation|Hibrit Gözlem/);
assert.doesNotMatch(publicPanel, /V21 · ÜST \/ ALT|en az 2 model|negatiflerde alt sınır yok/);
for (const paginationContract of [
    'CANDIDATE_HISTORY_PAGE_SIZE = 200',
    'id="candidate-page-summary"',
    'id="candidate-page-select"',
    'goCandidateHistoryPage',
    'V16 / V18',
    'Pre Destek',
    'EDGE (kayıt)'
]) {
    assert.ok(
        publicPanel.includes(paginationContract),
        `Tam-stat sayfalama/model görünümü eksik: ${paginationContract}`
    );
}
assert.doesNotMatch(publicPanel, /Tam-Stat Ham Akış|candidate-visible|candidateStatValue/);
assert.ok(scripts.length > 0, 'Panel JavaScript bloğu bulunamadı.');
for (const [, source] of scripts) {
    new vm.Script(source);
}

console.log('Test Lab panel contract tests passed.');
