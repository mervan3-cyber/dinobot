'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const VERSION = 'v23-goal-profile-2026-09-14';
const DAY = 86400000;
const finite = v => v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v);
const integer = v => { const n = finite(v); return n !== null && Number.isInteger(n) && n >= 0 ? n : null; };
const iso = v => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
function atomicJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data), 'utf8');
    fs.renameSync(temp, file);
}
function identity(mac, side) {
    const values = [mac?.fixture_id, mac?.league_id, mac?.season, mac?.[`${side}_team_id`]].map(integer);
    const kickoff = iso(mac?.fixture_kickoff);
    if (!kickoff || values.some(v => v === null || v <= 0)) return null;
    const [fixtureId, leagueId, season, teamId] = values;
    return { fixtureId, leagueId, season, teamId, kickoff, side };
}
function keyFor(info) { return `${VERSION}:${info.teamId}:${info.leagueId}:${info.season}:${info.kickoff.slice(0,10)}`; }
function summarize(games) {
    const n = games.length;
    const avg = key => n ? games.reduce((sum, game) => sum + game[key], 0) / n : null;
    return { n, goalsFor: avg('gf'), goalsAgainst: avg('ga'),
        failedToScoreRate: n ? games.filter(g => g.gf === 0).length / n : null,
        cleanSheetRate: n ? games.filter(g => g.ga === 0).length / n : null };
}
function parseFixtures(payload, info) {
    if (!Array.isArray(payload?.response) || Object.keys(payload?.errors || {}).length ||
        Number(payload?.paging?.total || 1) > 1) throw new Error('incomplete_or_invalid_fixture_response');
    const games = new Map();
    for (const row of payload.response) {
        // Entire response must belong to the requested team/competition/season.
        if (Number(row?.league?.id) !== info.leagueId || Number(row?.league?.season) !== info.season ||
            ![Number(row?.teams?.home?.id), Number(row?.teams?.away?.id)].includes(info.teamId))
            throw new Error('fixture_identity_mismatch');
        const id = integer(row?.fixture?.id), at = iso(row?.fixture?.date);
        if (!id || !at || row?.fixture?.status?.short !== 'FT') continue;
        // Exclude the live fixture, later fixtures, and overlapping same-day games.
        // Only games starting >= 6h before the current kickoff qualify.
        const age = Date.parse(info.kickoff) - Date.parse(at);
        if (id === info.fixtureId || age < 6 * 3600000 || age > 365 * DAY) continue;
        const hg = integer(row?.score?.fulltime?.home), ag = integer(row?.score?.fulltime?.away);
        if (hg === null || ag === null) continue;
        const home = Number(row.teams.home.id) === info.teamId;
        const game = { id, at, season: info.season, venue: home ? 'home' : 'away', gf: home ? hg : ag, ga: home ? ag : hg };
        if (games.has(id) && JSON.stringify(games.get(id)) !== JSON.stringify(game)) throw new Error('conflicting_fixture');
        games.set(id, game);
    }
    return [...games.values()].sort((a,b) => b.at.localeCompare(a.at) || b.id - a.id);
}
function buildProfile(games, info, fetchedAt) {
    const cutoff = Date.parse(info.kickoff);
    const eligible = games.filter(g => g.id !== info.fixtureId && cutoff - Date.parse(g.at) >= 6 * 3600000 && cutoff - Date.parse(g.at) <= 365 * DAY);
    const currentSeason = eligible.filter(g => g.season === info.season);
    const profile = { version: VERSION, teamId: info.teamId, leagueId: info.leagueId, season: info.season,
        cutoff: info.kickoff, fetchedAt, source: 'API-Football /fixtures; FT; same league; up to 365 days; previous season fallback',
        seasonsIncluded: [...new Set(eligible.map(g=>g.season).filter(Boolean))],
        seasonOverall: summarize(currentSeason), seasonHome: summarize(currentSeason.filter(g=>g.venue==='home')),
        seasonAway: summarize(currentSeason.filter(g=>g.venue==='away')),
        last5: summarize(eligible.slice(0,5)), last10: summarize(eligible.slice(0,10)),
        home: summarize(eligible.filter(g => g.venue === 'home')),
        away: summarize(eligible.filter(g => g.venue === 'away')),
        latestMatchAt: eligible[0]?.at || null,
        // Compact source evidence, once per profile in exports; never repeated per observation.
        games: eligible };
    profile.id = crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex').slice(0,24);
    return profile;
}

