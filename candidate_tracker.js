'use strict';

const fs = require('fs');
const path = require('path');
const {
    calculateMarketResult,
    profitForResult
} = require('./signal_tracker');

const HISTORY_VERSION = 2;
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
            shadowContexts: {},
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
                shadowContexts: parsed?.shadowContexts && typeof parsed.shadowContexts === 'object'
                    ? parsed.shadowContexts
                    : {},
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
                shadowContexts: {},
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
        if (this.data.records.length > this.maxRecords) {
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

        const usedContexts = new Set(
            this.data.records
                .map(record => record?.shadowContextId)
                .filter(Boolean)
        );
        for (const key of Object.keys(this.data.shadowContexts || {})) {
            if (!usedContexts.has(key)) delete this.data.shadowContexts[key];
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

            const normalized = { ...payload };
            if (payload.shadowContext) {
                const contextId = payload.shadowContextId ||
                    `${payload.scanId || payload.capturedAt}:${Number(payload.fixtureId)}`;
                this.data.shadowContexts[contextId] = payload.shadowContext;
                normalized.shadowContextId = contextId;
                delete normalized.shadowContext;
            }

            this.data.records.push({
                ...normalized,
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


    shadowContextFor(record) {
        if (record?.shadowContext) return record.shadowContext;
        const contextId = record?.shadowContextId;
        return contextId
            ? this.data.shadowContexts?.[contextId] || null
            : null;
    }


    unresolvedFixtureIds() {
        return [...new Set(
            this.data.records
                .filter(record => record.market && !record?.settlement?.result)
                .map(record => Number(record.fixtureId))
                .filter(fixtureId => Number.isFinite(fixtureId) && fixtureId > 0)
        )];
    }


    latestFixtureMoment(fixtureId) {
        const fixture = Number(fixtureId);
        if (!Number.isFinite(fixture) || fixture <= 0) return null;

        const selected = this.data.records
            .filter(record =>
                Number(record?.fixtureId) === fixture &&
                record?.liveStats &&
                record?.capturedAt
            )
            .sort((left, right) =>
                new Date(right.capturedAt) - new Date(left.capturedAt)
            )[0];

        return selected ? { ...selected } : null;
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


    summary(records = this.data.records) {
        const selectedRecords = Array.isArray(records)
            ? records
            : this.data.records;
        const overall = emptyResultBucket();
        const byDecision = {};
        const byClass = {};
        const uniqueFixtures = new Set();
        let sent = 0;
        let invalidMarket = 0;
        let unsentWinners = 0;
        let shadowSignals = 0;
        let prematchBlocked = 0;
        let livePlusPrematch = 0;
        const shadowPowerMoments = new Map();

        for (const record of selectedRecords) {
            uniqueFixtures.add(Number(record.fixtureId));
            addToResultBucket(overall, record);

            const decision = record.decision || 'unknown';
            byDecision[decision] = (byDecision[decision] || 0) + 1;

            const signalClass = record.signalClass || 'class_outside';
            byClass[signalClass] = (byClass[signalClass] || 0) + 1;

            if (decision === 'sent') sent++;
            if (decision === 'market_already_decided') invalidMarket++;
            if (decision === 'shadow_probability') shadowSignals++;
            if (['prematch_missing', 'prematch_total_missing', 'prematch_total_conflict'].includes(decision)) {
                prematchBlocked++;
            }
            if (record.modelVariant === 'live_plus_prematch') livePlusPrematch++;
            const shadowContext = this.shadowContextFor(record);
            if (shadowContext) {
                const shadowKey = `${record.scanId || record.capturedAt}:${Number(record.fixtureId)}`;
                if (!shadowPowerMoments.has(shadowKey)) {
                    shadowPowerMoments.set(shadowKey, shadowContext);
                }
            }
            if (
                record?.settlement?.result === 'W' &&
                decision !== 'sent' &&
                decision !== 'market_already_decided'
            ) {
                unsentWinners++;
            }
        }

        finalizeResultBucket(overall);
        const shadowContexts = [...shadowPowerMoments.values()];
        return {
            updatedAt: this.data.updatedAt,
            totalRecords: selectedRecords.length,
            uniqueFixtures: uniqueFixtures.size,
            sent,
            invalidMarket,
            unsentWinners,
            shadowSignals,
            prematchBlocked,
            livePlusPrematch,
            shadowPower: {
                decisionImpact: shadowContexts.some(
                    context => context?.decisionImpact === true
                ),
                contextMoments: shadowContexts.length,
                available: shadowContexts.filter(
                    context => context?.available === true
                ).length,
                teamStatsComplete: shadowContexts.filter(
                    context => context?.coverage?.teamStatsComplete === true
                ).length,
                standingsComplete: shadowContexts.filter(
                    context => context?.coverage?.standingsComplete === true
                ).length,
                predictionsAvailable: shadowContexts.filter(
                    context => context?.coverage?.predictionsAvailable === true
                ).length,
                identityVerified: shadowContexts.filter(
                    context => context?.validation?.identityVerified === true
                ).length,
                sampleAdequate: shadowContexts.filter(
                    context => context?.validation?.sampleAdequate === true
                ).length,
                fullyVerified: shadowContexts.filter(
                    context => context?.validation?.fullyVerified === true
                ).length
            },
            overall,
            byDecision,
            byClass
        };
    }


    list(limit = 200, records = this.data.records) {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 100000));
        const selectedRecords = Array.isArray(records)
            ? records
            : this.data.records;
        return [...selectedRecords]
            .sort((left, right) => new Date(right.capturedAt) - new Date(left.capturedAt))
            .slice(0, safeLimit)
            .map(record => {
                const context = this.shadowContextFor(record);
                return context
                    ? { ...record, shadowContext: context }
                    : { ...record };
            });
    }


    exportPayload(meta = {}, records = this.data.records) {
        const selectedRecords = Array.isArray(records)
            ? records
            : this.data.records;
        return {
            format: 'dino-full-stats-candidates',
            version: HISTORY_VERSION,
            exportedAt: new Date().toISOString(),
            ...meta,
            summary: this.summary(selectedRecords),
            records: this.list(100000, selectedRecords)
        };
    }
}


module.exports = {
    CandidateTracker
};
