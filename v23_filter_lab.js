'use strict';
// Entry-time, prospective LAB only. No HTTP client, selection, re-entry or delivery.
// Inherit proven settlement/streaming/archive plumbing; never run retired experiments.
const fs = require('fs');
const { GoalLab } = require('./v23_goal_lab');
const { VERSION: LEGACY_STORAGE } = require('./v23_goal_policy');
const { normalize, MAX_AGE_MS } = require('./v23_events');
const v21 = require('./v21_tariff'), v22 = require('./v22_tariff');
const VERSION = 'v23-entry-filters-v1-2026-09-21';
const DEFINITIONS = Object.freeze([
    {id:'event_score',source:'both',label:'Olay listesi / skor tutarlılığı',rule:'Geçerli olay golleri giriş skoruyla eşleşir. Veri kontrolüdür; gol tahmini değildir.'},
    {id:'v21_score',source:'v21',label:'1.5 ÜST · skor filtresi',rule:'Yalnız 1.5 ÜST: skor 1-0 veya 0-1. 0-0 elenirdi; diğer marketler korunur.'},
    {id:'v21_reaction',source:'v21',label:'1.5 ÜST · skor + reaksiyon',rule:'Skor filtresi + gerideki takım ≥4 şut ve ≥1 isabet. Diğer marketler korunur.'},
    {id:'v22_minute',source:'v22',label:'Yalnız C · dakika ≤73',rule:'Yalnız C: 73 dahil geçer, 74+ elenirdi. A/B’den de geçenler korunur.'},
    {id:'v22_quality',source:'v22',label:'Yalnız C · dakika + şut kalitesi',rule:'Dakika ≤73 + iki takım toplamında ≥2 isabet ve ≥%20 isabet oranı. A/B korunur.'},
    {id:'v22_reaction',source:'v22',label:'Yalnız C · dakika + reaksiyon',rule:'Dakika ≤73; ayrıca yalnız 1.5 ÜST’te gerideki takım ≥4 şut ve ≥1 isabet. A/B korunur.'}
]);
const definitions = source => DEFINITIONS.filter(d=>d.source==='both'||d.source===source);
const number = v => v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v)) ? null : Number(v);
const integer = v => {const n=number(v);return Number.isInteger(n)&&n>=0?n:null;};
const time = v => typeof v==='string'&&Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
const clone = v => JSON.parse(JSON.stringify(v));
const round = v => Math.round(v*1000)/1000;
const REASONS = Object.freeze({
    OUTSIDE_MARKET:'Diğer market: bu deney kısıtlamaz', AB_PROTECTED:'A/B de geçiyor: C filtresi uygulanmaz',
    ROUTE_MISSING:'Yalnız C kaynağı doğrulanamadı', INVALID_ENTRY:'Sinyal ve taze giriş verisi uyuşmuyor',
    SCORE_ZERO:'1.5 ÜST için giriş skoru 0-0', SCORE_ONE:'Giriş skoru 1-0 / 0-1', SCORE_INVALID:'1.5 ÜST için geçersiz veya sonuçlanmış giriş skoru',
    MINUTE_OK:'Dakika 73 veya daha erken', MINUTE_LATE:'Dakika 74 veya daha geç',
    REACTION_OK:'Gerideki takımda en az 4 şut ve 1 isabet', REACTION_LOW:'Gerideki takım 4 şut / 1 isabet şartını karşılamıyor',
    SHOTS_MISSING:'Gerekli şut/isabet verisi eksik veya tutarsız', QUALITY_OK:'Toplam en az 2 isabet ve en az %20 isabet oranı',
    QUALITY_LOW:'Toplam 2 isabet / %20 isabet şartı karşılanmıyor', NOT_15:'1.5 ÜST değil: yalnız dakika şartı uygulandı',
    EVENT_MATCH:'Olay golleri ve skor tutarlı', EVENT_MISMATCH:'Olay golleri skorla uyuşmuyor',
    EVENTS_MISSING:'Taze ve geçerli olay listesi yok', EVALUATION_ERROR:'LAB kontrolü hesaplanamadı; sinyal korunur'
});
function verdict(def,status,reason,values={}) {return {id:def.id,status,reasons:[reason],reasonLabels:[REASONS[reason]||reason],values};}
function shotPair(mac,side) {
    const shot=integer(mac?.[`${side}_shot`]),sot=integer(mac?.[`${side}_sot`]);
    return shot===null||sot===null||sot>shot?null:{shot,sot};
}
function evaluate({signal,mac,sourceModel,matchedFilters=[]}) {
    const at=time(signal.sentAt), statsAt=time(mac?.stats_received_at), minute=integer(signal.minute);
    const score=/^(\d+)-(\d+)$/.exec(String(signal.score));
    const entryOK=at!==null&&statsAt!==null&&statsAt<=at&&at-statsAt<=MAX_AGE_MS&&
        mac?.stats_identity_verified===true&&Number(signal.fixtureId)===Number(mac.fixture_id)&&
        Number(mac.dakika)===minute&&String(mac.skor)===String(signal.score)&&score&&minute!==null&&minute<=90;
    const values={minute,score:signal.score,market:signal.market,matchedFilters:[...matchedFilters],
        home:shotPair(mac,'home'),away:shotPair(mac,'away'),statsAt:mac?.stats_received_at||null};
    if(score&&Number(score[1])!==Number(score[2])) {
        values.trailingSide=Number(score[1])<Number(score[2])?'home':'away';
        values.trailing=values[values.trailingSide];
    }
    if(values.home&&values.away) {
        values.totalShots=values.home.shot+values.away.shot;values.totalSot=values.home.sot+values.away.sot;
        values.sotRatio=values.totalShots>0?values.totalSot/values.totalShots:null;
    }
    const reaction=def=>!values.trailing?verdict(def,'insufficient','SHOTS_MISSING',values):
        verdict(def,values.trailing.shot>=4&&values.trailing.sot>=1?'approve':'reject',
            values.trailing.shot>=4&&values.trailing.sot>=1?'REACTION_OK':'REACTION_LOW',values);
    const controls=definitions(sourceModel).map(def=>{
        if(def.id==='event_score') {
            if(!entryOK)return verdict(def,'insufficient','INVALID_ENTRY',values);
            const received=time(mac._v23EventsAt),parsed=normalize(mac._v23Events,mac,mac._v23EventsAt);
            if(received===null||received>at||at-received>MAX_AGE_MS||parsed.status!=='ok')return verdict(def,'insufficient','EVENTS_MISSING');
            const goalCount=parsed.events.filter(e=>e.type==='goal'&&!e.cancelled).length;
            const scoreTotal=Number(score[1])+Number(score[2]);
            return verdict(def,goalCount===scoreTotal?'approve':'reject',goalCount===scoreTotal?'EVENT_MATCH':'EVENT_MISMATCH',
                {goalCount,scoreTotal,eventsAt:mac._v23EventsAt});
        }
        // Outside-scope entries remain in the retained portfolio, not fake approvals.
        if(sourceModel==='v21'&&signal.market!=='1.5_UST')return verdict(def,'unaffected','OUTSIDE_MARKET',values);
        if(sourceModel==='v22'&&matchedFilters.some(f=>f==='A'||f==='B'))return verdict(def,'unaffected','AB_PROTECTED',values);
        if(sourceModel==='v22'&&!matchedFilters.includes('C'))return verdict(def,'insufficient','ROUTE_MISSING',values);
        if(!entryOK)return verdict(def,'insufficient','INVALID_ENTRY',values);
        if(sourceModel==='v21') {
            const goals=Number(score[1])+Number(score[2]);
            if(goals===0)return verdict(def,'reject','SCORE_ZERO',values);
            if(goals!==1)return verdict(def,'insufficient','SCORE_INVALID',values);
            return def.id==='v21_score'?verdict(def,'approve','SCORE_ONE',values):reaction(def);
        }
        // A definite minute rejection needs no shot data.
        if(minute>73)return verdict(def,'reject','MINUTE_LATE',values);
        if(def.id==='v22_minute')return verdict(def,'approve','MINUTE_OK',values);
        if(def.id==='v22_quality') {
            if(!values.home||!values.away)return verdict(def,'insufficient','SHOTS_MISSING',values);
            const pass=values.totalSot>=2&&values.totalSot*5>=values.totalShots;
            return verdict(def,pass?'approve':'reject',pass?'QUALITY_OK':'QUALITY_LOW',values);
        }
        if(signal.market!=='1.5_UST')return verdict(def,'approve','NOT_15',values);
        if(Number(score[1])+Number(score[2])!==1)return verdict(def,'insufficient','SCORE_INVALID',values);
        return reaction(def);
    });
    return {version:VERSION,capturedAt:signal.sentAt,decisionImpact:false,controls};
}
function validAudit(audit,source) {
    return audit?.version===VERSION&&Array.isArray(audit.controls)&&audit.controls.length===definitions(source).length&&
        definitions(source).every(d=>audit.controls.filter(c=>c?.id===d.id).length===1)&&
        audit.controls.every(c=>['approve','reject','insufficient','unaffected'].includes(c.status)&&Array.isArray(c.reasons)&&Array.isArray(c.reasonLabels));
}
function report(signals,source,summary) {
    const stats=rows=>summary(rows).overall, baseline=stats(signals);
    const controls=definitions(source).map(def=>{
        const by=status=>signals.filter(s=>s.filterAudit.controls.find(c=>c.id===def.id).status===status);
        const reject=stats(by('reject'));
        const retained=stats(signals.filter(s=>s.filterAudit.controls.find(c=>c.id===def.id).status!=='reject'));
        const reasonGroups={};
        for(const s of signals)for(const code of s.filterAudit.controls.find(c=>c.id===def.id).reasons)(reasonGroups[code]||=[]).push(s);
        return {...def,approve:stats(by('approve')),reject,insufficient:stats(by('insufficient')),unaffected:stats(by('unaffected')),retained,
            avoidedLosses:reject.losses,missedWinners:reject.wins,profitDifference:round(retained.profit-baseline.profit),
            reasons:Object.fromEntries(Object.entries(reasonGroups).map(([code,rows])=>[code,{label:REASONS[code]||code,...stats(rows)}]))};
    });
    return {baseline,controls};
}
function selectSource(signals,source='all') {
    if(!['all','v21','v22','v22:A','v22:B','v22:C'].includes(source))return null;
    return signals.filter(s=>source==='all'||s.sourceModel===source.split(':')[0]&&(!source.includes(':')||s.matchedFilters?.includes(source.split(':')[1])));
}
const inert = Object.freeze({prune(){},releaseFixture(){},metadata(){return {enabled:false,additionalApiCalls:0};}});
class FilterLab extends GoalLab {
    constructor(options) {
        super({...options,cache:inert,events:inert,live:inert});
        this.data.filterVersion=VERSION;
    }
    load() {
        if(!fs.existsSync(this.filePath))return;
        try {
            const data=JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if(data.filterVersion!==VERSION||![LEGACY_STORAGE,`${LEGACY_STORAGE}:settled-archive-v1`].includes(data.version)||
                !Array.isArray(data.signals)||!data.profiles||Object.keys(data.profiles).length||
                !data.signals.every(s=>s&&integer(s.fixtureId)>0&&time(s.sentAt)!==null&&['v21','v22'].includes(s.sourceModel)&&
                    s.assessment?.status==='insufficient'&&validAudit(s.filterAudit,s.sourceModel)))throw Error('filter_history_schema');
            const keys=new Set();
            for(const s of data.signals) {
                const key=`${s.sourceModel}:${s.baselineSignalId||s.signalId}`;
                if(keys.has(key))throw Error('duplicate_filter_entry');keys.add(key);
                if(s.archiveRef)this.archive.read(s);
            }
            this.data=data;
        } catch {
            this.disabledReason='history_unreadable';this.logger('> ⚠️ Yeni LAB geçmişi okunamadı; dosya korunuyor, canlı sinyal etkilenmez.');return;
        }
        this.archiveSettled();
    }
    capture() {} // No retired event/tempo timelines are constructed or accumulated.
    maintain() {this.archiveSettled();}
    observe(signal,mac) {
        const sourceModel=signal?.tariffVersion===v21.VERSION?'v21':signal?.tariffVersion===v22.VERSION?'v22':null;
        if(!this.enabled||this.disabledReason||!sourceModel||!signal.signalId||
            integer(signal.fixtureId)<1||Number(signal.fixtureId)!==Number(mac?.fixture_id)||
            time(signal.sentAt)===null||signal.statsValidation?.status!=='passed'||mac.stats_validation?.status!=='passed'||
            time(signal.sentAt)!==time(signal.statsValidation.verifiedAt)||time(signal.sentAt)!==time(mac.stats_validation.verifiedAt)||
            this.data.signals.some(s=>s.sourceModel===sourceModel&&s.baselineSignalId===signal.signalId))return null;
        if(this.data.signals.length>=this.maxRecords){this.disabledReason='history_capacity_reached';return null;}
        const matchedFilters=sourceModel==='v22'?[...(signal.matchedFilters||[])]:[];
        let filterAudit;
        try {filterAudit=evaluate({signal,mac,sourceModel,matchedFilters});}
        catch {filterAudit={version:VERSION,capturedAt:signal.sentAt,decisionImpact:false,
            controls:definitions(sourceModel).map(d=>verdict(d,'insufficient','EVALUATION_ERROR'))};}
        const copied={};
        for(const field of ['fixtureId','sentAt','match','league','minute','score','market','odds','edge','dinoProbability',
            'selectorV2Probability','v18Probability','prematchMarketSupport','statsValidation','liveStats'])copied[field]=signal[field]??null;
        const record=clone({...copied,signalId:`${VERSION}:${sourceModel}:${signal.signalId}`,baselineSignalId:signal.signalId,
            sourceModel,matchedFilters,filterAudit,baselineVersion:signal.tariffVersion,signalType:'strong',tariffSlot:'primary',
            tariffVersion:VERSION,telegramMessageId:null,observationOnly:true,
            // Storage compatibility marker only. No retired profile assessment is executed.
            assessment:{status:'insufficient',reasons:['RETIRED_NOT_RUN'],profileIds:{}},settlement:{result:null}});
        const previousStart=this.data.startedAt;this.data.signals.push(record);this.data.startedAt||=signal.sentAt;
        try {this.save();}catch {this.data.signals.pop();this.data.startedAt=previousStart;this.disabledReason='history_write_failed';return null;}
        return record;
    }
    metadata(signals=this.data.signals) {
        const current=signals.filter(s=>s.filterAudit?.version===VERSION);
        const sources=Object.fromEntries(['v21','v22'].map(source=>[source,report(current.filter(s=>s.sourceModel===source),source,r=>this.summary(r))]));
        return {label:'V21 / V22 · Yeni filtre deneyleri',enabled:this.enabled&&!this.disabledReason,disabledReason:this.disabledReason,
            telegram:false,decisionImpact:false,filterVersion:VERSION,startedAt:this.data.startedAt,summary:this.summary(current),
            filters:{version:VERSION,sources,sourceRecords:current.length,uniqueFixtures:new Set(current.map(s=>s.fixtureId)).size,
                v22Filters:Object.fromEntries(['A','B','C'].map(f=>[f,report(current.filter(s=>s.sourceModel==='v22'&&s.matchedFilters.includes(f)),'v22',r=>this.summary(r))]))},
            retiredExperiments:{enabled:false,historyRequests:false,timelineCapture:false},additionalApiCalls:0,
            storage:{archivedRecords:this.data.signals.filter(s=>s.archiveRef).length,fullRecordsInMemory:this.data.signals.filter(s=>!s.archiveRef).length,error:this.archiveError}};
    }
    csv(signals) {
        const quote=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""')+'"';
        const headers=['Tarih','Model','Mac','Dakika','Skor','Market','Oran','EDGE','V22Filtre','Sonuc','Final','DeneySurumu',
            ...DEFINITIONS.flatMap(d=>[`${d.id}_karar`,`${d.id}_gerekce`,`${d.id}_olcum`])];
        const rows=[headers];
        for(const s of this.fullSignals(signals))rows.push([s.sentAt,s.sourceModel,s.match,s.minute,s.score,s.market,s.odds,s.edge,
            s.matchedFilters.join('+'),s.settlement?.result,s.settlement?.finalScore,VERSION,...DEFINITIONS.flatMap(d=>{
                const c=s.filterAudit.controls.find(c=>c.id===d.id);return [c?.status,c?.reasonLabels.join(' | '),c?JSON.stringify(c.values):null];})]);
        return '\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n');
    }
}
function readRetired(filePath) {
    // On-demand archive export only: no collector, timers, timeline or disk changes.
    const lab=new GoalLab({filePath,cache:inert,events:inert,live:inert,enabled:false});
    lab.archiveSettled=()=>{};lab.save=()=>{throw Error('retired_read_only');};lab.load();
    if(lab.disabledReason)throw Error('retired_history_unreadable');
    return lab;
}
module.exports={FilterLab,VERSION,DEFINITIONS,REASONS,evaluate,validAudit,report,selectSource,readRetired};
