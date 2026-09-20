'use strict';
// Prospective LAB only. No HTTP client, model weights, market selection or delivery.
const VERSION = 'v23-live-lab-v1-2026-09-20';
const LIMITS = Object.freeze({maxFixtures:300,maxSnapshots:48,keepMinutes:30,ttlHours:6,maximumAgeMs:120000});
const DEFINITIONS = Object.freeze([
    {id:'tempo5',label:'Son ~5 dakika üretimi',rule:'3–7 dk gerçek gözlem; 10 dk hızına çevrilir. Onay: şut ≥4 ve isabet ≥1. Ret: şut ≤1 ve isabet 0. Ara bölge yalnız gözlem.'},
    {id:'tempo10',label:'Son ~10 dakika üretimi',rule:'8–12 dk gerçek gözlem; 10 dk hızına çevrilir. Onay: şut ≥4 ve isabet ≥1. Ret: şut ≤1 ve isabet 0. Ara bölge yalnız gözlem.'},
    {id:'quality',label:'Yeni şutların niteliği',rule:'Önce geçerli ~10, yoksa ~5 dk. Onay: 10 dk başına ceza sahası içi şut ≥2 ve isabet ≥1. Ret: içeriden şut 0, isabet 0 ve en az 2 yeni şut. Diğerleri gözlem. İki takımın iç şut verisi gerekli.'},
    {id:'xg',label:'Yeni xG üretimi',rule:'Önce geçerli ~10, yoksa ~5 dk. İki takımın xG artışı / gerçek süre ×10: ≥0,30 onay; ≤0,05 ret; arası gözlem. Gelecek gol olasılığı değildir.'},
    {id:'combined',label:'Tempo + şut niteliği',rule:'Aynı pencerede iki kontrol de yeterliyse: herhangi bir ret → ret; ikisi de onay → onay; diğerleri gözlem. Eksik bileşen varsa yetersiz.'},
    {id:'combined_xg',label:'Tempo + nitelik + xG',rule:'Üç kontrol de yeterliyse: herhangi bir ret → ret; hepsi onay → onay; diğerleri gözlem. xG yoksa yetersiz; xG varmış gibi kabul edilmez.'},
    {id:'context',label:'Dakika / skor / gereken gol',mode:'observation',rule:'Yalnız gruplama. V21 0-0 → 1.5 ÜST ve V22 yalnız C ayrı izlenir; ek veto uygulanmaz.'}
].map(d=>Object.freeze({mode:'hypothesis',...d})));
const REASONS = Object.freeze({
    STATE_INVALID:'Maç/istatistik kimliği, skor veya dakika doğrulanamadı',
    STATS_NOT_FRESH:'İstatistik zamanı eksik, gelecekte veya 120 saniyeden eski',
    FULL_STATS_MISSING:'İki takımın şut/isabet/korner verisi eksik veya tutarsız',
    HALF_NOT_LIVE:'Canlı 1. veya 2. yarı dışında; devre arası geçilmez',
    WINDOW_WARMING:'Uygun önceki gözlem yok; pencere hazırlanıyor',
    CLOCK_GAP:'Maç dakikası ile gözlem zamanı uyumsuz veya uzun duraklama var',
    STATE_CHANGED:'Pencerede skor, kırmızı kart, takım kimliği veya yarı değişti',
    RED_CONTEXT:'Kırmızı kart verisi eksik veya kartlı maç; ilk deneyin kapsamı dışında',
    EVENT_IN_WINDOW:'Pencere sınırında/içinde gol veya kırmızı kart olayı var',
    STATS_CORRECTED:'Pencerede şut/isabet/korner sayacı azaldı veya artış tutarsız',
    BOX_MISSING:'İki uçta iki takımın ceza sahası içi şut verisi yok',
    BOX_CORRECTED:'Ceza sahası içi şut sayacı azaldı veya şutla tutarsız',
    XG_MISSING:'İki uçta iki takımın xG verisi yok',
    XG_CORRECTED:'Pencerede xG sayacı azaldı',
    SUPPORT:'Başlangıç hipotezinin destek bölgesinde',
    WEAK:'Başlangıç hipotezinin zayıf bölgesinde; yalnız LAB ret simülasyonu',
    MIDDLE:'Ara bölge; yalnız gözlem, veto yok',
    COMPONENT_MISSING:'Birleşik deneyin gerekli bileşeni yetersiz',
    CONTEXT_ONLY:'Bağlam kaydı; karar veya olasılık değil',
    SIGNAL_MISMATCH:'Sinyal ile giriş anındaki canlı durum uyuşmuyor',
    EVALUATION_ERROR:'Canlı LAB hesaplanamadı; kaynak sinyal değişmedi'
});
const clone=v=>JSON.parse(JSON.stringify(v));
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const number=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const integer=v=>{const n=number(v);return Number.isInteger(n)?n:null;};
const rnd=n=>Math.round(n*10000)/10000;
function item(id,status,reason,values={}) {
    return {...DEFINITIONS.find(d=>d.id===id),status,reasons:[reason],reasonLabels:[REASONS[reason]||reason],values};
}
function snapshot(mac, capturedAt) {
    const at=time(capturedAt), statsAt=time(mac?.stats_received_at);
    if (!mac || !integer(mac.fixture_id) || !integer(mac.home_team_id) || !integer(mac.away_team_id) ||
        Number(mac.home_team_id)===Number(mac.away_team_id) || mac.stats_identity_verified!==true ||
        integer(mac.dakika)===null || mac.dakika>90 || !/^\d+-\d+$/.test(String(mac.skor)) || at===null)
        return {status:'insufficient',reason:'STATE_INVALID'};
    if (!['1H','2H'].includes(mac.status_short) || (mac.status_short==='1H'&&mac.dakika>45) || (mac.status_short==='2H'&&mac.dakika<45))
        return {status:'insufficient',reason:'HALF_NOT_LIVE'};
    if (statsAt===null||statsAt>at||at-statsAt>LIMITS.maximumAgeMs) return {status:'insufficient',reason:'STATS_NOT_FRESH'};
    const stats={};
    for (const side of ['home','away']) {
        stats[side]={...Object.fromEntries(['shot','sot','corner','red'].map(k=>[k,integer(mac[`${side}_${k}`])])),xg:number(mac[`${side}_xg`]),
            ...Object.fromEntries(['shotsInsidebox','shotsOutsidebox','blockedShots'].map(k=>[k,integer(mac._v23LiveStats?.[side]?.[k])]))};
        const s=stats[side];
        if ([s.shot,s.sot,s.corner].includes(null)||s.sot>s.shot) return {status:'insufficient',reason:'FULL_STATS_MISSING'};
    }
    // Optional event annotations reuse the existing fixture payload. They never
    // cause provider requests and unavailable events are not invented as empty facts.
    const eventsAt=time(mac._v23EventsAt);
    const eventsFresh=eventsAt!==null&&eventsAt<=at&&at-eventsAt<=LIMITS.maximumAgeMs&&Array.isArray(mac._v23Events);
    const events=eventsFresh?mac._v23Events.slice(0,150).map(e=>({type:String(e?.type||'').toLowerCase(),
        detail:String(e?.detail||'').toLowerCase(),comments:String(e?.comments||'').toLowerCase(),minute:integer(e?.time?.elapsed)})):null;
    return {status:'ok',capturedAt,statsAt:mac.stats_received_at,fixtureId:Number(mac.fixture_id),homeId:Number(mac.home_team_id),awayId:Number(mac.away_team_id),
        minute:Number(mac.dakika),phase:mac.status_short,score:String(mac.skor),stats,events};
}
function windowEvidence(snapshots,current,target) {
    const range=target===5?[3,7]:[8,12];
    const candidates=snapshots.filter(s=>s.phase===current.phase&&time(s.statsAt)<time(current.statsAt)&&time(s.capturedAt)<time(current.capturedAt)&&
        current.minute-s.minute>=range[0]&&current.minute-s.minute<=range[1]);
    candidates.sort((a,b)=>Math.abs(current.minute-a.minute-target)-Math.abs(current.minute-b.minute-target)||time(b.capturedAt)-time(a.capturedAt));
    const base=candidates[0];
    if(!base)return {status:'insufficient',reason:'WINDOW_WARMING',targetMinutes:target};
    const span=current.minute-base.minute, wall=(time(current.statsAt)-time(base.statsAt))/60000;
    const endpoint=s=>({capturedAt:s.capturedAt,statsAt:s.statsAt,minute:s.minute,score:s.score,phase:s.phase,stats:clone(s.stats)});
    const out={status:'insufficient',targetMinutes:target,windowMinutes:span,wallMinutes:rnd(wall),from:endpoint(base),to:endpoint(current)};
    if(Math.abs(wall-span)>3)return {...out,reason:'CLOCK_GAP'};
    const chain=[...snapshots.filter(s=>time(s.capturedAt)>=time(base.capturedAt)&&time(s.capturedAt)<time(current.capturedAt)),current];
    if(chain.some((s,i)=>s.homeId!==current.homeId||s.awayId!==current.awayId||s.phase!==current.phase||s.score!==current.score||s.minute>current.minute||
        (i>0&&(s.minute<chain[i-1].minute||time(s.statsAt)<time(chain[i-1].statsAt)))))
        return {...out,reason:'STATE_CHANGED'};
    if(chain.some(s=>['home','away'].some(side=>s.stats[side].red===null||s.stats[side].red!==0)))return {...out,reason:'RED_CONTEXT'};
    const relevant=(current.events||[]).filter(e=>e.minute!==null&&e.minute>=base.minute&&e.minute<=current.minute);
    if(relevant.some(e=>(e.type==='goal'&&!/missed|cancel|disallow|annul/.test(e.detail+' '+e.comments))||(e.type==='card'&&/red/.test(e.detail))))
        return {...out,reason:'EVENT_IN_WINDOW'};
    const deltas={};
    for(const side of ['home','away']) {
        deltas[side]={};
        for(const key of ['shot','sot','corner','xg','shotsInsidebox','shotsOutsidebox','blockedShots']) {
            const values=chain.map(s=>s.stats[side][key]);
            const missing=values.some(v=>v===null), corrected=values.some((v,i)=>i>0&&v!==null&&values[i-1]!==null&&v<values[i-1]);
            deltas[side][key]=missing||corrected?null:rnd(current.stats[side][key]-base.stats[side][key]);
            if(['shot','sot','corner'].includes(key)&&(missing||corrected))return {...out,reason:'STATS_CORRECTED'};
            if(key==='xg'&&(missing||corrected))out.xgIssue=corrected?'XG_CORRECTED':'XG_MISSING';
            if(key==='shotsInsidebox'&&(missing||corrected))out.boxIssue=corrected?'BOX_CORRECTED':'BOX_MISSING';
        }
        if(deltas[side].sot>deltas[side].shot)return {...out,reason:'STATS_CORRECTED'};
        if(chain.some(s=>s.stats[side].shotsInsidebox!==null&&s.stats[side].shotsInsidebox>s.stats[side].shot)||deltas[side].shotsInsidebox>deltas[side].shot)out.boxIssue='BOX_CORRECTED';
    }
    const totals=Object.fromEntries(Object.keys(deltas.home).map(k=>[k,deltas.home[k]===null||deltas.away[k]===null?null:rnd(deltas.home[k]+deltas.away[k])]));
    return {...out,status:'ok',deltas,totals,per10:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v===null?null:rnd(v*10/span)])),
        substitutions:current.events===null?null:relevant.filter(e=>e.type==='subst').length,eventsAvailable:current.events!==null,
        sotShare:totals.shot>0?rnd(totals.sot/totals.shot):null};
}
class LiveObservations {
    constructor({maxFixtures=LIMITS.maxFixtures,maxSnapshots=LIMITS.maxSnapshots}={}) {
        this.entries=new Map();this.maxFixtures=Math.max(1,Math.min(LIMITS.maxFixtures,maxFixtures));this.maxSnapshots=Math.max(2,Math.min(LIMITS.maxSnapshots,maxSnapshots));
    }
    capture(mac,capturedAt) {
        const s=snapshot(mac,capturedAt);if(s.status!=='ok')return;
        const at=time(capturedAt);this.prune(at);
        const entry=this.entries.get(s.fixtureId)||{lastAt:0,snapshots:[]};
        if(at<=entry.lastAt||entry.snapshots.some(p=>time(p.statsAt)>=time(s.statsAt)))return;
        // Historical windows need numeric endpoints, not repeated event payloads.
        // Keep events only in the frozen signal evidence/current evaluation.
        const {events,...stored}=s;
        entry.snapshots.push(stored);entry.snapshots=entry.snapshots.filter(p=>at-time(p.capturedAt)<=LIMITS.keepMinutes*60000).slice(-this.maxSnapshots);entry.lastAt=at;
        this.entries.delete(s.fixtureId);this.entries.set(s.fixtureId,entry);
        while(this.entries.size>this.maxFixtures)this.entries.delete(this.entries.keys().next().value);
    }
    evidence(mac,capturedAt) {
        const current=snapshot(mac,capturedAt);
        if(current.status!=='ok')return {...current,windows:{}};
        const rows=(this.entries.get(current.fixtureId)?.snapshots||[]).filter(s=>time(s.capturedAt)<=time(capturedAt));
        return {status:'ok',current,windows:{5:windowEvidence(rows,current,5),10:windowEvidence(rows,current,10)}};
    }
    releaseFixture(id){this.entries.delete(Number(id));}
    prune(now=Date.now()){for(const [id,e]of this.entries)if(now-e.lastAt>LIMITS.ttlHours*3600000)this.entries.delete(id);}
    metadata(){return {version:VERSION,cachedFixtures:this.entries.size,snapshots:[...this.entries.values()].reduce((n,e)=>n+e.snapshots.length,0),
        maximumFixtures:this.maxFixtures,maximumSnapshotsPerFixture:this.maxSnapshots,additionalApiCalls:0,persistentTimeline:false};}
}
function unavailable(capturedAt,reason='EVALUATION_ERROR') {
    return {version:VERSION,capturedAt,decisionImpact:false,thresholdsFitted:false,controls:DEFINITIONS.map(d=>item(d.id,'insufficient',reason)),evidence:null};
}
function evaluate({signal,mac,observations}) {
    const evidence=observations.evidence(mac,signal.sentAt), controls=[];
    if(Number(signal.fixtureId)!==Number(mac?.fixture_id)||Number(signal.minute)!==Number(mac.dakika)||String(signal.score)!==String(mac.skor))return unavailable(signal.sentAt,'SIGNAL_MISMATCH');
    const score=/^(\d+)-(\d+)$/.exec(String(signal.score)),line=/^(\d+(?:\.\d+)?)_UST$/.exec(String(signal.market));
    const goalsNeeded=score&&line?Math.floor(Number(line[1]))+1-Number(score[1])-Number(score[2]):null;
    if(goalsNeeded===null||goalsNeeded<1)return unavailable(signal.sentAt,'SIGNAL_MISMATCH');
    const measure=w=>({windowMinutes:w.windowMinutes,from:w.from?.capturedAt,to:w.to?.capturedAt,totals:w.totals,per10:w.per10,
        deltas:w.deltas,sotShare:w.sotShare,substitutions:w.substitutions,eventsAvailable:w.eventsAvailable,goalsNeeded});
    const tempo=(id,w)=>{
        if(!w||w.status!=='ok')return item(id,'insufficient',w?.reason||evidence.reason||'WINDOW_WARMING');
        const strong=w.per10.shot>=4&&w.per10.sot>=1,weak=w.per10.shot<=1&&w.totals.sot===0;
        return item(id,strong?'approve':weak?'reject':'observed',strong?'SUPPORT':weak?'WEAK':'MIDDLE',measure(w));
    };
    controls.push(tempo('tempo5',evidence.windows[5]),tempo('tempo10',evidence.windows[10]));
    const w=evidence.windows[10]?.status==='ok'?evidence.windows[10]:evidence.windows[5]?.status==='ok'?evidence.windows[5]:null;
    const quality=!w?item('quality','insufficient',evidence.reason||evidence.windows[10]?.reason||'WINDOW_WARMING'):
        w.boxIssue?item('quality','insufficient',w.boxIssue,measure(w)):
        w.per10.shotsInsidebox>=2&&w.per10.sot>=1?item('quality','approve','SUPPORT',measure(w)):
        w.totals.shotsInsidebox===0&&w.totals.sot===0&&w.totals.shot>=2?item('quality','reject','WEAK',measure(w)):item('quality','observed','MIDDLE',measure(w));
    const xg=!w?item('xg','insufficient',evidence.reason||evidence.windows[10]?.reason||'WINDOW_WARMING'):
        w.xgIssue?item('xg','insufficient',w.xgIssue,measure(w)):
        item('xg',w.per10.xg>=0.3?'approve':w.per10.xg<=0.05?'reject':'observed',w.per10.xg>=0.3?'SUPPORT':w.per10.xg<=0.05?'WEAK':'MIDDLE',measure(w));
    controls.push(quality,xg);
    const selectedTempo=w?controls.find(c=>c.id===`tempo${w.targetMinutes}`):controls[1];
    for(const [id,parts]of [['combined',[selectedTempo,quality]],['combined_xg',[selectedTempo,quality,xg]]]) {
        const missing=parts.some(c=>c.status==='insufficient'),reject=parts.some(c=>c.status==='reject'),approve=parts.every(c=>c.status==='approve');
        controls.push(item(id,missing?'insufficient':reject?'reject':approve?'approve':'observed',missing?'COMPONENT_MISSING':reject?'WEAK':approve?'SUPPORT':'MIDDLE',
            {windowMinutes:w?.windowMinutes??null,components:Object.fromEntries(parts.map(c=>[c.id,c.status]))}));
    }
    const minute=integer(signal.minute),band=minute<46?'0–45':minute<66?'46–65':minute<76?'66–75':'76–90';
    controls.push(item('context','observed','CONTEXT_ONLY',{minute,score:signal.score,goalsNeeded,tag:`${band} dk / ${goalsNeeded} gol gerekli`}));
    return {version:VERSION,capturedAt:signal.sentAt,decisionImpact:false,thresholdsFitted:false,controls,evidence};
}
function validAudit(a) {
    return a?.version===VERSION&&Array.isArray(a.controls)&&a.controls.length===DEFINITIONS.length&&DEFINITIONS.every(d=>a.controls.filter(c=>c?.id===d.id).length===1)&&
        a.controls.every(c=>['approve','reject','insufficient','observed'].includes(c.status)&&Array.isArray(c.reasons)&&Array.isArray(c.reasonLabels));
}
function report(signals,summary) {
    const stats=rows=>summary(rows).overall,baseline=stats(signals),get=(s,id)=>s.audit.live.controls.find(c=>c.id===id);
    return {baseline,controls:DEFINITIONS.map(d=>{
        const buckets=Object.fromEntries(['approve','reject','insufficient','observed'].map(st=>[st,stats(signals.filter(s=>get(s,d.id)?.status===st))]));
        const rejectOnly=stats(signals.filter(s=>get(s,d.id)?.status!=='reject'));
        const tags=[...new Set(signals.map(s=>get(s,d.id)?.values?.tag).filter(Boolean))];
        const codes=[...new Set(signals.flatMap(s=>get(s,d.id)?.reasons||[]))];
        return {...d,...buckets,rejectOnly,coveredPercent:signals.length?100*(buckets.approve.total+buckets.reject.total)/signals.length:null,
            comparableBaseline:stats(signals.filter(s=>['approve','reject'].includes(get(s,d.id)?.status))),
            avoidedLosses:buckets.reject.losses,missedWinners:buckets.reject.wins,profitDifference:rnd(rejectOnly.profit-baseline.profit),
            tags:Object.fromEntries(tags.map(t=>[t,stats(signals.filter(s=>get(s,d.id)?.values?.tag===t))])),
            reasons:Object.fromEntries(codes.map(c=>[c,{label:REASONS[c]||c,...stats(signals.filter(s=>get(s,d.id)?.reasons.includes(c)))}]))};
    })};
}
function comparison(signals,summary) {
    const current=signals.filter(s=>s.audit?.live?.version===VERSION),sources=Object.fromEntries(['v21','v22'].map(source=>[source,report(current.filter(s=>s.sourceModel===source),summary)]));
    const unique=new Map();for(const s of current){const key=JSON.stringify([s.fixtureId,s.market,s.minute,s.score,Date.parse(s.sentAt),s.odds]);if(!unique.has(key))unique.set(key,s);}
    return {version:VERSION,startedAt:current.map(s=>s.sentAt).sort()[0]||null,sourceRecords:current.length,oldRecordsExcluded:signals.length-current.length,
        uniqueFixtures:new Set(current.map(s=>s.fixtureId)).size,uniqueEntries:unique.size,sources,unique:report([...unique.values()],summary),
        v22Filters:Object.fromEntries(['A','B','C'].map(f=>[f,report(current.filter(s=>s.sourceModel==='v22'&&s.matchedFilters?.includes(f)),summary)])),
        focus:{v21ZeroZero:report(current.filter(s=>s.sourceModel==='v21'&&s.score==='0-0'&&s.market==='1.5_UST'),summary),
            v22COnly:report(current.filter(s=>s.sourceModel==='v22'&&s.matchedFilters?.length===1&&s.matchedFilters[0]==='C'),summary)},
        decisionImpact:false,thresholdsFitted:false,additionalApiCalls:0};
}
module.exports={VERSION,LIMITS,DEFINITIONS,REASONS,LiveObservations,snapshot,windowEvidence,evaluate,unavailable,validAudit,comparison};
