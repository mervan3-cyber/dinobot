'use strict';

const assert = require('node:assert/strict');
const v25 = require('./v25_runtime');

function close(actual, expected, tolerance = 0.2) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ±${tolerance}`);
}

const mallorca = v25.score({
    branch: 'B', market: '1.5_UST', minute: 68, score: '0-1', odds: 1.575,
    prematchSupport: 73.2218, isWeekend: true
});
close(mallorca.probability, 61.3);
close(mallorca.edge, -2.2);

const galaxyInput = {
    branch: 'A', market: '2.5_UST', minute: 35, score: '0-1', odds: 1.575,
    prematchSupport: 58.1395, isWeekend: true
};
const galaxy = v25.score(galaxyInput);
close(galaxy.probability, 65.4);
close(galaxy.edge, 1.9);

const sniper = v25.score({
    branch: 'SNIPER', market: '1.5_UST', minute: 29, score: '0-0', odds: 1.55,
    prematchSupport: 76.6284, isWeekend: true
});
close(sniper.probability, 79.4);
close(sniper.edge, 14.9);

const galaxyJoint = v25.checkJoint(galaxyInput, {
    probabilityMinimum: 60, edgeLow: -5, edgeHigh: 0
});
assert.equal(galaxyJoint.eligible, false);
assert.deepEqual(galaxyJoint.reasons, ['V25_EDGE_AT_OR_ABOVE_MAXIMUM']);
assert.equal(v25.checkJoint({
    branch: 'B', market: '1.5_UST', minute: 60, score: '1-0', odds: 1.55,
    prematchSupport: 70, isWeekend: true
}, { probabilityMinimum: 60, edgeLow: 0, edgeHigh: 7 }).score !== null, true);

console.log('V25 lean JavaScript runtime matches frozen Python scores.');
