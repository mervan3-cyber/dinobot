'use strict';
const M=require('./banko_model'),C=require('./public/banko_choices');
const VERSION='banko-market-lab-v1-2026-10-10';
const CLOSE_OVER_PP=3;
// IDs AND exact provider names must agree. In particular 276 is NOT verified as team shots.
const COUNT_MARKETS={45:{name:'Corners Over Under',field:'Corner Kicks',team:null,family:'corners'},57:{name:'Home Corners Over/Under',field:'Corner Kicks',team:'home',family:'corners'},58:{name:'Away Corners Over/Under',field:'Corner Kicks',team:'away',family:'corners'},211:{name:'Total Shots',field:'Total Shots',team:null,family:'shots'},87:{name:'Total ShotOnGoal',field:'Shots on Goal',team:null,family:'onTarget'}};
const clone=value=>JSON.parse(JSON.stringify(value));
function retained(spec){if(!spec)return false;
    return ['winner','doubleChance'].includes(spec.kind)&&spec.period==='full'||spec.kind==='btts'||['total','teamTotal'].includes(spec.kind)&&spec.direction==='over'||spec.kind==='cleanSheet'&&spec.yes===false;}
function extraSpec(m){let x;if(m.betId===25&&m.market==='Result/Total Goals'&&(x=/^Home\/Over (\d+\.5)$/.exec(m.selection)))return {kind:'homeOver',period:'full',line:Number(x[1]),family:'combo'};
    const c=COUNT_MARKETS[m.betId];if(c&&m.market===c.name&&(x=/^Over (\d+\.5)$/.exec(m.selection)))return {kind:'statOver',period:'full',line:Number(x[1]),field:c.field,team:c.team,family:c.family};return null;}
function countInput(spec,row){const sides=spec.team?[spec.team]:['home','away'],samples=sides.map(side=>row.profiles?.[side]?.stats?.[spec.field]);
    if(samples.some(s=>!s||s.games<8||!Number.isFinite(s.mean)||s.mean<0))return null;
    const lambda=samples.reduce((sum,s)=>sum+s.mean,0);if(lambda>150)return null;
    return {lambda,samples:Object.fromEntries(sides.map((side,i)=>[side,samples[i].games]))};}
function probability(spec,row){if(spec.kind==='homeOver'){const g=row.expectedGoals;if(!g||![g.home,g.away].every(n=>Number.isFinite(n)&&n>0))return null;
        // Joint score grid, not multiplication of correlated win/OVER probabilities.
        return M.pairs(g.home,g.away).reduce((p,s)=>p+(s.home>s.away&&s.home+s.away>spec.line?s.p:0),0);}
    const input=countInput(spec,row);if(!input)return null;const maximum=Math.ceil(input.lambda+15*Math.sqrt(input.lambda)+30);
    return M.poisson(input.lambda,maximum).reduce((p,v,n)=>p+(n>spec.line?v:0),0);}
function evaluate(m,spec,p,row,settings,now){const reasons=[],update=Date.parse(row.oddsUpdatedAt),kickoff=Date.parse(row.kickoff);
    if(!['home','away'].every(side=>row.profiles?.[side]?.last20?.games>=M.DATA_POLICY.minimumHistoryMatches&&row.profiles[side].venueSummary?.games>=M.DATA_POLICY.minimumVenueMatches))reasons.push('İki takımda en az 8 geçmiş lig maçı ve 3 ilgili saha maçı gerekli');
    if(!Number.isFinite(kickoff)||kickoff<=now.getTime()+30*60000)reasons.push('Maç başlamış veya başlangıca 30 dakikadan az kalmış');
    if(!Number.isFinite(update)||update>now.getTime()+60000||update>=kickoff||now.getTime()-update>settings.maxOddsAgeHours*3600000)reasons.push('Oran zaman damgası eski/geçersiz veya maç öncesi değil');
    if(!Number.isFinite(m.odd)||m.odd<settings.minLegOdd||m.odd>settings.maxLegOdd)reasons.push('Ayak oran aralığı dışında');
    if(!Number.isFinite(p)||p<0||p>1+1e-9)reasons.push(spec.kind==='statOver'?'Her kullanılan takımda en az 8 dolu istatistik kaydı gerekli':'Market için yeterli gol/yarı verisi yok');
    else if(p*100<settings.minModelProbability)reasons.push('Ham model alt sınırı altında');
    const edge=Number.isFinite(p)?p*100-100/m.odd:null;if(edge!==null&&edge<settings.minEdgePP)reasons.push('Model/piyasa farkı sınırın altında');
    const families=settings.marketFamilies||[];
    if(spec.kind==='homeOver'&&(!families.includes('result')||!families.includes('goals'))||!['homeOver','statOver'].includes(spec.kind)&&!families.includes(spec.family)||spec.family==='corners'&&!families.includes('corners'))reasons.push('Market ailesi ayarlardan kapalı');
    const score=Number.isFinite(m.dataScore)?m.dataScore:Math.round((Math.min(row.profiles?.home?.last20?.games||0,row.profiles?.away?.last20?.games||0)/20*.6+Math.min(row.profiles?.home?.venueSummary?.games||0,row.profiles?.away?.venueSummary?.games||0)/10*.4)*100);
    const input=spec.kind==='statOver'?countInput(spec,row):null;
    return {...m,spec:clone(spec),modelProbability:p,edgePP:edge,dataScore:score,eligible:reasons.length===0,reasons,modelVersion:VERSION,experimental:spec.kind==='statOver',method:spec.kind==='statOver'?'count-poisson-diagnostic':spec.kind==='homeOver'?'joint-goal-grid':'existing-goal-model',...(input?{statInput:input}:{})};}
