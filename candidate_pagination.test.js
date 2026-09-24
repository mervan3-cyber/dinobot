'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CandidateTracker } = require('./candidate_tracker');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-candidate-pages-'));

try {
    const tracker = new CandidateTracker({
        filePath: path.join(temporaryDirectory, 'candidates.json')
    });
    tracker.data.records = Array.from({ length: 405 }, (_, index) => ({
        recordId: `record-${index + 1}`,
        fixtureId: index + 1,
        capturedAt: new Date(Date.UTC(2026, 8, 24, 0, 0, index)).toISOString()
    }));

    const firstPage = tracker.list(200, tracker.data.records, 0);
    const secondPage = tracker.list(200, tracker.data.records, 200);
    const thirdPage = tracker.list(200, tracker.data.records, 400);

    assert.equal(firstPage.length, 200);
    assert.equal(secondPage.length, 200);
    assert.equal(thirdPage.length, 5);
    assert.equal(firstPage[0].recordId, 'record-405');
    assert.equal(secondPage[0].recordId, 'record-205');
    assert.equal(thirdPage[0].recordId, 'record-5');
    assert.equal(new Set([...firstPage, ...secondPage, ...thirdPage].map(item => item.recordId)).size, 405);

    const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    assert.match(serverSource, /req\.query\.page/);
    assert.match(serverSource, /totalPages/);
    assert.match(serverSource, /candidateTracker\.list\(limit, selection\.items, offset\)/);

    console.log('Candidate history pagination tests passed: 405 rows split into 200/200/5.');
} finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
