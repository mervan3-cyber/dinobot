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
const MARKET_PATTERN = /^(MS1|X|MS2|[0-4]\.5_(ALT|UST))$/;

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return null;
    return Number(Math.max(0, Math.min(100, parsed)).toFixed(1));
}

function probabilityPercent(value) {
    const parsed = numberOrNull(value);
    if (parsed === null) return null;
    return Number((parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed).toFixed(1));
}

function normalizeAction(value) {
    const action = String(value || '').trim().toUpperCase();
    return ['SELECT', 'PASS', 'ERROR'].includes(action) ? action : 'ERROR';
}

function marketLabel(market) {
    if (market === 'MS1') return 'HOME_WIN_FULL_TIME';
    if (market === 'X') return 'DRAW_FULL_TIME';
    if (market === 'MS2') return 'AWAY_WIN_FULL_TIME';
    const match = String(market || '').match(/^(\d+(?:\.\d+)?)_(ALT|UST)$/);
    if (!match) return String(market || 'UNKNOWN');
    return `TOTAL_${match[2] === 'UST' ? 'OVER' : 'UNDER'}_${match[1]}_FULL_TIME`;
}

function scoreTotal(score) {
    const match = String(score || '').match(/^(\d+)\s*-\s*(\d+)$/);
    return match ? Number(match[1]) + Number(match[2]) : null;
}

function marketAlreadySettled(market, score) {
    const totalMarket = String(market || '').match(/^(\d+(?:\.\d+)?)_(ALT|UST)$/);
    const total = scoreTotal(score);
    if (!totalMarket || total === null) return false;
    return total > Number(totalMarket[1]);
}

function liveStatsSnapshot(match) {
    return {
        home: {
            shots: numberOrNull(match?.home_shot),
            shots_on_goal: numberOrNull(match?.home_sot),
            corners: numberOrNull(match?.home_corner),
            possession: numberOrNull(match?.home_possession),
            yellow_cards: numberOrNull(match?.home_yellow),
            red_cards: numberOrNull(match?.home_red),
            fouls: numberOrNull(match?.home_fouls),
            offsides: numberOrNull(match?.home_offsides),
            saves: numberOrNull(match?.home_saves),
            xg: numberOrNull(match?.home_xg)
        },
        away: {
            shots: numberOrNull(match?.away_shot),
            shots_on_goal: numberOrNull(match?.away_sot),
            corners: numberOrNull(match?.away_corner),
            possession: numberOrNull(match?.away_possession),
            yellow_cards: numberOrNull(match?.away_yellow),
            red_cards: numberOrNull(match?.away_red),
            fouls: numberOrNull(match?.away_fouls),
            offsides: numberOrNull(match?.away_offsides),
            saves: numberOrNull(match?.away_saves),
            xg: numberOrNull(match?.away_xg)
        }
    };
}

function buildBlindCandidate(match, minimumOdd = 1.5) {
    const fixtureId = Number(match?.fixture_id);
    const minute = numberOrNull(match?.dakika);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return null;
    if (minute === null || minute < 25 || minute > 80) return null;

    const offeredMarkets = Object.entries(match?.canli_oranlar || {})
        .map(([market, raw]) => ({
            market,
            odds: numberOrNull(raw && typeof raw === 'object' ? raw.oran : raw),
            bookmaker: raw && typeof raw === 'object'
                ? raw.bookmaker || 'API-Football Live Odds'
                : 'API-Football Live Odds'
        }))
        .filter(item =>
            MARKET_PATTERN.test(item.market) &&
            item.odds !== null &&
            item.odds >= minimumOdd &&
            !marketAlreadySettled(item.market, match?.skor)
        )
        .sort((left, right) => left.market.localeCompare(right.market));

    if (offeredMarkets.length === 0) return null;

    return {
        fixtureId,
        match: match?.mac_isim || null,
        league: match?.lig || null,
        minute,
        score: match?.skor || null,
        statsSource: match?.stats_source || null,
        liveStats: liveStatsSnapshot(match),
        offeredMarkets,
        prematch: match?.prematch_available === true
            ? {
                source: match?.prematch_source || null,
                home_percent: probabilityPercent(match?.prematch_p_home),
                draw_percent: probabilityPercent(match?.prematch_p_draw),
                away_percent: probabilityPercent(match?.prematch_p_away)
            }
            : null
    };
}

