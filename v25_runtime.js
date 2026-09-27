'use strict';

const MODEL = require('./v25_lean_runtime.json');

function finite(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function sigmoid(value) {
    if (value >= 0) {
        const exp = Math.exp(-value);
        return 1 / (1 + exp);
    }
    const exp = Math.exp(value);
    return exp / (1 + exp);
}

function logit(value) {
    const clipped = Math.min(1 - 1e-5, Math.max(1e-5, value));
    return Math.log(clipped / (1 - clipped));
}

function pipelineProbability(model, features) {
    const numeric = model.numericFeatures.map((name, index) => {
        const value = finite(features[name]);
        return value === null ? model.numericImpute[index] : value;
    });
    const missing = model.numericFeatures.map(name => finite(features[name]) === null);
    for (const sourceIndex of model.numericIndicatorFeatures) {
        numeric.push(missing[sourceIndex] ? 1 : 0);
    }

    let decision = model.intercept;
    for (let index = 0; index < numeric.length; index += 1) {
        const scale = model.numericScale[index] || 1;
        const standardized = (numeric[index] - model.numericMean[index]) / scale;
        decision += standardized * model.numericCoefficients[index];
    }

    decision += model.categoricalBaseContribution;
    for (let index = 0; index < model.categoricalFeatures.length; index += 1) {
        const feature = model.categoricalFeatures[index];
        const raw = features[feature] === null || features[feature] === undefined || features[feature] === ''
            ? model.categoricalImpute[index]
            : String(features[feature]);
        const mapping = model.categoricalContributionDelta[feature] || {};
        decision += Object.prototype.hasOwnProperty.call(mapping, raw)
            ? mapping[raw]
            : (mapping.__UNKNOWN__ || 0);
    }
    return sigmoid(decision);
}

function parseScore(value) {
    const match = /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(String(value || ''));
    return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

function featureRow(input) {
    const score = parseScore(input?.score);
    const minute = finite(input?.minute);
    const odds = finite(input?.odds);
    const lineMatch = /^(\d+(?:\.\d+)?)_UST$/.exec(String(input?.market || ''));
    const line = lineMatch ? Number(lineMatch[1]) : null;
    if (!score || minute === null || odds === null || odds <= 1 || line === null) return null;
    const currentTotal = score.home + score.away;
    const goalsNeeded = Math.floor(line) + 1 - currentTotal;
    const minutesRemaining = Math.max(1, 90 - minute);
    return {
        minute,
        score_home: score.home,
        score_away: score.away,
        score_diff: score.home - score.away,
        current_total: currentTotal,
        line,
        goals_needed: goalsNeeded,
        odds,
        implied_probability: 100 / odds,
        prematch_support: finite(input?.prematchSupport),
        minutes_remaining: minutesRemaining,
        goals_needed_per_remaining_minute: goalsNeeded / minutesRemaining,
        is_weekend: input?.isWeekend ? 1 : 0,
        market: String(input.market),
        score: `${score.home}-${score.away}`,
        status_short: minute <= 45 ? '1H' : '2H'
    };
}

function score(input) {
    const branch = String(input?.branch || '').toUpperCase();
    const branchModel = MODEL.branches[branch];
    const features = featureRow(input);
    if (!branchModel || !features) return null;
    const core = pipelineProbability(branchModel.core, features);
    const segmentModel = branchModel.segments[String(input.market).toUpperCase()];
    const segment = segmentModel ? pipelineProbability(segmentModel, features) : core;
    const alpha = branchModel.blend.coreWeight;
    const raw = alpha * core + (1 - alpha) * segment;
    const calibrated = sigmoid(
        branchModel.blend.calibrationIntercept +
        branchModel.blend.calibrationCoefficient * logit(raw)
    );
    const marketProbability = 1 / features.odds;
    return {
        modelVersion: MODEL.version,
        trainedThrough: MODEL.trainedThrough,
        branch,
        market: features.market,
        probability: Number((100 * calibrated).toFixed(4)),
        rawProbability: Number((100 * raw).toFixed(4)),
        coreProbability: Number((100 * core).toFixed(4)),
        segmentProbability: Number((100 * segment).toFixed(4)),
        marketProbability: Number((100 * marketProbability).toFixed(4)),
        edge: Number((100 * (calibrated - marketProbability)).toFixed(4))
    };
}

function checkJoint(input, rule) {
    const result = score(input);
    const reasons = [];
    if (!result) reasons.push('V25_SCORE_UNAVAILABLE');
    if (result && result.probability < Number(rule?.probabilityMinimum ?? 60)) {
        reasons.push('V25_PROBABILITY_BELOW_MINIMUM');
    }
    if (result && result.edge < Number(rule?.edgeLow)) reasons.push('V25_EDGE_BELOW_MINIMUM');
    if (result && result.edge >= Number(rule?.edgeHigh)) reasons.push('V25_EDGE_AT_OR_ABOVE_MAXIMUM');
    return { eligible: reasons.length === 0, reasons, score: result, rule };
}

module.exports = { MODEL, score, checkJoint, _internal: { finite, sigmoid, logit, featureRow, pipelineProbability } };
