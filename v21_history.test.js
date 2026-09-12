'use strict';
const assert = require('assert/strict');
const { SignalTracker } = require('./signal_tracker');
const history = require('./v21_history');
const policy = require('./v21_tariff');
// Pure in-memory test: no external file or server access.
const tracker = new SignalTracker({ filePath: 'not-used.json' });
tracker.data.startedAt = '2026-09-12T00:00:00Z';
tracker.data.updatedAt = '2026-09-14T00:00:00Z';
tracker.data.signals = [
    {fixtureId:1,signalId:'old',signalType:'strong',sentAt:'2026-09-13T00:00:00Z',market:'3.5_ALT',odds:1.8,
        tariffVersion:history.LEGACY_VERSION,settlement:{result:'L',profit:-1,resolvedAt:'2026-09-13T04:00:00Z'}},
    {fixtureId:2,signalId:'new',signalType:'strong',sentAt:'2026-09-13T00:01:00Z',market:'2.5_UST',odds:1.8,
        tariffVersion:policy.VERSION,settlement:{result:'W',profit:.8,resolvedAt:'2026-09-13T02:00:00Z'}},
    {fixtureId:3,signalId:'unknown',signalType:'strong',sentAt:'2026-09-12T01:00:00Z',market:'1.5_UST',odds:1.8,
        settlement:{result:null}}
];
const original = JSON.stringify(tracker.data);
assert.deepEqual(history.select(tracker.data.signals).map(s=>s.signalId),['new']);
assert.deepEqual(history.select(tracker.data.signals,'previous').map(s=>s.signalId),['old','unknown']);
assert.equal(history.metadata(tracker.data.signals).archivedRecords,2);
assert.equal(history.metadata(tracker.data.signals).startedAt,'2026-09-13T00:01:00Z');
assert.equal(history.metadata(tracker.data.signals,'previous').rules,null,'Unknown past versions are not labelled with current rules');
const summary=history.summary(tracker);
assert.equal(summary.overall.total,1);assert.equal(summary.overall.wins,1);assert.equal(summary.overall.profit,.8);
assert.equal(summary.updatedAt,'2026-09-13T02:00:00Z','Old settlements must not update the new cohort clock');
assert.equal(history.summary(tracker,[]).overall.total,0);
assert.equal(history.summary(tracker,[]).updatedAt,null);
assert.equal(history.summary(tracker,tracker.data.signals,'previous').overall.total,2);
assert.equal(JSON.stringify(tracker.data),original,'No history rewriting or reclassification');
assert.equal(tracker.hasSignal(1,'strong'),true,'Old fixture locks retained');
assert.equal(history.metadata([]).startedAt,null,'No artificial experiment start before first new signal');
console.log('V21 current/previous cohorts, metadata, summaries, no rewrite and retained fixture locks passed.');
