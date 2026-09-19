'use strict';
const fs = require('fs');
const { SignalTracker, calculateMarketResult, profitForResult } = require('./signal_tracker');
const { atomicJson, integer, COLLECTOR_VERSION } = require('./v23_goal_profile');
const { VERSION, POLICY, evaluate, baselineCheck } = require('./v23_goal_policy');
const baseline = require('./v21_tariff');
const v22 = require('./v22_tariff');
const { EventObservations } = require('./v23_events');
const { VERSION: AUDIT_VERSION, DEFINITIONS, evaluateControls, comparison } = require('./v23_controls');
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
    constructor({ filePath, cache, enabled = true, logger = () => {}, maxRecords = 12000, events = new EventObservations() }) {
        super({ filePath, logger });
        this.cache = cache; this.events = events; this.enabled = enabled; this.maxRecords = maxRecords; this.disabledReason = null;
        this.data = { version: VERSION, startedAt: null, updatedAt: null, signals: [], profiles: {} };
    }
    load() {
        if (!fs.existsSync(this.filePath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if (data.version !== VERSION || !Array.isArray(data.signals) || !data.profiles || typeof data.profiles !== 'object' || Array.isArray(data.profiles) ||
                !data.signals.every(s => s && integer(s.fixtureId) > 0 && Number.isFinite(Date.parse(s.sentAt)) &&
                    ['approve','reject','insufficient'].includes(s.assessment?.status) && Array.isArray(s.assessment?.reasons) &&
                    (!s.audit || (s.audit.version === AUDIT_VERSION && ['v21','v22'].includes(s.sourceModel) && Array.isArray(s.audit.controls) &&
                        s.audit.controls.length === DEFINITIONS.length && DEFINITIONS.every(d=>s.audit.controls.filter(c=>c?.id===d.id).length===1) &&
                        s.audit.controls.every(c => c && ['approve','reject','insufficient','observed'].includes(c.status) && Array.isArray(c.reasons) && Array.isArray(c.reasonLabels)))))) throw Error('history_schema');
            this.data = data;
        } catch {
            this.disabledReason = 'history_unreadable';
            this.logger('> ⚠️ V23 geçmişi okunamadı. Dosya korunuyor; V23 kayıtları kapalı, mevcut modeller değişmedi.');
        }
    }
    save() { this.data.updatedAt = new Date().toISOString(); atomicJson(this.filePath,this.data); }
    capture(mac, capturedAt) {
        if (this.enabled && !this.disabledReason) this.events.capture(mac,capturedAt);
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
        return changed;
    }
    metadata(signals = this.data.signals) {
        const buckets = Object.fromEntries(['approve','reject','insufficient'].map(status =>
            [status,this.summary(signals.filter(s => s.assessment.status === status)).overall]));
        return { label: 'V23 · V21 / V22 Kontrol Laboratuvarı', enabled: this.enabled && !this.disabledReason,
            disabledReason: this.disabledReason, telegram: false, decisionImpact: false,
            tariffVersion: VERSION, policy: POLICY, startedAt: this.data.startedAt,
            auditVersion: AUDIT_VERSION, sourcePolicies: {v21:baseline.POLICY,v22:v22.POLICY},
            validationMode: 'fresh-v21-v22-independent-controls', summary: this.summary(signals), groups: buckets,
            experiment: comparison(signals,rows=>this.summary(rows)), eventCapture: this.events.metadata(),
            avoidedLosses: buckets.reject.losses, missedWinners: buckets.reject.wins,
            retainedPercent: signals.length ? 100*buckets.approve.total/signals.length : null,
            assessedCoverage: signals.length ? 100*(buckets.approve.total+buckets.reject.total)/signals.length : null,
            comparableBaseline: this.summary(signals.filter(s => s.assessment.status !== 'insufficient')).overall,
            cache: this.cache.metadata() };
    }
    export(signals = this.data.signals) {
        const ids = new Set(signals.flatMap(s => Object.values(s.assessment.profileIds || {})).filter(Boolean));
        return { ...this.metadata(signals), signals,
            profiles: Object.fromEntries([...ids].filter(id => this.data.profiles[id]).map(id => [id,this.data.profiles[id]])) };
    }
    csv(signals) {
        const quote = v => '"' + String(v ?? '').replace(/^[=+@-]/,"'$&").replace(/"/g,'""') + '"';
        const rows = [['Tarih','Mac','Dakika','Skor','Market','Dino','V16','V18','Pre','EDGE','Oran','Karar','Gerekce',
            'GerekenGol','KalanDakika','ReferansOlasilikKalibreDegil','EvProfil','DepProfil','Sonuc','Final']];
        rows[0].push('Kaynak','V22Filtre','DeneySurumu');
        for (const d of DEFINITIONS) rows[0].push(`${d.id}_karar`,`${d.id}_gerekce`,`${d.id}_degerler`);
        for (const s of signals) rows.push([s.sentAt,s.match,s.minute,s.score,s.market,s.dinoProbability,s.selectorV2Probability,
            s.v18Probability,s.prematchMarketSupport,s.edge,s.odds,s.assessment.status,s.assessment.reasonLabels.join(' | '),
            s.assessment.goalsNeeded,s.assessment.remainingMinutes,s.assessment.remainingProbability,
            s.assessment.profileIds?.home,s.assessment.profileIds?.away,s.settlement?.result,s.settlement?.finalScore,
            s.sourceModel || 'v21',s.matchedFilters?.join('+'),s.audit?.version || 'legacy',
            ...DEFINITIONS.flatMap(d=>{const c=s.audit?.controls?.find(c=>c.id===d.id);return [c?.status,c?.reasonLabels?.join(' | '),c?JSON.stringify(c.values):null];})]);
        return '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n');
    }
}
module.exports = { GoalLab, LABELS, selectSource };
