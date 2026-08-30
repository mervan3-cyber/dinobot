'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_VERSION = 2;
const CACHE_BUCKETS = ['teamStats', 'standings', 'predictions'];


function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseFloat(String(value).replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}


function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}


function safeRate(count, total) {
    const numerator = numberOrNull(count);
    const denominator = numberOrNull(total);
    if (numerator === null || denominator === null || denominator <= 0) return null;
    return round(numerator / denominator, 4);
}


function normalizePercent(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return null;
    return round(parsed > 1 ? parsed : parsed * 100, 1);
}


function compactSplit(fixtures, goalsFor, goalsAgainst, side) {
    const played = numberOrNull(fixtures?.played?.[side]);
    const wins = numberOrNull(fixtures?.wins?.[side]);
    const draws = numberOrNull(fixtures?.draws?.[side]);
    const losses = numberOrNull(fixtures?.loses?.[side]);

    return {
        played,
        wins,
        draws,
        losses,
        winRate: safeRate(wins, played),
        drawRate: safeRate(draws, played),
        lossRate: safeRate(losses, played),
        goalsForAverage: numberOrNull(goalsFor?.average?.[side]),
        goalsAgainstAverage: numberOrNull(goalsAgainst?.average?.[side])
    };
}


function normalizeExpectedIdentity(expected) {
    if (expected === null || expected === undefined) return {};
    if (typeof expected === 'number' || typeof expected === 'string') {
        return { teamId: numberOrNull(expected) };
    }
    return {
        fixtureId: numberOrNull(expected.fixtureId),
        leagueId: numberOrNull(expected.leagueId),
        season: numberOrNull(expected.season),
        teamId: numberOrNull(expected.teamId),
        homeTeamId: numberOrNull(expected.homeTeamId),
        awayTeamId: numberOrNull(expected.awayTeamId)
    };
}


function identityCheck(actual, expected) {
    if (expected === null || expected === undefined) return null;
    if (actual === null || actual === undefined) return false;
    return Number(actual) === Number(expected);
}


function checksAreValid(checks) {
    const values = Object.values(checks).filter(value => value !== null);
    return values.length > 0 && values.every(value => value === true);
}


function parseTeamStatisticsPayload(payload, expectedIdentity = null) {
    const expected = normalizeExpectedIdentity(expectedIdentity);
    const raw = payload?.response;
    const response = Array.isArray(raw) ? raw[0] : raw;
    if (!response || typeof response !== 'object') {
        return {
            available: false,
            validation: {
                identityValid: false,
                reason: 'response_missing'
            }
        };
    }

    const fixtures = response.fixtures || {};
    const goalsFor = response.goals?.for || {};
    const goalsAgainst = response.goals?.against || {};
    const teamId = numberOrNull(response.team?.id);
    const leagueId = numberOrNull(response.league?.id);
    const season = numberOrNull(response.league?.season);
    const totalPlayed = numberOrNull(fixtures?.played?.total);
    const totalWins = numberOrNull(fixtures?.wins?.total);
    const totalDraws = numberOrNull(fixtures?.draws?.total);
    const totalLosses = numberOrNull(fixtures?.loses?.total);

    const identityChecks = {
        teamIdMatches: identityCheck(teamId, expected.teamId),
        leagueIdMatches: identityCheck(leagueId, expected.leagueId),
        seasonMatches: identityCheck(season, expected.season)
    };
    const identityValid = Object.values(expected).filter(
        value => value !== null && value !== undefined
    ).length === 0
        ? teamId !== null
        : checksAreValid(identityChecks);

    return {
        available: identityValid,
        team: {
            id: teamId,
            name: response.team?.name || null
        },
        league: {
            id: leagueId,
            season
        },
        validation: {
            identityValid,
            checks: identityChecks,
            expected
        },
        form: response.form || null,
        total: {
            played: totalPlayed,
            wins: totalWins,
            draws: totalDraws,
            losses: totalLosses,
            winRate: safeRate(totalWins, totalPlayed),
            drawRate: safeRate(totalDraws, totalPlayed),
            lossRate: safeRate(totalLosses, totalPlayed),
            goalsForAverage: numberOrNull(goalsFor?.average?.total),
            goalsAgainstAverage: numberOrNull(goalsAgainst?.average?.total),
            cleanSheetRate: safeRate(response.clean_sheet?.total, totalPlayed),
            failedToScoreRate: safeRate(response.failed_to_score?.total, totalPlayed)
        },
        home: compactSplit(fixtures, goalsFor, goalsAgainst, 'home'),
        away: compactSplit(fixtures, goalsFor, goalsAgainst, 'away')
    };
}


