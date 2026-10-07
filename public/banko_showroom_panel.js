(function(){
    'use strict';
    const S=window.BankoShowroom;if(!S)return;
    const $=id=>document.getElementById(id),el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;};
    let groups=[],date=null,visible=false,exporting=false;const selected=new Set();
    try{const saved=JSON.parse(localStorage.getItem('banko-showroom-selected-v1')||'[]');if(Array.isArray(saved))saved.slice(-500).filter(k=>typeof k==='string').forEach(k=>selected.add(k));}catch(_){}
    const remember=()=>{try{localStorage.setItem('banko-showroom-selected-v1',JSON.stringify([...selected].slice(-500)));}catch(_){}};
    const picked=()=>groups.filter(g=>selected.has(g.key));
    function controls(){const count=picked().length;for(const id of ['banko-showroom-open','banko-showroom-png','banko-showroom-copy'])if($(id))$(id).disabled=!count||exporting;
        if($('banko-showroom-summary'))$('banko-showroom-summary').textContent=`${groups.length} grup · ${count} seçili. Yalnız manuel kaydettiğiniz seçimler; otomatik kuponlar eklenmez.`;}
    function table(team){const t=el('table'),head=el('thead'),hr=el('tr');for(const s of ['Lig maçı','Atılan','Yenilen']){const th=el('th',s);th.scope='col';hr.appendChild(th);}head.appendChild(hr);t.appendChild(head);const body=el('tbody');
        for(const s of [team.last5,team.last20]){const row=el('tr'),th=el('th',S.periodLabel(s));th.scope='row';row.append(th,el('td',S.num(s.scored)),el('td',S.num(s.conceded)));body.appendChild(row);}t.appendChild(body);return t;}
    function card(g){const poster=el('article',undefined,'banko-paper-poster');poster.dataset.showroomGroup=g.key;
        const header=el('header',undefined,'banko-paper-header'),brand=el('div','MAÇ YAKALA','banko-paper-brand');brand.appendChild(el('small','MAÇ ÖNÜ BİLGİ NOTLARI'));header.append(brand,el('span',S.dateLabel(g.date),'banko-paper-date'));poster.appendChild(header);
        const title=el('div',undefined,'banko-paper-intro');title.append(el('h3','Maç notları'),el('span',`${g.label} / ${g.legs.length} maç / Kişisel seçim`));poster.appendChild(title);
        g.legs.forEach((leg,i)=>{const box=el('section',undefined,'banko-paper-match'),heading=el('div',undefined,'banko-paper-match-head');heading.append(el('span',String(i+1).padStart(2,'0')),el('h4',leg.match));box.appendChild(heading);
            const market=el('div',undefined,'banko-paper-market-row'),name=el('div',undefined,'banko-paper-market');name.append(el('span',leg.market.name),el('strong',leg.market.selection));const price=el('div',undefined,'banko-paper-leg-price');price.append(el('span','Oynanan oran'),el('strong',S.odd(leg.playedOdd)));market.append(name,price);box.appendChild(market);
            const expected=el('div',undefined,'banko-paper-expected'),label=el('div');label.append(el('span','Modelin beklediği toplam gol'),el('small','Maçın tamamı'));expected.append(label,el('strong',S.num(leg.context.expectedTotal)+' gol'));box.appendChild(expected);
            box.appendChild(el('p','Gol ortalamaları · Maç başına','banko-paper-stats-title'));const teams=el('div',undefined,'banko-paper-teams');
            for(const [role,team] of [['Ev sahibi',leg.context.home],['Deplasman',leg.context.away]]){const col=el('div',undefined,'banko-paper-team'),teamLabel=el('div',undefined,'banko-paper-team-label');teamLabel.append(el('span',role),el('strong',team.name));col.append(teamLabel,table(team));teams.appendChild(col);}box.appendChild(teams);poster.appendChild(box);
        });
        const total=el('footer',undefined,'banko-paper-total');total.append(el('span','Toplam oynanan oran'),el('strong',S.odd(g.totalOdd)));poster.appendChild(total);return poster;}
    function download(blob,name){const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
    function message(text,error=false){const n=$('banko-showroom-message');if(n){n.textContent=text;n.className='banko-showroom-message'+(error?' error':'');}if(typeof showToast==='function')showToast(text,error);}
    async function exportGroups(list){if(exporting||!list.length)return;exporting=true;controls();message('Görseller tarayıcınızda hazırlanıyor; sunucuda işlem / API isteği yok.');
        try{const files=[];for(const g of list)files.push(...await S.pngPages(g,document));if(files.length===1)download(files[0].blob,files[0].name);else download(await S.zipFiles(files.map((f,i)=>({...f,name:(i+1)+'-'+f.name}))),'mac-yakala-showroom-'+date+'.zip');message(files.length===1?'PNG indirildi; Telegram’a kendiniz ekleyebilirsiniz.':`${files.length} PNG tek ZIP içinde indirildi; açıp Telegram’a toplu ekleyebilirsiniz.`);}
        catch(e){message(e.message||'Görsel hazırlanamadı.',true);}finally{exporting=false;controls();}}
    async function copyGroups(list){if(!list.length)return;const box=$('banko-showroom-text');box.value=list.map(S.couponText).join('\n\n──────────\n\n');box.hidden=false;
        try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(box.value);message('Metin kopyalandı; Telegram’a otomatik gönderilmedi.');}
        catch(_){box.focus();box.select();message('IP / HTTP panelde panoya erişim olmayabilir; seçili metni Ctrl+C ile kopyalayın.');}}
    function renderPreview(){const root=$('banko-showroom-preview');if(!root)return;root.replaceChildren();if(!visible)return;
        for(const g of picked()){const wrap=el('div',undefined,'banko-showroom-export'),actions=el('div',undefined,'banko-showroom-actions'),png=el('button','PNG İNDİR'),copy=el('button','TELEGRAM METNİ');png.type=copy.type='button';png.onclick=()=>exportGroups([g]);copy.onclick=()=>copyGroups([g]);actions.append(png,copy);wrap.append(card(g),actions);root.appendChild(wrap);}}
    function clearCopy(){const box=$('banko-showroom-text');if(box){box.hidden=true;box.value='';}}
    function render(data){if(!$('banko-showroom-groups'))return;if(date!==data.date){date=data.date;visible=false;}clearCopy();
        groups=S.buildGroups(data.manualSelections);const root=$('banko-showroom-groups');root.replaceChildren();
        for(const g of groups){const box=el('article',undefined,'banko-showroom-group'),check=el('input'),label=el('label',undefined,'banko-showroom-check');check.type='checkbox';check.checked=selected.has(g.key);check.dataset.showroomSelect=g.key;check.onchange=()=>{if(check.checked)selected.add(g.key);else selected.delete(g.key);remember();clearCopy();controls();renderPreview();};label.append(check,el('strong',g.label));
            const status={won:'Kazandı',lost:'Kaybetti',pending:'Bekliyor'}[g.result];box.append(label,el('p',`${g.legs.length} maç · Toplam oynanan oran ${S.odd(g.totalOdd)} · ${status}${g.profitUnits===null?'':` · ${S.num(g.profitUnits)} teorik birim`}`));
            box.appendChild(el('small',g.legs.map(l=>l.match).join(' / ')));
            if(g.missingOdds)box.appendChild(el('p',`${g.missingOdds} seçimde oynanan oran girilmedi; toplam oran hesaplanmadı. API fiyatı yerine kullanılmaz.`,'banko-showroom-warning'));
            if(g.sameFixture)box.appendChild(el('p','Aynı maçta farklı marketler var; bunları bir kupon gibi çarpıp sonuçlandırmıyoruz.','banko-showroom-warning'));
            if(g.duplicateCount)box.appendChild(el('p',`${g.duplicateCount} eşdeğer sürüm kaydı tekilleştirildi; en son düzenlenen kayıt kullanıldı.`,'banko-showroom-warning'));
            if(g.retrospective)box.appendChild(el('p',`${g.retrospective} seçim maç başladıktan sonra kaydedildi; bu liste model onayı değildir.`,'banko-showroom-warning'));
            if(g.legs.some(l=>!l.context.sourceCapturedAt))box.appendChild(el('p','Özgün analiz bağlamı bulunamayan seçimlerde istatistikler — gösterilir; API sorgusu yapılmaz.','banko-showroom-warning'));root.appendChild(box);
        }
        if(!groups.length)root.appendChild(el('p','Önce ana / yedek / analiz seçimlerini Seçimlerim’e kaydedin. Aynı etiketliler aynı gün içinde gruplanır; etiketsiz seçimler ayrı kalır.'));
        controls();renderPreview();
    }
    function bind(){if(!$('banko-showroom-open'))return;$('banko-showroom-open').onclick=()=>{visible=true;renderPreview();};$('banko-showroom-png').onclick=()=>exportGroups(picked());$('banko-showroom-copy').onclick=()=>copyGroups(picked());}
    bind();window.renderBankoShowroom=render;
})();
