'use strict';
// Read-only reuse of the existing fixture payloads. No API calls, no signal gate.
// The bounded in-memory timeline resets on restart; frozen signal evidence does not.
const crypto = require('crypto');
const { finite, integer } = require('./v23_goal_profile');
const VERSION = 'v23-events-observed-v1';
const MAX_AGE_MS = 120000;
const clone = value => JSON.parse(JSON.stringify(value));
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const text = value => String(value || '').toLowerCase();
function normalize(events, mac, observedAt) {
    if (!Array.isArray(events) || events.length > 150) return { status: 'insufficient', reason: 'EVENTS_MISSING_OR_OVERSIZED', events: [] };
    const rows = new Map();
    for (const e of events) {
        const type = text(e?.type), detail = text(e?.detail), comments = text(e?.comments);
        if (!['goal','card','subst','var'].includes(type)) continue;
        const minute = integer(e.time?.elapsed), extra = e.time?.extra == null ? 0 : integer(e.time.extra);
        const teamId = integer(e.team?.id), playerId = integer(e.player?.id), assistId = integer(e.assist?.id);
        if (minute === null || extra === null || ![integer(mac.home_team_id),integer(mac.away_team_id)].includes(teamId) || !teamId ||
            minute > Number(mac.dakika) || minute > 90 || (mac.status_short === '1H' && minute > 45))
            return { status: 'insufficient', reason: 'EVENT_IDENTITY_OR_TIME_INVALID', events: [] };
        const phase = minute <= 45 ? '1H' : '2H';
        const cancelled = /missed|cancel|disallow|annul/.test(detail + ' ' + comments);
        const row = { type, detail, minute, extra, phase, teamId, playerId, assistId, cancelled };
        const key = crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0,20);
        rows.set(key,{ key, ...row, firstObservedAt: observedAt });
    }
    return { status: 'ok', events: [...rows.values()].sort((a,b) => a.minute-b.minute || a.extra-b.extra || a.key.localeCompare(b.key)) };
}
function state(mac, capturedAt) {
    const stats = {};
    for (const side of ['home','away']) {
        stats[side] = Object.fromEntries(['shot','sot','corner','red'].map(k => [k,finite(mac[`${side}_${k}`])]));
    }
    return { capturedAt, statsAt: mac.stats_received_at || capturedAt, minute: finite(mac.dakika),
        phase: mac.status_short, score: String(mac.skor || ''), stats };
}
class EventObservations {
    constructor({ maxFixtures = 300, maxSnapshots = 32 } = {}) {
        this.entries = new Map(); this.maxFixtures = maxFixtures; this.maxSnapshots = maxSnapshots;
    }
    capture(mac, capturedAt) {
        const id = integer(mac?.fixture_id), at = time(capturedAt);
        if (!id || at === null || !['1H','2H'].includes(mac.status_short)) return;
        const received = time(mac._v23EventsAt);
        const parsed = normalize(mac._v23Events, mac, mac._v23EventsAt);
        const fresh = received !== null && received <= at && at-received <= MAX_AGE_MS;
        const entry = this.entries.get(id) || { snapshots: [], seen: new Map(), lastAt: 0 };
        if (entry.lastAt > at) return;
        if (parsed.status === 'ok' && fresh) {
            parsed.events = parsed.events.map(event => {
                if (!entry.seen.has(event.key)) entry.seen.set(event.key,event);
                return entry.seen.get(event.key); // Share immutable rows across the bounded ring.
            });
        }
        const snap = { ...state(mac,capturedAt), eventsAt: mac._v23EventsAt || null,
            status: parsed.status !== 'ok' ? parsed.status : fresh ? 'ok' : 'insufficient',
            reason: parsed.status !== 'ok' ? parsed.reason : fresh ? null : 'EVENTS_STALE_OR_FUTURE',
            events: parsed.status === 'ok' && fresh ? parsed.events : [] };
        // A later scan may not replace the evidence used by an earlier signal.
        if (!entry.snapshots.some(s => s.capturedAt === capturedAt)) entry.snapshots.push(snap);
        entry.snapshots = entry.snapshots.filter(s => at-time(s.capturedAt) <= 45*60000).slice(-this.maxSnapshots);
        const keys = new Set(entry.snapshots.flatMap(s=>s.events.map(e=>e.key)));
        for (const key of entry.seen.keys()) if (!keys.has(key)) entry.seen.delete(key);
        entry.lastAt = at; this.entries.delete(id); this.entries.set(id,entry);
        while (this.entries.size > this.maxFixtures) this.entries.delete(this.entries.keys().next().value);
        for (const [key,value] of this.entries) if (at-value.lastAt > 6*3600000) this.entries.delete(key);
    }
    evidence(mac, capturedAt) {
        const at = time(capturedAt), entry = this.entries.get(integer(mac?.fixture_id));
        const current = entry?.snapshots.find(s=>s.capturedAt === capturedAt);
        if (!current || at === null) return { version: VERSION, status: 'insufficient', reason: 'EVENTS_NOT_CAPTURED_AT_SIGNAL', events: [], windows: {} };
        const result = { version: VERSION, ...clone(current), windows: {},
            source: 'existing API-Football fixture payload; no additional requests', maximumAgeMs: MAX_AGE_MS };
        if (current.status !== 'ok') return result;
        const score = /^(\d+)-(\d+)$/.exec(current.score);
        const goalEvents = current.events.filter(e=>e.type === 'goal' && !e.cancelled);
        result.validGoalCount = goalEvents.length;
        result.scoreTotal = score ? Number(score[1])+Number(score[2]) : null;
        result.scoreConsistent = !!score && goalEvents.length === result.scoreTotal;
        // Yellow-red may coexist with a Red Card row. Count unique known players,
        // but never infer pitch manpower: staff/bench red cards may be present.
        result.redPlayerIds = [...new Set(current.events.filter(e=>e.type==='card' && /red/.test(e.detail)).map(e=>e.playerId).filter(Boolean))];
        result.hasVar = current.events.some(e=>e.type==='var');
        const goalsOrReds = e => (e.type==='goal' && !e.cancelled) || (e.type==='card' && /red/.test(e.detail));
        const allRelevant = current.events.filter(e=>e.phase===current.phase && (goalsOrReds(e) || e.type==='subst'));
        for (const [kind,predicate] of [['goal',e=>e.type==='goal'&&!e.cancelled],['red',e=>e.type==='card'&&/red/.test(e.detail)],['substitution',e=>e.type==='subst']]) {
            const event = current.events.filter(e=>e.phase===current.phase && predicate(e)).at(-1);
            if (!event) { result.windows[kind] = { status:'insufficient', reason:'NO_EVENT_IN_CURRENT_HALF' }; continue; }
            const base = entry.snapshots.find(s => s.status==='ok' && s.phase===current.phase &&
                time(s.capturedAt) >= time(event.firstObservedAt) && time(s.capturedAt) < at &&
                time(s.statsAt) >= time(event.firstObservedAt) && s.minute > event.minute &&
                s.events.some(e=>e.key===event.key));
            const gap = base ? current.minute-base.minute : null;
            const window = { status:'insufficient', reason:'POST_EVENT_WINDOW_TOO_SHORT_OR_MISSING', event,
                minutesSinceEvent: current.minute-event.minute, windowMinutes:gap, from:base ? clone(base) : null };
            // Do not attribute activity across another goal/card/substitution.
            if (base && allRelevant.some(e=>e.key!==event.key && e.minute >= base.minute)) window.reason='ANOTHER_EVENT_IN_WINDOW';
            else if (base && gap >= 3 && gap <= 20 && current.score===base.score && result.scoreConsistent &&
                time(current.statsAt) <= at && time(base.statsAt) < time(current.statsAt)) {
                const deltas = {}; let valid=true;
                for (const side of ['home','away']) {
                    deltas[side]={};
                    for (const k of ['shot','sot','corner']) {
                        const before=base.stats[side][k], now=current.stats[side][k];
                        if (before===null || now===null || now<before) valid=false;
                        deltas[side][k]=before===null||now===null?null:now-before;
                    }
                    if (base.stats[side].red!==current.stats[side].red || current.stats[side].red===null) valid=false;
                    if (deltas[side].sot>deltas[side].shot) valid=false;
                }
                if (valid) {
                    window.status='observed'; window.reason=null; window.deltas=deltas;
                    const shots=deltas.home.shot+deltas.away.shot, sot=deltas.home.sot+deltas.away.sot;
                    window.tag=shots===0?'NO_SHOTS_OBSERVED':sot===0?'SHOTS_WITHOUT_SOT':'SOT_OBSERVED';
                } else window.reason='STATS_MISSING_CORRECTED_OR_CARD_CHANGED';
            }
            // Evidence contains only the two endpoints, not the full ring buffer.
            if (window.from) window.from={capturedAt:base.capturedAt,statsAt:base.statsAt,minute:base.minute,score:base.score,stats:base.stats};
            result.windows[kind]=window;
        }
        return result;
    }
    metadata() { return { version:VERSION, cachedFixtures:this.entries.size, maximumFixtures:this.maxFixtures,
        maximumSnapshotsPerFixture:this.maxSnapshots, additionalApiCalls:0, persistentTimeline:false,
        restartBehavior:'new windows must accumulate; frozen signal evidence is retained' }; }
}
module.exports={VERSION,MAX_AGE_MS,normalize,EventObservations};