function extractJsonObject(text) {
    if (text && typeof text === 'object') return text;
    const source = String(text || '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    if (!source) throw new Error('Grok boş yanıt döndürdü.');

    try {
        return JSON.parse(source);
    } catch (_) {
        // Bazı OpenAI-uyumlu proxy'ler JSON'un çevresine açıklama ekliyor.
    }

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        if (start < 0) {
            if (char === '{') {
                start = index;
                depth = 1;
            }
            continue;
        }
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\' && inString) {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === '{') depth++;
        if (char === '}') depth--;
        if (depth === 0) {
            return JSON.parse(source.slice(start, index + 1));
        }
    }
    throw new Error('Grok yanıtında geçerli JSON bulunamadı.');
}

function responseContent(response) {
    const message = response?.data?.choices?.[0]?.message;
    if (message?.content !== null && message?.content !== undefined) {
        return message.content;
    }
    if (response?.data?.output_text !== undefined) return response.data.output_text;
    throw new Error('Grok yanıt biçimi tanınmadı.');
}

function shortDelay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

class GrokOnlyClient {
    constructor({
        baseUrl,
        apiKey,
        model,
        timeoutMs = 60000,
        httpClient = null
    }) {
        this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
        this.apiKey = String(apiKey || '');
        this.model = String(model || '');
        this.timeoutMs = Math.max(5000, Number(timeoutMs) || 60000);
        this.httpClient = httpClient || require('axios');
    }

    get configured() {
        return Boolean(this.baseUrl && this.apiKey && this.model);
    }

    async decide(candidates) {
        if (!this.configured) throw new Error('Grok bağlantı ayarları eksik.');
        if (!Array.isArray(candidates) || candidates.length === 0) return [];

        const idMap = new Map();
        const blinded = candidates.map((candidate, index) => {
            const blindId = `M${String(index + 1).padStart(3, '0')}`;
            idMap.set(blindId, candidate);
            return {
                id: blindId,
                minute: candidate.minute,
                score: candidate.score,
                live_stats: candidate.liveStats,
                prematch_1x2: candidate.prematch,
                available_markets: candidate.offeredMarkets.map(item => ({
                    code: item.market,
                    meaning: marketLabel(item.market),
                    odds: item.odds,
                    implied_probability_percent: Number((100 / item.odds).toFixed(1))
                }))
            };
        });

        const systemPrompt = [
            'You are the sole decision maker in a blind live-football betting evaluation.',
            'Team names, league names and fixture IDs are intentionally hidden. Never use web search or outside knowledge.',
            'Use only the supplied minute, score, live statistics, optional pre-match 1X2 context and currently offered markets.',
            'For each match choose AT MOST ONE market from available_markets, or PASS.',
            'Accuracy is more important than signal count. Do not select merely because an odd is high.',
            'Every offered odd is at least 1.50. Never invent a market, odd or missing statistic.',
            'Do not reveal chain-of-thought, calculations or analysis before the JSON. Start the response with { immediately.',
            'Return strict JSON only: {"decisions":[{"id":"M001","action":"SELECT|PASS","selected_market":"exact offered code or null","estimated_probability":0-100,"confidence":0-100,"risk_flags":["short flag"],"rationale":"one short Turkish sentence"}]}.'
        ].join(' ');

        const requestBody = {
            model: this.model,
            temperature: 0.1,
            reasoning_effort: 'low',
            max_tokens: Math.max(3000, candidates.length * 1400),
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: JSON.stringify({ matches: blinded })
                }
            ]
        };
        const requestConfig = {
            timeout: this.timeoutMs,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'x-api-key': this.apiKey,
                'Content-Type': 'application/json'
            }
        };

        let parsed = null;
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await this.httpClient.post(
                    `${this.baseUrl}/chat/completions`,
                    requestBody,
                    requestConfig
                );
                parsed = extractJsonObject(responseContent(response));
                if (!Array.isArray(parsed?.decisions)) {
                    throw new Error('Grok JSON yanıtında decisions dizisi yok.');
                }
                lastError = null;
                break;
            } catch (error) {
                lastError = error;
                const status = Number(error?.response?.status);
                if ([400, 401, 403, 404].includes(status) || attempt === 3) break;
                await shortDelay(attempt * 1500);
            }
        }
        if (lastError) throw lastError;

        const rawDecisions = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
        const rawById = new Map(
            rawDecisions.map(item => [String(item?.id || ''), item])
        );

        return [...idMap.entries()].map(([blindId, candidate]) => {
            const raw = rawById.get(blindId);
            if (!raw) {
                return {
                    candidate,
                    action: 'ERROR',
                    error: 'Grok bu maç için karar döndürmedi.'
                };
            }

            const requestedAction = normalizeAction(raw.action);
            const requestedMarket = String(raw.selected_market || '').trim().toUpperCase();
            const offered = candidate.offeredMarkets.find(
                item => item.market === requestedMarket
            );

            if (requestedAction === 'ERROR') {
                return {
                    candidate,
                    action: 'ERROR',
                    error: 'Grok SELECT veya PASS dışında bir karar döndürdü.',
                    rationale: String(raw.rationale || '').slice(0, 500)
                };
            }

            if (requestedAction === 'SELECT' && !offered) {
                return {
                    candidate,
                    action: 'ERROR',
                    error: 'Grok listede olmayan bir market seçti.',
                    rationale: String(raw.rationale || '').slice(0, 500)
                };
            }

            return {
                candidate,
                action: requestedAction === 'SELECT' ? 'SELECT' : 'PASS',
                selectedMarket: requestedAction === 'SELECT' ? offered : null,
                estimatedProbability: clampPercent(raw.estimated_probability),
                confidence: clampPercent(raw.confidence),
                riskFlags: Array.isArray(raw.risk_flags)
                    ? raw.risk_flags.map(value => String(value).slice(0, 100)).slice(0, 8)
                    : [],
                rationale: String(raw.rationale || '').slice(0, 500)
            };
        });
    }
}

