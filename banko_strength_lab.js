'use strict';
// Isolated shadow model. No provider, messaging, automatic coupons or production startup.
const crypto=require('crypto'),M=require('./banko_model'),C=require('./public/banko_choices');
const VERSION='banko-strength-lab-v1-2026-10-08';
const POLICY=Object.freeze({halfLifeDays:180,maxHistoryDays:730,maxFixtures:2000,maxIterations:60,priorExposure:8,minimumLeagueMatches:20,minimumTeamMatches:8,minimumEffectiveMatches:3});
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
function prepare(history,baseline,cutoff){
    const time=Date.parse(cutoff);if(!Number.isFinite(time)||![baseline?.home,baseline?.away].every(n=>Number.isFinite(n)&&n>0))return {error:'Lig gol tabanı veya geçmiş kesim tarihi geçersiz'};
    const unique=new Map();for(const f of history||[]){const date=Date.parse(f.date);
        if(!Number.isInteger(f.id)||!Number.isInteger(f.homeId)||!Number.isInteger(f.awayId)||f.homeId===f.awayId||!Number.isInteger(f.home)||!Number.isInteger(f.away)||f.home<0||f.away<0||!Number.isFinite(date)||date+3*3600000>=time||time-date>POLICY.maxHistoryDays*86400000)continue;
        if(unique.has(f.id)&&JSON.stringify(unique.get(f.id))!==JSON.stringify(f))return {error:'Aynı geçmiş maç için çelişkili kayıt; Güç LAB PAS'};unique.set(f.id,f);
    }
    const fixtures=[...unique.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||a.id-b.id).slice(0,POLICY.maxFixtures);
    if(fixtures.length<POLICY.minimumLeagueMatches)return {error:'Güç LAB için en az 20 geçerli geçmiş lig maçı gerekli'};
    const hash=crypto.createHash('sha256').update(JSON.stringify(fixtures.map(f=>[f.id,f.date,f.homeId,f.awayId,f.home,f.away]))).digest('hex');
    const teams=new Map(),rows=[];const get=id=>{if(!teams.has(id))teams.set(id,{id,attack:1,defence:1,games:0,effective:0,lastMatch:null});return teams.get(id);};
    for(const f of fixtures){const weight=2**(-(time-Date.parse(f.date))/86400000/POLICY.halfLifeDays),h=get(f.homeId),a=get(f.awayId);
        for(const t of [h,a]){t.games++;t.effective+=weight;if(!t.lastMatch)t.lastMatch=f.date;}rows.push({h,a,home:f.home,away:f.away,weight});}
    return {teams,rows,baseline:{home:baseline.home,away:baseline.away},cutoff,hash,iterations:0,delta:Infinity};
}
function step(context){
    const prior=POLICY.priorExposure,overall=(context.baseline.home+context.baseline.away)/2,priorGoals=prior*overall;
    const sums=new Map([...context.teams].map(([id])=>[id,{for:priorGoals,against:priorGoals,attackExposure:priorGoals,defenceExposure:priorGoals}]));
    for(const f of context.rows){const h=sums.get(f.h.id),a=sums.get(f.a.id),w=f.weight;
        h.for+=w*f.home;a.for+=w*f.away;h.against+=w*f.away;a.against+=w*f.home;
        h.attackExposure+=w*context.baseline.home*f.a.defence;a.attackExposure+=w*context.baseline.away*f.h.defence;
        h.defenceExposure+=w*context.baseline.away*f.a.attack;a.defenceExposure+=w*context.baseline.home*f.h.attack;}
    let delta=0;for(const [id,t] of context.teams){const s=sums.get(id),attack=.5*t.attack+.5*clamp(s.for/s.attackExposure,.25,4),defence=.5*t.defence+.5*clamp(s.against/s.defenceExposure,.25,4);
        delta=Math.max(delta,Math.abs(attack-t.attack),Math.abs(defence-t.defence));t.attack=attack;t.defence=defence;}
    context.iterations++;context.delta=delta;
}
function finish(context){if(context.error)return {version:VERSION,status:'unavailable',reasons:[context.error]};
    return {version:VERSION,status:context.delta<.005?'ready':'unavailable',reasons:context.delta<.005?[]:['Güç hesabı yeterince kararlı değil; LAB PAS'],
        cutoff:context.cutoff,inputHash:context.hash,historyMatches:context.rows.length,iterations:context.iterations,policy:POLICY,baseline:context.baseline,
        teams:Object.fromEntries([...context.teams].map(([id,t])=>[id,{...t,effective:Math.round(t.effective*100)/100}]))};}
