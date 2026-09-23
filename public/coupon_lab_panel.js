(function () {
    'use strict';

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
    function oddsText(object) {
        return Object.entries(object || {}).map(([key,value])=>`${key} ${Number(value).toFixed(2)}`).join(' · ') || '-';
    }
    function profileText(profile,label) {
        if(!profile)return `${label}: veri yok`;
        return `${label}: ${profile.scoredPerGame ?? '-'} gol/maç · İY %${profile.scoringMinutes?.firstShare ?? '-'} · 2Y %${profile.scoringMinutes?.secondShare ?? '-'}`;
    }
    function predictionText(prediction) {
        const p=prediction?.percent || {};
        return `${prediction?.advice || 'Tavsiye yok'} · 1/X/2 %${p.home ?? '-'}/%${p.draw ?? '-'}/%${p.away ?? '-'}`;
    }
    function picksText(item) {
        if(!item?.picks?.length)return 'LAB seçimi oluşmadı';
        return item.picks.map(pick=>`${pick.selection} @ ${Number(pick.odd).toFixed(2)}${pick.finalOdd?` → ${Number(pick.finalOdd).toFixed(2)}`:''}`).join(' · ');
    }
    function finalText(item) {
        const status=item?.finalCheck?.status;
        if(status==='passed')return '✅ Son kontrol geçti';
        if(status==='rejected')return `⛔ ${item.finalCheck.reasons?.join(' · ') || 'Reddedildi'}`;
        if(status==='error')return `⚠️ ${item.finalCheck.reasons?.join(' · ') || 'Kontrol hatası'}`;
        return item?.selected ? '⏳ Maç önü kontrol bekliyor' : '— Seçilmedi';
    }
    function resultText(item) {
        if(item?.result?.status!=='settled')return '⏳ Bekliyor';
        const picks=(item.result.picks || []).map(pick=>`${pick.selection} ${pick.won?'✅':'❌'}`).join(' · ');
        return `${item.result.score || '-'}${picks?` · ${picks}`:''}`;
    }
    function renderRows(items) {
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
            trCell(row,timeTR(item.kickoff));
            trCell(row,`${item.league || '-'} · ${item.home?.name || '-'} - ${item.away?.name || '-'}`);
            trCell(row,predictionText(item.prediction));
            trCell(row,`${profileText(item.profiles?.home,'Ev')} | ${profileText(item.profiles?.away,'Dep.')}`);
            trCell(row,`ÇŞ: ${oddsText(item.odds?.doubleChance)} | İY/MS: ${oddsText(item.odds?.htft)}`);
            trCell(row,picksText(item),item.selected?'positive':'muted');
            trCell(row,finalText(item),item.finalCheck?.status==='passed'?'positive':item.finalCheck?.status==='rejected'?'warning-text':'muted');
            trCell(row,resultText(item),item.result?.status==='settled'?'positive':'muted');
            body.appendChild(row);
        }
    }
    function render(data) {
        const scan=data?.latestScan;
        const status=data?.running?'Taranıyor…':scan
            ? `${scan.day} · ${scan.status==='complete'?'tamamlandı':scan.status==='error'?'hata':'çalışıyor'} · ${data.bookmaker?.name || 'bookmaker'} · ${scan.apiUsed ?? 0} API`
            : `Her gün ${String(data?.scanHour ?? 9).padStart(2,'0')}:00 otomatik · henüz taranmadı`;
        setText('coupon-lab-status',`${status} · ${data?.disclaimer || ''}`);
        setText('coupon-market-count',scan?.marketFixtures ?? 0);
        setText('coupon-candidate-count',data?.summary?.candidates ?? 0);
        setText('coupon-selected-count',data?.summary?.selected ?? 0);
        setText('coupon-passed-count',data?.summary?.passed ?? 0);
        setText('coupon-api-usage',`${data?.api?.used ?? 0} / ${data?.api?.limit ?? 200}`);
        const button=byId('coupon-lab-scan');
        if(button){button.disabled=data?.running===true;button.textContent=data?.running?'TARANIYOR…':'BUGÜNÜ ŞİMDİ TARA';}
        renderRows(data?.candidates || []);
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
            if(button){button.disabled=false;button.textContent='BUGÜNÜ ŞİMDİ TARA';}
        }
    }
    window.fetchCouponLab=fetchCouponLab;
    window.scanCouponLab=scanCouponLab;
})();