function emptyPerformance() {
    return {
        selections: 0,
        pending: 0,
        settled: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        voids: 0,
        hitRate: null,
        averageOdds: null,
        profit: 0,
        roi: null
    };
}

function finalizePerformance(bucket, oddsTotal) {
    const graded = bucket.wins + bucket.losses;
    const staked = bucket.wins + bucket.losses + bucket.pushes;
    bucket.hitRate = graded > 0
        ? Number((bucket.wins * 100 / graded).toFixed(1))
        : null;
    bucket.averageOdds = bucket.selections > 0
        ? Number((oddsTotal / bucket.selections).toFixed(3))
        : null;
    bucket.profit = Number(bucket.profit.toFixed(3));
    bucket.roi = staked > 0
        ? Number((bucket.profit * 100 / staked).toFixed(1))
        : null;
    return bucket;
}

class GrokOnlyTracker {
    constructor({ filePath, logger = () => {}, maxRecords = 50000 }) {
        this.filePath = filePath;
        this.logger = logger;
        this.maxRecords = Math.max(1000, Number(maxRecords) || 50000);
        this.data = { version: HISTORY_VERSION, updatedAt: null, decisions: [] };
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
                decisions: Array.isArray(parsed?.decisions) ? parsed.decisions : []
            };
            this.logger(`> 🤖 Grok kör-test geçmişi yüklendi: ${this.data.decisions.length} karar anı.`);
        } catch (error) {
            this.logger(`> ⚠️ Grok kör-test geçmişi yüklenemedi: ${error.message}`);
            this.data = { version: HISTORY_VERSION, updatedAt: null, decisions: [] };
        }
    }

    save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        this.data.updatedAt = new Date().toISOString();
        if (this.data.decisions.length > this.maxRecords) {
            this.data.decisions = this.data.decisions.slice(-this.maxRecords);
        }
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    }

    hasSelection(fixtureId) {
        const id = Number(fixtureId);
        return this.data.decisions.some(
            item => Number(item.fixtureId) === id && item.action === 'SELECT'
        );
    }

    hasMoment(fixtureId, minute, score) {
        const id = Number(fixtureId);
        return this.data.decisions.some(item =>
            Number(item.fixtureId) === id &&
            Number(item.minute) === Number(minute) &&
            String(item.score || '') === String(score || '')
        );
    }

    record(result, meta = {}) {
        const candidate = result?.candidate || {};
        if (this.hasMoment(candidate.fixtureId, candidate.minute, candidate.score)) {
            return null;
        }
        if (result?.action === 'SELECT' && this.hasSelection(candidate.fixtureId)) {
            return null;
        }

        const action = normalizeAction(result?.action);
        const selected = action === 'SELECT' ? result.selectedMarket : null;
        const capturedAt = meta.capturedAt || new Date().toISOString();
        const record = {
            decisionId: `grok-${candidate.fixtureId}-${candidate.minute}-${Date.now()}`,
            fixtureId: Number(candidate.fixtureId),
            capturedAt,
            action,
            match: candidate.match || null,
            league: candidate.league || null,
            minute: numberOrNull(candidate.minute),
            score: candidate.score || null,
            market: selected?.market || null,
            odds: numberOrNull(selected?.odds),
            bookmaker: selected?.bookmaker || null,
            estimatedProbability: clampPercent(result?.estimatedProbability),
            confidence: clampPercent(result?.confidence),
            rationale: result?.rationale || null,
            riskFlags: Array.isArray(result?.riskFlags) ? result.riskFlags : [],
            error: action === 'ERROR' ? result?.error || 'Geçersiz Grok kararı.' : null,
            model: meta.model || null,
            minimumOdd: numberOrNull(meta.minimumOdd),
            blindMode: true,
            telegramImpact: false,
            statsSource: candidate.statsSource || null,
            liveStats: candidate.liveStats || {},
            prematch: candidate.prematch || null,
            offeredMarkets: Array.isArray(candidate.offeredMarkets)
                ? candidate.offeredMarkets
                : [],
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
        this.data.decisions.push(record);
        this.save();
        return record;
    }

    unresolvedFixtureIds() {
        return [...new Set(
            this.data.decisions
                .filter(item => item.action === 'SELECT' && !item?.settlement?.result)
                .map(item => Number(item.fixtureId))
                .filter(id => Number.isFinite(id) && id > 0)
        )];
    }

    settleFixture(fixture) {
        const fixtureId = Number(fixture?.fixture?.id);
        if (!Number.isFinite(fixtureId) || fixtureId <= 0) return 0;
        const status = String(fixture?.fixture?.status?.short || '').toUpperCase();
        const isVoid = VOID_STATUSES.has(status);
        const isFinal = FINAL_STATUSES.has(status) || fixture?.fixture?.status?.finished === true;
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

        for (const item of this.data.decisions) {
            if (
                Number(item.fixtureId) !== fixtureId ||
                item.action !== 'SELECT' ||
                item?.settlement?.result
            ) continue;

            const result = isVoid
                ? 'VOID'
                : calculateMarketResult(item.market, finalHome, finalAway);
            if (!result) continue;
            item.settlement = {
                result,
                profit: profitForResult(result, item.odds),
                finalHome,
                finalAway,
                finalScore: finalHome !== null && finalAway !== null
                    ? `${finalHome}-${finalAway}`
                    : null,
                fixtureStatus: status || null,
                resolvedAt: new Date().toISOString()
            };
            changed++;
        }
        if (changed > 0) this.save();
        return changed;
    }

    summary(decisions = this.data.decisions) {
        const items = Array.isArray(decisions) ? decisions : this.data.decisions;
        const performance = emptyPerformance();
        const byMarket = {};
        const fixtures = new Set();
        let oddsTotal = 0;

        for (const item of items) {
            fixtures.add(Number(item.fixtureId));
            if (item.action !== 'SELECT') continue;
            performance.selections++;
            const odds = numberOrNull(item.odds);
            if (odds !== null) oddsTotal += odds;
            const result = item?.settlement?.result || null;
            if (!result) performance.pending++;
            else {
                performance.settled++;
                if (result === 'W') performance.wins++;
                if (result === 'L') performance.losses++;
                if (result === 'PUSH') performance.pushes++;
                if (result === 'VOID') performance.voids++;
                const profit = numberOrNull(item?.settlement?.profit);
                if (profit !== null) performance.profit += profit;
            }

            const market = item.market || 'UNKNOWN';
            if (!byMarket[market]) byMarket[market] = { ...emptyPerformance(), _odds: 0 };
            const bucket = byMarket[market];
            bucket.selections++;
            if (odds !== null) bucket._odds += odds;
            if (!result) bucket.pending++;
            else {
                bucket.settled++;
                if (result === 'W') bucket.wins++;
                if (result === 'L') bucket.losses++;
                if (result === 'PUSH') bucket.pushes++;
                if (result === 'VOID') bucket.voids++;
                const profit = numberOrNull(item?.settlement?.profit);
                if (profit !== null) bucket.profit += profit;
            }
        }

        finalizePerformance(performance, oddsTotal);
        for (const bucket of Object.values(byMarket)) {
            const bucketOdds = bucket._odds;
            delete bucket._odds;
            finalizePerformance(bucket, bucketOdds);
        }

        return {
            updatedAt: this.data.updatedAt,
            decisionMoments: items.length,
            uniqueFixtures: fixtures.size,
            passes: items.filter(item => item.action === 'PASS').length,
            errors: items.filter(item => item.action === 'ERROR').length,
            performance,
            byMarket
        };
    }

    list(limit = 200, decisions = this.data.decisions) {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 100000));
        const items = Array.isArray(decisions) ? decisions : this.data.decisions;
        return [...items]
            .sort((left, right) => new Date(right.capturedAt) - new Date(left.capturedAt))
            .slice(0, safeLimit);
    }

    exportPayload(meta = {}, decisions = this.data.decisions) {
        const items = Array.isArray(decisions) ? decisions : this.data.decisions;
        return {
            format: 'dino-grok-only-blind-test',
            version: HISTORY_VERSION,
            exportedAt: new Date().toISOString(),
            ...meta,
            summary: this.summary(items),
            decisions: this.list(100000, items)
        };
    }
}

