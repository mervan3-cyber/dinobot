(function () {
    'use strict';

    let settingsDirty=false;
    let settingsSaving=false;
    let latestData=null;

    function byId(id) { return document.getElementById(id); }
    function setText(id, value) { const node=byId(id); if(node) node.textContent=String(value ?? '-'); }
    function trCell(row, text, className) {
        const cell=document.createElement('td');
        cell.textContent=String(text ?? '-');
        if(className) cell.className=className;
        row.appendChild(cell);
        return cell;
    }
    function timeTR(value) {
        const date=new Date(value);
        return Number.isNaN(date.getTime())?'-':date.toLocaleTimeString('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'});
    }
    function dateTimeTR(value, fixtureDay, currentDay) {
        const time=timeTR(value);
        if(!fixtureDay || fixtureDay===currentDay)return time;
        const parts=String(fixtureDay).split('-');
        return parts.length===3?`${parts[2]}.${parts[1]} · ${time}`:`${fixtureDay} · ${time}`;
    }
    function oddsText(object) {
        return Object.entries(object || {}).map(([key,value])=>`${key} ${Number(value).toFixed(2)}`).join(' · ') || '-';
    }
    function profileText(profile,label) {
        if(!profile)return `${label}: veri yok`;
        const played=profile.played ?? '-';
        const failed=profile.failedToScore ?? '-';
        const clean=profile.cleanSheets ?? '-';
        return `${label}: ${played} saha maçı · ${profile.scoredPerGame ?? '-'} atılan / ${profile.concededPerGame ?? '-'} yenen · sezon tüm sahalar atılan İY/2Y %${profile.scoringMinutes?.firstShare ?? '-'}/%${profile.scoringMinutes?.secondShare ?? '-'} · yenen İY/2Y %${profile.concedingMinutes?.firstShare ?? '-'}/%${profile.concedingMinutes?.secondShare ?? '-'} · gol atamadı ${failed} · gol yemedi ${clean}`;
    }
    function predictionText(prediction) {
        const p=prediction?.percent || {};
        return `${prediction?.advice || 'Tavsiye yok'} · 1/X/2 %${p.home ?? '-'}/%${p.draw ?? '-'}/%${p.away ?? '-'}`;
    }
    function picksText(item) {
        if(!item?.picks?.length)return 'LAB seçimi oluşmadı';
        return item.picks.map(pick=>{
            const rawMarketProbability=pick.support?.htftMarketProbability;
            const marketProbability=rawMarketProbability===null || rawMarketProbability===undefined ? null : Number(rawMarketProbability);
            const probabilityText=pick.market==='İY/MS' && marketProbability!==null && Number.isFinite(marketProbability)
                ? ` · piyasa %${marketProbability.toFixed(1)}` : '';
            const tier=pick.support?.tier ? ` · ${pick.support.tier}` : '';
            return `${pick.market} ${pick.selection} @ ${Number(pick.odd).toFixed(2)}${pick.finalOdd?` → ${Number(pick.finalOdd).toFixed(2)}`:''} · puan ${Number(pick.qualityScore || 0).toFixed(1)}${probabilityText}${tier}`;
        }).join(' | ');
    }
    function finalText(item) {
        const status=item?.finalCheck?.status;
        if(status==='passed')return '✅ Son kontrol geçti';
        if(status==='rejected')return `⛔ ${item.finalCheck.reasons?.join(' · ') || 'Reddedildi'}`;
        if(status==='error')return `⚠️ ${item.finalCheck.reasons?.join(' · ') || 'Kontrol hatası'}`;
        if(!item?.selected)return `— Seçilmedi${item?.noSelectionReasons?.length?`: ${item.noSelectionReasons.join(' · ')}`:''}`;
        if(Date.parse(item.kickoff)<=Date.now())return '⚠️ Maç önü kontrol tamamlanmadı; onaylı değil';
        return '⏳ Maç önü kontrol bekliyor; henüz onaylı değil';
    }
    function resultText(item) {
        if(!item?.picks?.length)return '— Ana seçim yok';
        if(item?.result?.status!=='settled')return `⏳ ${item?.result?.reason || 'Bekliyor'}`;
        const picks=(item.result.picks || []).map(pick=>`${pick.selection} ${pick.won?'✅':'❌'}`).join(' · ');
        return `${item.result.score || '-'}${picks?` · ${picks}`:''}`;
    }
    function renderRows(items,currentDay) {
        const body=byId('coupon-lab-rows');
        if(!body)return;
        body.replaceChildren();
        if(!Array.isArray(items)||!items.length){
            const row=document.createElement('tr');
            const cell=trCell(row,'Bugün için henüz Kupon LAB kaydı yok.','empty-row');
            cell.colSpan=8; body.appendChild(row); return;
        }
        for(const item of items){
            const row=document.createElement('tr');
            if(item.selected)row.style.background='rgba(72,209,204,.06)';
            trCell(row,dateTimeTR(item.kickoff,item.fixtureDay,currentDay));
            trCell(row,`${item.league || '-'} · ${item.home?.name || '-'} - ${item.away?.name || '-'}`);
            trCell(row,predictionText(item.prediction));
            trCell(row,`${profileText(item.profiles?.home,'Ev')} | ${profileText(item.profiles?.away,'Dep.')}`);
            trCell(row,`İY/MS: ${oddsText(item.odds?.htft)} | MS bağlamı: ${oddsText(item.odds?.winner)}`);
            const pickCell=trCell(row,'');
            const primary=document.createElement('div');
            primary.textContent=`${item.selected?'Ana LAB adayı':'Ana seçim'}: ${picksText(item)}`;
            primary.className=item.selected && item.finalCheck?.status==='passed'?'positive':item.selected?'warning-text':'muted';
            pickCell.appendChild(primary);
            const alternatives=(item.alternatives || []).filter(pick=>!item.picks?.some(primaryPick=>primaryPick.selection===pick.selection));
            if(alternatives.length){
                const alternate=document.createElement('div');
                alternate.className='muted';
                alternate.textContent=`Alternatif analiz (kupona dahil değil): ${picksText({picks:alternatives})}`;
                pickCell.appendChild(alternate);
            }
            trCell(row,finalText(item),item.finalCheck?.status==='passed'?'positive':item.finalCheck?.status==='rejected'?'warning-text':'muted');
            trCell(row,resultText(item),item.result?.status==='settled'?(item.result.picks?.every(pick=>pick.won===true)?'positive':'warning-text'):'muted');
            body.appendChild(row);
        }
    }
    function setValue(id,value) { const node=byId(id); if(node) node.value=String(value ?? ''); }
    function setChecked(id,value) { const node=byId(id); if(node) node.checked=value===true; }
    function renderSettings(data) {
        const settings=data?.settings || {};
        if(!settingsDirty && !settingsSaving){
            setChecked('coupon-setting-enabled',settings.enabled !== false);
            setValue('coupon-setting-scan-time',settings.scanTime || data?.scanTime || '09:00');
            setChecked('coupon-setting-tomorrow',settings.includeTomorrow === true);
            setValue('coupon-setting-final-minutes',settings.finalCheckMinutes ?? data?.finalCheckMinutes ?? 75);
            setValue('coupon-setting-budget',settings.dailyLimit ?? data?.api?.limit ?? 200);
            setValue('coupon-setting-max-candidates',settings.maxCandidates ?? data?.limits?.maxCandidates ?? 30);
            setValue('coupon-setting-max-selected',settings.maxSelected ?? data?.limits?.maxSelected ?? 10);
        }
        const enabled=byId('coupon-setting-enabled')?.checked === true;
        const tomorrow=byId('coupon-setting-tomorrow')?.checked === true;
        setText('coupon-setting-enabled-label',enabled?'Açık':'Kapalı');
        setText('coupon-setting-tomorrow-label',tomorrow?'Açık':'Kapalı');
        setText('coupon-settings-state',settingsSaving?'KAYDEDİLİYOR':settingsDirty?'KAYDEDİLMEDİ':enabled?'AÇIK':'KAPALI');
        const state=byId('coupon-settings-state');
        if(state) state.className=`mini-badge ${settingsDirty?'bg-warning':enabled?'bg-success':'bg-muted'}`;
        const save=byId('coupon-settings-save');
        if(save){save.disabled=settingsSaving;save.textContent=settingsSaving?'KAYDEDİLİYOR…':'AYARLARI KAYDET';}
    }
    function render(data) {
        latestData=data;
        const scan=data?.latestScan;
        const status=data?.settling?'Sonuçlar güncelleniyor…':data?.running?'Taranıyor…':scan
            ? `${(scan.days || [scan.day]).join(' + ')} · ${scan.status==='complete'?'tamamlandı':scan.status==='error'?'hata':'çalışıyor'} · ${data.bookmaker?.name || 'bookmaker'} · ${scan.apiUsed ?? 0} API`
            : `Her gün ${data?.scanTime || '09:00'} otomatik · henüz taranmadı`;
        setText('coupon-lab-status',`${data?.storageError || status} · ${data?.disclaimer || ''}`);
        setText('coupon-market-count',scan?.marketFixtures ?? 0);
        setText('coupon-candidate-count',data?.summary?.candidates ?? 0);
        setText('coupon-selected-count',data?.summary?.selected ?? 0);
        setText('coupon-passed-count',data?.summary?.passed ?? 0);
        setText('coupon-api-usage',`${data?.api?.used ?? 0} / ${data?.api?.limit ?? 200}`);
        renderSettings(data);
        const button=byId('coupon-lab-scan');
        if(button){
            button.disabled=data?.running===true || data?.settling===true || data?.enabled===false || Boolean(data?.storageError);
            button.textContent=data?.running?'TARANIYOR…':data?.includeTomorrow?'BUGÜN + YARINI ŞİMDİ TARA':'BUGÜNÜ ŞİMDİ TARA';
        }
        const settle=byId('coupon-lab-settle');
        if(settle){
            settle.disabled=data?.running===true || data?.settling===true || Boolean(data?.storageError);
            settle.textContent=data?.settling?'GÜNCELLENİYOR…':'SONUÇLARI GÜNCELLE';
        }
        setText('coupon-lab-footnote',`Yalnız İY/MS · maç başına tek ana aday; diğerleri kupona dahil olmayan alternatif analizdir. Puan başarı yüzdesi değildir; piyasa yüzdesi oranlardan hesaplanır. Ana tarama her gün ${data?.scanTime || '09:00'}'da bir kez çalışır. En fazla ${data?.limits?.maxSelected ?? 10} maç, başlangıçtan ${data?.finalCheckMinutes ?? 75} dakika önce bir kez doğrulanır. Günlük API bütçesi ${data?.api?.limit ?? 200}; genel rezerv korunur.${data?.archivedCandidates?` Önceki sürümün ${data.archivedCandidates} kaydı dosyada korunur; bu listede kıyaslanmaz.`:''}`);
        renderRows(data?.candidates || [],data?.day);
    }
    async function fetchCouponLab() {
        if(typeof apiFetch!=='function')return;
        try { render(await apiFetch('/api/coupon-lab')); }
        catch(error){ setText('coupon-lab-status',`Kupon LAB okunamadı: ${error.message}`); }
    }
    async function scanCouponLab() {
        const button=byId('coupon-lab-scan');
        if(button){button.disabled=true;button.textContent='BAŞLATILIYOR…';}
        try {
            const result=await apiFetch('/api/coupon-lab/scan',{method:'POST'});
            if(typeof showToast==='function')showToast(result.message || 'Kupon LAB taraması başladı.');
            setTimeout(fetchCouponLab,800);
        } catch(error) {
            if(typeof showToast==='function')showToast(error.message,true);
            if(latestData)render(latestData);
        }
    }
    async function settleCouponLab() {
        const button=byId('coupon-lab-settle');
        if(button){button.disabled=true;button.textContent='GÜNCELLENİYOR…';}
        try {
            const result=await apiFetch('/api/coupon-lab/settle',{method:'POST'});
            latestData=result;
            render(result);
            if(typeof showToast==='function')showToast(result.message || 'Kupon LAB sonuçları güncellendi.');
        } catch(error) {
            if(typeof showToast==='function')showToast(error.message,true);
            if(latestData)render(latestData);
        }
    }
    function markCouponSettingsDirty() {
        settingsDirty=true;
        renderSettings(latestData || {});
    }
    async function saveCouponLabSettings() {
        if(settingsSaving)return;
        const payload={
            enabled:byId('coupon-setting-enabled')?.checked === true,
            includeTomorrow:byId('coupon-setting-tomorrow')?.checked === true,
            scanTime:byId('coupon-setting-scan-time')?.value || '09:00',
            finalCheckMinutes:Number(byId('coupon-setting-final-minutes')?.value),
            dailyLimit:Number(byId('coupon-setting-budget')?.value),
            maxCandidates:Number(byId('coupon-setting-max-candidates')?.value),
            maxSelected:Number(byId('coupon-setting-max-selected')?.value)
        };
        settingsSaving=true;
        renderSettings(latestData || {settings:payload});
        try {
            const result=await apiFetch('/api/coupon-lab/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            settingsDirty=false;
            latestData=result;
            render(result);
            if(typeof showToast==='function')showToast(result.message || 'Kupon LAB ayarları kaydedildi.');
        } catch(error) {
            if(typeof showToast==='function')showToast(error.message,true);
        } finally {
            settingsSaving=false;
            renderSettings(latestData || {settings:payload});
        }
    }
    window.fetchCouponLab=fetchCouponLab;
    window.scanCouponLab=scanCouponLab;
    window.settleCouponLab=settleCouponLab;
    window.markCouponSettingsDirty=markCouponSettingsDirty;
    window.saveCouponLabSettings=saveCouponLabSettings;
})();
