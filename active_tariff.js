'use strict';

// Telegram router only. The independent V19 and V17 lab policies stay intact.
const v19 = require('./hybrid_tariff');
const v17 = require('./market_tariff');
const VERSION = 'v21-telegram-v19-over-v17-25over-2026-09-12';
const MINIMUM_ODD = 1.50;
const MAXIMUM_ODD = null; // V17 has no upper odds cap; V19 retains its own cap.
const PRIMARY_RULES = Object.freeze([
    ...v19.PRIMARY_RULES.filter(rule => rule.market.endsWith('_UST')).map(rule => Object.freeze({ ...rule, signalSource: 'V19' })),
    ...v17.PRIMARY_RULES.filter(rule => rule.market === '2.5_UST').map(rule => Object.freeze({ ...rule, signalSource: 'Legacy V17' }))
]);
const FOLLOW_RULES = Object.freeze([]);
const currentSlot = (primary, follow) => primary || follow ? null : 'primary';

function check(args) {
    const matches = [];
    if (args.slot === 'primary' && String(args.market).endsWith('_UST')) {
        const result = v19.check(args);
        if (result.eligible) matches.push({ ...result, signalSource: 'V19' });
        if (args.market === '2.5_UST') {
            const legacy = v17.check(args);
            if (legacy.eligible) matches.push({
                ...legacy, signalSource: 'Legacy V17', decisionModel: 'v16',
                decisionProbability: Number(Number(args.selectorProbability).toFixed(1)),
                decisionEdge: legacy[legacy.rule.edgeField],
                minimumOdd: v17.MINIMUM_ODD, maximumOdd: null
            });
        }
    }
    if (!matches.length) return {
        eligible: false, reasons: ['Telegram: yalnız V19 ÜST veya Legacy V17 2.5 ÜST politikası'],
        slot: args.slot, rule: null, priority: -Infinity, signalSources: []
    };
    // V19 attribution wins an overlap; one candidate and one shared fixture lock.
    return { ...matches[0], signalSources: matches.map(result => result.signalSource) };
}

function canPreselect(args) {
    if (args.slot !== 'primary' || !String(args.market).endsWith('_UST')) return false;
    return v19.canPreselect(args) ||
        (args.market === '2.5_UST' && v17.canPreselect(args));
}

module.exports = { VERSION, MINIMUM_ODD, MAXIMUM_ODD, PRIMARY_RULES, FOLLOW_RULES,
    currentSlot, check, canPreselect, edgeValues: v19.edgeValues };