function flattenStandings(value, output = []) {
    if (!Array.isArray(value)) return output;
    for (const item of value) {
        if (Array.isArray(item)) {
            flattenStandings(item, output);
        } else if (item && typeof item === 'object') {
            output.push(item);
        }
    }
    return output;
}


function compactStanding(entry) {
    const compactRecord = record => ({
        played: numberOrNull(record?.played),
        wins: numberOrNull(record?.win),
        draws: numberOrNull(record?.draw),
        losses: numberOrNull(record?.lose),
        goalsFor: numberOrNull(record?.goals?.for),
        goalsAgainst: numberOrNull(record?.goals?.against)
    });

    return {
        teamId: numberOrNull(entry?.team?.id),
        teamName: entry?.team?.name || null,
        rank: numberOrNull(entry?.rank),
        points: numberOrNull(entry?.points),
        goalsDiff: numberOrNull(entry?.goalsDiff),
        form: entry?.form || null,
        group: entry?.group || null,
        description: entry?.description || null,
        all: compactRecord(entry?.all),
        home: compactRecord(entry?.home),
        away: compactRecord(entry?.away)
    };
}


function parseStandingsPayload(payload, expectedIdentity = null) {
    const expected = normalizeExpectedIdentity(expectedIdentity);
    const responses = Array.isArray(payload?.response) ? payload.response : [];
    const entries = [];
    const matchedLeagues = [];

    for (const response of responses) {
        const leagueId = numberOrNull(response?.league?.id);
        const season = numberOrNull(response?.league?.season);
        const leagueMatches = identityCheck(leagueId, expected.leagueId);
        const seasonMatches = identityCheck(season, expected.season);
        if (leagueMatches === false || seasonMatches === false) continue;

        const standings = flattenStandings(response?.league?.standings || []);
        for (const standing of standings) {
            entries.push(compactStanding(standing));
        }
        matchedLeagues.push({ leagueId, season });
    }

    const hasExpectation = expected.leagueId !== null || expected.season !== null;
    const identityValid = hasExpectation
        ? matchedLeagues.length > 0
        : entries.length > 0;

    return {
        available: entries.length > 0 && identityValid,
        entries,
        validation: {
            identityValid,
            expected,
            matchedLeagues
        }
    };
}


function predictionLean(percentages) {
    const rows = [
        ['MS1', numberOrNull(percentages?.home)],
        ['X', numberOrNull(percentages?.draw)],
        ['MS2', numberOrNull(percentages?.away)]
    ].filter(([, value]) => value !== null);

    if (rows.length !== 3) return null;
    rows.sort((left, right) => right[1] - left[1]);
    return rows[0][0];
}


