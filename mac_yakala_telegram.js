'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createIndependentLab}=require('./independent_lab');
const {createV22Lab}=require('./v22_lab');
const v21=require('./v21_tariff'),v22=require('./v22_tariff');
const VERSION='mac-yakala-v21-v22-independent-2026-09-16';
const WIN_TEXT='✅✅✅ YAKALADIK!';
const FOOTER='Öncelikli modelimiz V22';
const html=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clone=v=>JSON.parse(JSON.stringify(v));
function shortAnalysis(value,market) {
    const clean=String(value||'').replace(/<[^>]*>/g,'').replace(/[*_`#]/g,'').replace(/\s+/g,' ').trim();
    const sentences=clean.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g)||[];
    const selected=sentences.map(x=>x.trim()).filter(x=>x.length<=180&&!/EDGE|value|Dino|karar motoru|kesin kazan|garanti|%/i.test(x)).slice(0,2).join(' ');
    return selected||`Canlı veriler ve giriş skoru üzerinden ${String(market).replace('_UST',' ÜST')} seçimi değerlendirildi.`;
}
function formatSignal(record) {
    const models=[...new Set(record.signalSources)].sort((a,b)=>a==='V22'?-1:b==='V22'?1:a.localeCompare(b));
    return `<b>🟢 MAÇ YAKALA</b>\n\n⚽ <b>Maç:</b> ${html(record.match)}\n🏆 <b>Lig:</b> ${html(record.league)}\n⏱ <b>Dakika:</b> ${html(record.minute)}′\n📊 <b>Skor:</b> ${html(record.score)}\n${models.map(m=>`🧠 <b>Model:</b> ${html(m)}`).join('\n')}\n\n<b>🎯 ${html(record.market.replace('_UST',' ÜST'))} • 💰 ORAN: ${Number(record.odds).toFixed(3)}</b>\n\n<b>📝 Maç Yakala Analiz</b>\n${html(shortAnalysis(record.analysis,record.market))}\n\n${FOOTER}`;
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
    constructor({filePath,tracker,send,logger=()=>{},now=Date.now}) {
        Object.assign(this,{filePath,tracker,send,logger,now});this.data={version:1,entries:[]};this.disabled=false;this.busy=false;this.flushing=false;
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
            this.reconcile();this.save();
        }catch(error){this.disabled=true;this.logger('> ⛔ Telegram gönderim günlüğü okunamadı/yazılamadı; dosya korunuyor, gönderimler kapalı.');}
    }
    hasSource(channel,source,fixtureId){
        if(this.disabled||!channel)return true;
        return this.data.entries.some(e=>String(e.requestedChannel)===String(channel)&&e.payload.fixtureId===Number(fixtureId)&&e.payload.signalSources.includes(source)&&e.status!=='declined');
    }
    reconcile(){for(const e of this.data.entries)if(e.status==='sent'&&e.messageId)this.tracker.recordSent({...e.payload,deliveryKey:e.key,telegramMessageId:e.messageId,telegramChatId:e.chatId});}
    async publish(channel,payload){
        if(this.disabled||this.busy||!channel||!payload||!payload.signalSources?.length||payload.signalSources.some(s=>!['V21','V22'].includes(s)||this.hasSource(channel,s,payload.fixtureId)))return false;
        if(payload.statsValidation?.status!=='passed'||!/^\d+\.5_UST$/.test(payload.market)||!Number.isFinite(payload.odds)||payload.odds<1.5||payload.odds>4)return false;
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
                if(record?.settlement?.result!=='W')continue; // No loss/push/void notifications, no live-score celebrations.
                e.win={status:'sending',at:new Date(this.now()).toISOString()};this.save();
                try{
                    const msg=await this.send(e.chatId,WIN_TEXT,{reply_parameters:JSON.stringify({message_id:e.messageId,allow_sending_without_reply:false})});
                    e.win=Number.isInteger(msg?.message_id)&&msg.message_id>0?{status:'sent',messageId:msg.message_id,at:new Date(this.now()).toISOString()}:{status:'uncertain'};
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
module.exports={VERSION,WIN_TEXT,FOOTER,shortAnalysis,formatSignal,createRouter,TelegramDelivery};
