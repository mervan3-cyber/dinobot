(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory(require('./banko_choices'));
    else root.BankoShowroom=factory(root.BankoChoices);
})(typeof window!=='undefined'?window:this,function(C){
    'use strict';
    const VERSION='banko-showroom-paper-v1-2026-10-08';
    const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
    const text=(s,fallback='')=>typeof s==='string'?s.slice(0,300):fallback;
    const num=(n,d=2)=>finite(n)===null?'—':n.toFixed(d).replace('.',',');
    const odd=n=>finite(n)===null?'—':Math.abs(n)>=1e7?n.toExponential(2):n.toFixed(2);
    function sample(value,target){const games=Number.isInteger(value?.games)&&value.games>=0&&value.games<=target?value.games:0;
        return {games,target,scored:games?finite(value?.scored):null,conceded:games?finite(value?.conceded):null};}
    function normalizeContext(value){
        const team=side=>({name:text(value?.[side]?.name,side==='home'?'Ev sahibi':'Deplasman'),last5:sample(value?.[side]?.last5,5),last20:sample(value?.[side]?.last20,20)});
        const expected=finite(value?.expectedTotal);
        return {version:VERSION,home:team('home'),away:team('away'),expectedTotal:expected!==null&&expected>=0?expected:null,
            sourceCapturedAt:text(value?.sourceCapturedAt),modelVersion:text(value?.modelVersion)};
    }
    function snapshotFor(row){
        const h=finite(row?.expectedGoals?.home),a=finite(row?.expectedGoals?.away);
        return normalizeContext({home:{name:row?.home?.name,last5:row?.profiles?.home?.last5,last20:row?.profiles?.home?.last20},
            away:{name:row?.away?.name,last5:row?.profiles?.away?.last5,last20:row?.profiles?.away?.last20},expectedTotal:h!==null&&a!==null&&h>=0&&a>=0?h+a:null,
            sourceCapturedAt:row?.capturedAt,modelVersion:row?.pick?.modelVersion});
    }
    function parts(pick){const label=C.marketLabel(pick),split=label.split(' · ');
        return split.length>1?{name:split.slice(0,-1).join(' · '),selection:split.at(-1),label}:{name:label,selection:'',label};}
    const lastEdit=e=>Date.parse(e.priceHistory?.at(-1)?.changedAt||e.createdAt)||0;
    function buildGroups(entries){
        const grouped=new Map();
        for(const entry of entries||[]){
            if(!entry||typeof entry.id!=='string'||typeof entry.date!=='string'||!entry.pick)continue;
            const tag=text(entry.tag).trim().normalize('NFC'),key=JSON.stringify([entry.date,tag||null,...(tag?[]:[entry.id])]);
            if(!grouped.has(key))grouped.set(key,{key,date:entry.date,label:tag||'Etiketsiz seçim',entries:[]});grouped.get(key).entries.push(entry);
        }
        return [...grouped.values()].map(group=>{
            const unique=new Map();let duplicateCount=0;
            for(const e of group.entries){const key=JSON.stringify([e.fixtureId,C.outcomeKey(e.pick)||e.pick.key]);
                if(unique.has(key)){duplicateCount++;if(lastEdit(e)>=lastEdit(unique.get(key)))unique.set(key,e);}else unique.set(key,e);}
            const legs=[...unique.values()].sort((a,b)=>(Date.parse(a.kickoff)||0)-(Date.parse(b.kickoff)||0)||a.fixtureId-b.fixtureId).map(e=>({id:e.id,fixtureId:e.fixtureId,match:text(e.match),kickoff:text(e.kickoff),
                playedOdd:finite(e.playedOdd)!==null&&e.playedOdd>1&&e.playedOdd<=1000?e.playedOdd:null,market:parts(e.pick),
                context:normalizeContext(e.showroomSnapshot||e.showroomContext),result:{status:['won','lost'].includes(e.result?.status)?e.result.status:'pending'},timing:e.timing}));
            const sameFixture=new Set(legs.map(l=>l.fixtureId)).size!==legs.length,missingOdds=legs.filter(l=>l.playedOdd===null).length;
            const product=legs.reduce((n,l)=>n*(l.playedOdd??1),1),totalOdd=!sameFixture&&!missingOdds&&Number.isFinite(product)?product:null;
            const result=sameFixture?'pending':legs.some(l=>l.result.status==='lost')?'lost':legs.every(l=>l.result.status==='won')?'won':'pending';
            return {key:group.key,date:group.date,label:group.label,legs,totalOdd,missingOdds,sameFixture,duplicateCount,result,
                profitUnits:totalOdd===null||result==='pending'?null:result==='won'?totalOdd-1:-1,retrospective:legs.filter(l=>l.timing!=='prematch').length};
        });
    }
    function periodLabel(s){return s.games===s.target?'Son '+s.target:`Son ${s.target} · ${s.games} maç`;}
    function dateLabel(day){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(day||'');if(!match)return '—';
        return `${Number(match[3])} ${['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][Number(match[2])-1]||'—'} ${match[1]}`;}
    function couponText(group){return ['MAÇ YAKALA · MAÇ ÖNÜ BİLGİ NOTLARI',`${group.label} · ${dateLabel(group.date)}`,...group.legs.map((l,i)=>[
        `${i+1}. ${l.match}`,l.market.label,`Oynanan oran: ${odd(l.playedOdd)}`,`Modelin beklediği toplam gol (maçın tamamı): ${num(l.context.expectedTotal)}`,
        ...[['Ev sahibi',l.context.home],['Deplasman',l.context.away]].map(([role,t])=>`${role} · ${t.name}\n${periodLabel(t.last5)} lig: ${num(t.last5.scored)} atılan / ${num(t.last5.conceded)} yenilen\n${periodLabel(t.last20)} lig: ${num(t.last20.scored)} atılan / ${num(t.last20.conceded)} yenilen`)
    ].join('\n')),`Toplam oynanan oran: ${odd(group.totalOdd)}`].join('\n\n');}
    function slug(group){return (group.date+'-'+group.label).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-zA-Z0-9-]+/g,'-').replace(/-+/g,'-').slice(0,100)||'mac-yakala';}
    // Pure text layout is shared by the browser PNG renderer. No screenshot library, server renderer or external image fetch.
    function wrap(ctx,value,width){const lines=[];for(const paragraph of String(value).split('\n')){
        let line='';for(const word of paragraph.split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line='';}
            if(ctx.measureText(word).width>width){for(const ch of word){if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line='';}line+=ch;}}
            else line=line?line+' '+word:word;}lines.push(line);}return lines;}
    const palette={paper:'#fffdf9',ink:'#272b2c',muted:'#636762',line:'#deddd6',tint:'#f3eee5',accent:'#a7432a',odd:'#176344',oddTint:'#e9f4ed'};
    function drawPage(ctx,group,legs,pageIndex,pageCount){
        let y=0;const width=620,left=28,right=592;
        function font(size=14,weight=400,color=palette.ink){ctx.font=`${weight} ${size}px "Segoe UI", Arial, sans-serif`;ctx.fillStyle=color;ctx.textBaseline='top';}
        function lines(value,x,top,max,size=14,weight=400,color=palette.ink){font(size,weight,color);const rows=wrap(ctx,value,max),height=size*1.4;rows.forEach((s,i)=>ctx.fillText(s,x,top+i*height));return rows.length*height;}
        function rule(top){ctx.fillStyle=palette.line;ctx.fillRect(0,top,width,1);}
        ctx.fillStyle=palette.paper;ctx.fillRect(0,0,width,20000);ctx.fillStyle=palette.accent;ctx.fillRect(0,0,width,5);
        lines('MAÇ YAKALA',left,27,370,18,600);lines('MAÇ ÖNÜ BİLGİ NOTLARI',left,57,370,11,400,palette.muted);
        font(11,400,palette.muted);const d=dateLabel(group.date);ctx.fillText(d,right-ctx.measureText(d).width,28);y=89;rule(y);
        y+=24;const titleHeight=lines('Maç notları',left,y,400,27,600);y+=titleHeight+6;
        y+=lines(`${group.label} / ${group.legs.length} maç / Kişisel seçim${pageCount>1?` / ${pageIndex+1}-${pageCount}`:''}`,left,y,564,12,400,palette.muted)+18;
        for(const [index,l] of legs.entries()){
            rule(y);y+=24;
            const numText=String(group.legs.indexOf(l)+1).padStart(2,'0');lines(numText,left,y+3,28,12,400,palette.muted);
            y+=lines(l.match,left+27,y,537,18,600)+14;
            const headHeight=lines(l.market.name,left,y,400,24,500);lines('Oynanan oran',right-92,y+2,92,11,400,palette.muted);
            font(26,600,palette.odd);const o=odd(l.playedOdd),ow=ctx.measureText(o).width;ctx.fillStyle=palette.oddTint;ctx.fillRect(right-ow-18,y+24,ow+18,38);ctx.fillStyle=palette.odd;ctx.fillText(o,right-ow-9,y+27);
            y+=Math.max(headHeight,l.market.selection?34:67);if(l.market.selection)y+=lines(l.market.selection,left,y,430,31,600,palette.accent);y+=14;
            ctx.fillStyle=palette.tint;ctx.fillRect(left,y,564,64);lines('Modelin beklediği toplam gol',left+15,y+13,390,13);lines('Maçın tamamı',left+15,y+35,390,11,400,palette.muted);
            font(24,600);const g=num(l.context.expectedTotal)+' gol';ctx.fillText(g,right-15-ctx.measureText(g).width,y+20);y+=82;
            lines('Gol ortalamaları · Maç başına',left,y,564,13,500);y+=29;
            const heights=[];for(const [role,t,x] of [['Ev sahibi',l.context.home,left],['Deplasman',l.context.away,333]]){
                let ty=y;ty+=lines(role,x,ty,250,11,400,palette.muted)+3;ty+=lines(t.name,x,ty,250,13,600)+7;
                lines('Lig maçı',x,ty,115,11,400,palette.muted);lines('Atılan',x+154,ty,48,11,400,palette.muted);lines('Yenilen',x+215,ty,45,11,400,palette.muted);ty+=23;
                for(const s of [t.last5,t.last20]){ctx.fillStyle=palette.line;ctx.fillRect(x,ty,259,1);const ph=lines(periodLabel(s),x,ty+7,139,12,400,palette.muted);
                    lines(num(s.scored),x+157,ty+7,48,13);lines(num(s.conceded),x+218,ty+7,41,13);ty+=Math.max(32,ph+13);}heights.push(ty);}
            y=Math.max(...heights)+25;
        }
        rule(y);ctx.fillStyle=palette.oddTint;ctx.fillRect(0,y,width,107);lines('Toplam oynanan oran',left,y+34,280,22,500,palette.odd);
        const total=odd(group.totalOdd);let size=48;font(size,600,palette.odd);while(ctx.measureText(total).width>250&&size>20)font(--size,600,palette.odd);
        ctx.fillText(total,right-ctx.measureText(total).width,y+(107-size*1.2)/2);return Math.ceil(y+107);
    }
    async function pngPages(group,doc){
        doc=doc||(typeof document!=='undefined'?document:null);if(!doc)throw Error('PNG yalnız tarayıcıda hazırlanabilir.');
        const chunks=[];for(let i=0;i<group.legs.length;i+=5)chunks.push(group.legs.slice(i,i+5));
        const files=[];for(let i=0;i<chunks.length;i++){
            const measure=doc.createElement('canvas');measure.width=620;measure.height=1;
            const height=drawPage(measure.getContext('2d'),group,chunks[i],i,chunks.length);measure.width=1;measure.height=1;
            const canvas=doc.createElement('canvas');const scale=1080/620;canvas.width=1080;canvas.height=Math.ceil(height*scale);
            const ctx=canvas.getContext('2d');ctx.scale(scale,scale);drawPage(ctx,group,chunks[i],i,chunks.length);
            const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG hazırlanamadı.')),'image/png'));
            canvas.width=1;canvas.height=1;files.push({name:slug(group)+(chunks.length>1?'-'+(i+1):'')+'.png',blob});
        }return files;
    }
    function crc32(bytes){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
    async function zipFiles(files){
        if(files.length>65535)throw Error('Çok fazla görsel seçildi.');const chunks=[],central=[];let offset=0;
        for(const file of files){const name=new TextEncoder().encode(file.name),bytes=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(bytes);
            if(offset+bytes.length>0xffffffff)throw Error('Görselleri daha küçük gruplar halinde indirin.');
            const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,name.length,true);local.set(name,30);
            const header=new Uint8Array(46+name.length),c=new DataView(header.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);header.set(name,46);
            chunks.push(local,bytes);central.push(header);offset+=local.length+bytes.length;
        }
        const centralSize=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
        return new Blob([...chunks,...central,end],{type:'application/zip'});
    }
    return {VERSION,num,odd,sample,normalizeContext,snapshotFor,parts,buildGroups,periodLabel,dateLabel,couponText,slug,wrap,drawPage,pngPages,zipFiles,crc32};
});
