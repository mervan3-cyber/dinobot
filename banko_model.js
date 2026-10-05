'use strict';
// Transparent, uncalibrated LAB baselines. Never calls a provider or a messaging client.
const VERSION='banko-model-lab-v1-2026-10-05';
const finite=value=>value===null||value===undefined||typeof value==='boolean'||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null;
const mean=values=>values.length?values.reduce((s,v)=>s+v,0)/values.length:null;
const normalize=value=>String(value??'').toLowerCase().replace(/\s+/g,' ').trim();
const resultCode=value=>({home:'1',draw:'X',away:'2','1':'1',x:'X','0':'X','2':'2'})[normalize(value)]||null;
const dcCode=value=>({'home/draw':'1X','home/away':'12','draw/away':'X2','1x':'1X','12':'12','x2':'X2'})[normalize(value)]||null;
const htftCode=value=>{const parts=String(value).split('/').map(resultCode);return parts.length===2&&parts.every(Boolean)?parts.join('/'):null;};
function totalCode(value){const m=/^(over|under) (\d+(?:\.\d+)?)$/i.exec(String(value).trim());if(!m)return null;const line=Number(m[2]);return line>0&&line<40&&line%1===.5?{direction:m[1].toLowerCase(),line}:null;}
function validScore(value){return value&&Number.isInteger(value.home)&&value.home>=0&&Number.isInteger(value.away)&&value.away>=0;}
function pastFixture(f,cutoff){
    const date=Date.parse(f.fixture?.date);
    if(f.fixture?.status?.short!=='FT'||!Number.isFinite(date)||date+3*3600000>=cutoff||!validScore(f.score?.fulltime))return null;
    return {id:f.fixture.id,date:f.fixture.date,homeId:f.teams?.home?.id,awayId:f.teams?.away?.id,homeName:f.teams?.home?.name,awayName:f.teams?.away?.name,
        home:f.score.fulltime.home,away:f.score.fulltime.away,ht:validScore(f.score.halftime)&&f.score.halftime.home<=f.score.fulltime.home&&f.score.halftime.away<=f.score.fulltime.away?f.score.halftime:null};
}
function slimRich(f){
    return {id:f.fixture?.id,statistics:(f.statistics||[]).map(t=>({teamId:t.team?.id,values:Object.fromEntries((t.statistics||[]).map(s=>[s.type,finite(s.value)]))})),
        players:(f.players||[]).flatMap(t=>(t.players||[]).map(p=>{const s=p.statistics?.[0]||{};return {id:p.player?.id,name:p.player?.name,teamId:t.team?.id,minutes:finite(s.games?.minutes),goals:finite(s.goals?.total),shots:finite(s.shots?.total),on:finite(s.shots?.on),yellow:finite(s.cards?.yellow)};}))};
}
function teamProfile(histories,id,venue,rich){
    const all=histories.filter(f=>f.homeId===id||f.awayId===id).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    const rows=all.slice(0,20).map(f=>{const own=f.homeId===id;return {...f,scored:own?f.home:f.away,conceded:own?f.away:f.home,homeVenue:own,firstScored:f.ht?(own?f.ht.home:f.ht.away):null,firstConceded:f.ht?(own?f.ht.away:f.ht.home):null};});
    const homeAway=all.filter(f=>venue==='home'?f.homeId===id:f.awayId===id).slice(0,10).map(f=>({scored:venue==='home'?f.home:f.away,conceded:venue==='home'?f.away:f.home}));
    const summary=list=>({games:list.length,scored:mean(list.map(r=>r.scored)),conceded:mean(list.map(r=>r.conceded)),failedToScore:list.filter(r=>r.scored===0).length,cleanSheets:list.filter(r=>r.conceded===0).length});
    const stats={},fields=['Total Shots','Shots on Goal','shots insidebox','shots outsidebox','Corner Kicks','Yellow Cards','Red Cards','expected_goals'];
    const statRows=rows.slice(0,10).map(r=>rich[r.id]?.statistics?.find(t=>t.teamId===id)?.values||{});
    // API casing is provider-owned. Accept only the exact familiar aliases, never missing -> zero.
    for(const field of fields){const apiField=field==='shots insidebox'?'Shots insidebox':field==='shots outsidebox'?'Shots outsidebox':field;
        const values=statRows.map(s=>s[apiField]).filter(v=>v!==null&&v!==undefined);stats[apiField]={games:values.length,mean:mean(values)};}
    const phases=rows.filter(r=>r.firstScored!==null&&r.firstConceded!==null);
    const players=new Map();for(const r of rows.slice(0,5))for(const p of rich[r.id]?.players||[]){if(p.teamId!==id||!(p.minutes>0))continue;const item=players.get(p.id)||{id:p.id,name:p.name,games:0,minutes:0,goals:0,goalSamples:0,shots:0,shotSamples:0,on:0,onSamples:0};item.games++;item.minutes+=p.minutes;for(const [key,samples] of [['goals','goalSamples'],['shots','shotSamples'],['on','onSamples']])if(p[key]!==null){item[key]+=p[key];item[samples]++;}players.set(p.id,item);}
    return {id,venue,last20:summary(rows),last5:summary(rows.slice(0,5)),venueSummary:summary(homeAway),rows,venueRows:homeAway,stats,
        phases:{games:phases.length,firstScored:mean(phases.map(r=>r.firstScored)),firstConceded:mean(phases.map(r=>r.firstConceded)),secondScored:mean(phases.map(r=>r.scored-r.firstScored)),secondConceded:mean(phases.map(r=>r.conceded-r.firstConceded))},
        players:[...players.values()].sort((a,b)=>b.minutes-a.minutes).slice(0,20)};
}
function shrink(rows,field,prior,n=5){return (rows.reduce((s,r)=>s+r[field],0)+n*prior)/(rows.length+n);}
function expectedGoals(home,away,baseline){
    const lh=baseline.home,la=baseline.away;if(!(lh>0&&la>0))return null;
    const overall=(lh+la)/2,rates={};for(const [side,p] of [['home',home],['away',away]]){
        const own=side==='home'?lh:la,opp=side==='home'?la:lh;
        rates[side]={attack:.6*shrink(p.venueRows,'scored',own)+.4*(.6*shrink(p.rows,'scored',overall)+.4*shrink(p.rows.slice(0,5),'scored',overall)),
            defence:.6*shrink(p.venueRows,'conceded',opp)+.4*(.6*shrink(p.rows,'conceded',overall)+.4*shrink(p.rows.slice(0,5),'conceded',overall))};}
    const clamp=x=>Math.min(3.8,Math.max(.3,x));
    const goals={home:clamp(rates.home.attack*rates.away.defence/lh),away:clamp(rates.away.attack*rates.home.defence/la),rates,phase:null};
    if(home.phases.games>=10&&away.phases.games>=10){
        const share=p=>{const score=p.phases.firstScored+p.phases.secondScored;return score>0?Math.max(.3,Math.min(.6,p.phases.firstScored/score)):.45;};
        goals.phase={homeFirst:goals.home*share(home),awayFirst:goals.away*share(away)};
        goals.phase.homeSecond=goals.home-goals.phase.homeFirst;goals.phase.awaySecond=goals.away-goals.phase.awayFirst;
    }
    return goals;
}
function poisson(lambda,maximum=32){const p=[Math.exp(-lambda)];for(let n=1;n<=maximum;n++)p[n]=p[n-1]*lambda/n;return p;}
function pairs(home,away,maximum=32){const h=poisson(home,maximum),a=poisson(away,maximum);return h.flatMap((p,i)=>a.map((q,j)=>({home:i,away:j,p:p*q})));}
function winner(home,away){return home>away?'1':home===away?'X':'2';}
function predicate(spec,h,a){
    const total=h+a,team=spec.team==='home'?h:a;
    if(spec.kind==='winner')return winner(h,a)===spec.code;
    if(spec.kind==='doubleChance')return spec.code.includes(winner(h,a));
    if(spec.kind==='btts')return (h>0&&a>0)===spec.yes;
    if(spec.kind==='total')return spec.direction==='over'?total>spec.line:total<spec.line;
    if(spec.kind==='teamTotal')return spec.direction==='over'?team>spec.line:team<spec.line;
    if(spec.kind==='cleanSheet')return ((spec.team==='home'?a:h)===0)===spec.yes;
    if(spec.kind==='exact')return h===spec.home&&a===spec.away;
    return false;
}
function specFor(betId,value){
    let code,tc;const period=[6,13,20,31,34].includes(betId)?'first':[3,26,35].includes(betId)?'second':'full';
    if([1,3,13].includes(betId)&&(code=resultCode(value)))return {kind:'winner',code,period,family:'result'};
    if([12,20].includes(betId)&&(code=dcCode(value)))return {kind:'doubleChance',code,period,family:'result'};
    if([5,6,26].includes(betId)&&(tc=totalCode(value)))return {kind:'total',...tc,period,family:period==='full'?'goals':'halves'};
    if([16,17].includes(betId)&&(tc=totalCode(value)))return {kind:'teamTotal',...tc,team:betId===16?'home':'away',period,family:'teamGoals'};
    if([8,34,35].includes(betId)&&['yes','no'].includes(normalize(value)))return {kind:'btts',yes:normalize(value)==='yes',period,family:'btts'};
    if([27,28].includes(betId)&&['yes','no'].includes(normalize(value)))return {kind:'cleanSheet',yes:normalize(value)==='yes',team:betId===27?'home':'away',period,family:'teamGoals'};
    if([10,31].includes(betId)){const m=/^(\d+)[:\-](\d+)$/.exec(String(value).replace(/\s/g,''));if(m)return {kind:'exact',home:Number(m[1]),away:Number(m[2]),period,family:'goals'};}
    if(betId===7&&(code=htftCode(value)))return {kind:'htft',code,period,family:'halves'};
    if(betId===11){const key=normalize(value);code={'1st half':'first','first half':'first','2nd half':'second','second half':'second',draw:'equal','equal':'equal'}[key];if(code)return {kind:'highestHalf',code,period,family:'halves'};}
    if(betId===45&&(tc=totalCode(value)))return {kind:'corners',...tc,period:'full',family:'corners'};
    // Ambiguous combination labels, Asian pushes/quarters and bookmaker-specific card/player rules stay LAB-only.
    return null;
}
function probability(spec,g,home,away){
    if(!g)return null;
    if(spec.kind==='corners'){
        const x=home.stats['Corner Kicks'],y=away.stats['Corner Kicks'];if(x.games<8||y.games<8||x.mean===null||y.mean===null)return null;
        // Count Poisson is a diagnostic only: corners are overdispersed; no calibrated corner selection yet.
        const p=poisson(x.mean+y.mean,100);return p.reduce((s,v,n)=>s+((spec.direction==='over'?n>spec.line:n<spec.line)?v:0),0);
    }
    if((spec.period!=='full'||['htft','highestHalf'].includes(spec.kind))&&!g.phase)return null;
    if(['htft','highestHalf'].includes(spec.kind)){
        const first=pairs(g.phase.homeFirst,g.phase.awayFirst,14),second=pairs(g.phase.homeSecond,g.phase.awaySecond,14);let total=0;
        for(const a of first)for(const b of second){const yes=spec.kind==='htft'?`${winner(a.home,a.away)}/${winner(a.home+b.home,a.away+b.away)}`===spec.code:spec.code==='first'?a.home+a.away>b.home+b.away:spec.code==='second'?a.home+a.away<b.home+b.away:a.home+a.away===b.home+b.away;if(yes)total+=a.p*b.p;}
        return total;
    }
    const h=spec.period==='first'?g.phase.homeFirst:spec.period==='second'?g.phase.homeSecond:g.home;
    const a=spec.period==='first'?g.phase.awayFirst:spec.period==='second'?g.phase.awaySecond:g.away;
    return pairs(h,a).reduce((s,r)=>s+(predicate(spec,r.home,r.away)?r.p:0),0);
}
function parseMarkets(rows,fixtureId,bookmakerId=8){
    const matching=(Array.isArray(rows)?rows:[]).filter(r=>Number(r.fixture?.id)===Number(fixtureId)&&(r.bookmakers||[]).some(b=>Number(b.id)===bookmakerId));
    matching.sort((a,b)=>(Date.parse(b.update)||0)-(Date.parse(a.update)||0));const row=matching[0];if(!row)return {update:null,bookmaker:null,markets:[]};
    const b=row.bookmakers.find(b=>Number(b.id)===bookmakerId),map=new Map();
    for(const bet of b.bets||[])for(const v of bet.values||[]){const odd=finite(v.odd);if(!(odd>1))continue;const key=bet.id+'|'+v.value;if(!map.has(key))map.set(key,{key,betId:Number(bet.id),market:String(bet.name),selection:String(v.value),odd,spec:specFor(Number(bet.id),v.value)});}
    return {update:row.update||null,bookmaker:{id:bookmakerId,name:b.name},markets:[...map.values()]};
}
function evaluateMarkets(odds,goals,profiles,settings,now,kickoff){
    const sufficient=profiles.home.last20.games>=10&&profiles.away.last20.games>=10&&profiles.home.venueSummary.games>=5&&profiles.away.venueSummary.games>=5;
    const update=Date.parse(odds.update),validTime=Number.isFinite(update)&&update<=now.getTime()+60000&&update<Date.parse(kickoff)&&now.getTime()-update<=settings.maxOddsAgeHours*3600000;
    const memo=new Map();return odds.markets.map(m=>{
        const reasons=[];if(!m.spec)reasons.push('Bu marketin kuralı/oyuncu kimliği henüz doğrulanmadı; yalnız analiz');
        const key=m.spec?JSON.stringify(m.spec):m.key;let p=null;if(m.spec){if(!memo.has(key))memo.set(key,probability(m.spec,goals,profiles.home,profiles.away));p=memo.get(key);}
        if(p===null&&m.spec)reasons.push('Market için yeterli gol/yarı/istatistik örneklemi yok');
        if(!sufficient)reasons.push('İki takımda 10 geçmiş lig maçı ve 5 saha maçı gerekli');
        if(!validTime)reasons.push('Oran zaman damgası eski/geçersiz veya maç öncesi değil');
        if(m.spec?.kind==='corners')reasons.push('Korner tahmini deneysel; aşırı saçılım kalibre edilene kadar kupona alınmaz');
        if(m.odd<settings.minLegOdd||m.odd>settings.maxLegOdd)reasons.push('Ayak oran aralığı dışında');
        if(p!==null&&p*100<settings.minModelProbability)reasons.push('Deneysel ham model alt sınırı altında');
        const edge=p===null?null:p*100-100/m.odd;if(edge!==null&&edge<settings.minEdgePP)reasons.push('Deneysel model/piyasa farkı sınırın altında');
        if(m.spec&&!settings.marketFamilies.includes(m.spec.family))reasons.push('Bu market ailesi ayarlardan kapalı');
        const score=Math.round((Math.min(profiles.home.last20.games,profiles.away.last20.games)/20*.6+Math.min(profiles.home.venueSummary.games,profiles.away.venueSummary.games)/10*.4)*100);
        return {...m,modelProbability:p,edgePP:edge,dataScore:score,eligible:!reasons.length,reasons,modelVersion:VERSION};
    });
}
function optimize(rows,settings,sessionId){
    const options=rows.filter(r=>r.pick).sort((a,b)=>b.pick.modelProbability-a.pick.modelProbability||b.pick.dataScore-a.pick.dataScore||a.fixtureId-b.fixtureId),pairsFound=[];
    for(let a=0;a<options.length;a++)for(let b=a+1;b<options.length;b++){const x=options[a],y=options[b],odd=x.pick.odd*y.pick.odd;if(odd>=settings.minCouponOdd&&odd<=settings.maxCouponOdd)pairsFound.push({rows:[x,y],odd,rank:x.pick.modelProbability*y.pick.modelProbability});}
    pairsFound.sort((a,b)=>b.rank-a.rank||a.odd-b.odd);const selected=[],used=new Set();
    for(const pair of pairsFound){if(pair.rows.some(r=>used.has(r.fixtureId)))continue;selected.push(pair.rows);pair.rows.forEach(r=>used.add(r.fixtureId));if(selected.length>=settings.maxCoupons)break;}
    if(!selected.length){const single=options.find(r=>r.pick.odd>=settings.minSingleOdd&&r.pick.odd<=settings.maxSingleOdd);if(single)selected.push([single]);}
    return selected.map((legs,i)=>({id:sessionId+':coupon-'+(i+1),createdAt:rows[0]?.capturedAt,modelVersion:VERSION,
        legs:legs.map(r=>({fixtureId:r.fixtureId,match:r.match,kickoff:r.kickoff,league:r.league,pick:JSON.parse(JSON.stringify(r.pick)),result:{status:'pending'}})),
        originalOdd:legs.reduce((p,r)=>p*r.pick.odd,1),independenceModelProduct:legs.reduce((p,r)=>p*r.pick.modelProbability,1),check:{status:'waiting',history:[]},result:{status:'pending'}}));
}
function settle(pick,f){
    const status=f?.fixture?.status?.short;
    if(!['FT','AET','PEN'].includes(status)||!validScore(f.score?.fulltime))return {status:'pending',reason:'Kesin normal süre skoru bekleniyor'};
    const spec=pick.spec;if(!spec)return {status:'pending',reason:'Market kuralı doğrulanmadı'};
    const ft=f.score.fulltime,ht=f.score.halftime;let h=ft.home,a=ft.away;
    if(spec.period!=='full'||['htft','highestHalf'].includes(spec.kind)){if(!validScore(ht)||ht.home>h||ht.away>a)return {status:'pending',reason:'İlk yarı/normal süre skorları eksik veya tutarsız'};}
    let won;if(spec.kind==='corners'){
        if(status!=='FT')return {status:'pending',reason:'Korner istatistiği uzatmayı içerebilir; elle inceleme gerekli'};
        const values=(f.statistics||[]).map(t=>finite((t.statistics||[]).find(s=>s.type==='Corner Kicks')?.value));if(values.length!==2||values.some(v=>v===null))return {status:'pending',reason:'Korner sayısı eksik'};const n=values[0]+values[1];won=spec.direction==='over'?n>spec.line:n<spec.line;
    }else if(spec.kind==='htft')won=`${winner(ht.home,ht.away)}/${winner(h,a)}`===spec.code;
    else if(spec.kind==='highestHalf'){const first=ht.home+ht.away,second=h+a-first;won=spec.code==='first'?first>second:spec.code==='second'?second>first:first===second;}
    else {if(spec.period==='first'){h=ht.home;a=ht.away;}else if(spec.period==='second'){h-=ht.home;a-=ht.away;}won=predicate(spec,h,a);}
    return {status:won?'won':'lost',score:ft.home+'-'+ft.away,won,profitUnits:won?pick.odd-1:-1};
}
module.exports={VERSION,finite,mean,normalize,validScore,pastFixture,slimRich,teamProfile,expectedGoals,poisson,pairs,predicate,specFor,probability,parseMarkets,evaluateMarkets,optimize,settle};