function parsePredictionsPayload(payload, expectedIdentity = null) {
    const expected = normalizeExpectedIdentity(expectedIdentity);
    const response = Array.isArray(payload?.response)
        ? payload.response[0]
        : null;
    const prediction = response?.predictions;
    if (!prediction || typeof prediction !== 'object') {
        return {
            available: false,
            validation: {
                identityValid: false,
                reason: 'prediction_missing',
                expected
            }
        };
    }

    const actual = {
        fixtureId: numberOrNull(response?.fixture?.id),
        leagueId: numberOrNull(response?.league?.id),
        homeTeamId: numberOrNull(response?.teams?.home?.id),
        awayTeamId: numberOrNull(response?.teams?.away?.id)
    };
    const checks = {
        fixtureIdMatches: actual.fixtureId === null
            ? null
            : identityCheck(actual.fixtureId, expected.fixtureId),
        leagueIdMatches: actual.leagueId === null
            ? null
            : identityCheck(actual.leagueId, expected.leagueId),
        homeTeamIdMatches: actual.homeTeamId === null
            ? null
            : identityCheck(actual.homeTeamId, expected.homeTeamId),
        awayTeamIdMatches: actual.awayTeamId === null
            ? null
            : identityCheck(actual.awayTeamId, expected.awayTeamId)
    };
    const explicitChecks = Object.values(checks).filter(value => value !== null);
    const hasExpectedIdentity = Object.values(expected).some(
        value => value !== null && value !== undefined
    );
    const identityValid = explicitChecks.length === 0
        ? (!hasExpectedIdentity || Number.isFinite(expected.fixtureId))
        : explicitChecks.every(value => value === true);

    const percent = {
        home: normalizePercent(prediction.percent?.home),
        draw: normalizePercent(prediction.percent?.draw),
        away: normalizePercent(prediction.percent?.away)
    };

    const comparison = {};
    for (const key of [
        'form', 'att', 'def', 'poisson_distribution',
        'h2h', 'goals', 'total'
    ]) {
        const item = response?.comparison?.[key];
        comparison[key] = item
            ? {
                home: normalizePercent(item.home),
                away: normalizePercent(item.away)
            }
            : null;
    }

    const percentagesComplete = ['home', 'draw', 'away'].every(
        key => Number.isFinite(Number(percent[key]))
    );

    return {
        available: identityValid && percentagesComplete,
        validation: {
            identityValid,
            percentagesComplete,
            checks,
            expected,
            actual,
            requestFixtureId: expected.fixtureId
        },
        winner: {
            id: numberOrNull(prediction.winner?.id),
            name: prediction.winner?.name || null,
            comment: prediction.winner?.comment || null
        },
        winOrDraw: prediction.win_or_draw ?? null,
        underOver: prediction.under_over || null,
        goals: {
            home: prediction.goals?.home ?? null,
            away: prediction.goals?.away ?? null
        },
        advice: prediction.advice || null,
        percent,
        marketLean: predictionLean(percent),
        comparison
    };
}


function standingByTeam(standingsResult, teamId) {
    const id = Number(teamId);
    if (!Number.isFinite(id)) return null;
    return standingsResult?.entries?.find(
        entry => Number(entry?.teamId) === id
    ) || null;
}


function venueProfile(teamStats, side) {
    const profile = teamStats?.[side];
    return profile && typeof profile === 'object'
        ? profile
        : null;
}


