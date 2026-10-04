'use strict';
// Pure former Telegram gate. No collector, history storage, timers or API calls.
const { normalize, MAX_AGE_MS } = require('./v23_events');
const VERSION = 'v23-entry-filters-v2-2026-09-23';
const V22_GATE_CONTROL_IDS = Object.freeze(['v22_minute','v22_quality','v22_reaction']);
const DEFINITIONS = Object.freeze([
    {id:'event_score',source:'both',label:'Olay listesi / skor tutarlılığı',rule:'Geçerli olay golleri giriş skoruyla eşleşir. Veri kontrolüdür; gol tahmini değildir.'},
    {id:'v21_score',source:'v21',label:'1.5 ÜST · skor filtresi',rule:'Yalnız 1.5 ÜST: skor 1-0 veya 0-1. 0-0 elenirdi; diğer marketler korunur.'},
    {id:'v21_reaction',source:'v21',label:'1.5 ÜST · skor + reaksiyon',rule:'Skor filtresi + gerideki takım ≥4 şut ve ≥1 isabet. Diğer marketler korunur.'},
    {id:'v22_minute',source:'v22',label:'Yalnız C · dakika ≤73',rule:'Yalnız C: 73 dahil geçer, 74+ elenirdi. A/B’den de geçenler korunur.'},
    {id:'v22_quality',source:'v22',label:'Yalnız C · dakika + isabetli şut',rule:'Dakika ≤73 + iki takım toplamında ≥2 isabetli şut. İsabet oranı yalnız ölçülür; kararı etkilemez. A/B korunur.'},
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
    SHOTS_MISSING:'Gerekli şut/isabet verisi eksik veya tutarsız', QUALITY_OK:'Toplam en az 2 isabetli şut; isabet oranı yalnız gözlem',
    QUALITY_LOW:'Toplam 2 isabetli şut şartı karşılanmıyor', NOT_15:'1.5 ÜST değil: yalnız dakika şartı uygulandı',
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
        home:shotPair(mac,'home'),away:shotPair(mac,'away'),statsAt:mac?.stats_received_at||null,
        box:Object.fromEntries(['home','away'].map(side=>[side,{
            inside:integer(mac?._v23LiveStats?.[side]?.shotsInsidebox),
            outside:integer(mac?._v23LiveStats?.[side]?.shotsOutsidebox),
            blocked:integer(mac?._v23LiveStats?.[side]?.blockedShots)
        }]))};
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
            // The percentage is retained in values.sotRatio for analysis only.
            // It must never approve/reject a V22 signal.
            const pass=values.totalSot>=2;
            return verdict(def,pass?'approve':'reject',pass?'QUALITY_OK':'QUALITY_LOW',values);
        }
        if(signal.market!=='1.5_UST')return verdict(def,'approve','NOT_15',values);
        if(Number(score[1])+Number(score[2])!==1)return verdict(def,'insufficient','SCORE_INVALID',values);
        return reaction(def);
    });
    return {version:VERSION,capturedAt:signal.sentAt,decisionImpact:false,controls};
}
function v22Gate(audit) {
    if(!validAudit(audit,'v22'))return {eligible:false,reason:'AUDIT_INVALID',rejected:[],insufficient:[]};
    const selected=audit.controls.filter(control=>V22_GATE_CONTROL_IDS.includes(control.id));
    const rejected=selected.filter(control=>control.status==='reject').map(control=>control.id);
    const insufficient=selected.filter(control=>control.status==='insufficient').map(control=>control.id);
    // The LAB's prospective accounting always retained insufficient rows. Keep
    // that frozen behavior; only an explicit rejection is a live veto.
    return {eligible:rejected.length===0,reason:rejected.length?'EXPLICIT_REJECT':'PASS',rejected,insufficient};
}
function validAudit(audit,source) {
    return audit?.version===VERSION&&Array.isArray(audit.controls)&&audit.controls.length===definitions(source).length&&
        definitions(source).every(d=>audit.controls.filter(c=>c?.id===d.id).length===1)&&
        audit.controls.every(c=>['approve','reject','insufficient','unaffected'].includes(c.status)&&Array.isArray(c.reasons)&&Array.isArray(c.reasonLabels));
}

module.exports={VERSION,V22_GATE_CONTROL_IDS,DEFINITIONS,REASONS,evaluate,v22Gate,validAudit};