async function fit(context,checkpoint=async()=>{}){
    if(context.error)return finish(context);
    for(let i=0;i<POLICY.maxIterations;i++){if(i%5===0){await checkpoint();await new Promise(resolve=>setImmediate(resolve));}step(context);if(context.delta<.00001)break;}
    await checkpoint();return finish(context);
}
function fitSync(context){if(!context.error)for(let i=0;i<POLICY.maxIterations;i++){step(context);if(context.delta<.00001)break;}return finish(context);}
function analyse(row,fitted,cutoffDay){
    const lab={version:VERSION,status:'pas',capturedAt:row.capturedAt,inputCutoffDay:cutoffDay,inputHash:fitted?.inputHash||null,historyMatches:fitted?.historyMatches||0,
        pick:null,backup:null,expectedGoals:null,strengths:null,reasons:[],results:{main:{status:'pending'},backup:{status:'pending'}}};
    if(fitted?.status!=='ready'){lab.reasons=fitted?.reasons||['Güç geçmişi yok'];return lab;}
    const home=fitted.teams[row.home.id],away=fitted.teams[row.away.id];
    if(![home,away].every(t=>t&&t.games>=POLICY.minimumTeamMatches&&t.effective>=POLICY.minimumEffectiveMatches)){lab.reasons.push('İki takımda en az 8 geçmiş maç ve 3 ağırlıklı maçlık güç örneklemi gerekli');return lab;}
    const present=t=>({games:t.games,effectiveMatches:t.effective,attackIndex:Math.round(t.attack*100),concedingIndex:Math.round(t.defence*100),powerIndex:Math.round(t.attack/t.defence*100),lastMatch:t.lastMatch});
    lab.strengths={home:present(home),away:present(away)};
    const g={home:clamp(fitted.baseline.home*home.attack*away.defence,.3,3.8),away:clamp(fitted.baseline.away*away.attack*home.defence,.3,3.8),phase:null};
    // Phase shares remain the baseline's valid 10-half-history shares; no full-time API -> first-half conversion.
    const old=row.expectedGoals;if(old?.phase&&old.home>0&&old.away>0){const h=clamp(old.phase.homeFirst/old.home,.3,.6),a=clamp(old.phase.awayFirst/old.away,.3,.6);
        g.phase={homeFirst:g.home*h,awayFirst:g.away*a,homeSecond:g.home*(1-h),awaySecond:g.away*(1-a)};}
    lab.expectedGoals=g;lab.status='analysed';return lab;
}
function evaluate(row,settings,now){const lab=row.strengthLab;if(!lab?.expectedGoals)return;
    const markets=M.evaluateMarkets({update:row.oddsUpdatedAt,markets:row.markets},lab.expectedGoals,row.profiles,settings,now,row.kickoff).map(m=>({...m,modelVersion:VERSION}));
    if(Date.parse(row.kickoff)<=now.getTime()+30*60000)for(const m of markets){m.eligible=false;m.reasons.push('Maç başlamış veya başlangıca 30 dakikadan az kalmış; yeni LAB seçimi yok');}
    lab.pick=markets.filter(m=>m.eligible).sort(C.rank)[0]||null;lab.backup=lab.pick?C.alternative({pick:lab.pick,markets},settings):null;
    lab.status=lab.pick?'selected':'pas';lab.reasons=lab.pick?[]:['Aynı veri/oran/model eşiklerini geçen Güç LAB marketi yok; seçim zorlanmadı'];
}
const selections=row=>row.strengthLab?.expectedGoals?[['main',row.strengthLab.pick],['backup',row.strengthLab.backup]].filter(([,m])=>m):[];
function stats(rows,getPick,getResult){let total=0,won=0,lost=0,netUnits=0;for(const row of rows){const m=getPick(row);if(!m)continue;total++;const r=getResult(row,m);if(r?.status==='won'){won++;netUnits+=m.odd-1;}else if(r?.status==='lost'){lost++;netUnits--;}}
    const settled=won+lost;return {total,pas:rows.length-total,won,lost,pending:total-settled,settled,hitRate:settled?won/settled*100:null,netUnits,roi:settled?netUnits/settled*100:null};}
function different(row){const a=row.pick,b=row.strengthLab?.pick;return !!a!==!!b||!!a&&!!b&&!C.sameOutcome(a,b);}
function summary(session){const rows=(session?.candidates||[]).filter(r=>r.strengthLab?.version===VERSION&&r.strengthLab.status!=='disabled'&&Date.parse(r.strengthLab.capturedAt)<Date.parse(r.kickoff));
    return {available:rows.length>0,version:VERSION,fixtures:rows.length,different:rows.filter(different).length,same:rows.filter(r=>!different(r)).length,
        main:stats(rows,r=>r.pick,(r,m)=>r.marketResults?.[m.key]),lab:stats(rows,r=>r.strengthLab.pick,r=>r.strengthLab.results?.main),
        disclaimer:'Yalnız seçili taramanın aynı maçları; tekrar taramalar bağımsız maç sayılmaz. İlk kayıt oranıyla seçim başına 1 teorik birim. Manuel seçimler ve kupon sonuçları bu karşılaştırmaya dahil değildir.'};}
module.exports={VERSION,POLICY,prepare,fit,fitSync,analyse,evaluate,selections,summary,different};
