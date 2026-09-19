'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const VERSION = 'v23-goal-profile-2026-09-14';
const COLLECTOR_VERSION = 'v23-history-ready-2026-09-19';
const EARLY_ACCOUNTING_VERSION = 2;
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
function safeMessage(value) {
    return String(value || '').replace(/https?:\/\/\S+/gi, '[url]')
        .replace(/(bearer\s+|(?:api[-_ ]?key|token|secret|password|authorization)[\s"':=]+)[^\s,;]+/gi, '$1[redacted]')
        .replace(/[a-zA-Z0-9_-]{24,}/g, '[redacted]').replace(/[\r\n<>]/g, ' ').slice(0, 240);
}
function failure(error) {
    const httpStatus = Number(error?.response?.status) || null;
    const errors = error?.response?.data?.errors || error?.apiErrors;
    const text = errors && typeof errors === 'object' ? Object.entries(errors).map(([key, value]) =>
        /key|token|secret|password|authorization/i.test(key) ? `${key}: [redacted]` : `${key}: ${String(value)}`).join('; ') : error?.message;
    const hint = `${Object.keys(errors || {}).join(' ')} ${text || ''}`;
    const code = httpStatus === 429 || /rate.?limit|too many requests/i.test(hint) ? 'rate_limited' :
        httpStatus === 401 || httpStatus === 403 || /api.?key|token|subscription|plan|access|permission/i.test(hint) ? 'provider_access' :
        httpStatus === 400 || /parameter|field|invalid.*(from|to|season|team)|required/i.test(hint) ? 'provider_parameters' :
        errors && Object.keys(errors).length ? 'provider_response_error' :
        /ECONN|ETIMEDOUT|timeout/i.test(`${error?.code} ${hint}`) ? 'network_timeout' : 'profile_fetch_failed';
    return { code, httpStatus, message: safeMessage(text || code) };
}
const enough = (games, side) => games.length >= 10 && games.filter(g => g.venue === side).length >= 5;
function parseFixtures(payload, info) {
    if (Object.keys(payload?.errors || {}).length) {
        const error = new Error('provider_response_error'); error.apiErrors = payload.errors; throw error;
    }
    if (!Array.isArray(payload?.response) || Number(payload?.paging?.total || 1) > 1)
        throw new Error('incomplete_or_invalid_fixture_response');
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
        maxCallsPerDay = 80, maxCallsPerWarm = 12, maxEntries = 600, blockReason = () => null }) {
        Object.assign(this, { filePath, fetchApi, canFetch, logger, now, maxEntries, blockReason });
        this.maxCallsPerDay = Math.max(1, Math.min(1000, integer(maxCallsPerDay) || 80));
        this.maxCallsPerWarm = Math.max(1, Math.min(12, integer(maxCallsPerWarm) || 12));
        this.data = { version: VERSION, collectorVersion: COLLECTOR_VERSION, earlyAccountingVersion: EARLY_ACCOUNTING_VERSION,
            day: null, calls: 0, earlyCalls: 0, inheritedUnclassifiedCalls: 0, cooldownUntil: 0, entries: {} };
        this.queue = new Map(); this.running = false; this.disabled = false;
        this.targets = new Map(); this.preferEarly = false; this.lastBatchAt = null; this.lastBatchCalls = 0;
        this.droppedRequests = 0; this.prunedRequests = 0;
    }
    load() {
        if (!fs.existsSync(this.filePath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if (data.version !== VERSION || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries) ||
                integer(data.calls) === null || finite(data.cooldownUntil) === null) throw Error('cache_schema');
            if (Object.values(data.entries).some(e => !e || !Array.isArray(e.games) || !iso(e.fetchedAt) || finite(e.expiresAt) === null))
                throw Error('cache_entry_schema');
            // Keep successful legacy cache data and today's consumed quota. Old
            // failures are retryable with the repaired query; history is untouched.
            if (!['v23-history-collector-2026-09-18', COLLECTOR_VERSION].includes(data.collectorVersion)) for (const e of Object.values(data.entries)) {
                if (!['ok','partial'].includes(e.status)) { e.expiresAt = 0; e.retryAt = 0; }
                else if (e.games.length < 10 || !enough(e.games, 'home') || !enough(e.games, 'away')) {
                    // The old collector could incorrectly cache incomplete data as
                    // complete for 12 hours. Keep that evidence, but allow repair.
                    e.status = 'partial'; e.priorPending = true; e.retryAt = 0;
                }
            }
            // The prior migration classified ALL old calls as early preparation.
            // Preserve the total quota, but never invent the split. This migration
            // runs once; later restarts retain genuinely measured early calls.
            const measured = data.earlyAccountingVersion === EARLY_ACCOUNTING_VERSION;
            this.data = { ...data, collectorVersion: COLLECTOR_VERSION, earlyAccountingVersion: EARLY_ACCOUNTING_VERSION,
                earlyCalls: measured ? integer(data.earlyCalls) || 0 : 0,
                inheritedUnclassifiedCalls: measured ? integer(data.inheritedUnclassifiedCalls) || 0 : data.calls };
        } catch { this.disabled = true; this.logger('> ⚠️ V23 profil önbelleği okunamadı; dosya korunuyor, V23 veri toplama kapalı.'); }
    }
    save() { atomicJson(this.filePath, this.data); }
    resetDay() {
        const day = new Date(this.now()).toISOString().slice(0,10);
        if (this.data.day !== day) {
            this.data.day = day; this.data.calls = 0; this.data.earlyCalls = 0; this.data.inheritedUnclassifiedCalls = 0;
        }
    }
    pruneQueue() {
        for (const [key, info] of this.queue) {
            const age = this.now() - Date.parse(info.kickoff);
            if (age < 0 || age > 6*3600000) { this.queue.delete(key); this.prunedRequests++; }
        }
        for (const [id, target] of this.targets) if (this.now()-Date.parse(target.mac.fixture_kickoff)>6*3600000) this.targets.delete(id);
    }
    cancelFixture(fixtureId) {
        for (const [key, info] of this.queue) if (info.fixtureId === Number(fixtureId)) this.queue.delete(key);
        const target = this.targets.get(Number(fixtureId));
        if (target) target.closedAt ||= new Date(this.now()).toISOString();
    }
    releaseFixture(fixtureId) {
        const id = Number(fixtureId), target = this.targets.get(id), keys = new Set();
        if (target) for (const side of ['home','away']) { const info=identity(target.mac,side); if(info)keys.add(keyFor(info)); }
        for (const [key,info] of this.queue) if (info.fixtureId===id) { keys.add(key); this.queue.delete(key); }
        this.targets.delete(id);
        // Never evict a team profile another tracked fixture still needs.
        for (const other of this.targets.values()) for (const side of ['home','away']) {
            const info=identity(other.mac,side); if(info)keys.delete(keyFor(info));
        }
        for (const key of this.queue.keys()) keys.delete(key);
        this.evictEntries(keys);
    }
    evictEntries(keys) {
        if (this.disabled) return;
        const removed = new Map();
        for (const key of keys) if (this.data.entries[key]) { removed.set(key,this.data.entries[key]); delete this.data.entries[key]; }
        if (!removed.size) return;
        try { this.save(); }
        catch { for(const [key,entry] of removed)this.data.entries[key]=entry;
            this.logger('> ⚠️ V23 geçici önbellek temizliği yazılamadı; önbellek korundu.'); }
    }
    pruneExpired() {
        this.pruneQueue();
        this.evictEntries(Object.keys(this.data.entries).filter(key=>this.data.entries[key].expiresAt<=this.now() && !this.queue.has(key)));
    }
    request(mac, { priority = 50 } = {}) {
        if (this.disabled) return;
        this.pruneQueue();
        const home = identity(mac,'home'), away = identity(mac,'away');
        if (home && away && Date.parse(home.kickoff)<=this.now() && this.now()-Date.parse(home.kickoff)<=6*3600000) {
            const old = this.targets.get(home.fixtureId);
            this.targets.set(home.fixtureId,{ ...old, seenAt:this.now(), match:String(mac.mac_isim || old?.match || `Maç ${home.fixtureId}`),
                mac:{fixture_id:home.fixtureId,fixture_kickoff:home.kickoff,league_id:home.leagueId,season:home.season,
                    home_team_id:home.teamId,away_team_id:away.teamId} });
            while(this.targets.size>200)this.targets.delete(this.targets.keys().next().value);
        }
        for (const side of ['home','away']) {
            const info = identity(mac, side);
            if (!info || Date.parse(info.kickoff) > this.now() || this.now() - Date.parse(info.kickoff) > 6*3600000) continue;
            const key = keyFor(info), cached = this.data.entries[key];
            if (cached && cached.expiresAt > this.now() && !cached.priorPending) continue;
            const previous = this.queue.get(key);
            const work = { ...info, priority: Math.max(previous?.priority || 0, finite(priority) || 0), enqueuedAt: previous?.enqueuedAt || this.now() };
            if (!previous && this.queue.size >= 200) {
                const lowest = [...this.queue].sort((a,b) => a[1].priority-b[1].priority || b[1].enqueuedAt-a[1].enqueuedAt)[0];
                if (lowest[1].priority >= work.priority) { this.droppedRequests++; continue; }
                this.queue.delete(lowest[0]); this.droppedRequests++;
            }
            this.queue.set(key, work);
        }
    }
    get(mac, side, capturedAt) {
        if (this.disabled) return { status: 'cache_unreadable', profile: null };
        const info = identity(mac,side);
        if (!info) return { status: 'identity_or_kickoff_missing', profile: null };
        const entry = this.data.entries[keyFor(info)];
        if (!entry) return { status: this.waitReason() || 'profile_not_ready', profile: null };
        // A profile fetched after the signal can never be backfilled into that decision.
        if (entry.expiresAt <= Date.parse(capturedAt) || Date.parse(entry.fetchedAt) > Date.parse(capturedAt))
            return { status: 'profile_not_available_at_signal', profile: null };
        if (!['ok','partial'].includes(entry.status)) return { status: entry.status, profile: null, error: entry.lastError || null };
        return { status: entry.status, profile: buildProfile(entry.games, info, entry.fetchedAt), error: entry.lastError || null };
    }
    waitReason() {
        if (this.disabled) return 'cache_unreadable';
        if (this.now() < this.data.cooldownUntil) return this.data.cooldownReason || 'rate_limited';
        if (this.data.day === new Date(this.now()).toISOString().slice(0,10) && this.data.calls >= this.maxCallsPerDay) return 'daily_budget_exhausted';
        const blocked = this.blockReason();
        if (blocked) return blocked;
        const work = [...this.queue].filter(([key])=>{
            const e=this.data.entries[key];return !(e?.expiresAt>this.now()&&!e.priorPending);
        });
        if (work.length && work.every(([,info])=>info.priority<50) && this.data.earlyCalls>=Math.floor(this.maxCallsPerDay/4))
            return 'early_budget_exhausted';
        if (work.length && work.every(([key])=>this.data.entries[key]?.retryAt>this.now())) return 'profile_retry_wait';
        return null;
    }
    trim() {
        const keys = Object.keys(this.data.entries).sort((a,b) => this.data.entries[a].expiresAt - this.data.entries[b].expiresAt);
        for (const key of keys.slice(0, Math.max(0, keys.length-this.maxEntries))) delete this.data.entries[key];
    }
    async warm({ canContinue = () => true } = {}) {
        if (this.running || this.disabled) return;
        this.running = true;
        try {
            this.resetDay(); this.pruneQueue();
            this.save(); // Persist migration/day rollover even when no request can run.
            let calls = 0;
            const allowed = info => canContinue() && this.canFetch() && this.now() >= this.data.cooldownUntil &&
                this.data.calls < this.maxCallsPerDay && calls < this.maxCallsPerWarm &&
                (info.priority >= 50 || this.data.earlyCalls < Math.floor(this.maxCallsPerDay/4));
            let work = [...this.queue].sort((a,b) => b[1].priority-a[1].priority || a[1].enqueuedAt-b[1].enqueuedAt);
            // Every other batch reserves its front for one early fixture pair.
            // Normal candidates still get the first batch; early preparation must
            // not starve behind an endless stream of already eligible fixtures.
            if(this.preferEarly && this.data.earlyCalls<Math.floor(this.maxCallsPerDay/4)) {
                const early=work.filter(([key,info])=>info.priority<50 && !(this.data.entries[key]?.retryAt>this.now()))
                    .sort((a,b)=>a[1].kickoff.localeCompare(b[1].kickoff))[0];
                if(early){const id=early[1].fixtureId;work=[...work.filter(([,i])=>i.fixtureId===id),...work.filter(([,i])=>i.fixtureId!==id)];}
            }
            for (const [key, info] of work) {
                if (!this.queue.has(key)) continue;
                let entry = this.data.entries[key];
                if (entry?.expiresAt > this.now() && !entry.priorPending) { this.queue.delete(key); continue; }
                if (entry?.retryAt > this.now()) continue;
                if (!allowed(info)) continue;
                // Keep work queued until complete; an interrupted background batch
                // must not turn a deferred previous-season request into a 12h hit.
                for (let step = 0; step < 2 && this.queue.has(key) && allowed(info); step++) {
                    const prior = entry?.expiresAt > this.now() && entry?.priorPending;
                    const season = info.season - (prior ? 1 : 0);
                    this.resetDay(); this.data.calls++; calls++;
                    if (info.priority < 50) this.data.earlyCalls++;
                    this.save();
                    try {
                        const query = new URLSearchParams({ team: info.teamId, league: info.leagueId, season,
                            status: 'FT', from: new Date(Date.parse(info.kickoff)-365*DAY).toISOString().slice(0,10),
                            to: info.kickoff.slice(0,10), timezone: 'UTC' });
                        const response = await this.fetchApi(`/fixtures?${query}`, { timeout: 6000, dinoMaxAttempts: 1 });
                        const fetched = parseFixtures(response.data, { ...info, season });
                        const games = prior ? [...new Map([...fetched,...entry.games].map(g=>[g.id,g])).values()]
                            .sort((a,b)=>b.at.localeCompare(a.at)||b.id-a.id) : fetched;
                        const priorPending = !prior && !enough(games, info.side);
                        entry = { status: enough(games, info.side) ? 'ok' : 'partial', games, side: info.side,
                            fetchedAt: new Date(this.now()).toISOString(), expiresAt: this.now()+12*3600000,
                            priorPending, priorCompleted: Boolean(prior), retryAt: 0, attempts: 0, lastError: null };
                    } catch (error) {
                        const detail = { ...failure(error), at: new Date(this.now()).toISOString(), phase: prior ? 'previous_season' : 'current_season' };
                        const attempts = (entry?.attempts || 0)+1;
                        const permanent = ['provider_access','provider_parameters'].includes(detail.code);
                        const wait = permanent || attempts >= 3 ? 12*3600000 : detail.code === 'rate_limited' ? 30*60000 : Math.min(30, 2**attempts)*60000;
                        if (detail.code === 'rate_limited' || (!prior && permanent)) {
                            this.data.cooldownUntil = this.now()+30*60000; this.data.cooldownReason = detail.code;
                        }
                        if (prior) entry = { ...entry, priorPending: true, retryAt: this.now()+wait, attempts, lastError: detail };
                        else entry = { status: detail.code === 'rate_limited' ? 'rate_limited' : 'profile_fetch_failed', games: [],
                            fetchedAt: new Date(this.now()).toISOString(), expiresAt: this.now()+wait, retryAt: this.now()+wait,
                            priorPending: false, attempts, lastError: detail };
                        this.logger(`> ⚠️ V23 LAB geçmişi (takım ${info.teamId}, ${detail.phase}): ${detail.code} ${detail.httpStatus || ''} ${detail.message}. Ana sinyal değişmedi.`);
                    }
                    // A match can finish while the HTTP request is in flight.
                    // Its attempt remains charged, but must not repopulate the cache.
                    if (!this.queue.has(key)) break;
                    this.data.entries[key] = entry; this.trim(); this.save();
                    if (!entry.priorPending) { this.queue.delete(key); break; }
                    if (entry.retryAt > this.now()) break;
                }
            }
            this.lastBatchAt = new Date(this.now()).toISOString(); this.lastBatchCalls = calls;
            if(calls)this.preferEarly=!this.preferEarly;
        } catch {
            this.disabled = true;
            this.logger('> ⚠️ V23 profil önbelleği yazılamadı; veri toplama durdu, mevcut modeller etkilenmedi.');
        } finally { this.running = false; }
    }
    metadata() {
        const entries = Object.values(this.data.entries), current = entries.filter(e=>e.expiresAt>this.now());
        const lastErrors = Object.entries(this.data.entries).filter(([,e])=>e.lastError)
            .sort((a,b)=>b[1].lastError.at.localeCompare(a[1].lastError.at)).slice(0,5)
            .map(([key,e])=>({ teamId:Number(key.split(':')[1]), ...e.lastError }));
        const fixtures=[...this.targets.values()].filter(t=>this.now()-Date.parse(t.mac.fixture_kickoff)<=6*3600000)
            .sort((a,b)=>b.seenAt-a.seenAt).map(t=>{
                const team=side=>{const info=identity(t.mac,side),e=this.data.entries[keyFor(info)];
                    const status=!e?'profile_not_ready':e.expiresAt<=this.now()?'profile_expired':e.status;
                    return {teamId:info.teamId,status,ready:status==='ok',fetchedAt:e?.fetchedAt||null};};
                return {fixtureId:t.mac.fixture_id,match:t.match,home:team('home'),away:team('away'),closedAt:t.closedAt||null};
            });
        return { enabled: !this.disabled, collectorVersion: COLLECTOR_VERSION, cachedTeams: entries.length,
        readyProfiles: current.filter(e=>e.status==='ok').length, partialProfiles: current.filter(e=>e.status==='partial').length,
        failedProfiles: current.filter(e=>!['ok','partial'].includes(e.status)).length, expiredProfiles: entries.length-current.length,
        droppedRequests: this.droppedRequests, prunedRequests: this.prunedRequests, lastErrors,
        waitReason: this.waitReason(), cooldownUntil: this.data.cooldownUntil || null, earlyCallsToday: this.data.earlyCalls,
        earlyCallsLimit: Math.floor(this.maxCallsPerDay/4), inheritedUnclassifiedCalls:this.data.inheritedUnclassifiedCalls,
        lastBatchAt:this.lastBatchAt,lastBatchCalls:this.lastBatchCalls,
        readyFixturePairs:fixtures.filter(f=>f.home.ready&&f.away.ready).length,fixtures:fixtures.slice(0,20),
        queued: this.queue.size, callsDayUTC: this.data.day, callsToday: this.data.calls,
        maxCallsPerDay: this.maxCallsPerDay, warming: this.running }; }
}
module.exports = { VERSION, COLLECTOR_VERSION, DAY, finite, integer, iso, atomicJson, identity, parseFixtures, summarize, buildProfile, GoalProfileCache, failure, safeMessage };
