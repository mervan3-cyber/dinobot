'use strict';

const fs = require('fs');
const path = require('path');
const {observeOverWin}=require('./early_over_win');

const HISTORY_VERSION = 2;
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
        roi: null,
        averageOdds: null,
        _oddsTotal: 0,
        _oddsCount: 0
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
    bucket.averageOdds = bucket._oddsCount > 0
        ? Number((bucket._oddsTotal / bucket._oddsCount).toFixed(3))
        : null;
    delete bucket._oddsTotal;
    delete bucket._oddsCount;
    return bucket;
}

function addToBucket(bucket, signal) {
    bucket.total++;
    const odds = numberOrNull(signal?.odds);
    if (odds !== null) {
        bucket._oddsTotal += odds;
        bucket._oddsCount++;
    }

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
    constructor({ filePath, logger = () => {}, strict = false, now = Date.now }) {
        this.filePath = filePath;
        this.strict = strict;
        this.logger = logger;
        this.now=now;
        // Evidence before this process must earn two fresh confirmations after restart.
        this.earlyWinEpoch=now();
        this.earlyWinDisabled=false;
        this.data = {
            version: HISTORY_VERSION,
            startedAt: null,
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
            if (this.strict && (!Array.isArray(parsed?.signals) || parsed.signals.some(s => !Number.isFinite(Number(s.fixtureId)) || !s.signalId))) throw Error('Paylaşılan geçmiş şeması geçersiz');
            this.data = {
                version: HISTORY_VERSION,
                startedAt: parsed?.startedAt || null,
                updatedAt: parsed?.updatedAt || null,
                signals: Array.isArray(parsed?.signals) ? parsed.signals : []
            };
            this.logger(`> 📚 Paylaşılan sinyal geçmişi yüklendi: ${this.data.signals.length} kayıt.`);
        } catch (error) {
            if (this.strict) throw error; // Never replace unreadable live shared history with an empty file.
            this.logger(`> ⚠️ Sinyal geçmişi yüklenemedi: ${error.message}`);
            this.data = {
                version: HISTORY_VERSION,
                startedAt: null,
                updatedAt: null,
                signals: []
            };
        }
    }

    save() {
        const directory = path.dirname(this.filePath);
        fs.mkdirSync(directory, { recursive: true });
        if (!this.data.startedAt) {
            this.data.startedAt = new Date().toISOString();
        }
        this.data.updatedAt = new Date().toISOString();
        const temp = this.filePath + '.tmp';
        fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
        fs.renameSync(temp, this.filePath);
    }

    hasSignal(fixtureId, signalType) {
        const fixture = Number(fixtureId);
        const type = normalizeSignalType(signalType);
        return this.data.signals.some(
            signal => Number(signal.fixtureId) === fixture && signal.signalType === type
        );
    }

    findSignal(fixtureId, signalType) {
        const fixture = Number(fixtureId);
        const type = normalizeSignalType(signalType);
        return this.data.signals.find(
            signal => Number(signal.fixtureId) === fixture && signal.signalType === type
        ) || null;
    }

    recordSent(payload) {
        const fixtureId = Number(payload?.fixtureId);
        const signalType = normalizeSignalType(payload?.signalType);

        if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
            throw new Error('Geçerli fixture ID olmadan sinyal kaydedilemez.');
        }

        const existing = this.data.signals.find(
            signal => payload.deliveryKey ? signal.deliveryKey === payload.deliveryKey :
                !signal.deliveryKey && Number(signal.fixtureId) === fixtureId && signal.signalType === signalType
        );
        if (existing) return existing;

        const sentAt = payload.sentAt || new Date().toISOString();
        const record = {
            signalId: `${fixtureId}-${signalType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fixtureId,
            signalType,
            sentAt,
            telegramMessageId: payload.telegramMessageId ?? null,
            ...(payload.deliveryKey ? { deliveryKey: payload.deliveryKey, telegramChatId: payload.telegramChatId,
                sourcePolicies: payload.sourcePolicies || {} } : {}),
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
            selectorV2Probability: numberOrNull(payload.selectorV2Probability),
            selectorV2RawProbability: numberOrNull(payload.selectorV2RawProbability),
            selectorV2ModelVersion: payload.selectorV2ModelVersion || null,
            v18Probability: numberOrNull(payload.v18Probability),
            v18Edge: numberOrNull(payload.v18Edge),
            v25ModelVersion: payload.v25ModelVersion || null,
            v25TrainedThrough: payload.v25TrainedThrough || null,
            v25Probability: numberOrNull(payload.v25Probability),
            v25RawProbability: numberOrNull(payload.v25RawProbability),
            v25Edge: numberOrNull(payload.v25Edge),
            v25JointEligible: typeof payload.v25JointEligible === 'boolean' ? payload.v25JointEligible : null,
            v25JointRule: payload.v25JointRule || null,
            decisionModel: payload.decisionModel || null,
            entryAudit: payload.entryAudit || null,
            decisionProbability: numberOrNull(payload.decisionProbability),
            decisionEdge: numberOrNull(payload.decisionEdge),
            tariffVersion: payload.tariffVersion || null,
            signalSources: Array.isArray(payload.signalSources) ? [...payload.signalSources] : [],
            modelVotes: payload.modelVotes || null,
            modelProbabilities: payload.modelProbabilities || null,
            voteCount: numberOrNull(payload.voteCount),
            tariffSlot: payload.tariffSlot || null,
            tariffRuleId: payload.tariffRuleId || null,
            ...(Array.isArray(payload.matchedFilters) ? {
                matchedFilters: [...payload.matchedFilters], goalsNeeded: numberOrNull(payload.goalsNeeded)
            } : {}),
            v16Edge: numberOrNull(payload.v16Edge),
            prematchSource: payload.prematchSource || null,
            prematchProbabilities: payload.prematchProbabilities || null,
            prematchMarketSupport: numberOrNull(payload.prematchMarketSupport),
            prematchMarketSource: payload.prematchMarketSource || null,
            statsSource: payload.statsSource || null,
            statsValidation: payload.statsValidation || null,
            liveStats: payload.liveStats || {},
            shadowContext: payload.shadowContext || null,
            shadowAssessment: payload.shadowAssessment || null,
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

    attachShadowContext(fixtureId, shadowContext, assessmentByMarket = {}) {
        const fixture = Number(fixtureId);
        if (!Number.isFinite(fixture) || !shadowContext) return 0;

        let changed = 0;
        for (const signal of this.data.signals) {
            if (Number(signal.fixtureId) !== fixture) continue;
            signal.shadowContext = shadowContext;
            signal.shadowAssessment = signal.market
                ? assessmentByMarket?.[signal.market] || null
                : null;
            changed++;
        }

        if (changed > 0) this.save();
        return changed;
    }

    unresolvedFixtureIds() {
        return [...new Set(
            this.data.signals
                .filter(signal => !signal?.settlement?.result)
                .map(signal => Number(signal.fixtureId))
                .filter(fixtureId => Number.isFinite(fixtureId) && fixtureId > 0)
        )];
    }

    observeLiveFixtures(fixtures, observation) {
        if(this.earlyWinDisabled||!Array.isArray(fixtures))return 0;
        const byId=new Map(),duplicates=new Set();
        for(const fixture of fixtures){const id=Number(fixture?.fixture?.id);if(byId.has(id))duplicates.add(id);byId.set(id,fixture);}
        const updates=[];
        for(const record of this.data.signals){
            const id=Number(record.fixtureId);
            if(!byId.has(id)||duplicates.has(id))continue;
            const before=record.earlyOverWin;
            const next=observeOverWin(record,byId.get(id),observation,{now:this.now(),epoch:this.earlyWinEpoch});
            if(JSON.stringify(before||null)===JSON.stringify(next))continue;
            updates.push({record,before});record.earlyOverWin=next;
        }
        if(updates.length){
            try{this.save();}catch(error){
                for(const {record,before}of updates){if(before===undefined)delete record.earlyOverWin;else record.earlyOverWin=before;}
                this.earlyWinDisabled=true;throw error;
            }
        }
        return updates.length;
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
        // tercih et. Paylaşılan sinyalde uzatma/penaltı skoru normal süre yerine kullanılamaz.
        const fulltimeHome = numberOrNull(fixture?.score?.fulltime?.home);
        const fulltimeAway = numberOrNull(fixture?.score?.fulltime?.away);
        if (this.strict && !isVoid && (
            !FINAL_STATUSES.has(shortStatus) ||
            (['AET', 'PEN'].includes(shortStatus) && (fulltimeHome === null || fulltimeAway === null))
        )) return 0;
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

    summary(signals = this.data.signals) {
        const selectedSignals = Array.isArray(signals)
            ? signals
            : this.data.signals;
        const overall = emptyBucket();
        const byType = {
            surprise: emptyBucket(),
            strong: emptyBucket()
        };
        const byTariffSlot = {
            primary: emptyBucket(),
            follow: emptyBucket(),
            legacy: emptyBucket()
        };
        const byMarket = {};
        const uniqueFixtures = new Set();

        for (const signal of selectedSignals) {
            uniqueFixtures.add(Number(signal.fixtureId));
            addToBucket(overall, signal);

            const type = normalizeSignalType(signal.signalType);
            addToBucket(byType[type], signal);

            const tariffSlot = signal.tariffSlot === 'primary' || signal.tariffSlot === 'follow'
                ? signal.tariffSlot
                : 'legacy';
            addToBucket(byTariffSlot[tariffSlot], signal);

            const market = signal.market || 'Bilinmiyor';
            if (!byMarket[market]) byMarket[market] = emptyBucket();
            addToBucket(byMarket[market], signal);
        }

        finalizeBucket(overall);
        finalizeBucket(byType.surprise);
        finalizeBucket(byType.strong);
        finalizeBucket(byTariffSlot.primary);
        finalizeBucket(byTariffSlot.follow);
        finalizeBucket(byTariffSlot.legacy);
        for (const bucket of Object.values(byMarket)) finalizeBucket(bucket);

        return {
            startedAt: this.data.startedAt,
            updatedAt: this.data.updatedAt,
            uniqueFixtures: uniqueFixtures.size,
            overall,
            byType,
            byTariffSlot,
            byMarket
        };
    }

    list(limit = 100, signals = this.data.signals) {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100000));
        const selectedSignals = Array.isArray(signals)
            ? signals
            : this.data.signals;
        return [...selectedSignals]
            .sort((left, right) => new Date(right.sentAt) - new Date(left.sentAt))
            .slice(0, safeLimit);
    }

    exportPayload(meta = {}, signals = this.data.signals) {
        const selectedSignals = Array.isArray(signals)
            ? signals
            : this.data.signals;
        return {
            format: 'dino-shared-signals',
            version: HISTORY_VERSION,
            exportedAt: new Date().toISOString(),
            ...meta,
            summary: this.summary(selectedSignals),
            signals: this.list(100000, selectedSignals)
        };
    }
}

module.exports = {
    SignalTracker,
    calculateMarketResult,
    profitForResult
};
