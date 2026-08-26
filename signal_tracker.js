'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_VERSION = 1;
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);
const VOID_STATUSES = new Set(['CANC', 'ABD', 'AWD', 'WO']);

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSignalType(value) {
    return value === 'strong' ? 'strong' : 'surprise';
}

function calculateMarketResult(market, homeScore, awayScore) {
    const home = numberOrNull(homeScore);
    const away = numberOrNull(awayScore);

    if (home === null || away === null) return null;

    if (market === 'MS1') return home > away ? 'W' : 'L';
    if (market === 'X') return home === away ? 'W' : 'L';
    if (market === 'MS2') return away > home ? 'W' : 'L';

    const totalMatch = String(market || '').match(/^(\d+(?:\.\d+)?)_(ALT|UST)$/);
    if (!totalMatch) return null;

    const line = Number(totalMatch[1]);
    const direction = totalMatch[2];
    const totalGoals = home + away;

    if (totalGoals === line) return 'PUSH';
    if (direction === 'ALT') return totalGoals < line ? 'W' : 'L';
    return totalGoals > line ? 'W' : 'L';
}

function profitForResult(result, odds) {
    const parsedOdds = numberOrNull(odds);
    if (result === 'W' && parsedOdds !== null) return parsedOdds - 1;
    if (result === 'L') return -1;
    if (result === 'PUSH' || result === 'VOID') return 0;
    return null;
}

function emptyBucket() {
    return {
        total: 0,
        pending: 0,
        settled: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        voids: 0,
        hitRate: null,
        profit: 0,
        roi: null
    };
}

function finalizeBucket(bucket) {
    const graded = bucket.wins + bucket.losses;
    const staked = bucket.wins + bucket.losses + bucket.pushes;
    bucket.hitRate = graded > 0
        ? Number(((bucket.wins / graded) * 100).toFixed(1))
        : null;
    bucket.profit = Number(bucket.profit.toFixed(3));
    bucket.roi = staked > 0
        ? Number(((bucket.profit / staked) * 100).toFixed(1))
        : null;
    return bucket;
}

function addToBucket(bucket, signal) {
    bucket.total++;

    const result = signal?.settlement?.result || null;
    if (!result) {
        bucket.pending++;
        return;
    }

    bucket.settled++;
    if (result === 'W') bucket.wins++;
    if (result === 'L') bucket.losses++;
    if (result === 'PUSH') bucket.pushes++;
    if (result === 'VOID') bucket.voids++;

    const profit = numberOrNull(signal?.settlement?.profit);
    if (profit !== null) bucket.profit += profit;
}

class SignalTracker {
    constructor({ filePath, logger = () => {} }) {
        this.filePath = filePath;
        this.logger = logger;
        this.data = {
            version: HISTORY_VERSION,
            updatedAt: null,
            signals: []
        };
    }

    load() {
        try {
            if (!fs.existsSync(this.filePath)) {
                this.save();
                return;
            }

            const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            this.data = {
                version: HISTORY_VERSION,
                updatedAt: parsed?.updatedAt || null,
                signals: Array.isArray(parsed?.signals) ? parsed.signals : []
            };
            this.logger(`> 📚 Paylaşılan sinyal geçmişi yüklendi: ${this.data.signals.length} kayıt.`);
        } catch (error) {
            this.logger(`> ⚠️ Sinyal geçmişi yüklenemedi: ${error.message}`);
            this.data = {
                version: HISTORY_VERSION,
                updatedAt: null,
                signals: []
            };
        }
    }

    save() {
        const directory = path.dirname(this.filePath);
        fs.mkdirSync(directory, { recursive: true });
        this.data.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    }

    hasSignal(fixtureId, signalType) {
        const fixture = Number(fixtureId);
        const type = normalizeSignalType(signalType);
        return this.data.signals.some(
            signal => Number(signal.fixtureId) === fixture && signal.signalType === type
        );
    }

    recordSent(payload) {
        const fixtureId = Number(payload?.fixtureId);
        const signalType = normalizeSignalType(payload?.signalType);

        if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
            throw new Error('Geçerli fixture ID olmadan sinyal kaydedilemez.');
        }

        const existing = this.data.signals.find(
            signal => Number(signal.fixtureId) === fixtureId && signal.signalType === signalType
        );
        if (existing) return existing;

