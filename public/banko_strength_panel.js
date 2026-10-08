(function(){'use strict';
    const C=window.BankoChoices,$=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
    const num=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—',status=r=>({won:'Kazandı',lost:'Kaybetti',pending:'Bekliyor'})[r?.status]||'Bekliyor';
    const diff=r=>!!r.pick!==!!r.strengthLab?.pick||!!r.pick&&!!r.strengthLab?.pick&&!C.sameOutcome(r.pick,r.strengthLab.pick);
    let latest=null,page=0,bound=false;const opened=new Set();
    function table(heads,rows){const wrap=el('div',undefined,'table-wrap'),t=el('table'),head=el('thead'),h=el('tr');heads.forEach(v=>h.appendChild(el('th',v)));head.appendChild(h);t.appendChild(head);const body=el('tbody');for(const values of rows){const tr=el('tr');values.forEach(v=>tr.appendChild(el('td',v)));body.appendChild(tr);}t.appendChild(body);wrap.appendChild(t);return wrap;}
    function modelBox(name,pick,goals,result,reasons){const box=el('section',undefined,'banko-strength-model');box.appendChild(el('small',name));box.appendChild(el('h4',pick?C.marketLabel(pick):'PAS'));
        const line=el('p',undefined,'banko-strength-quote');line.append(el('strong',pick?'Oran '+num(pick.odd):'Seçim yok'),el('span',pick?'Ham model %'+num(pick.modelProbability*100,1):''));box.appendChild(line);
        const sum=goals&&Number.isFinite(goals.home)&&Number.isFinite(goals.away)?goals.home+goals.away:null;
        box.appendChild(el('p','Beklenen gol: '+num(goals?.home)+' ev / '+num(goals?.away)+' dep. · toplam '+num(sum)));
        if(pick){const item=el('p','Sonuç: '+status(result)+(result?.score?' · normal süre '+result.score:''),'banko-strength-result');item.dataset.result=result?.status||'pending';box.appendChild(item);}
        else if(reasons?.length)box.appendChild(el('p',reasons.join(' · '),'banko-strength-muted'));return box;}
    function card(row,sessionId=''){const lab=row.strengthLab,details=el('details',undefined,'banko-strength-card'),hasLab=!!lab,heading=el('summary','Güç LAB karşılaştırması · '+(!hasLab?'Bu sürümde yok':diff(row)?'Farklı seçim':'Aynı seçim / iki model de PAS'));
        const key=JSON.stringify([sessionId,row.id||row.fixtureId]);details.open=opened.has(key);details.ontoggle=()=>{if(details.open)opened.add(key);else opened.delete(key);};details.appendChild(heading);
        if(!hasLab){details.appendChild(el('p','Bu eski sürüme sonradan LAB tahmini eklenmez. Güç LAB açıkken yeni manuel tarama oluşturun.'));return details;}
        const pair=el('div',undefined,'banko-strength-pair');pair.append(modelBox('MEVCUT MODEL',row.pick,row.expectedGoals,row.marketResults?.[row.pick?.key],row.reasons),modelBox('GÜÇ LAB · DENEYSEL',lab.pick,lab.expectedGoals,lab.results?.main,lab.reasons));details.appendChild(pair);
        details.appendChild(el('p',lab.pick?'Güç LAB, rakiplere göre düzeltilmiş gol hızlarıyla aynı seçim eşiklerini uyguladı.':'Güç LAB seçim zorlamadı; eksik örneklem veya market eşikleri nedeniyle PAS olabilir.','banko-strength-muted'));
        if(lab.backup)details.appendChild(el('p','LAB yedek: '+C.marketLabel(lab.backup)+' @ '+num(lab.backup.odd)+' · '+status(lab.results?.backup)));
        if(lab.strengths){const h=lab.strengths.home,a=lab.strengths.away;details.appendChild(table(['Takım','Hücum endeksi','Gol yeme endeksi','Güç endeksi','Maç / ağırlıklı'],[[row.home.name,h.attackIndex,h.concedingIndex,h.powerIndex,h.games+' / '+num(h.effectiveMatches)],[row.away.name,a.attackIndex,a.concedingIndex,a.powerIndex,a.games+' / '+num(a.effectiveMatches)]]));}
        if(row.apiPrediction?.percent){const p=row.apiPrediction.percent;details.appendChild(el('p','API maç sonucu: ev '+(p.home||'—')+' / beraberlik '+(p.draw||'—')+' / dep. '+(p.away||'—')+' · yalnız bağlam, LAB onayı değil.','banko-strength-muted'));}
        const method=el('details'),title=el('summary','Hesap ve kayıt bilgisi');method.appendChild(title);method.appendChild(el('p','Lig ortalaması 100. Hücum endeksinde yüksek, gol yeme endeksinde düşük değer güçlüdür. Güç endeksi hücum/gol yeme oranıdır; kazanma yüzdesi değildir. Eski maçların ağırlığı 180 günde yarıya iner; küçük örneklem lig ortalamasına dengelenir. Yarı gol payları mevcut modelle aynıdır.'));
        method.appendChild(el('p','Veri kesimi: '+(lab.inputCutoffDay||'—')+' · lig geçmişi '+lab.historyMatches+' maç · model '+lab.version+' · kayıt '+(lab.capturedAt||'—')));details.appendChild(method);
        details.appendChild(el('p','Ham model yüzdesi kalibre edilmiş başarı oranı değildir. Salt okunur LAB: ana kupon, manuel liste ve Telegram değişmez.','banko-strength-muted'));return details;}
    function renderRows(){const list=$('banko-strength-list');if(!list)return;list.replaceChildren();const query=($('banko-strength-search')?.value||'').toLocaleLowerCase('tr-TR'),only=$('banko-strength-different')?.checked;
        const rows=C.displayRows(latest?.session?.candidates||[],!!$('banko-strength-show-pas')?.checked,query).filter(r=>!only||r.strengthLab&&diff(r)),pages=Math.max(1,Math.ceil(rows.length/10));page=Math.min(page,pages-1);
        for(const row of rows.slice(page*10,page*10+10)){const box=el('article',undefined,'banko-strength-row');box.appendChild(el('h4',row.match+' · '+row.league));box.appendChild(card(row,latest.session.id));list.appendChild(box);}
        if(!rows.length)list.appendChild(el('p','Bu filtreyle gösterilecek karşılaştırma yok.'));$('banko-strength-page').textContent='Sayfa '+(page+1)+'/'+pages+' · '+rows.length+' maç';$('banko-strength-prev').disabled=page===0;$('banko-strength-next').disabled=page>=pages-1;
    }
    function bind(){if(bound||!$('banko-strength-search'))return;bound=true;const reset=()=>{page=0;renderRows();};$('banko-strength-search').oninput=$('banko-strength-different').onchange=reset;if($('banko-strength-show-pas'))$('banko-strength-show-pas').onchange=reset;$('banko-strength-prev').onclick=()=>{page=Math.max(0,page-1);renderRows();};$('banko-strength-next').onclick=()=>{page++;renderRows();};}
    function render(data){if(!$('banko-strength-summary'))return;bind();if(latest?.session?.id!==data.session?.id)page=0;latest=data;const s=data.strengthComparison,summary=$('banko-strength-summary');summary.replaceChildren();
        if(!s?.available)summary.appendChild(el('p',data.busy?'Tarama sürüyor; Güç LAB analizleri geldikçe görünecek.':'Bu sürümde Güç LAB karşılaştırması yok. Ayarlarda Güç LAB’ı açıp yeni manuel tarama oluşturun.'));
        else {summary.appendChild(el('p',s.fixtures+' aynı maç · '+s.same+' aynı karar · '+s.different+' farklı karar · yalnız seçili tarama'));
            summary.appendChild(table(['Model','Seçim / PAS','Kazanan / kaybeden','Bekleyen','İsabet','Teorik net / ROI'],[['Mevcut',s.main.total+' / '+s.main.pas,s.main.won+' / '+s.main.lost,s.main.pending,'%'+num(s.main.hitRate,1),num(s.main.netUnits)+' / %'+num(s.main.roi,1)],['Güç LAB',s.lab.total+' / '+s.lab.pas,s.lab.won+' / '+s.lab.lost,s.lab.pending,'%'+num(s.lab.hitRate,1),num(s.lab.netUnits)+' / %'+num(s.lab.roi,1)]]));summary.appendChild(el('p',s.disclaimer,'banko-strength-muted'));}
        renderRows();
    }
    window.BankoStrengthPanel={render,card,different:diff};
})();