function deriveStrengthSnapshot(homeStats, awayStats, homeStanding, awayStanding) {
    const home = venueProfile(homeStats, 'home');
    const away = venueProfile(awayStats, 'away');
    if (!home || !away) {
        return {
            available: false,
            lean: null,
            delta: null,
            expectedGoalsTotal: null
        };
    }

    const homeWinRate = numberOrNull(home.winRate);
    const awayWinRate = numberOrNull(away.winRate);
    const homeFor = numberOrNull(home.goalsForAverage);
    const homeAgainst = numberOrNull(home.goalsAgainstAverage);
    const awayFor = numberOrNull(away.goalsForAverage);
    const awayAgainst = numberOrNull(away.goalsAgainstAverage);

    const components = [];
    if (homeWinRate !== null && awayWinRate !== null) {
        components.push((homeWinRate - awayWinRate) * 40);
    }
    if ([homeFor, homeAgainst, awayFor, awayAgainst].every(value => value !== null)) {
        const homeBalance = homeFor - homeAgainst;
        const awayBalance = awayFor - awayAgainst;
        components.push((homeBalance - awayBalance) * 12);
    }

    const homeRank = numberOrNull(homeStanding?.rank);
    const awayRank = numberOrNull(awayStanding?.rank);
    if (homeRank !== null && awayRank !== null) {
        components.push(Math.max(-12, Math.min(12, awayRank - homeRank)) * 1.5);
    }

    const delta = components.length > 0
        ? round(components.reduce((sum, value) => sum + value, 0), 1)
        : null;
    const expectedHomeGoals = homeFor !== null && awayAgainst !== null
        ? (homeFor + awayAgainst) / 2
        : null;
    const expectedAwayGoals = awayFor !== null && homeAgainst !== null
        ? (awayFor + homeAgainst) / 2
        : null;
    const expectedGoalsTotal = expectedHomeGoals !== null && expectedAwayGoals !== null
        ? round(expectedHomeGoals + expectedAwayGoals, 2)
        : null;

    return {
        available: delta !== null || expectedGoalsTotal !== null,
        lean: delta === null
            ? null
            : delta >= 8
                ? 'HOME'
                : delta <= -8
                    ? 'AWAY'
                    : 'BALANCED',
        delta,
        expectedGoalsTotal,
        components: {
            homeWinRate,
            awayWinRate,
            homeGoalsForAverage: homeFor,
            homeGoalsAgainstAverage: homeAgainst,
            awayGoalsForAverage: awayFor,
            awayGoalsAgainstAverage: awayAgainst,
            homeRank,
            awayRank
        },
        note: 'V16 ikinci katman bağlamıdır; eksik veya tam doğrulanmamış bağlam tek başına Telegram vetosu değildir.'
    };
}


function normalizedPredictionTotal(value) {
    const match = String(value || '')
        .trim()
        .toLowerCase()
        .match(/(over|under)\s*(\d+(?:\.\d+)?)/);
    if (!match) return null;
    return `${Number(match[2])}_${match[1] === 'over' ? 'UST' : 'ALT'}`;
}


function buildMarketShadowAssessment(context, market) {
    const selectedMarket = String(market || '');
    const prediction = context?.prediction;
    const strength = context?.strength;
    let predictionSupport = null;
    let predictionAgrees = null;
    let strengthAgrees = null;

    if (['MS1', 'X', 'MS2'].includes(selectedMarket)) {
        const key = selectedMarket === 'MS1'
            ? 'home'
            : selectedMarket === 'X'
                ? 'draw'
                : 'away';
        predictionSupport = numberOrNull(prediction?.percent?.[key]);
        predictionAgrees = prediction?.marketLean
            ? prediction.marketLean === selectedMarket
            : null;
        strengthAgrees = strength?.lean
            ? (
                selectedMarket === 'MS1'
                    ? strength.lean === 'HOME'
                    : selectedMarket === 'MS2'
                        ? strength.lean === 'AWAY'
                        : strength.lean === 'BALANCED'
            )
            : null;
    } else {
        const predictedTotal = normalizedPredictionTotal(prediction?.underOver);
        predictionAgrees = predictedTotal
            ? predictedTotal === selectedMarket
            : null;
        const totalMatch = selectedMarket.match(/^(\d+(?:\.\d+)?)_(ALT|UST)$/);
        const expectedTotal = numberOrNull(strength?.expectedGoalsTotal);
        if (totalMatch && expectedTotal !== null) {
            const line = Number(totalMatch[1]);
            strengthAgrees = totalMatch[2] === 'UST'
                ? expectedTotal > line
                : expectedTotal < line;
        }
    }

    const agreements = [predictionAgrees, strengthAgrees]
        .filter(value => value === true).length;
    const disagreements = [predictionAgrees, strengthAgrees]
        .filter(value => value === false).length;

    return {
        decisionImpact: context?.decisionImpact === true,
        validationStatus: context?.validation?.fullyVerified === true
            ? 'fully_verified'
            : context?.available === true
                ? 'partial'
                : 'missing',
        sourceAgreements: agreements,
        sourceDisagreements: disagreements,
        predictionSupport,
        predictionAgrees,
        predictionLean: prediction?.marketLean || null,
        predictionUnderOver: prediction?.underOver || null,
        strengthAgrees,
        strengthLean: strength?.lean || null,
        strengthDelta: numberOrNull(strength?.delta),
        expectedGoalsTotal: numberOrNull(strength?.expectedGoalsTotal)
    };
}


