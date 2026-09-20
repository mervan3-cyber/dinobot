'use strict';
const fs = require('fs');
const { SignalTracker, calculateMarketResult, profitForResult } = require('./signal_tracker');
const { integer, COLLECTOR_VERSION } = require('./v23_goal_profile');
const { SettledArchive, durableJson, profileIds } = require('./v23_archive');
const { VERSION, POLICY, evaluate, baselineCheck } = require('./v23_goal_policy');
const baseline = require('./v21_tariff');
const v22 = require('./v22_tariff');
const { EventObservations } = require('./v23_events');
const { VERSION: AUDIT_VERSION, DEFINITIONS, evaluateControls, comparison } = require('./v23_controls');
const liveLab = require('./v23_live_lab');
// Old code must refuse the compact disk format rather than report incomplete evidence.
const STORAGE_VERSION = `${VERSION}:settled-archive-v1`;
const LABELS = Object.freeze({
    BASELINE_INVALID: 'Kaynak model koşulları doğrulanamadı', LIVE_STATE_MISSING: 'Canlı skor/dakika eksik',
    MARKET_ALREADY_DECIDED: 'Market girişte zaten sonuçlanmış', RED_CARD_DATA_MISSING: 'Kart verisi eksik',
    RED_CARD_OUTSIDE_REFERENCE_MODEL: 'Kırmızı kart: referans hesabının kapsamı dışında',
    HOME_PROFILE_MISSING: 'Ev sahibi gol geçmişi hazır değil', AWAY_PROFILE_MISSING: 'Deplasman gol geçmişi hazır değil',
    HOME_SAMPLE_TOO_SMALL: 'Ev sahibi örneklemi yetersiz (son 10 / evde 5)', AWAY_SAMPLE_TOO_SMALL: 'Deplasman örneklemi yetersiz (son 10 / deplasmanda 5)',
    HOME_HISTORY_TOO_OLD: 'Ev sahibi son maçı eski/eksik', AWAY_HISTORY_TOO_OLD: 'Deplasman son maçı eski/eksik',
    HOME_GOAL_AVERAGE_MISSING: 'Ev sahibi gol ortalaması eksik', AWAY_GOAL_AVERAGE_MISSING: 'Deplasman gol ortalaması eksik',
    GOAL_REFERENCE_SUPPORTS: 'Kalan gol için referans hesap en az %50',
    GOAL_REFERENCE_BELOW_THRESHOLD: 'Kalan gol için referans hesap %50 altında',
    PROFILE_EVALUATION_ERROR: 'Profil değerlendirmesi yapılamadı',
    PRE_ALREADY_IN_BASELINE_NOT_AN_INDEPENDENT_VOTE: 'Pre >%50 baz filtresinde; ek bağımsız oy sayılmaz',
    V22_PRE_ALREADY_IN_SOURCE_NOT_AN_INDEPENDENT_VOTE: 'Pre, V22 A/B/C kaynak filtresinde; ek bağımsız oy sayılmaz',
    SCORE_EFFECT_AND_STOPPAGE_TIME_NOT_FITTED: 'Skor etkisi/uzatma için öğrenilmiş katsayı uygulanmadı',
    HOME_FAILED_TO_SCORE_3_OF_LAST_5: 'Ev sahibi son 5 maçın en az 3’ünde gol atamadı',
    AWAY_FAILED_TO_SCORE_3_OF_LAST_5: 'Deplasman son 5 maçın en az 3’ünde gol atamadı'
});
function selectSource(signals, source = 'all') {
    if (!['all','v21','v22','v22:A','v22:B','v22:C','legacy'].includes(source)) return null;
    return signals.filter(s => source === 'all' ? true : source === 'legacy' ? !s.audit :
        s.audit?.version === AUDIT_VERSION && s.sourceModel === source.split(':')[0] &&
        (!source.includes(':') || s.matchedFilters?.includes(source.split(':')[1])));
}
class GoalLab extends SignalTracker {
    constructor({ filePath, cache, enabled = true, logger = () => {}, maxRecords = 12000, events = new EventObservations(), live = new liveLab.LiveObservations() }) {
        super({ filePath, logger });
        this.cache = cache; this.events = events; this.enabled = enabled; this.maxRecords = maxRecords; this.disabledReason = null;
        this.live = live;
        this.data = { version: VERSION, startedAt: null, updatedAt: null, signals: [], profiles: {} };
        this.archive = new SettledArchive(filePath); this.archiveError = null;
    }
    load() {
        if (!fs.existsSync(this.filePath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if (![VERSION, STORAGE_VERSION].includes(data.version) || !Array.isArray(data.signals) || !data.profiles || typeof data.profiles !== 'object' || Array.isArray(data.profiles) ||
                !data.signals.every(s => s && integer(s.fixtureId) > 0 && Number.isFinite(Date.parse(s.sentAt)) &&
                    ['approve','reject','insufficient'].includes(s.assessment?.status) && Array.isArray(s.assessment?.reasons) &&
                    (!s.audit || (s.audit.version === AUDIT_VERSION && ['v21','v22'].includes(s.sourceModel) && Array.isArray(s.audit.controls) &&
                        s.audit.controls.length === DEFINITIONS.length && DEFINITIONS.every(d=>s.audit.controls.filter(c=>c?.id===d.id).length===1) &&
                        s.audit.controls.every(c => c && ['approve','reject','insufficient','observed'].includes(c.status) && Array.isArray(c.reasons) && Array.isArray(c.reasonLabels)))))) throw Error('history_schema');
            for (const signal of data.signals) {
                if (signal.audit?.live && !liveLab.validAudit(signal.audit.live)) throw Error('live_history_schema');
                if (signal.archiveRef) this.archive.read(signal);
            }
            this.data = data;
        } catch {
            this.disabledReason = 'history_unreadable';
            this.logger('> ⚠️ V23 geçmişi okunamadı. Dosya korunuyor; V23 kayıtları kapalı, mevcut modeller değişmedi.');
            return;
        }
        this.archiveSettled();
    }
    save() {
        this.data.updatedAt = new Date().toISOString();
        durableJson(this.filePath,{...this.data,version:this.data.signals.some(s=>s.archiveRef) ? STORAGE_VERSION : VERSION});
    }
    archiveSettled() {
        if (this.disabledReason === 'history_unreadable') return;
        const finished = this.data.signals.filter(s=>!s.archiveRef && ['W','L','PUSH','VOID'].includes(s.settlement?.result));
        if (!finished.length) return;
        const previous = this.data;
        try {
            // First conversion leaves an exclusive, verified legacy snapshot on disk.
            // It is a migration backup, not a rolling backup of future signals.
            const backup = `${this.filePath}.pre-archive.bak`;
            if (!previous.signals.some(s=>s.archiveRef) && fs.existsSync(backup)) {
                const saved = JSON.parse(fs.readFileSync(backup,'utf8'));
                if (saved.version!==VERSION || !Array.isArray(saved.signals) || saved.signals.some(s=>s.archiveRef))
                    throw Error('archive_backup_invalid');
            }
            if (!previous.signals.some(s=>s.archiveRef) && fs.existsSync(this.filePath) && !fs.existsSync(backup)) {
                const bytes = fs.readFileSync(this.filePath);
                const fd = fs.openSync(backup,'wx');
                try { fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
                if (!bytes.equals(fs.readFileSync(backup))) throw Error('archive_backup_verification_failed');
            }
            const indices = new Map(finished.map(s=>[s,this.archive.write(s,previous.profiles)]));
            const signals = previous.signals.map(s=>indices.get(s)||s);
            const keepProfiles = new Set(signals.filter(s=>!s.archiveRef).flatMap(profileIds));
            const profiles = Object.fromEntries(Object.entries(previous.profiles).filter(([id])=>keepProfiles.has(id)));
            this.data = {...previous, signals, profiles};
            this.save(); // Commit only after every evidence file has been verified.
            this.archiveError = null;
        } catch {
            this.data = previous; this.archiveError = 'archive_write_failed';
            this.logger('> ⚠️ V23 arşive taşınamadı; tam kayıtlar korunuyor. Lab/sinyal kararı değişmedi.');
        }
    }
    maintain() {
        this.events.prune?.();
        this.live.prune();
        this.cache.pruneExpired?.();
        this.archiveSettled();
    }
    indexList(limit = 100000) { return super.list(limit); }
    list(limit = 100, signals = this.data.signals) {
        return super.list(limit,signals).map(s=>s.archiveRef ? this.archive.read(s).signal : s);
    }
    capture(mac, capturedAt) {
        if (!this.enabled || this.disabledReason) return;
        // Isolated diagnostics cannot prevent each other or affect source signals.
        try { this.events.capture(mac,capturedAt); } catch {}
        try { this.live.capture(mac,capturedAt); } catch {}
    }
    // Only a NEW V21/V22 live record can enter. No scan selection, API call or
    // Telegram gate here; approval must never cause a later market re-selection.
    observe(signal, mac) {
        const sourceModel = signal?.tariffVersion === baseline.VERSION ? 'v21' : signal?.tariffVersion === v22.VERSION ? 'v22' : null;
        if (!this.enabled || this.disabledReason || !signal || !sourceModel ||
            this.data.signals.some(s => Number(s.fixtureId) === Number(signal.fixtureId) && (s.sourceModel || 'v21') === sourceModel) ||
            Number(signal.fixtureId) !== Number(mac?.fixture_id) ||
            signal.statsValidation?.status !== 'passed' || mac.stats_validation?.status !== 'passed' ||
            !Number.isFinite(Date.parse(signal.sentAt)) || Date.parse(signal.sentAt) !== Date.parse(mac.stats_validation.verifiedAt) ||
            Date.parse(signal.sentAt) !== Date.parse(signal.statsValidation.verifiedAt)) return null;
        if (this.data.signals.length >= this.maxRecords) {
            this.disabledReason = 'history_capacity_reached';
            this.logger('> ⚠️ V23 12.000 kayıt sınırına ulaştı. Geçmiş silinmedi; dışa aktarım/ayrı arşiv planı gerekli.');
            return null;
        }
        let homeEntry, awayEntry, assessment;
        try {
            homeEntry = this.cache.get(mac,'home',signal.sentAt);
            awayEntry = this.cache.get(mac,'away',signal.sentAt);
            assessment = evaluate({ signal, mac, homeEntry, awayEntry });
        } catch {
            assessment = { version: VERSION, status: 'insufficient', reasons: ['PROFILE_EVALUATION_ERROR'], notes: [], profileIds: {} };
        }
        assessment.reasonLabels = assessment.reasons.map(code => LABELS[code] || code);
        assessment.noteLabels = assessment.notes.map(code => LABELS[code] || code);
        assessment.collectorVersion = COLLECTOR_VERSION;
        assessment.profileDiagnostics = { home: homeEntry?.error || null, away: awayEntry?.error || null };
        let audit;
        try {
            this.capture(mac,signal.sentAt);
            const events=this.events.evidence(mac,signal.sentAt);
            if(events.status==='ok' && (events.minute!==Number(signal.minute)||events.score!==String(signal.score))) {
                events.status='insufficient';events.reason='EVENT_SIGNAL_STATE_MISMATCH';events.windows={};
            }
            audit = evaluateControls({signal,mac,assessment,homeEntry,awayEntry,
                events,baseValid:baselineCheck(signal).eligible});
        } catch {
            // Even a diagnostic failure must preserve the baseline observation.
            audit = {version:AUDIT_VERSION,capturedAt:signal.sentAt,decisionImpact:false,events:null,
                controls:DEFINITIONS.map(d=>({...d,status:'insufficient',reasons:['CONTROL_EVALUATION_ERROR'],reasonLabels:['Kontrol hesaplanamadı'],values:{}}))};
        }
        try { audit.live = liveLab.evaluate({signal,mac,observations:this.live}); }
        catch { audit.live = liveLab.unavailable(signal.sentAt); }
        const copied = {};
        for (const field of ['fixtureId','sentAt','match','league','minute','score','market','odds','edge','dinoProbability',
            'selectorV2Probability','v18Probability','prematchMarketSupport','prematchMarketSource','statsValidation','liveStats']) copied[field] = signal[field] ?? null;
        const record = { ...copied, signalId: `v23-${sourceModel}-${signal.fixtureId}`, baselineSignalId: signal.signalId,
            sourceModel, matchedFilters: sourceModel === 'v22' ? [...(signal.matchedFilters || baselineCheck(signal).matchedFilters || [])] : [], audit,
            baselineVersion: signal.tariffVersion, signalType: 'strong', tariffVersion: VERSION, tariffSlot: 'primary',
            telegramMessageId: null, observationOnly: true, assessment, settlement: { result: null } };
        for (const entry of [homeEntry,awayEntry]) if (entry?.profile) this.data.profiles[entry.profile.id] = JSON.parse(JSON.stringify(entry.profile));
        // Deep freeze by value: later enrichment/settlement of the source cannot rewrite inputs.
        const frozenRecord = JSON.parse(JSON.stringify(record));
        this.data.signals.push(frozenRecord);
        this.data.startedAt ||= record.sentAt;
        try { this.save(); }
        catch (error) {
            this.data.signals.pop(); this.disabledReason = 'history_write_failed';
            this.logger('> ⚠️ V23 geçmişi yazılamadı; V23 durdu, mevcut modeller etkilenmedi.');
            return null;
        }
        return frozenRecord;
    }
    settleFixture(fixture) {
        if (this.disabledReason === 'history_unreadable') return 0;
        const status = fixture?.fixture?.status?.short;
        const isVoid = ['CANC','ABD','AWD','WO'].includes(status);
        if (!isVoid && !['FT','AET','PEN'].includes(status)) return 0;
        let home = integer(fixture?.score?.fulltime?.home), away = integer(fixture?.score?.fulltime?.away);
        // Never grade a 90-minute OVER from an extra-time/penalty aggregate.
        if (status === 'FT' && (home === null || away === null)) {
            home = integer(fixture?.goals?.home); away = integer(fixture?.goals?.away);
        }
        if (!isVoid && (home === null || away === null)) return 0;
        let changed = 0;
        const previous = [];
        for (const record of this.data.signals) {
            if (Number(record.fixtureId) !== Number(fixture?.fixture?.id) || record.settlement?.result) continue;
            const result = isVoid ? 'VOID' : calculateMarketResult(record.market,home,away);
            if (!result) continue;
            previous.push([record,record.settlement]);
            record.settlement = { result, profit: profitForResult(result,record.odds), finalHome: home, finalAway: away,
                finalScore: home !== null && away !== null ? `${home}-${away}` : null,
                fixtureStatus: status, resolvedAt: new Date().toISOString() };
            changed++;
        }
        if (changed) {
            try { this.save(); }
            catch (error) {
                // Keep the fixture pending so the next refresh can retry persistence.
                for (const [record,settlement] of previous) record.settlement = settlement;
                throw error;
            }
        }
        // Only a confirmed final status with a persisted settlement reaches cleanup.
        this.events.releaseFixture?.(fixture?.fixture?.id);
        this.live.releaseFixture(fixture?.fixture?.id);
        this.cache.releaseFixture?.(fixture?.fixture?.id);
        this.archiveSettled();
        return changed;
    }
    metadata(signals = this.data.signals) {
        const buckets = Object.fromEntries(['approve','reject','insufficient'].map(status =>
            [status,this.summary(signals.filter(s => s.assessment.status === status)).overall]));
        const bothAtEntry = signals.filter(s=>s.assessment.profileIds?.home && s.assessment.profileIds?.away).length;
        const oneAtEntry = signals.filter(s=>Boolean(s.assessment.profileIds?.home)!==Boolean(s.assessment.profileIds?.away)).length;
        const profileCoverage = {total:signals.length,bothAtEntry,oneAtEntry,noneAtEntry:signals.length-bothAtEntry-oneAtEntry,
            judgedAtEntry:buckets.approve.total+buckets.reject.total,
            newCollectorRecords:signals.filter(s=>s.assessment.collectorVersion===COLLECTOR_VERSION).length};
        return { label: 'V23 · V21 / V22 Kontrol Laboratuvarı', enabled: this.enabled && !this.disabledReason,
            disabledReason: this.disabledReason, telegram: false, decisionImpact: false,
            tariffVersion: VERSION, policy: POLICY, startedAt: this.data.startedAt,
            auditVersion: AUDIT_VERSION, sourcePolicies: {v21:baseline.POLICY,v22:v22.POLICY},
            validationMode: 'fresh-v21-v22-independent-controls', summary: this.summary(signals), groups: buckets,
            experiment: comparison(signals,rows=>this.summary(rows)), eventCapture: this.events.metadata(),
            liveExperiment: liveLab.comparison(signals,rows=>this.summary(rows)), liveCapture: this.live.metadata(),
            avoidedLosses: buckets.reject.losses, missedWinners: buckets.reject.wins,
            retainedPercent: signals.length ? 100*buckets.approve.total/signals.length : null,
            assessedCoverage: signals.length ? 100*(buckets.approve.total+buckets.reject.total)/signals.length : null,
            comparableBaseline: this.summary(signals.filter(s => s.assessment.status !== 'insufficient')).overall,
            cache: this.cache.metadata(), profileCoverage,
            storage: {mode:'settled-on-disk-active-in-memory',
                archivedRecords:this.data.signals.filter(s=>s.archiveRef).length,
                fullRecordsInMemory:this.data.signals.filter(s=>!s.archiveRef).length,
                activeProfilesInMemory:Object.keys(this.data.profiles).length,
                compactIndexRecords:this.data.signals.length, error:this.archiveError} };
    }
    export(signals = this.data.signals) {
        const profiles = {}, full = [];
        for (const s of signals) {
            if (s.archiveRef) { const data=this.archive.read(s); full.push(data.signal); Object.assign(profiles,data.profiles); }
            else { full.push(s); for (const id of profileIds(s)) if (this.data.profiles[id]) profiles[id]=this.data.profiles[id]; }
        }
        return { ...this.metadata(signals), signals:full, profiles };
    }
    *fullSignals(signals) {
        for (const s of signals) yield s.archiveRef ? this.archive.read(s).signal : s;
    }
    exportStream(signals = this.data.signals) {
        // Streaming HTTP export holds at most one archived record at a time.
        // Freeze the selection (not the evidence) across response backpressure.
        const selected=[...signals];
        const activeProfiles={...this.data.profiles};
        const archive=this.archive;
        function* profiles() {
            const seen=new Set();
            for (const s of selected) {
                const ids=profileIds(s).filter(id=>!seen.has(id));
                if(!ids.length)continue;
                const source=s.archiveRef ? archive.read(s).profiles : activeProfiles;
                for(const id of ids){if(!source[id])throw Error('export_profile_missing');seen.add(id);yield [id,source[id]];}
            }
        }
        // Active records may settle during an await: copy just these entries so
        // exported totals and records stay from the same point in time.
        for(let i=0;i<selected.length;i++)if(!selected[i].archiveRef)selected[i]=JSON.parse(JSON.stringify(selected[i]));
        return {...this.metadata(selected),signals:this.fullSignals(selected),profileEntries:profiles()};
    }
    csv(signals) {
        const quote = v => '"' + String(v ?? '').replace(/^[=+@-]/,"'$&").replace(/"/g,'""') + '"';
        const rows = [['Tarih','Mac','Dakika','Skor','Market','Dino','V16','V18','Pre','EDGE','Oran','Karar','Gerekce',
            'GerekenGol','KalanDakika','ReferansOlasilikKalibreDegil','EvProfil','DepProfil','Sonuc','Final']];
        rows[0].push('Kaynak','V22Filtre','DeneySurumu');
        for (const d of DEFINITIONS) rows[0].push(`${d.id}_karar`,`${d.id}_gerekce`,`${d.id}_degerler`);
        rows[0].push('CanliDeneySurumu');
        for (const d of liveLab.DEFINITIONS) rows[0].push(`live_${d.id}_karar`,`live_${d.id}_gerekce`,`live_${d.id}_degerler`);
        for (const indexed of signals) { const s=indexed.archiveRef ? this.archive.read(indexed).signal : indexed; rows.push([s.sentAt,s.match,s.minute,s.score,s.market,s.dinoProbability,s.selectorV2Probability,
            s.v18Probability,s.prematchMarketSupport,s.edge,s.odds,s.assessment.status,s.assessment.reasonLabels.join(' | '),
            s.assessment.goalsNeeded,s.assessment.remainingMinutes,s.assessment.remainingProbability,
            s.assessment.profileIds?.home,s.assessment.profileIds?.away,s.settlement?.result,s.settlement?.finalScore,
            s.sourceModel || 'v21',s.matchedFilters?.join('+'),s.audit?.version || 'legacy',
            ...DEFINITIONS.flatMap(d=>{const c=s.audit?.controls?.find(c=>c.id===d.id);return [c?.status,c?.reasonLabels?.join(' | '),c?JSON.stringify(c.values):null];}),
            s.audit?.live?.version,
            ...liveLab.DEFINITIONS.flatMap(d=>{const c=s.audit?.live?.controls?.find(c=>c.id===d.id);return [c?.status,c?.reasonLabels?.join(' | '),c?JSON.stringify(c.values):null];})]); }
        return '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n');
    }
}
module.exports = { GoalLab, LABELS, selectSource };