class GoalProfileCache {
    constructor({ filePath, fetchApi, canFetch = () => true, logger = () => {}, now = Date.now,
        maxCallsPerDay = 80, maxCallsPerWarm = 12, maxEntries = 600 }) {
        Object.assign(this, { filePath, fetchApi, canFetch, logger, now, maxCallsPerDay, maxCallsPerWarm, maxEntries });
        this.data = { version: VERSION, day: null, calls: 0, cooldownUntil: 0, entries: {} };
        this.queue = new Map(); this.running = false; this.disabled = false;
    }
    load() {
        if (!fs.existsSync(this.filePath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if (data.version !== VERSION || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries) ||
                integer(data.calls) === null || finite(data.cooldownUntil) === null) throw Error('cache_schema');
            this.data = data;
        } catch { this.disabled = true; this.logger('> ⚠️ V23 profil önbelleği okunamadı; dosya korunuyor, V23 veri toplama kapalı.'); }
    }
    save() { atomicJson(this.filePath, this.data); }
    request(mac) {
        if (this.disabled) return;
        for (const side of ['home','away']) {
            const info = identity(mac, side);
            if (!info || Date.parse(info.kickoff) > this.now() || this.now() - Date.parse(info.kickoff) > 6*3600000) continue;
            const key = keyFor(info), cached = this.data.entries[key];
            if (cached && cached.expiresAt > this.now()) continue;
            if (this.queue.size < 200) this.queue.set(key, info);
        }
    }
    get(mac, side, capturedAt) {
        if (this.disabled) return { status: 'cache_unreadable', profile: null };
        const info = identity(mac,side);
        if (!info) return { status: 'identity_or_kickoff_missing', profile: null };
        const entry = this.data.entries[keyFor(info)];
        if (!entry) return { status: 'profile_not_ready', profile: null };
        // A profile fetched after the signal can never be backfilled into that decision.
        if (entry.expiresAt <= Date.parse(capturedAt) || Date.parse(entry.fetchedAt) > Date.parse(capturedAt))
            return { status: 'profile_not_available_at_signal', profile: null };
        if (entry.status !== 'ok') return { status: entry.status, profile: null };
        return { status: 'ok', profile: buildProfile(entry.games, info, entry.fetchedAt) };
    }
    async warm() {
        if (this.running || this.disabled) return;
        this.running = true;
        try {
            let calls = 0;
            for (const [key, info] of this.queue) {
                const day = new Date(this.now()).toISOString().slice(0,10);
                if (this.data.day !== day) { this.data.day = day; this.data.calls = 0; }
                if (!this.canFetch() || this.now() < this.data.cooldownUntil ||
                    this.data.calls >= this.maxCallsPerDay || calls >= this.maxCallsPerWarm) break;
                this.queue.delete(key);
                if (this.now() - Date.parse(info.kickoff) > 6*3600000) continue;
                if (this.data.entries[key]?.expiresAt > this.now()) continue;
                this.data.calls++; calls++;
                this.save(); // Persist the quota counter before making a request, including across restarts.
                let entry;
                try {
                    const query = new URLSearchParams({ team: info.teamId, league: info.leagueId, season: info.season,
                        status: 'FT', to: info.kickoff.slice(0,10), timezone: 'UTC' });
                    const response = await this.fetchApi(`/fixtures?${query}`, { timeout: 6000, dinoMaxAttempts: 1 });
                    let games = parseFixtures(response.data, info);
                    // Early-season samples may be too small. At most one prior-season
                    // request, same competition, still strictly before this kickoff.
                    const enough = rows => rows.length >= 10 && rows.filter(g=>g.venue==='home').length >= 5 && rows.filter(g=>g.venue==='away').length >= 5;
                    if (!enough(games) && this.canFetch() && this.data.calls < this.maxCallsPerDay && calls < this.maxCallsPerWarm) {
                        this.data.calls++; calls++; this.save();
                        query.set('season',String(info.season-1));
                        const prior = await this.fetchApi(`/fixtures?${query}`, { timeout: 6000, dinoMaxAttempts: 1 });
                        const previous = parseFixtures(prior.data,{...info,season:info.season-1});
                        const unique = new Map([...previous,...games].map(g=>[g.id,g]));
                        games = [...unique.values()].sort((a,b)=>b.at.localeCompare(a.at)||b.id-a.id);
                    }
                    entry = { status: 'ok', games,
                        fetchedAt: new Date(this.now()).toISOString(), expiresAt: this.now() + 12*3600000 };
                } catch (error) {
                    const status = Number(error?.response?.status);
                    if (status === 429) this.data.cooldownUntil = this.now() + 30*60000;
                    entry = { status: status === 429 ? 'rate_limited' : 'profile_fetch_failed', games: [],
                        fetchedAt: new Date(this.now()).toISOString(), expiresAt: this.now() + 30*60000 };
                    this.logger(`> ⚠️ V23 gol geçmişi alınamadı (takım ${info.teamId}); mevcut sinyaller etkilenmedi.`);
                }
                this.data.entries[key] = entry;
                const keys = Object.keys(this.data.entries).sort((a,b) => this.data.entries[a].expiresAt - this.data.entries[b].expiresAt);
                for (const old of keys.slice(0, Math.max(0, keys.length - this.maxEntries))) delete this.data.entries[old];
                this.save();
            }
        } catch {
            this.disabled = true;
            this.logger('> ⚠️ V23 profil önbelleği yazılamadı; veri toplama durdu, mevcut modeller etkilenmedi.');
        } finally { this.running = false; }
    }
    metadata() { return { enabled: !this.disabled, cachedTeams: Object.keys(this.data.entries).length,
        queued: this.queue.size, callsDayUTC: this.data.day, callsToday: this.data.calls,
        maxCallsPerDay: this.maxCallsPerDay, warming: this.running }; }
}
module.exports = { VERSION, DAY, finite, integer, iso, atomicJson, identity, parseFixtures, summarize, buildProfile, GoalProfileCache };
