'use strict';

const fs = require('fs');
const path = require('path');

const MODEL_PATH = path.join(__dirname, 'dino_selector_v2.json');
const MODEL = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
const MARKET_NAMES = [
    '0.5_UST', '0.5_ALT', '1.5_UST', '1.5_ALT', '2.5_UST', '2.5_ALT',
    '3.5_UST', '3.5_ALT', '4.5_UST', '4.5_ALT', 'MS1', 'X', 'MS2'
];


function numeric(value) {
    if (value === null || value === undefined || value === '') return Number.NaN;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}


function finiteOr(value, fallback = 0) {
    const parsed = numeric(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}


function oddValue(mac, market) {
    const value = mac?.canli_oranlar?.[market];
    return numeric(value && typeof value === 'object' ? value.oran : value);
}


function normalizeOdds(values) {
    const parsed = values.map(numeric);
    if (parsed.some(value => !Number.isFinite(value) || value <= 1)) {
        return values.map(() => Number.NaN);
    }
    const inverse = parsed.map(value => 1 / value);
    const total = inverse.reduce((sum, value) => sum + value, 0);
    return inverse.map(value => value / total);
}


function scoreParts(mac) {
    if (Number.isFinite(Number(mac?.home_score)) && Number.isFinite(Number(mac?.away_score))) {
        return [Number(mac.home_score), Number(mac.away_score)];
    }
    const parts = String(mac?.skor || '').split('-').map(Number);
    return parts.length === 2 && parts.every(Number.isFinite) ? parts : [Number.NaN, Number.NaN];
}


function commonFeatures(mac, shadowContext) {
    const minute = Math.max(finiteOr(mac?.dakika, 1), 1);
    const [homeScore, awayScore] = scoreParts(mac);
    const homeShots = numeric(mac?.home_shot);
    const awayShots = numeric(mac?.away_shot);
    const homeSot = numeric(mac?.home_sot);
    const awaySot = numeric(mac?.away_sot);
    const homeCorners = numeric(mac?.home_corner);
    const awayCorners = numeric(mac?.away_corner);
    const homeXg = numeric(mac?.home_xg);
    const awayXg = numeric(mac?.away_xg);
    const totalShots = homeShots + awayShots;
    const totalSot = homeSot + awaySot;
    const totalCorners = homeCorners + awayCorners;
    const totalXg = homeXg + awayXg;
    const homeVenue = shadowContext?.teamStats?.home?.home || {};
    const awayVenue = shadowContext?.teamStats?.away?.away || {};
    const homeStanding = shadowContext?.standings?.home || {};
    const awayStanding = shadowContext?.standings?.away || {};
    const apiPercent = shadowContext?.prediction?.percent || {};

    return {
        minute,
        minute_sq: minute * minute / 100,
        remaining_minutes: Math.max(0, 95 - minute),
        home_score: homeScore,
        away_score: awayScore,
        total_goals: homeScore + awayScore,
        goal_diff: homeScore - awayScore,
        abs_goal_diff: Math.abs(homeScore - awayScore),
        home_shots: homeShots,
        away_shots: awayShots,
        total_shots: totalShots,
        shot_diff: homeShots - awayShots,
        shots_rate90: totalShots / minute * 90,
        home_sot: homeSot,
        away_sot: awaySot,
        total_sot: totalSot,
        sot_diff: homeSot - awaySot,
        sot_rate90: totalSot / minute * 90,
        shot_accuracy: totalSot / Math.max(finiteOr(totalShots), 1),
        home_corners: homeCorners,
        away_corners: awayCorners,
        total_corners: totalCorners,
        corner_diff: homeCorners - awayCorners,
        corners_rate90: totalCorners / minute * 90,
        possession_diff: numeric(mac?.home_possession) - numeric(mac?.away_possession),
        total_yellow: numeric(mac?.home_yellow) + numeric(mac?.away_yellow),
        total_red: numeric(mac?.home_red) + numeric(mac?.away_red),
        total_fouls: numeric(mac?.home_fouls) + numeric(mac?.away_fouls),
        total_offsides: numeric(mac?.home_offsides) + numeric(mac?.away_offsides),
        total_saves: numeric(mac?.home_saves) + numeric(mac?.away_saves),
        home_xg: homeXg,
        away_xg: awayXg,
        total_xg: totalXg,
        xg_rate90: totalXg / minute * 90,
        prematch_home: numeric(mac?.prematch_p_home),
        prematch_draw: numeric(mac?.prematch_p_draw),
        prematch_away: numeric(mac?.prematch_p_away),
        shadow_available: shadowContext?.available === true ? 1 : 0,
        shadow_identity_verified: shadowContext?.validation?.identityVerified === true ? 1 : 0,
        shadow_sample_adequate: shadowContext?.validation?.sampleAdequate === true ? 1 : 0,
        shadow_fully_verified: shadowContext?.validation?.fullyVerified === true ? 1 : 0,
        shadow_strength_delta: numeric(shadowContext?.strength?.delta),
        shadow_expected_goals_total: numeric(shadowContext?.strength?.expectedGoalsTotal),
        home_venue_win_rate: numeric(homeVenue?.winRate),
        away_venue_win_rate: numeric(awayVenue?.winRate),
        home_venue_gf_avg: numeric(homeVenue?.goalsForAverage),
        home_venue_ga_avg: numeric(homeVenue?.goalsAgainstAverage),
        away_venue_gf_avg: numeric(awayVenue?.goalsForAverage),
        away_venue_ga_avg: numeric(awayVenue?.goalsAgainstAverage),
        rank_diff: numeric(awayStanding?.rank) - numeric(homeStanding?.rank),
        points_diff: numeric(homeStanding?.points) - numeric(awayStanding?.points),
        api_prediction_home: numeric(apiPercent?.home) / 100,
        api_prediction_draw: numeric(apiPercent?.draw) / 100,
        api_prediction_away: numeric(apiPercent?.away) / 100
    };
}


function addOneHot(features, market) {
    for (const name of MARKET_NAMES) {
        features[`market_${name}`] = name === market ? 1 : 0;
    }
}


function marketDescriptor(market) {
    if (['MS1', 'X', 'MS2'].includes(market)) {
        return { kind: 'result', side: market, line: Number.NaN };
    }
    const match = String(market).match(/^(\d+(?:\.\d+)?)_(ALT|UST)$/);
    return match
        ? { kind: 'total', side: match[2], line: Number(match[1]) }
        : null;
}


function liveMarketProbability(mac, market, descriptor) {
    if (descriptor.kind === 'result') {
        const probabilities = normalizeOdds(['MS1', 'X', 'MS2'].map(name => oddValue(mac, name)));
        return probabilities[['MS1', 'X', 'MS2'].indexOf(market)];
    }
    const over = `${descriptor.line.toFixed(1)}_UST`;
    const under = `${descriptor.line.toFixed(1)}_ALT`;
    const probabilities = normalizeOdds([oddValue(mac, over), oddValue(mac, under)]);
    return probabilities[descriptor.side === 'UST' ? 0 : 1];
}


function prematchSupport(mac, market, descriptor) {
    if (market === 'MS1') return numeric(mac?.prematch_p_home);
    if (market === 'X') return numeric(mac?.prematch_p_draw);
    if (market === 'MS2') return numeric(mac?.prematch_p_away);
    const total = mac?.prematch_totals?.[String(Number(descriptor.line))];
    return numeric(descriptor.side === 'UST' ? total?.over : total?.under);
}


function candidateFeatures(mac, market, dino, liveOnlyDino, shadowContext) {
    const descriptor = marketDescriptor(market);
    if (!descriptor) return null;
    const dinoProbability = numeric(dino?.[market]) / 100;
    const odds = oddValue(mac, market);
    const liveProbability = liveMarketProbability(mac, market, descriptor);
    const prematch = prematchSupport(mac, market, descriptor);
    const liveOnly = numeric(liveOnlyDino?.[market]) / 100;
    if (![dinoProbability, odds, liveProbability].every(Number.isFinite)) return null;
    const features = commonFeatures(mac, shadowContext);
    const totalGoals = finiteOr(features.total_goals);
    const apiKey = market === 'MS1'
        ? 'home'
        : market === 'X'
            ? 'draw'
            : market === 'MS2'
                ? 'away'
                : null;
    const apiSupport = apiKey
        ? numeric(shadowContext?.prediction?.percent?.[apiKey]) / 100
        : Number.NaN;
    Object.assign(features, {
        is_total: descriptor.kind === 'total' ? 1 : 0,
        is_over: descriptor.side === 'UST' ? 1 : 0,
        is_under: descriptor.side === 'ALT' ? 1 : 0,
        is_home: market === 'MS1' ? 1 : 0,
        is_draw: market === 'X' ? 1 : 0,
        is_away: market === 'MS2' ? 1 : 0,
        line: descriptor.line,
        goals_to_cross: descriptor.kind === 'total' ? descriptor.line + 0.5 - totalGoals : Number.NaN,
        line_cushion: descriptor.kind === 'total' ? descriptor.line - totalGoals : Number.NaN,
        dino_probability: dinoProbability,
        dino_logit: Math.log(Math.max(dinoProbability, 1e-5) / Math.max(1 - dinoProbability, 1e-5)),
        live_probability: liveProbability,
        raw_implied: 1 / odds,
        odds,
        prematch_support: prematch,
        live_only_probability: liveOnly,
        api_market_support: apiSupport,
        dino_live_gap: dinoProbability - liveProbability,
        dino_prematch_gap: dinoProbability - prematch,
        market_prematch_gap: liveProbability - prematch,
        dino_api_gap: dinoProbability - apiSupport,
        agreement_dino_market: (dinoProbability >= 0.5) === (liveProbability >= 0.5) ? 1 : 0,
        agreement_all: Number.isFinite(prematch) && dinoProbability >= 0.5 &&
            liveProbability >= 0.5 && prematch >= 0.5 ? 1 : 0,
        dino_minute: dinoProbability * finiteOr(mac?.dakika)
    });
    addOneHot(features, market);
    return { features, descriptor, dinoProbability, liveProbability, prematch, odds };
}


function interpolate(x, pointsX, pointsY) {
    if (x <= pointsX[0]) return pointsY[0];
    if (x >= pointsX[pointsX.length - 1]) return pointsY[pointsY.length - 1];
    let low = 0;
    let high = pointsX.length - 1;
    while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (pointsX[middle] <= x) low = middle;
        else high = middle;
    }
    const width = pointsX[high] - pointsX[low];
    if (width <= 0) return pointsY[low];
    const ratio = (x - pointsX[low]) / width;
    return pointsY[low] + ratio * (pointsY[high] - pointsY[low]);
}


