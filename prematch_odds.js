'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_VERSION = 1;
const SUPPORTED_TOTAL_LINES = new Set([0.5, 1.5, 2.5, 3.5, 4.5]);


function normalizeText(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}


function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}


function round(value, digits = 6) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}


function median(values) {
    const usable = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (usable.length === 0) return null;
    const middle = Math.floor(usable.length / 2);
    return usable.length % 2 === 1
        ? usable[middle]
        : (usable[middle - 1] + usable[middle]) / 2;
}


function parsePrematchMarket(bet, value) {
    const betName = normalizeText(bet?.name);
    const selection = normalizeText(
        value?.value ?? value?.name ?? value?.selection
    );

    const winnerNames = new Set([
        'match winner',
        '1x2',
        'fulltime result',
        'full time result',
        'fulltime 1x2',
        'full time 1x2'
    ]);

    if (winnerNames.has(betName)) {
        if (['home', '1'].includes(selection)) return 'MS1';
        if (['draw', 'x'].includes(selection)) return 'X';
        if (['away', '2'].includes(selection)) return 'MS2';
        return null;
    }

    const totalNames = new Set([
        'goals over under',
        'over under line',
        'total goals',
        'match goals',
        'total match goals'
    ]);
    if (!totalNames.has(betName)) return null;

    const selectionMatch = selection.match(
        /^(over|under)(?:\s+(\d+(?:\.\d+)?))?$/
    );
    if (!selectionMatch) return null;

    const line = numberOrNull(
        value?.handicap ?? value?.line ?? selectionMatch[2]
    );
    if (!SUPPORTED_TOTAL_LINES.has(line)) return null;

    return `${line}_${selectionMatch[1] === 'over' ? 'UST' : 'ALT'}`;
}


function bookmakerRows(payload) {
    const fixtures = Array.isArray(payload?.response) ? payload.response : [];
    const rows = new Map();

    for (const fixture of fixtures) {
        const bookmakers = Array.isArray(fixture?.bookmakers)
            ? fixture.bookmakers
            : [];

        for (const bookmaker of bookmakers) {
            const id = numberOrNull(bookmaker?.id);
            const name = String(bookmaker?.name || `Bookmaker ${id || ''}`).trim();
            const key = id !== null ? `id:${id}` : `name:${normalizeText(name)}`;
            const existing = rows.get(key) || { id, name, markets: {} };
            const bets = Array.isArray(bookmaker?.bets) ? bookmaker.bets : [];

            for (const bet of bets) {
                const values = Array.isArray(bet?.values) ? bet.values : [];
                for (const value of values) {
                    const market = parsePrematchMarket(bet, value);
                    const odd = numberOrNull(value?.odd ?? value?.odds);
                    if (!market || odd === null || odd <= 1 || odd > 100) continue;

                    const current = numberOrNull(existing.markets[market]);
                    if (current === null || odd > current) {
                        existing.markets[market] = odd;
                    }
                }
            }

            rows.set(key, existing);
        }
    }

    return [...rows.values()].filter(row => Object.keys(row.markets).length > 0);
}


function isPreferred(row, preferredBookmakerId, preferredBookmakerName) {
    const wantedId = numberOrNull(preferredBookmakerId);
    if (wantedId !== null && numberOrNull(row?.id) === wantedId) return true;

    const wantedName = normalizeText(preferredBookmakerName);
    const rowName = normalizeText(row?.name);
    return Boolean(wantedName && rowName && rowName.includes(wantedName));
}


function fairThreeWay(row) {
    const odds = ['MS1', 'X', 'MS2'].map(market => numberOrNull(row?.markets?.[market]));
    if (odds.some(odd => odd === null || odd <= 1)) return null;

    const inverse = odds.map(odd => 1 / odd);
    const overround = inverse.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(overround) || overround <= 0) return null;

    return {
        home: inverse[0] / overround,
        draw: inverse[1] / overround,
        away: inverse[2] / overround,
        odds: {
            home: odds[0],
            draw: odds[1],
            away: odds[2]
        }
    };
}


function fairTotal(row, line) {
    const overOdd = numberOrNull(row?.markets?.[`${line}_UST`]);
    const underOdd = numberOrNull(row?.markets?.[`${line}_ALT`]);
    if (overOdd === null || underOdd === null || overOdd <= 1 || underOdd <= 1) {
        return null;
    }

    const overInverse = 1 / overOdd;
    const underInverse = 1 / underOdd;
    const overround = overInverse + underInverse;
    if (!Number.isFinite(overround) || overround <= 0) return null;

    return {
        over: overInverse / overround,
        under: underInverse / overround,
        odds: {
            over: overOdd,
            under: underOdd
        }
    };
}


function sourceLabel(row, count) {
    return row
        ? `${row.name} Pre-Match Odds`
        : `API-Football Pre-Match Konsensüs (${count} kaynak)`;
}


