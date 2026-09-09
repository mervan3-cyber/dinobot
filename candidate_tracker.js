'use strict';

const fs = require('fs');
const path = require('path');
const {
    calculateMarketResult,
    profitForResult
} = require('./signal_tracker');

const HISTORY_VERSION = 2;
const SNAPSHOT_ARCHIVE_VERSION = 1;
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


function turkeyDate(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(safeDate);
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}


function firstDefined(rows, getter) {
    for (const row of rows) {
        const value = getter(row);
        if (value !== null && value !== undefined) return value;
    }
    return null;
}


class CandidateTracker {
    constructor({
        filePath,
        logger = () => {},
        maxRecords = 50000,
        snapshotArchiveDirectory = null
    }) {
        this.filePath = filePath;
        this.logger = logger;
        this.maxRecords = Math.max(1000, Number(maxRecords) || 50000);
        this.snapshotArchiveDirectory = snapshotArchiveDirectory
            ? path.resolve(snapshotArchiveDirectory)
            : null;
        this.data = {
            version: HISTORY_VERSION,
            updatedAt: null,
            shadowContexts: {},
            records: []
        };
    }


    appendArchiveRows(rows, capturedAt = new Date().toISOString()) {
        if (!this.snapshotArchiveDirectory || !Array.isArray(rows) || rows.length === 0) {
            return 0;
        }

        fs.mkdirSync(this.snapshotArchiveDirectory, { recursive: true });
        const byDate = new Map();
        for (const row of rows) {
            const date = turkeyDate(row?.capturedAt || capturedAt);
            if (!byDate.has(date)) byDate.set(date, []);
            byDate.get(date).push(JSON.stringify(row));
        }

        for (const [date, lines] of byDate) {
            const filePath = path.join(
                this.snapshotArchiveDirectory,
                `v20-training-${date}.jsonl`
            );
            fs.appendFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
        }
        return rows.length;
    }


    archiveSnapshotBatch(records) {
        if (!this.snapshotArchiveDirectory || !Array.isArray(records) || records.length === 0) {
            return 0;
        }

        const groups = new Map();
        for (const record of records) {
            const key = `${record?.scanId || record?.capturedAt}:${Number(record?.fixtureId)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(record);
        }

        const archivedAt = new Date().toISOString();
        const snapshots = [];
        for (const [snapshotId, rows] of groups) {
            const base = rows.find(row => row?.statsComplete === true) || rows[0];
            if (!base || !Number.isFinite(Number(base.fixtureId))) continue;
            const snapshotContext = firstDefined(rows, row => row?.snapshotContext) || null;
            const shadowContext = firstDefined(
                rows,
                row => this.shadowContextFor(row)
            );
            snapshots.push({
                recordType: 'snapshot',
                schemaVersion: SNAPSHOT_ARCHIVE_VERSION,
                archivedAt,
                snapshotId,
                scanId: base.scanId || null,
                capturedAt: base.capturedAt || archivedAt,
                fixtureId: Number(base.fixtureId),
                match: base.match || null,
                league: base.league || null,
                minute: numberOrNull(base.minute),
                score: base.score || null,
                statusShort: base.statusShort || null,
                statsSource: base.statsSource || null,
                statsComplete: base.statsComplete === true,
                liveStats: base.liveStats || null,
                dataQuality: base.dataQuality || snapshotContext?.dataQuality || null,
                liveOdds: snapshotContext?.liveOdds || null,
                prematch: snapshotContext?.prematch || null,
                shadowContext,
                markets: rows
                    .filter(row => row?.market)
                    .map(row => ({
                        market: row.market,
                        odds: numberOrNull(row.odds),
                        bookmaker: row.bookmaker || null,
                        marketProbability: numberOrNull(row.marketProbability),
                        dinoProbability: numberOrNull(row.dinoProbability),
                        liveOnlyProbability: numberOrNull(row.liveOnlyProbability),
                        selectorV2Probability: numberOrNull(row.selectorV2Probability),
                        v18Probability: numberOrNull(row.v18Probability),
                        v18Edge: numberOrNull(row.v18Edge),
                        v20Probability: numberOrNull(row.v20Probability),
                        v20Edge: numberOrNull(row.v20Edge),
                        v20ExpectedValue: numberOrNull(row.v20ExpectedValue),
                        v20Eligible: row.v20Eligible === true,
                        v20ModelVersion: row.v20ModelVersion || null,
                        prematchMarketSupport: numberOrNull(row.prematchMarketSupport),
                        decision: row.decision || null
                    }))
            });
        }

        return this.appendArchiveRows(snapshots, archivedAt);
    }


    archiveSettlement({
        fixtureId,
        fixtureStatus,
        finalHome,
        finalAway,
        finalScore,
        resolvedAt
    }) {
        return this.appendArchiveRows([{
            recordType: 'settlement',
            schemaVersion: SNAPSHOT_ARCHIVE_VERSION,
            archivedAt: new Date().toISOString(),
            capturedAt: resolvedAt || new Date().toISOString(),
            fixtureId: Number(fixtureId),
            fixtureStatus: fixtureStatus || null,
            finalHome: numberOrNull(finalHome),
            finalAway: numberOrNull(finalAway),
            finalScore: finalScore || null,
            resolvedAt: resolvedAt || new Date().toISOString()
        }], resolvedAt);
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
        const addedRecords = [];

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

            const storedRecord = {
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
            };
            this.data.records.push(storedRecord);
            addedRecords.push(storedRecord);
            existingIds.add(payload.recordId);
            added++;
        }

        if (added > 0) {
            try {
                // Archive while every incoming context is still available;
                // ring-buffer trimming may remove older rows in this batch.
                this.archiveSnapshotBatch(addedRecords);
            } catch (error) {
                this.logger(`> ⚠️ V20 günlük eğitim arşivi yazılamadı: ${error.message}`);
            }
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

        if (changed > 0) {
            this.save();
            try {
                const resolved = this.data.records.find(record =>
                    Number(record?.fixtureId) === fixtureId &&
                    record?.settlement?.resolvedAt
                )?.settlement;
                this.archiveSettlement({
                    fixtureId,
                    fixtureStatus: shortStatus || null,
                    finalHome,
                    finalAway,
                    finalScore: finalHome !== null && finalAway !== null
                        ? `${finalHome}-${finalAway}`
                        : null,
                    resolvedAt: resolved?.resolvedAt || new Date().toISOString()
                });
            } catch (error) {
                this.logger(`> ⚠️ V20 sonuç arşivi yazılamadı: ${error.message}`);
            }
        }
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