class GrokOnlyEngine {
    constructor({
        client,
        tracker,
        logger = () => {},
        enabled = true,
        minimumOdd = 1.5,
        batchSize = 2
    }) {
        this.client = client;
        this.tracker = tracker;
        this.logger = logger;
        this.enabled = Boolean(enabled);
        this.minimumOdd = Math.max(1.01, Number(minimumOdd) || 1.5);
        this.batchSize = Math.max(1, Math.min(10, Number(batchSize) || 2));
        this.status = {
            isRunning: false,
            lastStartedAt: null,
            lastCompletedAt: null,
            lastError: null,
            lastEligibleFixtures: 0,
            lastEvaluatedFixtures: 0,
            lastSelections: 0,
            lastPasses: 0,
            lastErrors: 0,
            calls: 0
        };
    }

    configured() {
        return this.enabled && this.client?.configured === true;
    }

    publicStatus() {
        return {
            enabled: this.enabled,
            configured: this.client?.configured === true,
            active: this.configured(),
            model: this.client?.model || null,
            minimumOdd: this.minimumOdd,
            minuteRange: { minimum: 25, maximum: 80 },
            batchSize: this.batchSize,
            telegramImpact: false,
            blindIdentity: true,
            ...this.status
        };
    }

    async scan(matches) {
        if (!this.configured()) return { skipped: true, reason: 'not_configured' };
        if (this.status.isRunning) return { skipped: true, reason: 'already_running' };

        const candidates = (Array.isArray(matches) ? matches : [])
            .map(match => buildBlindCandidate(match, this.minimumOdd))
            .filter(Boolean)
            .filter(candidate => !this.tracker.hasSelection(candidate.fixtureId))
            .filter(candidate => !this.tracker.hasMoment(
                candidate.fixtureId,
                candidate.minute,
                candidate.score
            ));

        this.status.lastEligibleFixtures = candidates.length;
        if (candidates.length === 0) return { skipped: true, reason: 'no_candidates' };

        this.status.isRunning = true;
        this.status.lastStartedAt = new Date().toISOString();
        this.status.lastCompletedAt = null;
        this.status.lastError = null;
        this.status.lastEvaluatedFixtures = 0;
        this.status.lastSelections = 0;
        this.status.lastPasses = 0;
        this.status.lastErrors = 0;
        this.logger(`> 🤖 Grok-only kör test başladı: ${candidates.length} tam-stat maç | 25-80 dk | oran ${this.minimumOdd.toFixed(2)}+.`);

        try {
            for (let index = 0; index < candidates.length; index += this.batchSize) {
                const batch = candidates.slice(index, index + this.batchSize);
                this.status.calls++;
                let results;
                try {
                    results = await this.client.decide(batch);
                } catch (error) {
                    this.status.lastError = String(error?.message || error).slice(0, 500);
                    this.status.lastErrors += batch.length;
                    for (const candidate of batch) {
                        this.tracker.record({
                            candidate,
                            action: 'ERROR',
                            error: this.status.lastError
                        }, {
                            model: this.client.model,
                            minimumOdd: this.minimumOdd
                        });
                    }
                    this.logger(`> ⚠️ Grok-only grup hatası; V16 etkilenmedi: ${this.status.lastError}`);
                    continue;
                }

                for (const result of results) {
                    const saved = this.tracker.record(result, {
                        model: this.client.model,
                        minimumOdd: this.minimumOdd
                    });
                    if (!saved) continue;
                    this.status.lastEvaluatedFixtures++;
                    if (saved.action === 'SELECT') {
                        this.status.lastSelections++;
                        this.logger(`> 🤖 GROK-ONLY SEÇTİ: ${saved.match} | ${saved.minute}' | ${saved.market} | oran ${saved.odds}`);
                    } else if (saved.action === 'PASS') {
                        this.status.lastPasses++;
                    } else {
                        this.status.lastErrors++;
                    }
                }
            }
            return {
                success: true,
                evaluated: this.status.lastEvaluatedFixtures,
                selections: this.status.lastSelections,
                passes: this.status.lastPasses,
                errors: this.status.lastErrors
            };
        } finally {
            this.status.isRunning = false;
            this.status.lastCompletedAt = new Date().toISOString();
            this.logger(`> 🤖 Grok-only kör test bitti: ${this.status.lastSelections} seçim | ${this.status.lastPasses} pas | ${this.status.lastErrors} hata. Telegram etkilenmedi.`);
        }
    }
}

module.exports = {
    GrokOnlyClient,
    GrokOnlyTracker,
    GrokOnlyEngine,
    buildBlindCandidate,
    extractJsonObject,
    marketLabel
};
