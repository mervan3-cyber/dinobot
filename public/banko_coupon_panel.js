(function(){
    'use strict';
    const C=window.BankoChoices;
    const $=id=>document.getElementById(id),el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;};
    const num=(n,d=2)=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(d):'—';
    const dt=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'});};
    const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const day=()=>$('banko-date').value||today();
    const labels={waiting:'Ön aday · maç önü bekliyor',warning:'Uyarı · elle inceleyin',passed:'Maç önü kontrol geçti',rejected:'Güncel kontrol reddetti',pending:'Sonuç bekliyor',won:'Kazandı',lost:'Kaybetti'};
    const marketNames={1:'Maç sonucu',3:'2Y sonucu',5:'Toplam gol',6:'İY gol',7:'İY/MS',8:'KG Var/Yok',10:'Kesin skor',11:'En gollü yarı',12:'Çifte şans',13:'İY sonucu',16:'Ev takım golü',17:'Dep. takım golü',20:'İY çifte şans',26:'2Y gol',27:'Ev gol yememe',28:'Dep. gol yememe',31:'İY kesin skor',34:'İY KG',35:'2Y KG',45:'Toplam korner'};
    const statNames={'Total Shots':'Toplam şut','Shots on Goal':'İsabetli şut','Shots insidebox':'Ceza içi şut','Shots outsidebox':'Ceza dışı şut','Corner Kicks':'Korner','Yellow Cards':'Sarı kart','Red Cards':'Kırmızı kart',expected_goals:'xG'};
    const optionalStats=new Set(['Yellow Cards','Red Cards','expected_goals']);
    const marketLabel=C.marketLabel;
    let latest=null,dirty=false,fetching=false,page=0,sessionId=null,candidateSerial=0;
    const openAlternatives=new Set();
    const openCandidates=new Set();
    const selectionDrafts=new Map();
    // Read-only choices from the saved scan. Never refresh odds, relax eligibility or replace a frozen pick.
    const alternative=C.alternative;
    const integerIds=['dailyLimit','maxCandidates','maxCoupons','precheckMinutes','maxOddsAgeHours'];
    const numericIds=[...integerIds,'minLegOdd','maxLegOdd','minCouponOdd','maxCouponOdd','minSingleOdd','maxSingleOdd','minModelProbability','minEdgePP'];
    const booleanIds=['enabled','autoPrecheck','women','predictionContext'];
    function table(heads,rows){const wrap=el('div',undefined,'table-wrap'),t=el('table'),head=el('thead'),tr=el('tr');heads.forEach(h=>tr.appendChild(el('th',h)));head.appendChild(tr);t.appendChild(head);const body=el('tbody');rows.forEach(values=>{const r=el('tr');values.forEach(v=>{const cell=el('td');if(v&&typeof v.setAttribute==='function')cell.appendChild(v);else cell.textContent=String(v??'');r.appendChild(cell);});body.appendChild(r);});t.appendChild(body);wrap.appendChild(t);return wrap;}
    function note(text,error=false){return el('div',text,'banko-note'+(error?' error':''));}
    const origins={main:'Ana tahmin',backup:'Gerçek yedek',analysis:'Diğer analiz marketi'};
    function enteredOdd(input){if(input.value.trim()==='')return null;const n=Number(input.value.replace(',','.'));if(!Number.isFinite(n)||n<=1||n>1000)throw Error('Oran 1’den büyük, en fazla 1000 olmalı.');return n;}
    function priceForm(row,pick){
        if(!pick?.spec||pick.spec.kind==='corners'||!Number.isFinite(pick.modelProbability))return note('Bu marketin seçim/sonuçlandırma kuralı doğrulanmadı; takibe eklenmez.');
        const box=el('div',undefined,'banko-selection-form'),key=JSON.stringify([latest?.session?.id,row.fixtureId,pick.key]);
        box.dataset.bankoMarket=pick.key;
        const draft=selectionDrafts.get(key)||{odd:'',tag:'',confirmed:false};selectionDrafts.set(key,draft);
        const odd=el('input'),tag=el('input'),price=el('label','Oynayacağın / oynadığın oran'),group=el('label','Kupon etiketi (isteğe bağlı)'),message=el('p',undefined,'banko-price-check');
        odd.type='text';odd.inputMode='decimal';odd.placeholder='API '+num(pick.odd)+' · boşsa yalnız takip';odd.value=draft.odd;odd.setAttribute('aria-label',row.match+' · girilen oran');
        tag.type='text';tag.maxLength=80;tag.placeholder='Örn. üç maçlı deneme';tag.value=draft.tag;tag.setAttribute('aria-label',row.match+' · kupon etiketi');price.appendChild(odd);group.appendChild(tag);
        const accept=el('label',undefined,'banko-manual-consent'),checkbox=el('input'),save=el('button','SEÇİMLERİME EKLE');checkbox.type='checkbox';checkbox.checked=draft.confirmed;accept.append(checkbox,el('span','Şart dışı / eski kaydı yalnız manuel takip için ekliyorum; model onayı değildir.'));save.type='button';save.dataset.bankoSelection=pick.key;
        const update=()=>{draft.odd=odd.value;draft.tag=tag.value;draft.confirmed=checkbox.checked;try{
            const entered=enteredOdd(odd),check=C.priceCheck(row,pick,latest?.session?.settings||latest.settings,entered??pick.odd,new Date());
            accept.hidden=check.eligible;message.textContent=(entered===null?'Oran girilmedi; API fiyatı referans. ':'Girilen oran '+num(entered)+'. ')+(check.eligible?'Kayıtlı şartlarla fiyat kontrolü geçti. ':check.reasons.join(' · '))+` Ham fark ${num(check.edgePP,1)} puan. Yeni veri/oran/kadro kontrolü yapılmadı.`;
            message.className='banko-price-check'+(check.eligible?'':' banko-price-warning');save.disabled=!!latest?.busy||!!latest?.storageError||(!check.eligible&&!checkbox.checked);
        }catch(e){message.textContent=e.message;accept.hidden=true;save.disabled=true;}};
        odd.oninput=tag.oninput=checkbox.onchange=update;
        save.onclick=async()=>{save.disabled=true;try{const response=await apiFetch('/api/banko-coupon/selection',{method:'POST',body:JSON.stringify({date:day(),sessionId:latest?.session?.id,fixtureId:row.fixtureId,marketKey:pick.key,playedOdd:enteredOdd(odd),tag:tag.value,allowRejected:checkbox.checked})});if(typeof showToast==='function')showToast(response.alreadySaved?'Bu sürümde aynı seçim zaten kayıtlı.':'Seçim kaydedildi; Telegram’a gönderilmedi.');await fetchFull();}catch(e){message.textContent=e.message;update();if(typeof showToast==='function')showToast(e.message,true);}};
        box.append(price,group,message,accept,save);update();return box;
    }
    function renderTracking(data){
        const summary=data.trackingSummary,manual=$('banko-manual-list');if(!manual)return;manual.replaceChildren();
        const count=s=>`${s?.won||0} K / ${s?.lost||0} Y / ${s?.pending||0} bekleyen`;
        $('banko-manual-summary').textContent=summary?`${summary.manual.total} tekil seçim · ${count(summary.manual)} · ${summary.manual.records} kayıt. Maç başladıktan sonra eklenen: ${summary.manual.retrospective}.`:'Henüz kayıt yok';
        $('banko-model-tracking').textContent=summary?`Seçili tarama · Ana: ${count(summary.model.main)} · Yedek: ${count(summary.model.backup)} · Tüm uygun marketler: ${count(summary.model.all)}. ${summary.disclaimer}`:'';
        for(const entry of data.manualSelections||[]){
            const card=el('article',undefined,'banko-manual-card'),head=el('strong',entry.match+' · '+marketLabel(entry.pick));
            card.append(head,el('p',`${origins[entry.origin]||'Manuel'} · ${entry.timing==='prematch'?'Maç öncesi kaydedildi':'Geçmiş / başlamış maç kaydı'} · ${dt(entry.createdAt)} · sürüm ${entry.sessionId.slice(-8)}`));
            card.appendChild(el('p',`${labels[entry.result.status]||'Sonuç bekliyor'}${entry.result.score?' · API normal süre '+entry.result.score:''} · API oranı ${num(entry.pick.odd)} · Girilen oran ${entry.playedOdd===null?'Yok':num(entry.playedOdd)}${entry.tag?' · Kupon etiketi: '+entry.tag:''}`));
            if(entry.result.reason)card.appendChild(note(entry.result.reason));if(entry.priceCheck&&!entry.priceCheck.eligible)card.appendChild(note('Yalnız manuel takip · '+entry.priceCheck.reasons.join(' · '),true));
            const odd=el('input'),tag=el('input'),save=el('button','ORAN / ETİKETİ KAYDET'),fields=el('div',undefined,'banko-manual-edit');odd.type='text';odd.inputMode='decimal';odd.value=entry.playedOdd===null?'':String(entry.playedOdd);odd.placeholder='Girilen oran';odd.setAttribute('aria-label',entry.match+' · kayıt oranı');tag.value=entry.tag||'';tag.placeholder='Kupon etiketi';tag.maxLength=80;tag.setAttribute('aria-label',entry.match+' · kayıt etiketi');save.type='button';save.disabled=!!data.busy||!!data.storageError;
            save.onclick=async()=>{save.disabled=true;try{await apiFetch('/api/banko-coupon/selection-price',{method:'POST',body:JSON.stringify({id:entry.id,playedOdd:enteredOdd(odd),tag:tag.value})});await fetchFull();}catch(e){if(typeof showToast==='function')showToast(e.message,true);}finally{save.disabled=!!latest?.busy;}};fields.append(odd,tag,save);card.appendChild(fields);manual.appendChild(card);
        }
    }
    function controls(data){
        if(!$('banko-date').value)$('banko-date').value=data.day||today();
        $('banko-status').textContent=data.storageError||`${data.job?.status==='waiting-live'&&data.busy?'⏸ Canlı taramayı bekliyor':data.busy?'İşlem sürüyor':'Hazır'} · ${data.job?.message||'Tarih seçip manuel oluşturabilirsiniz.'}${data.busy?` · ${data.job?.processed||0}/${data.job?.total||0}`:''}`;
        $('banko-api').textContent=`${data.api.used} / ${data.api.limit}`;$('banko-reserve').textContent=`Genel kalan ${data.api.remaining??'bilinmiyor'} · canlı rezerv ${data.api.reserve}`;
        for(const id of ['scan','discover','check','results','save'])if($('banko-'+id))$('banko-'+id).disabled=!!data.busy||!!data.storageError||(id!=='save'&&data.settings.enabled===false);
        $('banko-dirty').textContent=dirty?'Kaydedilmemiş ayarlar var':'Ayarlar kaydedildi';
        if(!dirty){numericIds.forEach(k=>{$('banko-setting-'+k).value=data.settings[k];});booleanIds.forEach(k=>{$('banko-setting-'+k).checked=data.settings[k];});document.querySelectorAll('[data-banko-family]').forEach(n=>{n.checked=data.settings.marketFamilies.includes(n.dataset.bankoFamily);});}
    }
    function profile(p,name){const box=el('div',undefined,'banko-profile');box.appendChild(el('h4',name));if(!p){box.appendChild(note('Geçmiş veri yok'));return box;}
        box.appendChild(table(['Örneklem','Maç','Atılan','Yenilen'],[['Son 5',p.last5.games,num(p.last5.scored),num(p.last5.conceded)],['Son 20 lig',p.last20.games,num(p.last20.scored),num(p.last20.conceded)],['Aynı saha',p.venueSummary.games,num(p.venueSummary.scored),num(p.venueSummary.conceded)]]));
        const statRows=entries=>entries.map(([key,v])=>[statNames[key]||key,num(v.mean),`${v.games}/10`]);
        box.appendChild(table(['Son 10 maçtan istatistik','Ort.','Dolu kayıt'],statRows(Object.entries(p.stats).filter(([key])=>!optionalStats.has(key)))));
        const optional=el('details');optional.appendChild(el('summary','İsteğe bağlı veriler · kart / xG (seçim şartı değil)'));
        optional.appendChild(table(['Son 10 maçtan isteğe bağlı veri','Ort.','Dolu kayıt'],statRows(Object.entries(p.stats).filter(([key])=>optionalStats.has(key)))));box.appendChild(optional);
        const history=el('details');history.appendChild(el('summary','Geçmiş maçları aç'));history.appendChild(table(['Tarih','Maç','Skor','İY'],p.rows.map(r=>[dt(r.date),`${r.homeName||r.homeId} - ${r.awayName||r.awayId}`,`${r.home}-${r.away}`,r.ht?`${r.ht.home}-${r.ht.away}`:'Eksik'])));box.appendChild(history);
        const players=el('details');players.appendChild(el('summary','Oyuncu geçmişi · son 5 / doğrulanmamış prop bağlamı'));players.appendChild(table(['Oyuncu','Süre','Gol / kayıt','Şut / kayıt','İsabet / kayıt'],p.players.map(p=>[p.name,p.minutes,`${p.goalSamples?p.goals:'—'} / ${p.goalSamples}`,`${p.shotSamples?p.shots:'—'} / ${p.shotSamples}`,`${p.onSamples?p.on:'—'} / ${p.onSamples}`])));box.appendChild(players);return box;
    }
    function candidate(row){const details=el('details',undefined,'banko-analysis'),summary=el('summary'),heading=el('span',`${row.match} · ${row.league} · ${dt(row.kickoff)} · ${row.pick?marketLabel(row.pick)+' @ '+num(row.pick.odd):'PAS'}`,'banko-analysis-title');
        const button=el('button','↻ Alternatif tahmin','banko-alternative-button'),backup=el('section',undefined,'banko-alternative');
        const stateKey=JSON.stringify([latest?.session?.id,row.id||row.fixtureId]),backupId='banko-alternative-'+(++candidateSerial);
        details.open=openCandidates.has(stateKey);details.ontoggle=()=>{if(details.open)openCandidates.add(stateKey);else openCandidates.delete(stateKey);};
        button.type='button';button.dataset.bankoAlternative=String(row.fixtureId);button.title='Aynı kayıttaki uygun ikinci seçeneği gösterir; API harcamaz ve kuponu değiştirmez.';
        button.setAttribute('aria-controls',backupId);button.setAttribute('aria-label',`${row.match} · alternatif tahmin`);backup.id=backupId;backup.setAttribute('aria-live','polite');backup.hidden=true;
        const showBackup=()=>{const pick=alternative(row,latest?.session?.settings);backup.replaceChildren();
            backup.appendChild(el('h4',pick?'Yedek seçenek · '+marketLabel(pick):'Uygun alternatif yok'));
            if(pick){
                backup.appendChild(el('p',`Kayıt oranı ${num(pick.odd)} · Ham model %${num(pick.modelProbability*100,1)} · Veri puanı ${pick.dataScore}/100 · Model − piyasa farkı ${num(pick.edgePP,1)} yüzde puan.`));
                backup.appendChild(el('p','Ana seçimden sonra, aynı veri/oran/model şartlarını geçen en yüksek ham model puanlı farklı seçenek. Aynı tahminin farklı adla tekrarı değildir.'));
                backup.appendChild(el('small',`Kaydedilmiş analiz · Oran güncellemesi ${dt(row.oddsUpdatedAt)}. Canlı yenileme veya yeni maç önü kontrolü yapılmadı; ham yüzde doğrulanmış başarı oranı değildir.`));
                backup.appendChild(priceForm(row,pick));
            }else backup.appendChild(el('p',row.pick?'Ana tahmin dışındaki marketlerde aynı koşulları geçen ikinci seçim yok; eşikler düşürülmedi.':'Bu maç PAS; ana seçim şartlarını geçmediği için yedek tahmin zorlanmadı.'));
            backup.appendChild(el('small','Ana tahmin, kayıtlı kupon ve sonuç takibi değişmez. Yedek seçenek ayrı bir bahistir, ana tahminin sigortası değildir.'));
        };
        const setVisible=visible=>{backup.hidden=!visible;button.setAttribute('aria-expanded',String(visible));button.textContent=visible?'Yedeği gizle':'↻ Alternatif tahmin';if(visible){showBackup();details.open=true;openAlternatives.add(stateKey);}else openAlternatives.delete(stateKey);};
        button.onclick=event=>{event?.preventDefault();event?.stopPropagation();setVisible(backup.hidden);};
        summary.append(heading,button);details.append(summary,backup);setVisible(openAlternatives.has(stateKey));
        if(row.pick){details.appendChild(el('h4','Ana seçim · '+marketLabel(row.pick)));details.appendChild(priceForm(row,row.pick));}
        const reasons=row.pick?[`Ham model %${num(row.pick.modelProbability*100,1)}; kalibre edilmiş başarı yüzdesi değildir. Veri puanı ${row.pick.dataScore}/100. Model − piyasa farkı ${num(row.pick.edgePP,1)} yüzde puan.`,...row.risks]:[...row.reasons,...row.risks];if(reasons.length)details.appendChild(note(reasons.join('\n')));
        if(row.apiPrediction?.advice)details.appendChild(el('p','API tavsiyesi (yalnız bağlam): '+row.apiPrediction.advice));
        details.appendChild(el('p',`Veri: ${dt(row.capturedAt)} · Oran güncellemesi: ${dt(row.oddsUpdatedAt)} · Beklenen gol ${num(row.expectedGoals?.home)} / ${num(row.expectedGoals?.away)}`));
        const grid=el('div',undefined,'banko-profile-grid');grid.append(profile(row.profiles?.home,row.home.name),profile(row.profiles?.away,row.away.name));details.appendChild(grid);
        const markets=el('details');markets.appendChild(el('summary',`Tüm marketleri aç (${row.markets.length}) · desteklenmeyenler yalnız analiz`));const listing=el('div');let count=80;
        const more=el('button','SONRAKİ 80 MARKET');more.type='button';const fill=()=>{listing.replaceChildren(table(['Market / seçim','Oran','Ham model','Veri puanı','Durum / pas nedeni','Manuel takip'],row.markets.slice(0,count).map(m=>{const action=el('details');action.appendChild(el('summary','Seçim / fiyat kontrolü'));let loaded=false;action.ontoggle=()=>{if(action.open&&!loaded){loaded=true;action.appendChild(priceForm(row,m));}};return [marketLabel(m),num(m.odd),m.modelProbability===null?'—':`%${num(m.modelProbability*100,1)}`,m.dataScore,m.eligible?'Aday':m.reasons.join(' · '),action];})));more.disabled=count>=row.markets.length;};more.onclick=()=>{count+=80;fill();};fill();markets.append(listing,more);details.appendChild(markets);return details;
    }
    function couponText(c){return ['🎫 MAÇ YAKALA · BANKO KUPON LAB',...c.legs.map((l,i)=>`${i+1}. ${l.match}\n${dt(l.kickoff)} · ${marketLabel(l.pick)} @ ${num(l.pick.odd)}`),`Toplam ilk kayıt oranı: ${num(c.originalOdd)}`,`Kontrol: ${labels[c.check.status]||c.check.status}`,...c.legs.flatMap(l=>[...(l.check?.warnings||[]),...(l.check?.reasons||[])]),'Analiz amaçlıdır; kesin kazanma garantisi yoktur. Güncel oranı ve kadroyu kontrol edin.'].join('\n\n');}
    function couponCard(c,index,session){const status=c.result.status==='pending'?c.check.status:c.result.status,card=el('article',undefined,'banko-coupon banko-'+status),head=el('div',undefined,'banko-coupon-head');head.append(el('h4',`Kupon ${index+1} · ${c.legs.length} maç · ${labels[status]||status}`),el('span',num(c.originalOdd),'banko-price'));card.appendChild(head);
        card.appendChild(el('p',`İlk kayıt ${dt(session.createdAt)} · ${session.id.slice(-8)} sürümü${c.check.currentOdd?` · güncel kontrolde ${num(c.check.currentOdd)}`:''}`));
        const legs=el('div',undefined,'banko-legs');for(const l of c.legs){const box=el('div',undefined,'banko-leg');box.append(el('strong',l.match),el('strong',marketLabel(l.pick)+' @ '+num(l.pick.odd)),el('small',dt(l.kickoff)+' · '+l.league),el('small',`Ham model %${num(l.pick.modelProbability*100,1)} · veri puanı ${l.pick.dataScore}/100`),el('small',l.result.status!=='pending'?`${labels[l.result.status]} · ${l.result.score||'—'}`:labels[l.check?.status||'waiting']));if(l.check?.currentOdd)box.appendChild(el('small',`Kontrol oranı ${num(l.check.currentOdd)} · ${dt(l.check.checkedAt)}`));(l.check?.warnings||[]).forEach(w=>box.appendChild(note(w)));(l.check?.reasons||[]).forEach(w=>box.appendChild(note(w,true)));legs.appendChild(box);}card.appendChild(legs);
        card.appendChild(note(`Ham model çarpımı %${num(c.independenceModelProduct*100,1)}: maçlar bağımsız varsayılır; kuponun doğrulanmış başarı olasılığı değildir. ${c.result.status==='pending'?'Sonuçlar yalnız SONUÇLARI GETİR ile sorgulanır.':`Teorik net ${num(c.result.profitUnits)} birim (ilk kayıt fiyatı, kupon başına 1 birim).`}`));
        const actions=el('div',undefined,'banko-actions'),copy=el('button','TELEGRAM METNİNİ KOPYALA');copy.type='button';copy.disabled=c.check.status==='rejected';const text=el('textarea',couponText(c),'banko-copy-box');text.value=couponText(c);text.readOnly=true;text.hidden=true;
        copy.onclick=async()=>{text.hidden=false;try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text.value);if(typeof showToast==='function')showToast('Metin kopyalandı; Telegram’a gönderilmedi.');}catch(_){text.focus();text.select();if(typeof showToast==='function')showToast('Metin kutusundan elle kopyalayabilirsiniz.');}};actions.appendChild(copy);card.append(actions,text);
        const logs=el('details');logs.appendChild(el('summary',`Kontrol geçmişi (${c.check.history.length}) · ilk seçim değişmez`));for(const h of c.check.history)logs.appendChild(el('p',`${dt(h.checkedAt)} · ${h.automatic?'Otomatik':'Manuel'} · ${labels[h.status]} · ${num(h.originalOdd)} → ${num(h.currentOdd)} · ${[...h.reasons,...h.warnings].join(' / ')}`));card.appendChild(logs);return card;
    }
    function renderCandidates(){const body=$('banko-candidates');body.replaceChildren();const search=($('banko-search').value||'').toLocaleLowerCase('tr-TR'),rows=(latest?.session?.candidates||[]).filter(r=>(r.match+' '+r.league).toLocaleLowerCase('tr-TR').includes(search));const pages=Math.max(1,Math.ceil(rows.length/10));page=Math.min(page,pages-1);rows.slice(page*10,page*10+10).forEach(r=>body.appendChild(candidate(r)));$('banko-page').textContent=`Sayfa ${page+1}/${pages} · ${rows.length} maç`;$('banko-prev').disabled=page===0;$('banko-next').disabled=page>=pages-1;}
    function render(data){latest=data;controls(data);const s=data.session;$('banko-count').textContent=`${data.summary.coupons} kupon · ${data.summary.candidates} analiz`;$('banko-results-summary').textContent=`${data.summary.won} K / ${data.summary.lost} Y / ${data.summary.pending} bekleyen · ${num(data.summary.profitUnits)} teorik birim`;
        const versions=$('banko-version');versions.replaceChildren(el('option','Son sürüm'));versions.children[0].value='';data.sessions.slice().reverse().forEach(v=>{const n=el('option',`${dt(v.createdAt)} · ${v.status} · ${v.couponCount} kupon`);n.value=v.id;versions.appendChild(n);});versions.value=sessionId||'';
        const archive=$('banko-archive');archive.replaceChildren(el('option','Kayıtlı tarihler'));archive.children[0].value='';data.availableDates.forEach(d=>{const n=el('option',d);n.value=d;archive.appendChild(n);});
        const coupons=$('banko-coupons');coupons.replaceChildren();if(!s)coupons.appendChild(note('Bu tarih için kupon yok. Önce ligleri getirebilir veya doğrudan manuel oluşturabilirsiniz.'));else{if(s.status==='running')coupons.appendChild(note(data.busy&&data.job?.sessionId===s.id&&data.job?.status==='waiting-live'?'⏸ Canlı işlem bekleniyor. Toplanan analizler korundu; aynı tarama otomatik devam edecek. Tekrar oluştur düğmesine basmanız gerekmiyor.':'Tarama sürüyor; kuponlar tamamlanınca oluşturulacak.'));else if(s.status!=='complete')coupons.appendChild(note(`Tarama ${s.status}: ${s.reason||'Henüz tamamlanmadı'}. Eksik tarama kupon onayı sayılmaz.`,true));if(s.reason)coupons.appendChild(note(s.reason));s.coupons.forEach((c,i)=>coupons.appendChild(couponCard(c,i,s)));}
        const leagueBox=$('banko-leagues');if(!dirty){leagueBox.replaceChildren();(data.discovery?.leagues||[]).forEach(l=>{const n=el('label'),input=el('input');input.type='checkbox';input.dataset.bankoLeague=String(l.id);input.checked=data.settings.allowedLeagueIds.includes(l.id);input.onchange=window.markBankoDirty;n.append(input,el('span',`${l.country} · ${l.name} (${l.matches})`));leagueBox.appendChild(n);});}
        renderCandidates();renderTracking(data);if(typeof window.renderBankoShowroom==='function')window.renderBankoShowroom(data);
    }
    async function fetchFull(){if(fetching)return;fetching=true;try{render(await apiFetch('/api/banko-coupon?date='+encodeURIComponent(day())+(sessionId?'&session='+encodeURIComponent(sessionId):'')));}catch(e){$('banko-status').textContent=e.message;}finally{fetching=false;}}
    async function poll(){try{const data=await apiFetch('/api/banko-coupon?summary=1&date='+encodeURIComponent(day()));const changed=latest?.job?.id!==data.job?.id||latest?.job?.status!==data.job?.status;controls(data);if(changed&&(!data.busy||data.job?.status==='waiting-live'||latest?.job?.status==='waiting-live'))await fetchFull();else if(latest)latest.job=data.job;}catch(_){} }
    async function action(kind){try{if(dirty&&kind==='scan')throw Error('Önce değiştirdiğiniz ayarları kaydedin.');const result=await apiFetch('/api/banko-coupon/'+kind,{method:'POST',body:JSON.stringify({date:day(),sessionId:sessionId||latest?.session?.id})});controls(result);if(typeof showToast==='function')showToast(result.message);await fetchFull();}catch(e){if(typeof showToast==='function')showToast(e.message,true);$('banko-status').textContent=e.message;}}
    async function save(){try{const settings={};numericIds.forEach(k=>settings[k]=Number($('banko-setting-'+k).value));booleanIds.forEach(k=>settings[k]=$('banko-setting-'+k).checked);settings.marketFamilies=Array.from(document.querySelectorAll('[data-banko-family]')).filter(n=>n.checked).map(n=>n.dataset.bankoFamily);
        const visible=new Set(Array.from(document.querySelectorAll('[data-banko-league]')).map(n=>Number(n.dataset.bankoLeague)));settings.allowedLeagueIds=[...(latest?.settings.allowedLeagueIds||[]).filter(id=>!visible.has(id)),...Array.from(document.querySelectorAll('[data-banko-league]')).filter(n=>n.checked).map(n=>Number(n.dataset.bankoLeague))];
        await apiFetch('/api/banko-coupon/settings',{method:'POST',body:JSON.stringify(settings)});dirty=false;await fetchFull();if(typeof showToast==='function')showToast('Banko ayarları kaydedildi.');}catch(e){if(typeof showToast==='function')showToast(e.message,true);}}
    window.fetchBankoCoupon=fetchFull;window.pollBankoCoupon=poll;window.runBankoAction=action;window.saveBankoSettings=save;window.markBankoDirty=()=>{dirty=true;$('banko-dirty').textContent='Kaydedilmemiş ayarlar var';};
    window.bankoDateChanged=()=>{sessionId=null;page=0;fetchFull();};window.bankoVersionChanged=()=>{sessionId=$('banko-version').value||null;page=0;fetchFull();};window.bankoArchiveChanged=()=>{if($('banko-archive').value){$('banko-date').value=$('banko-archive').value;window.bankoDateChanged();}};
    window.bankoSetDay=offset=>{$('banko-date').value=new Date(Date.parse(today()+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);window.bankoDateChanged();};
    window.bankoPage=offset=>{page=Math.max(0,page+offset);renderCandidates();};window.bankoSearch=()=>{page=0;renderCandidates();};window.bankoAllLeagues=()=>{document.querySelectorAll('[data-banko-league]').forEach(n=>n.checked=false);if(latest)latest.settings.allowedLeagueIds=[];window.markBankoDirty();};
})();
