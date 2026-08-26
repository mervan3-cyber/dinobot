'use strict';

const fs = require('fs');
const path = require('path');
const {
    calculateMarketResult,
    profitForResult
} = require('./signal_tracker');

const HISTORY_VERSION = 1;
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);
const VOID_STATUSES = new Set(['CANC', 'ABD', 'AWD', 'WO']);


function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}


function emptyResultBucket() {
    return {
        total: 0,
        pending: 0,
        settled: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        voids: 0,
        priced: 0,
        profit: 0,
        hitRate: null,
        roi: null
    };
}


function addToResultBucket(bucket, record) {
    bucket.total++;
    const result = record?.settlement?.result || null;
    if (!result) {
        bucket.pending++;
        return;
    }

    bucket.settled++;
    if (result === 'W') bucket.wins++;
    if (result === 'L') bucket.losses++;
    if (result === 'PUSH') bucket.pushes++;
    if (result === 'VOID') bucket.voids++;

    const profit = numberOrNull(record?.settlement?.profit);
    const odds = numberOrNull(record?.odds);
    if (profit !== null && odds !== null && odds > 1) {
        bucket.priced++;
        bucket.profit += profit;
    }
}


function finalizeResultBucket(bucket) {
    const graded = bucket.wins + bucket.losses;
    const staked = bucket.priced;
    bucket.hitRate = graded > 0
        ? Number(((bucket.wins / graded) * 100).toFixed(1))
        : null;
    bucket.profit = Number(bucket.profit.toFixed(3));
    bucket.roi = staked > 0
        ? Number(((bucket.profit / staked) * 100).toFixed(1))
        : null;
    return bucket;
}


class CandidateTracker {
    constructor({ filePath, logger = () => {}, maxRecords = 50000 }) {
        this.filePath = filePath;
        this.logger = logger;
        this.maxRecords = Math.max(1000, Number(maxRecords) || 50000);
        this.data = {
            version: HISTORY_VERSION,
            updatedAt: null,
            records: []
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
                records: Array.isArray(parsed?.records) ? parsed.records : []
            };
            this.trim();
            this.logger(
                `> 📚 Tam-stat aday geçmişi yüklendi: ${this.data.records.length} market anı.`
            );
        } catch (error) {
            this.logger(`> ⚠️ Aday geçmişi yüklenemedi: ${error.message}`);
            this.data = {
                version: HISTORY_VERSION,
                updatedAt: null,
                records: []
            };
        }
    }


    save() {
        const directory = path.dirname(this.filePath);
        fs.mkdirSync(directory, { recursive: true });
        this.data.updatedAt = new Date().toISOString();
        fs.writeFileSync(
            this.filePath,
            JSON.stringify(this.data, null, 2),
            'utf8'
        );
    }


    trim() {
        if (this.data.records.length <= this.maxRecords) return;

        const pending = this.data.records.filter(record => !record?.settlement?.result);
        const settled = this.data.records
            .filter(record => record?.settlement?.result)
            .sort((left, right) => new Date(right.capturedAt) - new Date(left.capturedAt));
        const settledLimit = Math.max(0, this.maxRecords - pending.length);
        this.data.records = [
            ...pending,
            ...settled.slice(0, settledLimit)
        ].sort((left, right) => new Date(left.capturedAt) - new Date(right.capturedAt));

        if (this.data.records.length > this.maxRecords) {
            this.data.records = this.data.records.slice(-this.maxRecords);
        }
    }


    recordBatch(records) {
        const incoming = Array.isArray(records)
            ? records.filter(record => record && typeof record === 'object')
            : [];
        if (incoming.length === 0) return 0;

        const existingIds = new Set(this.data.records.map(record => record.recordId));
        let added = 0;

        for (const payload of incoming) {
            if (!payload.recordId || existingIds.has(payload.recordId)) continue;

            this.data.records.push({
                ...payload,
                settlement: payload.settlement || {
                    result: null,
                    profit: null,
                    finalHome: null,
                    finalAway: null,
                    finalScore: null,
                    fixtureStatus: null,
                    resolvedAt: null
                }
            });
            existingIds.add(payload.recordId);
            added++;
        }

        if (added > 0) {
            this.trim();
            this.save();
        }

        return added;
    }


    unresolvedFixtureIds() {
        return [...new Set(
            this.data.records
                .filter(record => record.market && !record?.settlement?.result)
                .map(record => Number(record.fixtureId))
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

        const fulltimeHome = numberOrNull(fixture?.score?.fulltime?.home);
        const fulltimeAway = numberOrNull(fixture?.score?.fulltime?.away);
        const finalHome = fulltimeHome !== null
            ? fulltimeHome
            : numberOrNull(fixture?.goals?.home);
        const finalAway = fulltimeAway !== null
            ? fulltimeAway
            : numberOrNull(fixture?.goals?.away);
        let changed = 0;

        for (const record of this.data.records) {
            if (
                Number(record.fixtureId) !== fixtureId ||
                !record.market ||
                record?.settlement?.result
            ) {
                continue;
            }

            const result = isVoid
                ? 'VOID'
                : calculateMarketResult(record.market, finalHome, finalAway);
            if (!result) continue;

            record.settlement = {
                result,
                profit: numberOrNull(record.odds) !== null
                    ? profitForResult(result, record.odds)
                    : null,
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
        const overall = emptyResultBucket();
        const byDecision = {};
        const byClass = {};
        const uniqueFixtures = new Set();
        let sent = 0;
        let invalidMarket = 0;
        let unsentWinners = 0;

        for (const record of this.data.records) {
            uniqueFixtures.add(Number(record.fixtureId));
            addToResultBucket(overall, record);

            const decision = record.decision || 'unknown';
            byDecision[decision] = (byDecision[decision] || 0) + 1;

            const signalClass = record.signalClass || 'class_outside';
            byClass[signalClass] = (byClass[signalClass] || 0) + 1;

            if (decision === 'sent') sent++;
            if (decision === 'market_already_decided') invalidMarket++;
            if (
                record?.settlement?.result === 'W' &&
                decision !== 'sent' &&
                decision !== 'market_already_decided'
            ) {
                unsentWinners++;
            }
        }

        finalizeResultBucket(overall);
        return {
            updatedAt: this.data.updatedAt,
            totalRecords: this.data.records.length,
            uniqueFixtures: uniqueFixtures.size,
            sent,
            invalidMarket,
            unsentWinners,
            overall,
            byDecision,
            byClass
        };
    }


    list(limit = 200) {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 100000));
        return [...this.data.records]
            .sort((left, right) => new Date(right.capturedAt) - new Date(left.capturedAt))
            .slice(0, safeLimit);
    }


    exportPayload(meta = {}) {
        return {
            format: 'dino-full-stats-candidates',
            version: HISTORY_VERSION,
            exportedAt: new Date().toISOString(),
            ...meta,
            summary: this.summary(),
            records: this.list(100000)
        };
    }
}


module.exports = {
    CandidateTracker
};