function normalizeTriple(home, draw, away) {
    const total = home + draw + away;
    if (![home, draw, away, total].every(Number.isFinite) || total <= 0) return null;
    return {
        home: home / total,
        draw: draw / total,
        away: away / total
    };
}


function parsePrematchOddsPayload(payload, {
    preferredBookmakerId = null,
    preferredBookmakerName = 'Bet365'
} = {}) {
    const rows = bookmakerRows(payload);
    const preferred = rows.find(
        row => isPreferred(row, preferredBookmakerId, preferredBookmakerName)
    ) || null;

    const threeWayRows = rows
        .map(row => ({ row, fair: fairThreeWay(row) }))
        .filter(item => item.fair);
    const preferredThreeWay = threeWayRows.find(item => item.row === preferred) || null;

    let oneXTwo = null;
    if (preferredThreeWay) {
        oneXTwo = {
            ...preferredThreeWay.fair,
            source: sourceLabel(preferredThreeWay.row, 1),
            bookmakerId: preferredThreeWay.row.id,
            sourceCount: 1
        };
    } else if (threeWayRows.length > 0) {
        const normalized = normalizeTriple(
            median(threeWayRows.map(item => item.fair.home)),
            median(threeWayRows.map(item => item.fair.draw)),
            median(threeWayRows.map(item => item.fair.away))
        );
        if (normalized) {
            oneXTwo = {
                ...normalized,
                odds: null,
                source: sourceLabel(null, threeWayRows.length),
                bookmakerId: null,
                sourceCount: threeWayRows.length
            };
        }
    }

    const totals = {};
    for (const line of SUPPORTED_TOTAL_LINES) {
        const totalRows = rows
            .map(row => ({ row, fair: fairTotal(row, line) }))
            .filter(item => item.fair);
        const preferredTotal = totalRows.find(item => item.row === preferred) || null;

        if (preferredTotal) {
            totals[String(line)] = {
                over: round(preferredTotal.fair.over),
                under: round(preferredTotal.fair.under),
                odds: preferredTotal.fair.odds,
                source: sourceLabel(preferredTotal.row, 1),
                bookmakerId: preferredTotal.row.id,
                sourceCount: 1
            };
        } else if (totalRows.length > 0) {
            const over = median(totalRows.map(item => item.fair.over));
            if (Number.isFinite(over)) {
                totals[String(line)] = {
                    over: round(over),
                    under: round(1 - over),
                    odds: null,
                    source: sourceLabel(null, totalRows.length),
                    bookmakerId: null,
                    sourceCount: totalRows.length
                };
            }
        }
    }

    return {
        available: Boolean(oneXTwo),
        oneXTwo: oneXTwo
            ? {
                ...oneXTwo,
                home: round(oneXTwo.home),
                draw: round(oneXTwo.draw),
                away: round(oneXTwo.away)
            }
            : null,
        totals,
        bookmakerCount: rows.length
    };
}


class PrematchOddsCache {
    constructor({ filePath, logger = () => {} }) {
        this.filePath = filePath;
        this.logger = logger;
        this.data = {
            version: CACHE_VERSION,
            updatedAt: null,
            entries: {}
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
                version: CACHE_VERSION,
                updatedAt: parsed?.updatedAt || null,
                entries: parsed?.entries && typeof parsed.entries === 'object'
                    ? parsed.entries
                    : {}
            };
            this.prune();
            this.logger(
                `> 🧭 Pre-match önbelleği yüklendi: ${Object.keys(this.data.entries).length} fixture.`
            );
        } catch (error) {
            this.logger(`> ⚠️ Pre-match önbelleği yüklenemedi: ${error.message}`);
            this.data = { version: CACHE_VERSION, updatedAt: null, entries: {} };
        }
    }


    save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        this.data.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    }


    prune() {
        const now = Date.now();
        for (const [fixtureId, entry] of Object.entries(this.data.entries)) {
            if (!Number.isFinite(Number(entry?.expiresAt)) || Number(entry.expiresAt) <= now) {
                delete this.data.entries[fixtureId];
            }
        }
    }


    get(fixtureId) {
        const key = String(Number(fixtureId));
        const entry = this.data.entries[key];
        if (!entry) return null;
        if (!Number.isFinite(Number(entry.expiresAt)) || Number(entry.expiresAt) <= Date.now()) {
            delete this.data.entries[key];
            return null;
        }
        return entry;
    }


    set(fixtureId, result, { ttlMs, status = 'ok' } = {}) {
        const key = String(Number(fixtureId));
        if (!key || key === 'NaN') return;
        const safeTtl = Math.max(60_000, Number(ttlMs) || 60 * 60 * 1000);
        this.data.entries[key] = {
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
        const entries = Object.values(this.data.entries);
        return {
            total: entries.length,
            available: entries.filter(entry => entry.status === 'ok' && entry.result?.available).length,
            missing: entries.filter(entry => entry.status !== 'ok' || !entry.result?.available).length,
            updatedAt: this.data.updatedAt
        };
    }
}


module.exports = {
    parsePrematchOddsPayload,
    PrematchOddsCache
};
