'use strict';
// DOM text nodes only: provider names/reasons must never become HTML.
function renderEntryFilterLab(data, source) {
    const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
    const el=id=>document.getElementById(id);
    const pct=n=>n==null?'—':`%${Number(n).toFixed(1)}`;
    const unit=n=>n==null?'—':`${n>0?'+':''}${Number(n).toFixed(2)}`;
    const wl=b=>`${b?.wins||0} / ${b?.losses||0}`;
    const bucket=b=>`${b?.total||0} toplam · ${wl(b)} K/Y · ${b?.pending||0} bekleyen`;
    const verdicts={approve:'Onay',reject:'Elenirdi',insufficient:'Veri yetersiz',unaffected:'Korunur / kapsam dışı'};
    const cell=(row,text,cls)=>{const td=node('td',text,cls);row.appendChild(td);return td;};
    const table=(parent,headers)=>{const wrap=node('div',undefined,'filterlab-scroll'),t=node('table',undefined,'filterlab-table'),head=node('thead'),tr=node('tr');
        headers.forEach(h=>tr.appendChild(node('th',h)));head.appendChild(tr);t.appendChild(head);const body=node('tbody');t.appendChild(body);wrap.appendChild(t);parent.appendChild(wrap);return body;};
    const tone=n=>n>0?'filterlab-positive':n<0?'filterlab-negative':'';
    el('testlab-v23-mode').textContent=!data?'HAZIR DEĞİL':data.enabled?'YALNIZ LAB · SİNYAL ELENMEZ':'KAPALI';
    el('testlab-v23-cohort').textContent=`Yeni dönem: ${data?.startedAt?formatDateTime(data.startedAt):'ilk yeni sinyal bekleniyor'}. Eski sonuçlar yeni testlere katılmaz.`;
    el('testlab-v23-impact').textContent=data?.disabledReason?`LAB durumu: ${data.disabledReason}. Canlı modeller etkilenmez.`:
        `${data?.filters?.sourceRecords||0} kaynak kaydı · ${data?.filters?.uniqueFixtures||0} maç. V21/V22 ayrı değerlendirilir; sonuçları tekil Telegram kasası gibi toplanmaz.`;
    el('testlab-v23-storage').textContent=`Eski deneyler ve geçmiş API toplama kapalı · Yeni testler için ek API: 0 · ${data?.storage?.archivedRecords||0} kayıt arşivde / ${data?.storage?.fullRecordsInMemory||0} tam kayıt RAM’de.${data?.storage?.error?' Arşiv yazılamadı; tam kayıtlar korunuyor.':''}`;
    const summary=el('testlab-v23-summary-rows');summary.replaceChildren();
    for(const name of ['v21','v22']) {
        const b=data?.filters?.sources?.[name]?.baseline||{},row=node('tr');
        [name.toUpperCase()+' · mevcut sistem',b.total||0,wl(b),b.pending||0,pct(b.hitRate),unit(b.profit),pct(b.roi)].forEach(v=>cell(row,v));summary.appendChild(row);
    }
    const container=el('testlab-v23-controls');container.replaceChildren();
    const reports=source==='all'?['v21','v22'].map(s=>[s.toUpperCase(),data?.filters?.sources?.[s]]):
        [[source.toUpperCase(),source.includes(':')?data?.filters?.v22Filters?.[source.split(':')[1]]:data?.filters?.sources?.[source]]];
    const allDefinitions=data?.filters?.sources?Object.values(data.filters.sources).flatMap(r=>r.controls):[];
    for(const [name,report]of reports) {
        const card=node('section',undefined,`filterlab-model ${name.startsWith('V21')?'filterlab-v21':'filterlab-v22'}`),b=report?.baseline||{};
        card.appendChild(node('h4',`${name} · ${b.total||0} sinyal`));
        card.appendChild(node('p',`Mevcut: ${wl(b)} K/Y · ${b.pending||0} bekleyen · ${unit(b.profit)} birim · ROI ${pct(b.roi)}`,'filterlab-baseline'));
        card.appendChild(node('p',name.startsWith('V21')?'Yeni şartlar yalnız 1.5 ÜST’e uygulanır. Diğer marketler aynen korunur.':'Yeni şartlar yalnız C’den geçenlere uygulanır. A/B’den de geçenler korunur.','muted'));
        const body=table(card,['Deney / kural','Onay','Elenirdi','Yetersiz / Korunan','Engellenen kayıp','Kaçırılan kazanan','Sonrası K/Y · İsabet','Net / ROI','Δ birim']);
        for(const c of report?.controls||[]) {
            const row=node('tr');if(c.id==='event_score')row.className='filterlab-quality-row';
            const first=cell(row,'');const details=node('details');details.appendChild(node('summary',c.label));
            details.appendChild(node('p',c.rule));
            if(c.id==='event_score')details.appendChild(node('p','Veri doğruluğu kontrolü; diğer deneylerle birleştirilmez.'));
            for(const r of Object.values(c.reasons||{}))details.appendChild(node('p',`${r.label}: ${bucket(r)}`));
            first.appendChild(details);
            cell(row,bucket(c.approve));cell(row,bucket(c.reject));
            const untouched=cell(row,`${c.insufficient.total} / ${c.unaffected.total}`);untouched.title='Veri yetersiz / filtre kapsamı dışında korunan. İkisi de filtre sonrası hesapta kalır.';
            cell(row,c.avoidedLosses,'filterlab-positive');cell(row,c.missedWinners,'filterlab-negative');
            const retained=cell(row,`${wl(c.retained)} · ${pct(c.retained.hitRate)}`);retained.title=`${c.retained.pending} bekleyen · ${c.retained.voids} iptal · ${c.retained.pushes} iade`;
            cell(row,`${unit(c.retained.profit)} / ${pct(c.retained.roi)}`,tone(c.retained.profit));cell(row,unit(c.profitDifference),tone(c.profitDifference));body.appendChild(row);
        }
        if(!report) {const row=node('tr');cell(row,'Yeni deney verisi bekleniyor.').colSpan=9;body.appendChild(row);}
        container.appendChild(card);
    }
    const body=el('testlab-v23-rows');body.replaceChildren();
    const signals=(data?.signals||[]).filter(s=>source==='all'||s.sourceModel===source.split(':')[0]&&(!source.includes(':')||s.matchedFilters?.includes(source.split(':')[1])));
    for(const s of signals) {
        const row=node('tr');
        cell(row,`${formatDateTime(s.sentAt)} · ${s.sourceModel.toUpperCase()}${s.matchedFilters.length?' · '+s.matchedFilters.join('+'):''}`);
        cell(row,s.match||'—');cell(row,`${s.minute}' / ${s.score}`);cell(row,`${String(s.market).replace('_UST',' ÜST')} / ${Number(s.odds).toFixed(3)}`);
        const checks=cell(row,'');const details=node('details'),controls=s.filterAudit?.controls||[];
        details.appendChild(node('summary',`${controls.filter(c=>c.status==='approve').length} onay · ${controls.filter(c=>c.status==='reject').length} elenirdi · ${controls.filter(c=>c.status==='insufficient').length} yetersiz · ${controls.filter(c=>c.status==='unaffected').length} korunur`));
        for(const c of controls) {
            const def=allDefinitions.find(d=>d.id===c.id),v=c.values||{},parts=[];
            if(v.totalShots!=null)parts.push(`Toplam ${v.totalShots} şut / ${v.totalSot} isabet · oran ${v.sotRatio==null?'tanımsız':pct(v.sotRatio*100)}`);
            if(v.trailingSide)parts.push(`Geride: ${v.trailingSide==='home'?'ev':'deplasman'} · şut ${v.trailing?.shot??'yok'} / isabet ${v.trailing?.sot??'yok'}`);
            if(v.goalCount!=null)parts.push(`Olay golü ${v.goalCount} / skor toplamı ${v.scoreTotal}`);
            details.appendChild(node('p',`${def?.label||c.id}: ${verdicts[c.status]}. ${c.reasonLabels.join('; ')}${parts.length?' · '+parts.join(' · '):''}`));
        }
        checks.appendChild(details);cell(row,`${{W:'Kazandı',L:'Kaybetti',VOID:'İptal',PUSH:'İade'}[s.settlement?.result]||'Bekliyor'} / ${s.settlement?.finalScore||'—'}`);body.appendChild(row);
    }
    if(!signals.length){const row=node('tr');cell(row,'Bu kaynak / tarihte yeni LAB kaydı yok. Yeni sinyal geldiğinde kararlar sonuç beklemeden görünür.').colSpan=6;body.appendChild(row);}
}
function downloadRetiredV23(format) {
    const link=document.createElement('a');
    link.href=`${BACKEND_URL}/api/v23-retired-history/${format==='csv'?'export.csv':'export'}`;
    link.target='_blank';link.rel='noopener';document.body.appendChild(link);link.click();link.remove();
}
