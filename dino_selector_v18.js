'use strict';

const fs = require('fs');
const path = require('path');

const MODEL_PATH = process.env.DINO_V18_MODEL_PATH
    ? path.resolve(process.env.DINO_V18_MODEL_PATH)
    : path.join(__dirname, 'dino_selector_v18.json');
const MODEL = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));


function numeric(value) {
    if (value === null || value === undefined || value === '') return Number.NaN;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}


function finiteOr(value, fallback = 0) {
    const parsed = numeric(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}


function scoreParts(mac) {
    if (Number.isFinite(Number(mac?.home_score)) && Number.isFinite(Number(mac?.away_score))) {
        return [Number(mac.home_score), Number(mac.away_score)];
    }
    const match = String(mac?.skor || '').match(/^(\d+)\s*-\s*(\d+)$/);
    return match ? [Number(match[1]), Number(match[2])] : [Number.NaN, Number.NaN];
}


function oddValue(mac, market) {
    const raw = mac?.canli_oranlar?.[market];
    return numeric(raw && typeof raw === 'object' ? raw.oran : raw);
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


function marketDescriptor(market) {
    if (['MS1', 'X', 'MS2'].includes(market)) {
        return { kind: 'result', side: market, line: Number.NaN };
    }
    const match = String(market || '').match(/^(\d+(?:\.\d+)?)_UST$/);
    return match ? { kind: 'total', side: 'UST', line: Number(match[1]) } : null;
}


function liveMarketProbability(mac, market, descriptor) {
    if (descriptor.kind === 'result') {
        const names = ['MS1', 'X', 'MS2'];
        return normalizeOdds(names.map(name => oddValue(mac, name)))[names.indexOf(market)];
    }
    return normalizeOdds([
        oddValue(mac, `${descriptor.line.toFixed(1)}_UST`),
        oddValue(mac, `${descriptor.line.toFixed(1)}_ALT`)
    ])[0];
}


function prematchSupport(mac, market, descriptor) {
    if (market === 'MS1') return numeric(mac?.prematch_p_home);
    if (market === 'X') return numeric(mac?.prematch_p_draw);
    if (market === 'MS2') return numeric(mac?.prematch_p_away);
    const total = mac?.prematch_totals?.[String(Number(descriptor.line))];
    return numeric(total?.over);
}


function commonFeatures(mac, shadowContext) {
    const minute = Math.max(1, finiteOr(mac?.dakika, 1));
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
    const totalGoals = homeScore + awayScore;
    const goalDiff = homeScore - awayScore;
    const homeVenue = shadowContext?.teamStats?.home?.home || {};
    const awayVenue = shadowContext?.teamStats?.away?.away || {};
    const homeStanding = shadowContext?.standings?.home || {};
    const awayStanding = shadowContext?.standings?.away || {};
    const apiPercent = shadowContext?.prediction?.percent || {};
    const strengthDelta = numeric(shadowContext?.strength?.delta);
    const expectedTotal = numeric(shadowContext?.strength?.expectedGoalsTotal);
    const homeVenueWin = numeric(homeVenue?.winRate);
    const homeVenueDraw = numeric(homeVenue?.drawRate);
    const homeVenueLoss = numeric(homeVenue?.lossRate);
    const homeVenueGf = numeric(homeVenue?.goalsForAverage);
    const homeVenueGa = numeric(homeVenue?.goalsAgainstAverage);
    const awayVenueWin = numeric(awayVenue?.winRate);
    const awayVenueDraw = numeric(awayVenue?.drawRate);
    const awayVenueLoss = numeric(awayVenue?.lossRate);
    const awayVenueGf = numeric(awayVenue?.goalsForAverage);
    const awayVenueGa = numeric(awayVenue?.goalsAgainstAverage);

    return {
        minute,
        minute_fraction: minute / 90,
        minute_sq: (minute / 90) ** 2,
        remaining_minutes: Math.max(0, 95 - minute),
        home_score: homeScore,
        away_score: awayScore,
        total_goals: totalGoals,
        goal_diff: goalDiff,
        abs_goal_diff: Math.abs(finiteOr(goalDiff)),
        is_level: finiteOr(goalDiff) === 0 ? 1 : 0,
        home_leading: finiteOr(goalDiff) > 0 ? 1 : 0,
        away_leading: finiteOr(goalDiff) < 0 ? 1 : 0,
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
        shot_accuracy: totalSot / Math.max(1, finiteOr(totalShots)),
        home_shot_share: homeShots / Math.max(1, finiteOr(totalShots)),
        home_sot_share: homeSot / Math.max(1, finiteOr(totalSot)),
        goals_per_sot: totalGoals / Math.max(1, finiteOr(totalSot)),
        home_corners: homeCorners,
        away_corners: awayCorners,
        total_corners: totalCorners,
        corner_diff: homeCorners - awayCorners,
        corners_rate90: totalCorners / minute * 90,
        home_possession: numeric(mac?.home_possession),
        away_possession: numeric(mac?.away_possession),
        possession_diff: numeric(mac?.home_possession) - numeric(mac?.away_possession),
        total_yellow: numeric(mac?.home_yellow) + numeric(mac?.away_yellow),
        yellow_diff: numeric(mac?.home_yellow) - numeric(mac?.away_yellow),
        total_red: numeric(mac?.home_red) + numeric(mac?.away_red),
        red_diff: numeric(mac?.home_red) - numeric(mac?.away_red),
        total_fouls: numeric(mac?.home_fouls) + numeric(mac?.away_fouls),
        foul_diff: numeric(mac?.home_fouls) - numeric(mac?.away_fouls),
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
        home_venue_played: numeric(shadowContext?.validation?.homeVenuePlayed),
        away_venue_played: numeric(shadowContext?.validation?.awayVenuePlayed),
        shadow_strength_delta: strengthDelta,
        shadow_abs_strength_delta: Math.abs(finiteOr(strengthDelta)),
        shadow_expected_goals_total: expectedTotal,
        home_venue_win_rate: homeVenueWin,
        home_venue_draw_rate: homeVenueDraw,
        home_venue_loss_rate: homeVenueLoss,
        home_venue_gf_avg: homeVenueGf,
        home_venue_ga_avg: homeVenueGa,
        away_venue_win_rate: awayVenueWin,
        away_venue_draw_rate: awayVenueDraw,
        away_venue_loss_rate: awayVenueLoss,
        away_venue_gf_avg: awayVenueGf,
        away_venue_ga_avg: awayVenueGa,
        venue_win_rate_diff: homeVenueWin - awayVenueWin,
        venue_draw_rate_sum: homeVenueDraw + awayVenueDraw,
        venue_goal_expectation: (homeVenueGf + awayVenueGa + awayVenueGf + homeVenueGa) / 2,
        rank_diff: numeric(awayStanding?.rank) - numeric(homeStanding?.rank),
        points_diff: numeric(homeStanding?.points) - numeric(awayStanding?.points),
        table_goal_diff: numeric(homeStanding?.goalsDiff) - numeric(awayStanding?.goalsDiff),
        api_prediction_home: numeric(apiPercent?.home) / 100,
        api_prediction_draw: numeric(apiPercent?.draw) / 100,
        api_prediction_away: numeric(apiPercent?.away) / 100
    };
}


function candidateFeatures(mac, market, dino, liveOnlyDino, shadowContext = null) {
    const descriptor = marketDescriptor(market);
    const model = MODEL.models?.[market];
    if (!descriptor || !model) return null;

    const odds = oddValue(mac, market);
    const dinoProbability = numeric(dino?.[market]) / 100;
    if (!Number.isFinite(odds) || odds <= 1.01 || odds > 30 || !Number.isFinite(dinoProbability)) {
        return null;
    }

    const [homeScore, awayScore] = scoreParts(mac);
    if (![homeScore, awayScore].every(Number.isFinite)) return null;
    if (descriptor.kind === 'total' && homeScore + awayScore > descriptor.line) return null;

    const normalizedLive = liveMarketProbability(mac, market, descriptor);
    const liveProbability = Number.isFinite(normalizedLive) ? normalizedLive : 1 / odds;
    const prematch = prematchSupport(mac, market, descriptor);
    const liveOnly = numeric(liveOnlyDino?.[market]) / 100;
    const features = commonFeatures(mac, shadowContext);
    const totalGoals = homeScore + awayScore;
    const apiKey = market === 'MS1' ? 'home' : market === 'X' ? 'draw' : market === 'MS2' ? 'away' : null;
    const apiSupport = apiKey
        ? numeric(shadowContext?.prediction?.percent?.[apiKey]) / 100
        : Number.NaN;
    const strengthDelta = numeric(shadowContext?.strength?.delta);
    const scoreDiff = homeScore - awayScore;
    const strengthAlignment = market === 'MS1'
        ? strengthDelta
        : market === 'X'
            ? -Math.abs(strengthDelta)
            : market === 'MS2'
                ? -strengthDelta
                : Number.NaN;
    const scoreAlignment = market === 'MS1'
        ? scoreDiff
        : market === 'X'
            ? -Math.abs(scoreDiff)
            : market === 'MS2'
                ? -scoreDiff
                : Number.NaN;

    Object.assign(features, {
        line: descriptor.line,
        goals_to_cross: descriptor.kind === 'total' ? descriptor.line + 0.5 - totalGoals : Number.NaN,
        line_cushion: descriptor.kind === 'total' ? descriptor.line - totalGoals : Number.NaN,
        dino_probability: dinoProbability,
        dino_logit: Math.log(
            Math.min(1 - 1e-5, Math.max(1e-5, dinoProbability)) /
            (1 - Math.min(1 - 1e-5, Math.max(1e-5, dinoProbability)))
        ),
        live_probability: liveProbability,
        raw_implied: 1 / odds,
        odds,
        prematch_support: prematch,
        live_only_probability: liveOnly,
        dino_live_gap: dinoProbability - liveProbability,
        dino_prematch_gap: dinoProbability - prematch,
        market_prematch_gap: liveProbability - prematch,
        agreement_dino_market: (dinoProbability >= 0.5) === (liveProbability >= 0.5) ? 1 : 0,
        expected_total_line_gap: descriptor.kind === 'total'
            ? numeric(shadowContext?.strength?.expectedGoalsTotal) - descriptor.line
            : Number.NaN,
        venue_total_line_gap: descriptor.kind === 'total'
            ? features.venue_goal_expectation - descriptor.line
            : Number.NaN,
        api_market_support: apiSupport,
        strength_market_alignment: strengthAlignment,
        score_market_alignment: scoreAlignment
    });

    return { features, descriptor, dinoProbability, liveProbability, prematch, odds };
}


function predict(features, artifact) {
    const original = artifact.featureNames.map(name => numeric(features?.[name]));
    const missing = original.map(value => !Number.isFinite(value));
    const transformed = original.map((value, index) =>
        Number.isFinite(value) ? value : artifact.imputer.statistics[index]
    );
    for (const index of artifact.imputer.missingIndicatorFeatureIndices) {
        transformed.push(missing[index] ? 1 : 0);
    }

    if (
        transformed.length !== artifact.logistic.coefficients.length ||
        transformed.length !== artifact.scaler.mean.length ||
        transformed.length !== artifact.scaler.scale.length
    ) {
        throw new Error(`V18 model boyutu uyuşmuyor: ${artifact.market}`);
    }

    let linear = artifact.logistic.intercept;
    for (let index = 0; index < transformed.length; index++) {
        const scaled = (transformed[index] - artifact.scaler.mean[index]) / artifact.scaler.scale[index];
        linear += scaled * artifact.logistic.coefficients[index];
    }
    const clipped = Math.max(-35, Math.min(35, linear));
    return 1 / (1 + Math.exp(-clipped));
}


function scoreMarket(mac, market, dino, liveOnlyDino, shadowContext = null) {
    const candidate = candidateFeatures(mac, market, dino, liveOnlyDino, shadowContext);
    if (!candidate) return null;
    const probability = predict(candidate.features, MODEL.models[market]);
    return {
        market,
        kind: candidate.descriptor.kind,
        odds: candidate.odds,
        dinoProbability: candidate.dinoProbability * 100,
        liveProbability: candidate.liveProbability * 100,
        prematchSupport: Number.isFinite(candidate.prematch) ? candidate.prematch * 100 : null,
        v18Probability: probability * 100,
        v18Edge: (probability - candidate.liveProbability) * 100,
        modelVariant: MODEL.models[market].variant
    };
}


module.exports = {
    MODEL,
    scoreMarket,
    _internal: {
        numeric,
        scoreParts,
        oddValue,
        normalizeOdds,
        commonFeatures,
        candidateFeatures,
        predict,
        marketDescriptor,
        liveMarketProbability,
        prematchSupport
    }
};
