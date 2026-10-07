(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BankoChoices=api;})(typeof window!=='undefined'?window:globalThis,function(){
    'use strict';
    const VERSION='banko-choices-v1-2026-10-07';
    function outcomeKey(m){
        if(!m?.spec||typeof m.spec!=='object')return null;
        let s={...m.spec};delete s.family;
        // Exact identities, not correlated predictions. Scope/period must still match.
        if(s.kind==='cleanSheet')s={kind:'teamTotal',period:s.period,team:s.team==='home'?'away':'home',direction:s.yes?'under':'over',line:.5};
        if(s.kind==='total'&&s.direction==='under'&&s.line===.5)s={kind:'exact',period:s.period,home:0,away:0};
        return JSON.stringify(Object.keys(s).sort().map(k=>[k,s[k]]));
    }
    const sameOutcome=(a,b)=>!!outcomeKey(a)&&outcomeKey(a)===outcomeKey(b);
    function accepted(m,settings){
        if(!outcomeKey(m)||m.eligible!==true||!Array.isArray(m.reasons)||m.reasons.length)return false;
        if(!Number.isFinite(m.modelProbability)||m.modelProbability<0||m.modelProbability>1||!Number.isFinite(m.odd)||m.odd<=1||!Number.isFinite(m.dataScore)||!Number.isFinite(m.edgePP))return false;
        return !settings||(m.odd>=settings.minLegOdd&&m.odd<=settings.maxLegOdd&&m.modelProbability*100>=settings.minModelProbability&&m.edgePP>=settings.minEdgePP&&(!Array.isArray(settings.marketFamilies)||settings.marketFamilies.includes(m.spec.family)));
    }
    const rank=(a,b)=>b.modelProbability-a.modelProbability||b.dataScore-a.dataScore||(Number(a.betId)||0)-(Number(b.betId)||0)||String(a.selection).localeCompare(String(b.selection));
    function alternative(row,settings){if(!outcomeKey(row.pick))return null;return (row.markets||[]).filter(m=>m.key!==row.pick.key&&!sameOutcome(m,row.pick)&&accepted(m,settings)).sort(rank)[0]||null;}
    function priceCheck(row,m,settings,odd,now){
        const priceReasons=new Set(['Ayak oran aralığı dışında','Deneysel model/piyasa farkı sınırın altında']);
        const reasons=(Array.isArray(m?.reasons)?m.reasons:[]).filter(r=>!priceReasons.has(r));
        if(!m?.spec||!Number.isFinite(m.modelProbability)||m.modelProbability<0||m.modelProbability>1||!Number.isFinite(m.dataScore)||!Array.isArray(m.reasons))reasons.push('Kayıtlı model/veri şartları sağlanmıyor');
        if(Number.isFinite(m?.modelProbability)&&m.modelProbability*100<settings.minModelProbability)reasons.push('Deneysel ham model alt sınırı altında');
        if(m?.spec&&!settings.marketFamilies.includes(m.spec.family))reasons.push('Bu market ailesi ayarlardan kapalı');
        if(m?.spec?.kind==='corners')reasons.push('Korner seçimi deneysel; sonuçlandırma onayı yok');
        if(m?.eligible!==true&&!m?.reasons?.length)reasons.push('Kayıtlı seçim şartları sağlanmıyor');
        if(!Number.isFinite(odd)||odd<=1)reasons.push('Kontrol edilecek oran 1’den büyük olmalı');
        else if(odd<settings.minLegOdd||odd>settings.maxLegOdd)reasons.push('Girilen oran kayıtlı ayak aralığı dışında');
        const edge=Number.isFinite(m?.modelProbability)&&Number.isFinite(odd)&&odd>1?m.modelProbability*100-100/odd:null;
        if(edge!==null&&edge<settings.minEdgePP)reasons.push('Girilen fiyatta ham model/piyasa farkı sınır altında');
        if(now){
            const time=now instanceof Date?now.getTime():Number(now),kickoff=Date.parse(row.kickoff),update=Date.parse(row.oddsUpdatedAt);
            if(!Number.isFinite(kickoff)||kickoff<=time+30*60000)reasons.push('Maç başladı veya başlangıca 30 dakikadan az kaldı');
            if(!Number.isFinite(update)||update>time+60000||update>=kickoff||time-update>settings.maxOddsAgeHours*3600000)reasons.push('Kayıt oranı eski/geçersiz; bu işlem yeni maç önü kontrolü değildir');
        }
        return {eligible:!reasons.length,reasons:[...new Set(reasons)],edgePP:edge,odd,modelProbability:m?.modelProbability??null,referenceOdd:m?.odd??null,referenceOnly:true};
    }
    function marketLabel(m){
        if(!m)return 'Seçim yok';
        const s=m.spec,selection=String(m.selection||''),total=/^(Over|Under) (\d+(?:\.\d+)?)$/.exec(selection);
        const value=total?`${total[2]} ${total[1]==='Over'?'ÜST':'ALT'}`:({Home:'1',Draw:'X',Away:'2',Yes:'VAR',No:'YOK','Home/Draw':'1X','Home/Away':'12','Draw/Away':'X2'})[selection]||selection;
        const period=s?.period==='first'?'İLK YARI':s?.period==='second'?'İKİNCİ YARI':'MAÇ';
        if(s?.kind==='teamTotal')return `${period} · ${s.team==='home'?'EV SAHİBİ':'DEPLASMAN'} takım golü · ${value}`;
        if(s?.kind==='cleanSheet')return `${period} · ${s.team==='home'?'EV SAHİBİ':'DEPLASMAN'} gol yemez · ${s.yes?'EVET':'HAYIR'}`;
        if(s?.kind==='htft')return 'İLK YARI / MAÇ SONUCU · '+s.code.replace(/X/g,'0');
        if(s?.kind==='highestHalf')return 'EN GOLLÜ YARI · '+({first:'İlk yarı',second:'İkinci yarı',equal:'Eşit'})[s.code];
        const kind={winner:'Sonuç',doubleChance:'Çifte şans',total:'TOPLAM gol',btts:'KG',exact:'Kesin skor',corners:'Toplam korner'}[s?.kind];
        if(s?.kind==='btts')return `${period} · KG · ${s.yes?'VAR':'YOK'}`;
        return kind?`${period} · ${kind} · ${s.kind==='doubleChance'?s.code:value}`:`${m.market||'Kuralı doğrulanmamış market'} · ${value}`;
    }
    return {VERSION,outcomeKey,sameOutcome,accepted,rank,alternative,priceCheck,marketLabel};
});