function predict(features) {
    const original = MODEL.featureNames.map(name => numeric(features?.[name]));
    const missing = original.map(value => !Number.isFinite(value));
    const transformed = original.map((value, index) =>
        Number.isFinite(value) ? value : MODEL.imputer.statistics[index]
    );
    for (const index of MODEL.imputer.missingIndicatorFeatureIndices) {
        transformed.push(missing[index] ? 1 : 0);
    }
    let linear = MODEL.logistic.intercept;
    for (let index = 0; index < transformed.length; index++) {
        const scaled = (transformed[index] - MODEL.scaler.mean[index]) / MODEL.scaler.scale[index];
        linear += scaled * MODEL.logistic.coefficients[index];
    }
    const raw = linear >= 0
        ? 1 / (1 + Math.exp(-linear))
        : Math.exp(linear) / (1 + Math.exp(linear));
    const calibrated = interpolate(raw, MODEL.calibration.x, MODEL.calibration.y);
    return { raw, calibrated };
}


function scoreMarket(mac, market, dino, liveOnlyDino, shadowContext = null) {
    const candidate = candidateFeatures(mac, market, dino, liveOnlyDino, shadowContext);
    if (!candidate) return null;
    const prediction = predict(candidate.features);
    return {
        market,
        kind: candidate.descriptor.kind,
        side: candidate.descriptor.side,
        odds: candidate.odds,
        dinoProbability: candidate.dinoProbability * 100,
        liveProbability: candidate.liveProbability * 100,
        prematchSupport: Number.isFinite(candidate.prematch) ? candidate.prematch * 100 : null,
        selectorRawProbability: prediction.raw * 100,
        selectorProbability: prediction.calibrated * 100
    };
}


function policyCheck(mac, score, shadowContext, minimumOdd = MODEL.policy.defaultMinimumOdd) {
    const reasons = [];
    const minute = Number(mac?.dakika);
    if (!Number.isFinite(minute) || minute < MODEL.policy.minimumMinute || minute > MODEL.policy.maximumMinute) {
        reasons.push(`dakika_${MODEL.policy.minimumMinute}_${MODEL.policy.maximumMinute}_disi`);
    }
    if (!score || score.selectorProbability < MODEL.policy.threshold * 100) {
        reasons.push('selector_probability_below_threshold');
    }
    if (!score || score.odds < minimumOdd) reasons.push('odds_below_minimum');
    if (MODEL.policy.excludedMarkets.includes(score?.market)) reasons.push('market_excluded');
    if (
        MODEL.policy.requireFullyVerifiedShadow &&
        shadowContext?.validation?.fullyVerified !== true
    ) {
        reasons.push('shadow_not_fully_verified');
    }
    return { eligible: reasons.length === 0, reasons };
}


module.exports = {
    MODEL,
    MARKET_NAMES,
    scoreMarket,
    policyCheck,
    _internal: { candidateFeatures, predict, normalizeOdds, interpolate }
};