        const sentAt = payload.sentAt || new Date().toISOString();
        const record = {
            signalId: `${fixtureId}-${signalType}-${Date.now()}`,
            fixtureId,
            signalType,
            sentAt,
            telegramMessageId: payload.telegramMessageId ?? null,
            match: payload.match || null,
            league: payload.league || null,
            minute: numberOrNull(payload.minute),
            score: payload.score || null,
            market: payload.market || null,
            dinoProbability: numberOrNull(payload.dinoProbability),
            edge: numberOrNull(payload.edge),
            odds: numberOrNull(payload.odds),
            bookmaker: payload.bookmaker || null,
            marketProbability: numberOrNull(payload.marketProbability),
            modelVariant: payload.modelVariant || null,
            liveOnlyProbability: numberOrNull(payload.liveOnlyProbability),
            prematchSource: payload.prematchSource || null,
            prematchProbabilities: payload.prematchProbabilities || null,
            prematchMarketSupport: numberOrNull(payload.prematchMarketSupport),
            prematchMarketSource: payload.prematchMarketSource || null,
            statsSource: payload.statsSource || null,
            liveStats: payload.liveStats || {},
            analysis: payload.analysis || null,
            settlement: {
                result: null,
                profit: null,
                finalHome: null,
                finalAway: null,
                finalScore: null,
                fixtureStatus: null,
                resolvedAt: null
            }
        };

        this.data.signals.push(record);
        this.save();
        return record;
    }

    unresolvedFixtureIds() {
        return [...new Set(
            this.data.signals
                .filter(signal => !signal?.settlement?.result)
                .map(signal => Number(signal.fixtureId))
                .filter(fixtureId => Number.isFinite(fixtureId) && fixtureId > 0)
        )];
    }

    settleFixture(fixture) {
        const fixtureId = Number(fixture?.fixture?.id);
        if (!Number.isFinite(fixtureId) || fixtureId <= 0) return 0;

        const shortStatus = String(fixture?.fixture?.status?.short || '').toUpperCase();
        const isVoid = VOID_STATUSES.has(shortStatus);
        const isFinal = FINAL_STATUSES.has(shortStatus) || fixture?.fixture?.status?.finished === true;
        if (!isVoid && !isFinal) return 0;

        // Canlı 1X2 ve toplam gol marketleri normal sürenin sonucuna göre
        // değerlendirilir. Uzatma/penaltı oynandıysa API'nin fulltime alanını
        // tercih et; yalnızca bu alan yoksa genel goals değerine dön.
        const fulltimeHome = numberOrNull(fixture?.score?.fulltime?.home);
        const fulltimeAway = numberOrNull(fixture?.score?.fulltime?.away);
        const finalHome = fulltimeHome !== null
            ? fulltimeHome
            : numberOrNull(fixture?.goals?.home);
        const finalAway = fulltimeAway !== null
            ? fulltimeAway
            : numberOrNull(fixture?.goals?.away);
        let changed = 0;

        for (const signal of this.data.signals) {
            if (
                Number(signal.fixtureId) !== fixtureId ||
                signal?.settlement?.result
            ) {
                continue;
            }

            const result = isVoid
                ? 'VOID'
                : calculateMarketResult(signal.market, finalHome, finalAway);
            if (!result) continue;

            signal.settlement = {
                result,
                profit: profitForResult(result, signal.odds),
                finalHome,
                finalAway,
                finalScore: finalHome !== null && finalAway !== null
                    ? `${finalHome}-${finalAway}`
                    : null,
                fixtureStatus: shortStatus || null,
                resolvedAt: new Date().toISOString()
            };
            changed++;
        }

        if (changed > 0) this.save();
        return changed;
    }

    summary() {
        const overall = emptyBucket();
        const byType = {
            surprise: emptyBucket(),
            strong: emptyBucket()
        };
        const byMarket = {};
        const uniqueFixtures = new Set();

        for (const signal of this.data.signals) {
            uniqueFixtures.add(Number(signal.fixtureId));
            addToBucket(overall, signal);

            const type = normalizeSignalType(signal.signalType);
            addToBucket(byType[type], signal);

            const market = signal.market || 'Bilinmiyor';
            if (!byMarket[market]) byMarket[market] = emptyBucket();
            addToBucket(byMarket[market], signal);
        }

        finalizeBucket(overall);
        finalizeBucket(byType.surprise);
        finalizeBucket(byType.strong);
        for (const bucket of Object.values(byMarket)) finalizeBucket(bucket);

        return {
            updatedAt: this.data.updatedAt,
            uniqueFixtures: uniqueFixtures.size,
            overall,
            byType,
            byMarket
        };
    }

    list(limit = 100) {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100000));
        return [...this.data.signals]
            .sort((left, right) => new Date(right.sentAt) - new Date(left.sentAt))
            .slice(0, safeLimit);
    }

    exportPayload(meta = {}) {
        return {
            format: 'dino-shared-signals',
            version: HISTORY_VERSION,
            exportedAt: new Date().toISOString(),
            ...meta,
            summary: this.summary(),
            signals: this.list(100000)
        };
    }
}

module.exports = {
    SignalTracker,
    calculateMarketResult,
    profitForResult
};
