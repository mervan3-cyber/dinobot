'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createIndependentLab}=require('./independent_lab');
const {createV22Lab}=require('./v22_lab');
const v21=require('./v21_tariff'),v22=require('./v22_tariff');
const {canNotifyWin}=require('./early_over_win');
const VERSION='mac-yakala-v24-live-2026-10-05';
const WIN_TEXT='✅✅✅ YAKALADIK!';
const FOOTER='';
const html=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clone=v=>JSON.parse(JSON.stringify(v));
function shortAnalysis(value,market) {
    const clean=String(value||'')
        .replace(/<[^>]*>/g,'')
        .replace(/[*_`#]/g,'')
        .replace(/\s+/g,' ')
        .trim();
    // Yalnız noktalama işaretinden sonra boşluk varsa yeni cümle say.
    // Böylece 0.5, 1.5, 2.5 ve 3.5 gibi market çizgileri parçalanmaz.
    const sentences=clean
        .split(/(?<=[.!?])\s+/)
        .map(sentence=>sentence.trim())
        .filter(Boolean);
    const accepted=[];
    for(const sentence of sentences) {
        if(accepted.length===2)break;
        if(/EDGE|value|Dino|karar motoru|kesin kazan|garanti|%/i.test(sentence))continue;
        // Limit the whole paragraph, not each sentence independently.
        if([...accepted,sentence].join(' ').length<=180)accepted.push(sentence);
    }
    const selected=accepted.join(' ');
    const marketLabel=String(market||'').replace('_UST',' ÜST');
    const fallback=`Canlı veriler ve giriş skoru üzerinden ${marketLabel} seçimi değerlendirildi.`;
    return selected||(fallback.length<=180?fallback:'Seçilen market canlı giriş verileriyle değerlendirildi.');
}
function briefStatsAnalysis(record) {
    // Use only the accepted entry snapshot, never Gemini's unverified numbers.
    const count=value=>{
        if(!['number','string'].includes(typeof value)||String(value).trim()==='')return null;
        const n=Number(value);
        return Number.isSafeInteger(n)&&n>=0&&n<=1000?n:null;
    };
    const stats=side=>{
        const source=record?.liveStats?.[side]||{};
        const shots=count(source.shots),sot=count(source.shotsOnGoal);
        return {shots,shotsOnGoal:sot!==null&&shots!==null&&sot>shots?null:sot,corners:count(source.corners)};
    };
    const home=stats('home'),away=stats('away'),market=String(record?.market||'');
    const isWinner=market==='MS1'||market==='MS2';
    const side=market==='MS1'?'Ev sahibi':'Deplasman';
    const selected=isWinner?(market==='MS1'?home:away):Object.fromEntries(
        Object.keys(home).map(field=>[field,home[field]!==null&&away[field]!==null?home[field]+away[field]:null])
    );
    const labels={shots:'şut',shotsOnGoal:'isabetli şut',corners:'korner'};
    const numbers=Object.entries(labels).filter(([field])=>selected[field]!==null)
        .map(([field,label])=>`${selected[field]} ${label}`);
    const summary=numbers.length
        ? `${isWinner?side+':':'Toplam'} ${numbers.join(', ')}.`
        : `${isWinner?'Seçilen tarafın':'Canlı'} şut/isabet/korner verisi eksik.`;
    let context='Seçim giriş skoru üzerinden değerlendirildi.';
    if(isWinner)context=`${market}: ${side.toLocaleLowerCase('tr-TR')} galibiyeti seçildi.`;
    else {
        const line=/^(\d+\.5)_UST$/.exec(market);
        const score=/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(String(record?.score||''));
        if(line&&Number(line[1])<=9.5&&score) {
            const needed=Math.floor(Number(line[1]))+1-Number(score[1])-Number(score[2]);
            if(needed>0&&needed<=2)context=`${line[1]} ÜST için ${needed} gol daha gerekiyor.`;
        }
    }
    // Fixed, neutral wording: no pressure/tempo claims or invented missing fields.
    return shortAnalysis(`${summary} ${context}`,market);
}
function formatSignal(record) {
    const models=[...new Set(record.signalSources)].sort((a,b)=>a==='V22'?-1:b==='V22'?1:a.localeCompare(b));
    return `<b>🟢 MAÇ YAKALA</b>\n\n⚽ <b>Maç:</b> ${html(record.match)}\n🏆 <b>Lig:</b> ${html(record.league)}\n⏱ <b>Dakika:</b> ${html(record.minute)}′\n📊 <b>Skor:</b> ${html(record.score)}\n${models.map(m=>`🧠 <b>Model:</b> ${html(m)}`).join('\n')}\n\n<b>🎯 ${html(record.market.replace('_UST',' ÜST'))} • 💰 ORAN: ${Number(record.odds).toFixed(3)}</b>\n\n<b>📝 Maç Yakala Analiz</b>\n${html(shortAnalysis(record.analysis,record.market))}`;
}
function createRouter({delivery,channel,v16Model,v18Model,prematchSupport,prematchSource,alreadyDecided,liveSnapshot,v21Enabled=true,v22Enabled=true}) {
    const adapter=source=>({hasSignal:fixtureId=>delivery.hasSource(channel,source,fixtureId),findSignal:()=>null});
    const args={v16Model,v18Model,prematchSupport,prematchSource,alreadyDecided,liveSnapshot};
    const first=createIndependentLab({...args,v19Enabled:false,v21Enabled,v19Tracker:adapter('V19'),v21Tracker:adapter('V21')});
    const second=createV22Lab({...args,enabled:v22Enabled,tracker:adapter('V22')});
    function preselect(mac,dino){return first.preselect(mac,dino)||second.preselect(mac,dino);}
    function select({mac,dino,liveOnlyDino}) {
        const choices=[['V22',second.select({mac,dino,liveOnlyDino})],['V21',first.select('v21',{mac,dino,liveOnlyDino})]];
        const groups=new Map();
        for(const [source,selected] of choices)if(selected){
            const key=[selected.market,selected.args.odds].join('|');
            if(!groups.has(key))groups.set(key,{market:selected.market,oran:Number(selected.args.odds),minimum_oran:1.5,maximum_oran:4,choices:[]});
            groups.get(key).choices.push({source,...selected});
        }
        return [...groups.values()];
    }
    function record(mac,group,analysis,capturedAt) {
        const choices=group.choices.filter(s=>!delivery.hasSource(channel,s.source,mac.fixture_id)).map(s=>{
            const args={...s.args,score:mac.skor,minute:mac.dakika,odds:group.oran,selectorProbability:s.score16?.selectorProbability,v18Probability:s.score18?.v18Probability};
            return {...s,policy:(s.source==='V21'?v21:v22).check(args)};
        }).filter(s=>s.policy.eligible);
        if(!choices.length)return null;
        const s=choices[0];
        return {fixtureId:Number(mac.fixture_id),signalType:'strong',sentAt:capturedAt,match:mac.mac_isim,league:mac.lig,minute:Number(mac.dakika),score:mac.skor,
            market:group.market,odds:group.oran,signalSources:choices.map(s=>s.source),tariffVersion:VERSION,tariffSlot:'primary',tariffRuleId:choices.map(s=>s.source).join('+'),
            sourcePolicies:Object.fromEntries(choices.map(s=>[s.source,{version:s.source==='V21'?v21.VERSION:v22.VERSION,matchedFilters:s.policy.matchedFilters||[]} ])),
            dinoProbability:s.policy.probabilities.dino,selectorV2Probability:s.policy.probabilities.v16,v18Probability:s.policy.probabilities.v18,
            edge:s.policy.recordedEdge,decisionEdge:s.policy.recordedEdge,decisionModel:choices.map(s=>s.source).join('+'),decisionProbability:null,
            modelVotes:s.policy.votes,modelProbabilities:s.policy.probabilities,voteCount:s.policy.voteCount,
            prematchMarketSupport:s.args.prematchSupport,prematchMarketSource:prematchSource(mac,group.market),statsValidation:clone(mac.stats_validation),
            statsSource:mac.stats_source,liveStats:liveSnapshot(mac),analysis:shortAnalysis(analysis,group.market)};
    }
    return {preselect,select,record};
}
class TelegramDelivery {
    constructor({filePath,tracker,send,logger=()=>{},now=Date.now,liveSource=null}) {
        Object.assign(this,{filePath,tracker,send,logger,now,liveSource});this.data={version:1,entries:[]};this.disabled=false;this.busy=false;this.flushing=false;
    }
    save(){
        try{fs.mkdirSync(path.dirname(this.filePath),{recursive:true});const tmp=this.filePath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data),'utf8');fs.renameSync(tmp,this.filePath);}
        catch(error){this.disabled=true;throw error;}
    }
    load(){
        try{
            if(fs.existsSync(this.filePath)){
                const d=JSON.parse(fs.readFileSync(this.filePath,'utf8'));
                if(d.version!==1||!Array.isArray(d.entries)||d.entries.some(e=>!e.key||!e.payload?.fixtureId||!Array.isArray(e.payload.signalSources)||!['sending','sent','declined','uncertain'].includes(e.status)))throw Error('invalid delivery ledger');
                this.data=d;
                for(const e of d.entries){if(e.status==='sending')e.status='uncertain';if(e.win?.status==='sending')e.win.status='uncertain';}
            }
            // A missing/older journal cannot prove whether win replies already went out.
            // Keep the surviving shared history intact and stop rather than resend.
            if(this.tracker.data.signals.some(s=>s.deliveryKey&&!this.data.entries.some(e=>e.key===s.deliveryKey&&e.status==='sent')))throw Error('delivery journal does not cover shared history');
            if (this.liveSource === 'V24') {
                if (this.data.v24ActivatedAt && !Number.isFinite(Date.parse(this.data.v24ActivatedAt))) throw Error('invalid V24 activation timestamp');
                if (!this.data.v24ActivatedAt) this.data.v24ActivatedAt = new Date(this.now()).toISOString();
            }
            this.reconcile();this.save();
        }catch(error){this.disabled=true;this.logger('> ⛔ Telegram gönderim günlüğü okunamadı/yazılamadı; dosya korunuyor, gönderimler kapalı.');}
    }
    hasSource(channel,source,fixtureId){
        if(this.disabled||!channel)return true;
        return this.data.entries.some(e=>String(e.requestedChannel)===String(channel)&&e.payload.fixtureId===Number(fixtureId)&&e.payload.signalSources.includes(source)&&e.status!=='declined');
    }
    hasFixture(channel,fixtureId){
        if(this.disabled||!channel)return true;
        return this.data.entries.some(e=>String(e.requestedChannel)===String(channel)&&e.payload.fixtureId===Number(fixtureId)&&e.status!=='declined') ||
            this.tracker.data.signals.some(s=>Number(s.fixtureId)===Number(fixtureId));
    }
    reconcile(){for(const e of this.data.entries)if(e.status==='sent'&&e.messageId)this.tracker.recordSent({...e.payload,deliveryKey:e.key,telegramMessageId:e.messageId,telegramChatId:e.chatId});}
    findSent(channel,payload){
        const key=crypto.createHash('sha256').update(JSON.stringify([channel,payload.fixtureId,payload.market,payload.minute,payload.score,payload.sentAt,payload.odds,payload.signalSources])).digest('hex');
        return this.data.entries.find(e=>e.key===key&&e.status==='sent');
    }
    async publish(channel,payload){
        const isV24=payload?.signalSources?.length===1&&payload.signalSources[0]==='V24';
        if(this.disabled||this.busy||!channel||!payload||!payload.signalSources?.length)return false;
        if(this.liveSource==='V24'&&!isV24)return false;
        if(isV24) {
            if(this.hasFixture(channel,payload.fixtureId)||!this.data.v24ActivatedAt||Date.parse(payload.sentAt)<Date.parse(this.data.v24ActivatedAt)||!Number.isFinite(Date.parse(payload.sentAt)))return false;
            if(payload.entryAudit?.eventScore?.status!=='approve')return false;
        } else if(payload.signalSources.some(s=>!['V21','V22'].includes(s)||this.hasSource(channel,s,payload.fixtureId)))return false;
        const winner=isV24&&['MS1','MS2'].includes(payload.market);
        if(payload.statsValidation?.status!=='passed'||(!winner&&!/^\d+\.5_UST$/.test(payload.market))||!Number.isFinite(payload.odds)||payload.odds<1.5||payload.odds>(winner?2.5:4))return false;
        this.busy=true;
        const key=crypto.createHash('sha256').update(JSON.stringify([channel,payload.fixtureId,payload.market,payload.minute,payload.score,payload.sentAt,payload.odds,payload.signalSources])).digest('hex');
        const entry={key,requestedChannel:String(channel),status:'sending',createdAt:new Date(this.now()).toISOString(),payload:clone(payload),win:null};
        try {
            this.data.entries.push(entry);this.save(); // Persist intent before the external write; uncertain delivery is never blindly repeated.
            let message;
            try{message=await this.send(channel,formatSignal(payload),{parse_mode:'HTML'});}
            catch(error){
                const code=Number(error?.response?.body?.error_code);
                entry.status=code>=400&&code<500?'declined':'uncertain';entry.errorCode=code||null;this.save();
                this.logger(`> ⚠️ Telegram sinyali ${entry.status==='uncertain'?'belirsiz; tekrar gönderilmeyecek':'reddedildi; yeni taze girişte yeniden denenebilir'}.`);return false;
            }
            if(!Number.isInteger(message?.message_id)||message.message_id<=0){entry.status='uncertain';this.save();return false;}
            entry.messageId=message.message_id;entry.chatId=message.chat?.id??channel;entry.status='sent';this.save();
            this.tracker.recordSent({...payload,deliveryKey:key,telegramMessageId:entry.messageId,telegramChatId:entry.chatId});
            return true;
        }catch(error){this.logger('> ⛔ Telegram gönderim kaydı yazılamadı; mükerrer gönderimi önlemek için gönderim kapalı.');this.disabled=true;return false;}
        finally{this.busy=false;}
    }
    async flushWins(){
        if(this.disabled||this.flushing)return 0;
        this.flushing=true;let count=0;
        try{
            this.reconcile();
            for(const e of this.data.entries){
                if(e.status!=='sent'||!e.messageId||['sent','sending','uncertain','failed'].includes(e.win?.status)||Number(e.win?.retryAt||0)>this.now())continue;
                const record=this.tracker.data.signals.find(s=>s.deliveryKey===e.key);
                if(!canNotifyWin(record,{now:this.now(),epoch:this.tracker.earlyWinDisabled?Infinity:this.tracker.earlyWinEpoch}))continue;
                const notification=record?.settlement?.result==='W'?'final':'early-over';
                e.win={status:'sending',at:new Date(this.now()).toISOString(),notification};this.save();
                try{
                    const msg=await this.send(e.chatId,WIN_TEXT,{reply_parameters:JSON.stringify({message_id:e.messageId,allow_sending_without_reply:false})});
                    e.win=Number.isInteger(msg?.message_id)&&msg.message_id>0?{status:'sent',messageId:msg.message_id,at:new Date(this.now()).toISOString(),notification}:{status:'uncertain',notification};
                    if(e.win.status==='sent')count++;
                }catch(error){
                    const code=Number(error?.response?.body?.error_code);
                    e.win=code===429?{status:'retry',retryAt:this.now()+Math.max(1,Number(error.response.body.parameters?.retry_after)||60)*1000}:
                        code>=400&&code<500?{status:'failed',errorCode:code}:{status:'uncertain'};
                    this.logger(`> ⚠️ YAKALADIK yanıtı ${e.win.status}; bağımsız mesaj gönderilmedi.`);
                }
                this.save();
            }
        }catch(error){this.disabled=true;this.logger('> ⛔ Sonuç bildirimi günlüğü yazılamadı; bildirimler güvenlik için durduruldu.');}
        finally{this.flushing=false;}
        return count;
    }
}
module.exports={VERSION,WIN_TEXT,FOOTER,shortAnalysis,briefStatsAnalysis,formatSignal,createRouter,TelegramDelivery};
