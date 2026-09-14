'use strict';
const { finite, integer } = require('./v23_goal_profile');
const { poissonTail, POLICY } = require('./v23_goal_policy');
const VERSION = 'v23-independent-controls-v1-2026-09-14';
const DEFINITIONS = Object.freeze([
    {id:'goal_blend',label:'Gol geçmişi · son 10 + ev/deplasman',mode:'hypothesis',rule:'Sabit Poisson referansı ≥%50; mevcut V23 hesabı, kalibre değil'},
    {id:'goal_recent',label:'Yalnız son 10 gol üretimi',mode:'hypothesis',rule:'İki takımın son 10 GF/GA değerleri; kalan gol Poisson referansı ≥%50'},
    {id:'goal_venue',label:'Yalnız ev/deplasman gol üretimi',mode:'hypothesis',rule:'İki takımın ilgili sahada en az 5 maçlık GF/GA değerleri; referans ≥%50'},
    {id:'event_score',label:'Olay listesi / skor tutarlılığı',mode:'data-quality',rule:'Taze listedeki geçerli toplam gol sayısı giriş skoruyla eşleşiyor; gol tahmini değildir'},
    {id:'after_goal',label:'Gol sonrası üretim',mode:'observation',rule:'Aynı devrede olaydan sonra gözlenen 3–20 dakikalık pencere; veto eşiği yok'},
    {id:'after_red',label:'Kırmızı kart sonrası üretim',mode:'observation',rule:'Kart olayı sonrasındaki pencere; sahadaki eksik oyuncu sayısı varsayılmaz; veto eşiği yok'},
    {id:'after_substitution',label:'Değişiklik sonrası üretim',mode:'observation',rule:'Son değişiklikten sonraki pencere; hücum/defans değişikliği varsayılmaz; veto eşiği yok'},
    {id:'last5_scoring',label:'Son 5 · gol atamama',mode:'observation',rule:'Takım bazında son 5 gol atamama oranı; ≥3/5 yalnız gözlem etiketi'},
    {id:'red_score_context',label:'Kart / skor durumu',mode:'observation',rule:'Girişteki kart sayıları ve önde/geride olma; öğrenilmiş çarpan uygulanmaz'}
]);
const REASONS = Object.freeze({
    PROFILE_NOT_READY:'Gol geçmişi giriş anında hazır değil', SAMPLE_TOO_SMALL:'İlgili kontrol için yeterli maç yok',
    HISTORY_TOO_OLD:'Son maç 60 günden eski veya tarihi geçersiz', GOAL_AVERAGE_MISSING:'Gol ortalaması eksik/geçersiz',
    RED_CARD_DATA_MISSING:'Kart bilgisi eksik', RED_CARD_OUTSIDE_REFERENCE_MODEL:'Kırmızı kart mevcut; sabit gol hesabı bu durumu modellemiyor',
    BASELINE_INVALID:'Kaynak sinyal koşulları geçersiz', LIVE_STATE_MISSING:'Giriş skoru/dakikası/market geçersiz',
    GOAL_REFERENCE_SUPPORTS:'Kalan gol referansı en az %50', GOAL_REFERENCE_BELOW_THRESHOLD:'Kalan gol referansı %50 altında',
    EVENTS_NOT_CAPTURED_AT_SIGNAL:'Giriş anında olay kaydı yok', EVENTS_MISSING_OR_OVERSIZED:'Olay listesi eksik veya sınır dışında',
    EVENT_SIGNAL_STATE_MISMATCH:'Olay anlık görüntüsü ile kaynak sinyalin skor/dakikası aynı değil',
    EVENTS_STALE_OR_FUTURE:'Olay verisi 120 saniyeden eski veya girişten sonra geldi', EVENT_IDENTITY_OR_TIME_INVALID:'Olay takım/dakika bilgisi doğrulanamadı',
    EVENT_SCORE_MATCH:'Olay listesinin toplam golü skorla uyumlu', EVENT_SCORE_MISMATCH:'Olay listesinin toplam golü skorla uyuşmuyor',
    NO_EVENT_IN_CURRENT_HALF:'Bu devrede ilgili olay gözlenmedi', POST_EVENT_WINDOW_TOO_SHORT_OR_MISSING:'Olay sonrası yeterli ölçüm penceresi yok',
    ANOTHER_EVENT_IN_WINDOW:'Araya başka gol/kart/değişiklik girdi; etki ayrıştırılamıyor',
    STATS_MISSING_CORRECTED_OR_CARD_CHANGED:'İstatistik eksik/düzeltilmiş veya kart durumu değişmiş',
    OBSERVATION_ONLY_NO_VETO:'Yalnız gözlem; onay/red eşiği belirlenmedi', CONTROL_EVALUATION_ERROR:'Bu kontrol hesaplanamadı; diğer kontroller bağımsızdır'
});
function item(id,status,reasons=[],values={}) {
    return {...DEFINITIONS.find(d=>d.id===id),status,reasons,reasonLabels:reasons.map(r=>REASONS[r]||r),values};
}
function goalComponent(id,signal,mac,home,away,baseValid) {
    const reasons=[], score=/^(\d+)-(\d+)$/.exec(String(signal.score)), line=/^(\d+\.5)_UST$/.exec(String(signal.market));
    const minute=finite(signal.minute),needed=score&&line?Math.floor(Number(line[1]))+1-Number(score[1])-Number(score[2]):null;
    const values={minimumProbability:0.5,calibrated:false,goalsNeeded:needed,remainingMinutes:minute===null?null:90-minute};
    if (!baseValid) reasons.push('BASELINE_INVALID');
    if (!score||!line||minute===null||minute<0||minute>90||needed<=0) reasons.push('LIVE_STATE_MISSING');
    if (integer(mac.home_red)===null||integer(mac.away_red)===null) reasons.push('RED_CARD_DATA_MISSING');
    else if (Number(mac.home_red)>0||Number(mac.away_red)>0) reasons.push('RED_CARD_OUTSIDE_REFERENCE_MODEL');
    const groups=[];
    for (const [side,p] of [['home',home],['away',away]]) {
        if (!p) { reasons.push('PROFILE_NOT_READY'); continue; }
        const g=id==='goal_recent'?p.last10:p[side], minimum=id==='goal_recent'?10:5;
        if (!g||!Number.isInteger(g.n)||g.n<minimum) reasons.push('SAMPLE_TOO_SMALL');
        const age=Date.parse(p.cutoff)-Date.parse(p.latestMatchAt);
        if (!Number.isFinite(age)||age<0||age>POLICY.maximumLatestMatchAgeDays*86400000) reasons.push('HISTORY_TOO_OLD');
        if (finite(g?.goalsFor)===null||finite(g?.goalsAgainst)===null||g.goalsFor<0||g.goalsAgainst<0) reasons.push('GOAL_AVERAGE_MISSING');
        values[side]={profileId:p.id,n:g?.n??null,goalsFor:g?.goalsFor??null,goalsAgainst:g?.goalsAgainst??null}; groups.push(g);
    }
    if (reasons.length) return item(id,'insufficient',[...new Set(reasons)],values);
    const [h,a]=groups;
    values.expectedHome90=(h.goalsFor+a.goalsAgainst)/2;
    values.expectedAway90=(a.goalsFor+h.goalsAgainst)/2;
    values.expectedRemainingGoals=(values.expectedHome90+values.expectedAway90)*values.remainingMinutes/90;
    values.remainingProbability=poissonTail(values.expectedRemainingGoals,needed);
    return item(id,values.remainingProbability>=0.5?'approve':'reject',
        [values.remainingProbability>=0.5?'GOAL_REFERENCE_SUPPORTS':'GOAL_REFERENCE_BELOW_THRESHOLD'],values);
}
function evaluateControls({signal,mac,assessment,homeEntry,awayEntry,events,baseValid}) {
    const controls=[];
    const safe=(id,fn)=>{try{controls.push(fn());}catch{controls.push(item(id,'insufficient',['CONTROL_EVALUATION_ERROR']));}};
    safe('goal_blend',()=>({...item('goal_blend',assessment.status,assessment.reasons,{remainingProbability:assessment.remainingProbability,
        expectedRemainingGoals:assessment.expectedRemainingGoals,goalsNeeded:assessment.goalsNeeded,remainingMinutes:assessment.remainingMinutes,
        minimumProbability:0.5,calibrated:false}),reasonLabels:assessment.reasonLabels}));
    for (const id of ['goal_recent','goal_venue']) safe(id,()=>goalComponent(id,signal,mac,homeEntry?.profile,awayEntry?.profile,baseValid));
    safe('event_score',()=>events?.status==='ok'?item('event_score',events.scoreConsistent?'approve':'reject',
        [events.scoreConsistent?'EVENT_SCORE_MATCH':'EVENT_SCORE_MISMATCH'],{eventsAt:events.eventsAt,goalCount:events.validGoalCount,scoreTotal:events.scoreTotal,hasVar:events.hasVar}):
        item('event_score','insufficient',[events?.reason||'EVENTS_NOT_CAPTURED_AT_SIGNAL']));
    for (const [id,kind] of [['after_goal','goal'],['after_red','red'],['after_substitution','substitution']]) safe(id,()=>{
        if(events?.status!=='ok')return item(id,'insufficient',[events?.reason||'EVENTS_NOT_CAPTURED_AT_SIGNAL']);
        if(!events.scoreConsistent)return item(id,'insufficient',['EVENT_SCORE_MISMATCH']);
        const w=events.windows?.[kind];
        return item(id,w?.status==='observed'?'observed':'insufficient',
            [w?.status==='observed'?'OBSERVATION_ONLY_NO_VETO':w?.reason||'POST_EVENT_WINDOW_TOO_SHORT_OR_MISSING'],w||{});
    });
    safe('last5_scoring',()=>{
        const h=homeEntry?.profile?.last5,a=awayEntry?.profile?.last5;
        if(!h||!a)return item('last5_scoring','insufficient',['PROFILE_NOT_READY']);
        if(h.n<5||a.n<5||finite(h.failedToScoreRate)===null||finite(a.failedToScoreRate)===null)return item('last5_scoring','insufficient',['SAMPLE_TOO_SMALL']);
        return item('last5_scoring','observed',['OBSERVATION_ONLY_NO_VETO'],{homeFailedToScoreRate:h.failedToScoreRate,
            awayFailedToScoreRate:a.failedToScoreRate,tag:`HOME_${h.failedToScoreRate>=0.6?'GE3':'LT3'}_AWAY_${a.failedToScoreRate>=0.6?'GE3':'LT3'}`});
    });
    safe('red_score_context',()=>{
        if(integer(mac.home_red)===null||integer(mac.away_red)===null)return item('red_score_context','insufficient',['RED_CARD_DATA_MISSING']);
        return item('red_score_context','observed',['OBSERVATION_ONLY_NO_VETO'],{homeRed:Number(mac.home_red),awayRed:Number(mac.away_red),
            score:signal.score,scoreState:assessment.scoreState,tag:`${Number(mac.home_red)>0?'HOME_RED':'HOME_NO_RED'}_${Number(mac.away_red)>0?'AWAY_RED':'AWAY_NO_RED'}_${assessment.scoreState}`});
    });
    return {version:VERSION,capturedAt:signal.sentAt,controls,events,decisionImpact:false,thresholdsFitted:false};
}
// Every statistic is calculated from the same frozen source entries, never a
// hindsight re-selection. Unknowns pass through in the reject-only simulation.
function report(signals,summary) {
    const stats=rows=>summary(rows).overall;
    const baseline=stats(signals);
    const controls=DEFINITIONS.map(def=>{
        const by=status=>signals.filter(s=>s.audit.controls.find(c=>c.id===def.id)?.status===status);
        const approve=stats(by('approve')),reject=stats(by('reject')),insufficient=stats(by('insufficient')),observed=stats(by('observed'));
        const comparable=stats(signals.filter(s=>['approve','reject'].includes(s.audit.controls.find(c=>c.id===def.id)?.status)));
        const rejectOnly=stats(signals.filter(s=>s.audit.controls.find(c=>c.id===def.id)?.status!=='reject'));
        const tagNames=[...new Set(signals.map(s=>s.audit.controls.find(c=>c.id===def.id)?.values?.tag).filter(Boolean))];
        const tags=Object.fromEntries(tagNames.map(tag=>[tag,stats(signals.filter(s=>s.audit.controls.find(c=>c.id===def.id)?.values?.tag===tag))]));
        const reasonCodes=[...new Set(signals.flatMap(s=>s.audit.controls.find(c=>c.id===def.id)?.reasons||[]))];
        const reasons=Object.fromEntries(reasonCodes.map(code=>{
            const example=signals.map(s=>s.audit.controls.find(c=>c.id===def.id)).find(c=>c?.reasons.includes(code));
            return [code,{label:REASONS[code]||example?.reasonLabels?.[example.reasons.indexOf(code)]||code,
                ...stats(signals.filter(s=>s.audit.controls.find(c=>c.id===def.id)?.reasons.includes(code)))}];
        }));
        return {...def,approve,reject,insufficient,observed,comparableBaseline:comparable,rejectOnly,tags,reasons,
            avoidedLosses:reject.losses,missedWinners:reject.wins,
            coveredPercent:signals.length?100*comparable.total/signals.length:null,
            profitDifference:Math.round((rejectOnly.profit-baseline.profit)*1000)/1000};
    });
    return {baseline,controls};
}
function comparison(signals,summary) {
    const current=signals.filter(s=>s.audit?.version===VERSION),legacy=signals.filter(s=>s.audit?.version!==VERSION);
    const sources=Object.fromEntries(['v21','v22'].map(source=>[source,report(current.filter(s=>s.sourceModel===source),summary)]));
    // Deduplicate only genuinely identical entries. Different markets/minutes/
    // odds/timestamps remain distinct observations, not independent matches.
    const entryKey=s=>JSON.stringify([s.fixtureId,s.market,s.minute,s.score,Date.parse(s.sentAt),s.odds]);
    const unique=new Map();for(const s of current)if(!unique.has(entryKey(s)))unique.set(entryKey(s),s);
    const v21Fixtures=new Set(current.filter(s=>s.sourceModel==='v21').map(s=>s.fixtureId));
    return {version:VERSION,startedAt:current.map(s=>s.sentAt).sort()[0]||null,sources,
        v22Filters:Object.fromEntries(['A','B','C'].map(f=>[f,report(current.filter(s=>s.sourceModel==='v22'&&s.matchedFilters?.includes(f)),summary)])),
        unique:report([...unique.values()],summary),sourceRecords:current.length,uniqueEntries:unique.size,
        duplicateEntries:current.length-unique.size,uniqueFixtures:new Set(current.map(s=>s.fixtureId)).size,
        sharedFixtures:new Set(current.filter(s=>s.sourceModel==='v22'&&v21Fixtures.has(s.fixtureId)).map(s=>s.fixtureId)).size,
        legacy:summary(legacy).overall,
        notes:['All source signals remain active in lab; no actual veto or Telegram change.',
            'A/B/C labels and reason totals overlap; do not add them.',
            'No veto threshold for observed-only event features; no hindsight backfill.',
            'Reject-only simulation keeps insufficient and observed entries; same odds, one-unit stakes.']};
}
module.exports={VERSION,DEFINITIONS,REASONS,evaluateControls,comparison};
