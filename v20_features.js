'use strict';

const STATS = ['shots','shotsOnGoal','corners','possession','yellowCards','redCards','fouls','offsides','saves','xg'];
const CUMULATIVE = STATS.filter(x => x !== 'possession');
const MARKETS = ['0.5_UST','1.5_UST','2.5_UST','3.5_UST','4.5_UST','MS1','X','MS2'];
function num(x) { if (x === null || x === undefined || x === '') return NaN; const n=Number(x); return Number.isFinite(n) ? n : NaN; }
function sum(a,b) { return num(a)+num(b); }
function ratio(a,b) { return Number.isFinite(a) && Number.isFinite(b) ? a/Math.max(1,b) : NaN; }
function logit(p) { return Number.isFinite(p) ? Math.log(Math.max(0.001,Math.min(0.999,p))/(1-Math.max(0.001,Math.min(0.999,p)))) : NaN; }
function probability(x) { const n=num(x); return n>=0 && n<=1 ? n : NaN; }
function turkeyDate(ts) { return new Date(new Date(ts).getTime()+10800000).toISOString().slice(0,10); }
function validState(s) {
    if (!s || !Number.isFinite(num(s.minute)) || s.minute < 1 || s.minute > 130) return false;
    if (![s.homeScore,s.awayScore].every(x => Number.isInteger(x) && x>=0)) return false;
    for(const team of ['home','away']) {
        const v=s.stats?.[team] || {};
        if(!['shots','shotsOnGoal','corners'].every(k => Number.isFinite(num(v[k])) && num(v[k])>=0)) return false;
        if(num(v.shotsOnGoal)>num(v.shots)) return false;
    }
    return true;
}
function priorState(s, history=[]) {
    return [...history].reverse().find(p => p.at < s.at && p.minute <= s.minute-3 && s.minute-p.minute<=20 &&
        (p.status==='1H' && s.status==='1H' || p.status==='2H' && s.status==='2H')) || null;
}
function stateFeatures(s, history=[]) {
    const h=s.stats.home,a=s.stats.away,m=num(s.minute),g=s.homeScore+s.awayScore,d=s.homeScore-s.awayScore;
    const f={minute:m,remaining:Math.max(0,95-m),homeScore:s.homeScore,awayScore:s.awayScore,totalGoals:g,
        goalDiff:d,absGoalDiff:Math.abs(d),level:Number(d===0),half2:Number(s.status==='2H'),atBreak:Number(s.status==='HT')};
    for(const k of STATS) {
        const hv=num(h[k]),av=num(a[k]);
        f['stat_h_'+k]=hv; f['stat_a_'+k]=av; f['stat_sum_'+k]=hv+av; f['stat_diff_'+k]=hv-av;
        if(CUMULATIVE.includes(k)) f['stat_rate_'+k]=(hv+av)/m*90;
    }
    f.sotShare=ratio(num(h.shotsOnGoal),sum(h.shotsOnGoal,a.shotsOnGoal));
    f.shotAccuracy=ratio(sum(h.shotsOnGoal,a.shotsOnGoal),sum(h.shots,a.shots));
    f.xgPerShot=ratio(sum(h.xg,a.xg),sum(h.shots,a.shots));
    f.goalsMinusXg=g-sum(h.xg,a.xg);
    f.goalsPerSot=ratio(g,sum(h.shotsOnGoal,a.shotsOnGoal));
    const prev=priorState(s,history); f.seq_available=Number(!!prev); f.seq_gap=prev ? m-prev.minute : NaN;
    for(const k of CUMULATIVE) {
        for(const side of ['home','away']) {
            const now=num(s.stats[side][k]),before=num(prev?.stats?.[side]?.[k]);
            const reliable=!!prev && Number.isFinite(now) && Number.isFinite(before) && now>=before;
            f[`seq_${side}_${k}`]=reliable ? (now-before)/f.seq_gap*10 : NaN;
        }
    }
    f.seq_goals=prev && g>=prev.homeScore+prev.awayScore ? g-prev.homeScore-prev.awayScore : NaN;
    f.pre_home=probability(s.pre?.home); f.pre_draw=probability(s.pre?.draw); f.pre_away=probability(s.pre?.away);
    const ctx=s.context || {}, id=ctx.validation?.identityVerified===true;
    const hp=ctx.prediction?.percent || {};
    for(const side of ['home','draw','away']) f['api_p_'+side]=id ? num(hp[side])/100 : NaN;
    for(const side of ['home','away']) {
        const venue=ctx.teamStats?.[side]?.[side] || {}, n=num(venue.played ?? ctx.validation?.[side+'VenuePlayed']);
        f['api_'+side+'_sample']=id ? n : NaN;
        for(const k of ['winRate','drawRate','goalsForAverage','goalsAgainstAverage']) {
            const v=num(venue[k]);
            f['api_'+side+'_'+k]=id && n>=3 ? v : NaN;
        }
        const t=ctx.standings?.[side] || {};
        f['api_'+side+'_rank']=id ? num(t.rank) : NaN;
        f['api_'+side+'_points']=id ? num(t.points) : NaN;
        f['api_'+side+'_gd']=id ? num(t.goalsDiff) : NaN;
    }
    for(const market of ['MS1','X','MS2']) f['price_'+market]=1/num(s.markets?.[market]?.odds);
    return f;
}
function marketFeatures(s,market,history=[]) {
    const f=stateFeatures(s,history),r=s.markets[market] || {},od=num(r.odds),raw=1/od;
    if(market.endsWith('_UST')) {
        const line=Number(market.split('_')[0]);
        f.line=line; f.goalsNeeded=line+0.5-f.totalGoals; f.needRate=f.goalsNeeded/Math.max(5,f.remaining)*90;
        f.pre_market=num(r.pre)/100;
        f.price_opposite=1/num(s.markets[line.toFixed(1)+'_ALT']?.odds);
    }
    f.price_raw=raw;f.price_logit=logit(raw);f.price_odds=od;
    const prev=priorState(s,history),prevOdd=num(prev?.markets?.[market]?.odds);
    f.price_movement=Number.isFinite(prevOdd) ? raw-1/prevOdd : NaN;
    return f;
}
function resultFeatures(s,history=[]) {
    const f=stateFeatures(s,history);
    const prev=priorState(s,history);
    for(const market of ['MS1','X','MS2']) f['price_move_'+market]=1/num(s.markets[market]?.odds)-1/num(prev?.markets?.[market]?.odds);
    return f;
}
function fromMac(mac,at,context=null) {
    const score=String(mac.skor || '').match(/^(\d+)\s*-\s*(\d+)$/);
    const map={shots:'shot',shotsOnGoal:'sot',corners:'corner',possession:'possession',yellowCards:'yellow',redCards:'red',fouls:'fouls',offsides:'offsides',saves:'saves',xg:'xg'};
    const s={fixtureId:Number(mac.fixture_id),at,minute:num(mac.dakika),status:mac.status_short,match:mac.mac_isim,
        homeScore:score ? Number(score[1]) : NaN,awayScore:score ? Number(score[2]) : NaN,stats:{home:{},away:{}},
        pre:mac.prematch_available ? {home:mac.prematch_p_home,draw:mac.prematch_p_draw,away:mac.prematch_p_away} : {},context,markets:{}};
    for(const side of ['home','away']) for(const [key,suffix] of Object.entries(map)) s.stats[side][key]=num(mac[side+'_'+suffix]);
    for(const [market,value] of Object.entries(mac.canli_oranlar || {})) {
        const line=Number(market.split('_')[0]);
        const pre=['MS1','X','MS2'].includes(market) ? s.pre[{MS1:'home',X:'draw',MS2:'away'}[market]] : mac.prematch_totals?.[String(line)]?.[market.endsWith('_UST')?'over':'under'];
        s.markets[market]={odds:num(typeof value==='object'?value.oran:value),pre:num(pre)*100};
    }
    return s;
}
module.exports={STATS,MARKETS,num,turkeyDate,validState,priorState,stateFeatures,marketFeatures,resultFeatures,fromMac};
