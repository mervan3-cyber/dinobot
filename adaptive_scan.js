'use strict';
// Pure cadence policy. No provider requests, model scoring, timers or Telegram.
const MINUTE=60000, NORMAL_MS=10*MINUTE, FAST_MS=5*MINUTE;
const REASONS=Object.freeze({stopped:'Sistem kapalı',auto_off:'Otomatik tarama kapalı',outside_schedule:'Çalışma saati dışında',
    single:'Program: tek sefer tarama',schedule_five:'Program: sabit 5 dakika (ayrı ayar)',disabled:'Seçenek kapalı · normal 10 dakika',
    provider_cooldown:'API hata / hız sınırı koruması · 10 dakika',quota_unknown:'Güncel API kotası bilinmiyor · 10 dakika',
    quota_reserve:'API kota rezervi · 10 dakika',no_candidates:'Uygun tam-stat maç yok · 10 dakika',
    stale_candidates:'Aday bilgisi eskidi · 10 dakika',fast:'Uygun tam-stat maç var · 5 dakika'});
const nonnegative=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isInteger(Number(v))&&Number(v)>=0;
function isCandidate(m) {
    if(!m||!['1H','2H'].includes(m.status_short)||!nonnegative(m.dakika)||m.dakika<25||m.dakika>80||
        m.stats_identity_verified!==true||!Number.isInteger(Number(m.fixture_id))||Number(m.fixture_id)<=0)return false;
    for(const side of ['home','away']) {
        if(!['shot','sot','corner'].every(k=>nonnegative(m[`${side}_${k}`]))||Number(m[`${side}_sot`])>Number(m[`${side}_shot`]))return false;
    }
    return Object.values(m.canli_oranlar||{}).some(o=>{const odds=Number(o?.oran??o);return Number.isFinite(odds)&&odds>1;});
}
class AdaptiveScan {
    constructor(){this.lastStartedAt=null;this.lastFinishedAt=null;this.observedAt=null;this.candidateCount=0;this.cooldownUntil=0;}
    resetClock(){this.lastStartedAt=null;this.lastFinishedAt=null;}
    begin(now=Date.now()){this.lastStartedAt=now;this.lastFinishedAt=null;}
    observe(matches,now=Date.now()) {
        this.candidateCount=new Set(matches.filter(isCandidate).map(m=>Number(m.fixture_id))).size;this.observedAt=now;
    }
    providerFailure(now=Date.now()){this.cooldownUntil=Math.max(this.cooldownUntil,now+NORMAL_MS);}
    finish({failed=false}={},now=Date.now()) {
        this.lastFinishedAt=now;
        if(failed){this.candidateCount=0;this.observedAt=now;this.providerFailure(now);}
    }
    status({enabled=false,running=true,auto=true,schedule={mode:'loop'},quota=null,reserve=1500}={},now=Date.now()) {
        let reason;
        if(!running)reason='stopped';else if(!auto)reason='auto_off';else if(!schedule)reason='outside_schedule';
        else if(schedule.mode==='single')reason='single';
        // Preserve a user's explicitly configured old fixed-five-minute schedule.
        else if(schedule.mode==='5 Dakikada Bir Tara')reason='schedule_five';
        else if(!enabled)reason='disabled';else if(this.cooldownUntil>now)reason='provider_cooldown';
        else if(typeof quota!=='number'||!Number.isFinite(quota)||quota<0)reason='quota_unknown';
        else if(quota<=reserve)reason='quota_reserve';else if(!this.candidateCount)reason='no_candidates';
        else if(this.observedAt===null||now-this.observedAt>12*MINUTE)reason='stale_candidates';else reason='fast';
        const active=reason==='fast',scheduledFast=reason==='schedule_five';
        const intervalMinutes=active||scheduledFast?5:10;
        const paused=['stopped','auto_off','outside_schedule','single'].includes(reason);
        let nextRunTime=0;
        if(!paused&&this.lastStartedAt!==null) {
            nextRunTime=this.lastStartedAt+intervalMinutes*MINUTE;
            // A long scan must finish before another starts; no catch-up burst.
            if(this.lastFinishedAt!==null)nextRunTime=Math.max(nextRunTime,this.lastFinishedAt+MINUTE);
        }
        return {enabled:!!enabled,active,scheduledFast,intervalMinutes,reason,reasonLabel:REASONS[reason],
            candidateCount:this.candidateCount,observedAt:this.observedAt,cooldownUntil:this.cooldownUntil>now?this.cooldownUntil:null,
            lastStartedAt:this.lastStartedAt,lastFinishedAt:this.lastFinishedAt,nextRunTime,quotaReserve:reserve};
    }
}
function providerTrouble(result) {
    const errors=result?.data?.errors;
    return !!errors&&/rate.?limit|too many|request.*limit|limit.*request/i.test(JSON.stringify(errors));
}
module.exports={AdaptiveScan,isCandidate,providerTrouble,REASONS,MINUTE,NORMAL_MS,FAST_MS};
