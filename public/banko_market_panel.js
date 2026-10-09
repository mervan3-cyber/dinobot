(function(){'use strict';
    const C=window.BankoChoices,el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
    const num=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—',opened=new Set();
    function label(m){const s=m.spec;if(s.kind==='homeOver')return 'MAÇ · MS1 + '+s.line+' ÜST';
        if(s.kind==='statOver')return 'MAÇ · '+(s.team==='home'?'Ev ':s.team==='away'?'Dep. ':'Toplam ')+({'Corner Kicks':'korner','Total Shots':'şut','Shots on Goal':'isabetli şut'}[s.field]||s.field)+' · '+s.line+' ÜST';return C.marketLabel(m);}
    function selection(m,title,lab){const box=el('section',undefined,'banko-market-choice'+(m.experimental?' banko-market-experimental':''));
        box.append(el('small',title),el('h4',label(m)));const line=el('p',undefined,'banko-market-quote');line.append(el('strong','Oran '+num(m.odd)),el('span','Ham model %'+num(m.modelProbability*100,1)));box.appendChild(line);
        box.appendChild(el('p','Model − piyasa farkı '+num(m.edgePP,1)+' puan.'));
        if(m.statInput)box.appendChild(el('p','İstatistik ortalaması '+num(m.statInput.lambda)+' · dolu kayıt '+Object.entries(m.statInput.samples).map(([side,n])=>(side==='home'?'ev':'dep.')+' '+n+'/10').join(' / ')));
        const r=lab.results?.[m.key],state=r?.status||'pending',result=el('p',({won:'Kazandı',lost:'Kaybetti',pending:'Sonuç bekliyor'})[state]||'Sonuç bekliyor','banko-market-result');result.dataset.result=state;
        if(r?.score)result.textContent+=' · normal süre '+r.score;if(Number.isFinite(r?.statValue))result.textContent+=' · gerçekleşen '+r.statValue;box.appendChild(result);
        if(r?.reason)box.appendChild(el('small',r.reason));return box;}
    function card(row,sessionId=''){const lab=row.marketLab,details=el('details',undefined,'banko-market-card'),key=JSON.stringify([sessionId,row.fixtureId]);
        details.appendChild(el('summary','Market LAB · '+(lab?.pick?label(lab.pick)+' @ '+num(lab.pick.odd):lab?'Gol/sonuç seçimi PAS':'Bu sürümde yok')));
        details.open=opened.has(key);details.ontoggle=()=>{if(details.open)opened.add(key);else opened.delete(key);};
        if(!lab){details.appendChild(el('p','Bu kayıt sonradan değiştirilmez. Market LAB açıkken yeni manuel tarama oluşturun.'));return details;}
        const grid=el('div',undefined,'banko-market-grid');if(lab.pick)grid.appendChild(selection(lab.pick,'MARKET LAB SEÇİMİ',lab));else grid.appendChild(el('p','Veri/oran/model koşullarını geçen gol/sonuç seçimi yok; tahmin zorlanmadı. '+(lab.reasons||[]).join(' · ')));
        if(lab.nearbyOver)grid.appendChild(selection(lab.nearbyOver,'YAKIN ÜST · en fazla 3 yüzde puan fark',lab));details.appendChild(grid);
        if(lab.nearbyOver)details.appendChild(el('p','Yakın ÜST kendi eşiklerini de geçti. Ayrı bir alternatif; çifte şansla birleşik bahis veya sigorta değildir.','banko-market-muted'));
        const stats=el('section',undefined,'banko-market-stats');stats.appendChild(el('h4','Korner / şut · deneysel istatistik seçenekleri'));
        if(lab.experimental?.length){const choices=el('div',undefined,'banko-market-grid');for(const m of lab.experimental)choices.appendChild(selection(m,'DENEYSEL · kupona alınmaz',lab));stats.appendChild(choices);}
        else stats.appendChild(el('p','Doğrulanmış market adı, en az 8 dolu kayıt ve aynı oran/model eşiklerini geçen istatistik seçeneği yok.'));
        stats.appendChild(el('small','Sayı-Poisson tanısı kalibre edilmedi; rakibin verdiği korner/şut etkisi modellenmez. Gol marketleriyle aynı sıralamaya sokulmaz. Kesin istatistik gelmezse sonuç bekler; ek istatistik API isteği yapılmaz.'));details.appendChild(stats);
        if(lab.unsupportedShotQuotes)details.appendChild(el('p','Oyuncu/takım şutu adı belirsiz '+lab.unsupportedShotQuotes+' oran kaydı kullanılmadı. “Away Player Shots Total” takım şutu kabul edilmez.','banko-market-muted'));
        const method=el('details');method.append(el('summary','Kapsam ve elenen seçenekler'),el('p','Maç sonucu / maç çifte şansı, desteklenen tüm ÜST ve KG VAR/YOK; doğrulanmış MS1 + ÜST. İlk yarı çifte şansı ve ALT seçenekleri yok. Mevcut gol modeli aynı kaldı. '+lab.inspected+' market incelendi; '+lab.qualified+' gol/sonuç marketi eşikleri geçti.'));
        for(const m of (lab.rejected||[]).slice(0,40))method.appendChild(el('p',m.selection+' @ '+num(m.odd)+' · '+m.reasons.join(' · ')));
        if(lab.rejected?.length>40)method.appendChild(el('small','Diğer elenme kayıtları Banko JSON çıktısında korunur.'));details.appendChild(method);
        details.appendChild(el('p',lab.disclaimer,'banko-market-muted'));return details;}
    function render(data){const box=document.getElementById('banko-market-summary');if(!box)return;const s=data.marketComparison;
        box.textContent=s?.available?`Market LAB · ${s.fixtures} analiz · gol/sonuç: ${s.core.total} seçenek (${s.core.won} K / ${s.core.lost} Y / ${s.core.pending} bekleyen) · istatistik: ${s.statistics.total} deneysel seçenek. Ayrı takip; ana başarıya eklenmez.`:'Market LAB yeni taramalarda analizlerin içinde görünür; eski kayıtlar değiştirilmez.';}
    window.BankoMarketPanel={card,render,label};
})();
