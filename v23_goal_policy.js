'use strict';
const { finite, integer } = require('./v23_goal_profile');
const baseline = require('./v21_tariff');
const VERSION = 'v23-goal-check-shadow-v1-2026-09-14';
const POLICY = Object.freeze({ version: VERSION, baselineVersion: baseline.VERSION,
    minimumRecentGames: 10, minimumVenueGames: 5, maximumLatestMatchAgeDays: 60,
    recentWeight: 0.5, venueWeight: 0.5, minimumRemainingProbability: 0.50,
    redCardMode: 'insufficient', addedTimeMinutes: 0, calibrated: false, telegram: false,
    description: 'Sabit Poisson referansı; onay bir bahis önerisi veya kalibre edilmiş olasılık değildir.' });
function poissonTail(lambda, needed) {
    if (lambda < 0 || !Number.isFinite(lambda) || !Number.isInteger(needed) || needed < 1) return null;
    let mass = Math.exp(-lambda), cdf = mass;
    for (let k=1; k<needed; k++) { mass *= lambda/k; cdf += mass; }
    return Math.max(0,Math.min(1,1-cdf));
}
function evaluate({ signal, mac, homeEntry, awayEntry }) {
    const reasons = [], notes = [], score = String(signal.score || '').match(/^(\d+)-(\d+)$/);
    const line = String(signal.market || '').match(/^(\d+\.5)_UST$/);
    const minute = finite(signal.minute), homeRed = integer(mac.home_red), awayRed = integer(mac.away_red);
    const result = { version: VERSION, status: 'insufficient', reasons, notes, goalsNeeded: null,
        remainingMinutes: minute === null ? null : Math.max(0,90-minute),
        homeRed, awayRed, scoreState: score ? (Number(score[1]) === Number(score[2]) ? 'level' : Number(score[1]) > Number(score[2]) ? 'home_leads' : 'away_leads') : null,
        profileIds: { home: homeEntry?.profile?.id || null, away: awayEntry?.profile?.id || null },
        profileStatus: { home: homeEntry?.status || 'missing', away: awayEntry?.status || 'missing' },
        expectedGoals90: null, expectedRemainingGoals: null, remainingProbability: null, calibrated: false };
    const base = baseline.check({ market: signal.market, minute, odds: signal.odds, dinoProbability: signal.dinoProbability,
        selectorProbability: signal.selectorV2Probability, v18Probability: signal.v18Probability, prematchSupport: signal.prematchMarketSupport });
    if (!base.eligible) reasons.push('BASELINE_INVALID');
    if (!score || !line || minute === null || minute < 0 || minute > 90) reasons.push('LIVE_STATE_MISSING');
    else {
        result.goalsNeeded = Math.floor(Number(line[1])) + 1 - Number(score[1]) - Number(score[2]);
        if (result.goalsNeeded <= 0) reasons.push('MARKET_ALREADY_DECIDED');
    }
    if (homeRed === null || awayRed === null) reasons.push('RED_CARD_DATA_MISSING');
    else if (homeRed > 0 || awayRed > 0) reasons.push('RED_CARD_OUTSIDE_REFERENCE_MODEL');
    const home = homeEntry?.profile, away = awayEntry?.profile;
    for (const [side, profile] of [['HOME',home],['AWAY',away]]) {
        if (!profile) { reasons.push(`${side}_PROFILE_MISSING`); continue; }
        const venue = side === 'HOME' ? profile.home : profile.away;
        if (profile.last10?.n < POLICY.minimumRecentGames || venue?.n < POLICY.minimumVenueGames || !venue || !profile.last10)
            reasons.push(`${side}_SAMPLE_TOO_SMALL`);
        const age = Date.parse(profile.cutoff) - Date.parse(profile.latestMatchAt);
        if (!Number.isFinite(age) || age < 0 || age > POLICY.maximumLatestMatchAgeDays*86400000) reasons.push(`${side}_HISTORY_TOO_OLD`);
        for (const group of [profile.last10,venue]) {
            if (finite(group?.goalsFor) === null || finite(group?.goalsAgainst) === null || group.goalsFor < 0 || group.goalsAgainst < 0)
                reasons.push(`${side}_GOAL_AVERAGE_MISSING`);
        }
    }
    notes.push('PRE_ALREADY_IN_BASELINE_NOT_AN_INDEPENDENT_VOTE');
    notes.push('SCORE_EFFECT_AND_STOPPAGE_TIME_NOT_FITTED');
    if (reasons.length) return result;
    // Symmetric attack-versus-defence estimate. Last 5 is reported, not counted
    // as a third independent vote because it is already contained in last 10.
    const blend = (recent,venue,key) => POLICY.recentWeight*recent[key] + POLICY.venueWeight*venue[key];
    const homeAttack = blend(home.last10,home.home,'goalsFor');
    const awayDefence = blend(away.last10,away.away,'goalsAgainst');
    const awayAttack = blend(away.last10,away.away,'goalsFor');
    const homeDefence = blend(home.last10,home.home,'goalsAgainst');
    result.expectedHome90 = (homeAttack+awayDefence)/2;
    result.expectedAway90 = (awayAttack+homeDefence)/2;
    result.expectedGoals90 = result.expectedHome90+result.expectedAway90;
    result.expectedRemainingGoals = result.expectedGoals90 * result.remainingMinutes/90;
    result.remainingProbability = poissonTail(result.expectedRemainingGoals,result.goalsNeeded);
    if (result.remainingProbability === null) { reasons.push('LIVE_STATE_MISSING'); return result; }
    result.status = result.remainingProbability >= POLICY.minimumRemainingProbability ? 'approve' : 'reject';
    reasons.push(result.status === 'approve' ? 'GOAL_REFERENCE_SUPPORTS' : 'GOAL_REFERENCE_BELOW_THRESHOLD');
    if (home.last5.failedToScoreRate >= 0.6) notes.push('HOME_FAILED_TO_SCORE_3_OF_LAST_5');
    if (away.last5.failedToScoreRate >= 0.6) notes.push('AWAY_FAILED_TO_SCORE_3_OF_LAST_5');
    return result;
}
module.exports = { VERSION, POLICY, poissonTail, evaluate };