function analyse(row,settings,now){const evaluated=[],memo=new Map();
    for(const m of row.markets||[]){const spec=retained(m.spec)?m.spec:extraSpec(m);if(!spec)continue;let p=m.modelProbability;
        if(['homeOver','statOver'].includes(spec.kind)){const key=JSON.stringify(spec);if(!memo.has(key))memo.set(key,probability(spec,row));p=memo.get(key);}
        evaluated.push(evaluate(m,spec,p,row,settings,now));}
    const core=evaluated.filter(m=>m.eligible&&!m.experimental).sort(C.rank),pick=core[0]||null;
    const nearbyOver=pick&&['winner','doubleChance'].includes(pick.spec.kind)?core.find(m=>['total','teamTotal'].includes(m.spec.kind)&&m.spec.direction==='over'&&Math.abs(m.modelProbability-pick.modelProbability)*100<=CLOSE_OVER_PP+1e-9)||null:null;
    const experimental=[];for(const family of ['corners','shots','onTarget']){const best=evaluated.filter(m=>m.eligible&&m.experimental&&m.spec.family===family).sort(C.rank)[0];if(best)experimental.push(best);}
    return {version:VERSION,capturedAt:row.capturedAt,oddsUpdatedAt:row.oddsUpdatedAt,status:pick?'selected':'pas',pick:pick&&clone(pick),nearbyOver:nearbyOver&&clone(nearbyOver),experimental:clone(experimental),results:{},
        inspected:evaluated.length,qualified:core.length,experimentalInspected:evaluated.filter(m=>m.experimental).length,
        reasons:pick?[]:[...new Set(evaluated.flatMap(m=>m.reasons))].slice(0,8),
        rejected:evaluated.filter(m=>!m.eligible).map(m=>({key:m.key,betId:m.betId,selection:m.selection,spec:m.spec,odd:m.odd,modelProbability:m.modelProbability,reasons:m.reasons})),
        unsupportedShotQuotes:(row.markets||[]).filter(m=>m.betId===276).length,
        policy:{nearbyOverPP:CLOSE_OVER_PP,core:'full-result-dc/all-supported-over/btts/home-over-combo',statistics:'8+ samples; half-lines only; diagnostic; not mixed into goal ranking'},
        disclaimer:'Salt okunur deneysel LAB. Ana kupon, Güç LAB, manuel seçimler ve Telegram değişmez. Ham yüzdeler doğrulanmış başarı oranı değildir.'};}
function selections(row){const lab=row.marketLab;if(lab?.version!==VERSION)return [];const list=[lab.pick,lab.nearbyOver,...(lab.experimental||[])].filter(Boolean);return [...new Map(list.map(m=>[m.key,m])).values()];}
function actual(f){const stats={};for(const side of ['home','away']){const id=f.teams?.[side]?.id,records=(f.statistics||[]).filter(t=>t.team?.id===id);
    stats[side]={};if(!Number.isInteger(id)||records.length!==1)continue;
    for(const field of ['Corner Kicks','Total Shots','Shots on Goal']){const values=(records[0].statistics||[]).filter(s=>s.type===field),n=values.length===1?M.finite(values[0].value):null;if(Number.isInteger(n)&&n>=0)stats[side][field]=n;}}
    return {status:f.fixture?.status?.short||null,fulltime:M.validScore(f.score?.fulltime)?clone(f.score.fulltime):null,halftime:M.validScore(f.score?.halftime)?clone(f.score.halftime):null,stats};}
function settle(pick,f){const spec=pick.spec,a=actual(f),status=a.status;
    if(spec.kind==='statOver'){if(status!=='FT')return {status:'pending',reason:'Kesin normal süre istatistiği bekleniyor; uzatma sayıları kullanılmaz'};
        const sides=spec.team?[spec.team]:['home','away'],values=sides.map(side=>a.stats[side][spec.field]);
        if(values.some(n=>!Number.isInteger(n)))return {status:'pending',reason:'Kesin takım kimlikli istatistik eksik; eksik değer sıfır sayılmaz'};
        const n=values.reduce((sum,v)=>sum+v,0),won=n>spec.line;return {status:won?'won':'lost',won,statValue:n,score:a.fulltime?`${a.fulltime.home}-${a.fulltime.away}`:null,profitUnits:won?pick.odd-1:-1};}
    if(spec.kind==='homeOver'){if(!['FT','AET','PEN'].includes(status)||!a.fulltime)return {status:'pending',reason:'Kesin normal süre skoru bekleniyor'};
        const {home:h,away:b}=a.fulltime,won=h>b&&h+b>spec.line;return {status:won?'won':'lost',won,score:`${h}-${b}`,profitUnits:won?pick.odd-1:-1};}
    return M.settle(pick,f);}
function summary(session){const rows=(session?.candidates||[]).filter(r=>r.marketLab?.version===VERSION),counts={core:{total:0,won:0,lost:0,pending:0},statistics:{total:0,won:0,lost:0,pending:0}};
    for(const row of rows)for(const m of selections(row)){const group=m.experimental?counts.statistics:counts.core;group.total++;const status=row.marketLab.results?.[m.key]?.status;group[['won','lost'].includes(status)?status:'pending']++;}
    return {available:rows.length>0,fixtures:rows.length,version:VERSION,...counts,disclaimer:'Market LAB seçenekleri ana model ve kupon sonuçlarından ayrıdır; bir maçın farklı marketleri bağımsız örnek değildir.'};}
module.exports={VERSION,CLOSE_OVER_PP,retained,extraSpec,probability,evaluate,analyse,selections,actual,settle,summary};
