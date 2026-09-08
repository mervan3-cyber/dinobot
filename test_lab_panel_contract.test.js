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
    '/api/two-rule-core-shadow-history',
    '/api/v17-legacy-shadow-history',
    'TAZE DOĞRULAMA',
    'HAM GÖZLEM',
    'scope: "test-lab"'
]) {
    assert.match(publicPanel, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const scripts = [...publicPanel.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length > 0, 'Panel JavaScript bloğu bulunamadı.');
for (const [, source] of scripts) {
    new vm.Script(source);
}

console.log('Test Lab panel contract tests passed.');