class ShadowPowerCache {
    constructor({ filePath, logger = () => {} }) {
        this.filePath = filePath;
        this.logger = logger;
        this.data = this.emptyData();
    }


    emptyData() {
        return {
            version: CACHE_VERSION,
            updatedAt: null,
            teamStats: {},
            standings: {},
            predictions: {}
        };
    }


    load() {
        try {
            if (!fs.existsSync(this.filePath)) {
                this.save();
                return;
            }
            const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            if (Number(parsed?.version) !== CACHE_VERSION) {
                this.logger('> 🧪 Eski gölge güç önbelleği kimlik doğrulaması için sıfırlandı.');
                this.data = this.emptyData();
                this.save();
                return;
            }
            this.data = this.emptyData();
            this.data.updatedAt = parsed?.updatedAt || null;
            for (const bucket of CACHE_BUCKETS) {
                this.data[bucket] = parsed?.[bucket] && typeof parsed[bucket] === 'object'
                    ? parsed[bucket]
                    : {};
            }
            this.prune();
            this.logger(
                `> 🧪 Gölge güç önbelleği yüklendi: ${this.summary().total} kayıt.`
            );
        } catch (error) {
            this.logger(`> ⚠️ Gölge güç önbelleği yüklenemedi: ${error.message}`);
            this.data = this.emptyData();
        }
    }


    save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        this.data.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    }


    prune() {
        const now = Date.now();
        for (const bucket of CACHE_BUCKETS) {
            for (const [key, entry] of Object.entries(this.data[bucket] || {})) {
                if (!Number.isFinite(Number(entry?.expiresAt)) || Number(entry.expiresAt) <= now) {
                    delete this.data[bucket][key];
                }
            }
        }
    }


    get(bucket, key) {
        if (!CACHE_BUCKETS.includes(bucket)) return null;
        const entry = this.data[bucket]?.[String(key)];
        if (!entry) return null;
        if (!Number.isFinite(Number(entry.expiresAt)) || Number(entry.expiresAt) <= Date.now()) {
            delete this.data[bucket][String(key)];
            return null;
        }
        return entry;
    }


    set(bucket, key, result, { ttlMs, status = 'ok' } = {}) {
        if (!CACHE_BUCKETS.includes(bucket) || key === null || key === undefined) return;
        const safeTtl = Math.max(60_000, Number(ttlMs) || 60 * 60 * 1000);
        this.data[bucket][String(key)] = {
            status,
            fetchedAt: new Date().toISOString(),
            expiresAt: Date.now() + safeTtl,
            result: result || null
        };
        this.prune();
        this.save();
    }


    summary() {
        this.prune();
        const byType = {};
        let total = 0;
        for (const bucket of CACHE_BUCKETS) {
            const entries = Object.values(this.data[bucket] || {});
            total += entries.length;
            byType[bucket] = {
                total: entries.length,
                available: entries.filter(
                    entry => entry.status === 'ok' && entry.result?.available !== false
                ).length,
                missing: entries.filter(
                    entry => entry.status !== 'ok' || entry.result?.available === false
                ).length
            };
        }
        return {
            total,
            byType,
            updatedAt: this.data.updatedAt
        };
    }
}


module.exports = {
    ShadowPowerCache,
    parseTeamStatisticsPayload,
    parseStandingsPayload,
    parsePredictionsPayload,
    standingByTeam,
    deriveStrengthSnapshot,
    buildMarketShadowAssessment
};
