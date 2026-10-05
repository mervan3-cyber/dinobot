'use strict';
const fs=require('fs'),crypto=require('crypto');
const {atomicSave,SHARING_KINDS}=require('./sharing_settings');
const isTelegram=kind=>kind==='extraTelegram'||kind==='groupTelegram';
const {formatSignal,WIN_TEXT}=require('./mac_yakala_telegram');
const {canNotifyWin}=require('./early_over_win');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const copy=s=>JSON.parse(JSON.stringify(s));
const errorCode=e=>Number(e?.statusCode||e?.response?.body?.error_code)||null;
function boundedSend(action,ms=15000) {
    let timer;
    return Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),ms);})]).finally(()=>clearTimeout(timer));
}
class SharingDelivery {
    constructor({filePath,settings,tracker,extraChatId='',groupChatId='',xIdentity='',telegramSend,xSend,logger=()=>{},now=Date.now,timeoutMs=15000}) {
        Object.assign(this,{filePath,settings,tracker,extraChatId:String(extraChatId),groupChatId:String(groupChatId),xIdentity,telegramSend,xSend,logger,now,timeoutMs});
        this.data={version:1,entries:[]};this.disabled=false;this.flushing=false;
    }
    save() {try{atomicSave(this.filePath,this.data);}catch(e){this.disabled=true;throw e;}}
    load() {
        try {
            if(!fs.existsSync(this.filePath))return;
            const d=JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if(d.version!==1||!Array.isArray(d.entries)||d.entries.some(e=>!e.key||!e.primaryKey||!SHARING_KINDS.includes(e.kind)||!['sending','sent','declined','uncertain','skipped'].includes(e.status)||!Number.isSafeInteger(e.epoch)))throw Error('invalid');
            this.data=d;
            for(const e of d.entries){if(e.status==='sending')e.status='uncertain';if(e.win?.status==='sending')e.win.status='uncertain';}
            this.save();
        }catch(_){this.disabled=true;this.logger('> ⚠️ Ek paylaşım günlüğü hatalı; ana Telegram etkilenmedi, ek paylaşımlar kapalı.');}
    }
    target(kind){return kind==='extraTelegram'?this.extraChatId:kind==='groupTelegram'?this.groupChatId:kind==='x'?this.xIdentity:'';}
    active(e){return !this.disabled&&this.settings.active(e.kind)&&e.target===this.target(e.kind)&&e.epoch===this.settings.data.epochs[e.kind];}
    status(){
        const result={disabled:this.disabled};
        for(const kind of SHARING_KINDS){
            const entries=this.data.entries.filter(e=>e.kind===kind&&e.target===this.target(kind));
            const e=entries[entries.length-1];
            result[kind]={sent:entries.filter(e=>e.status==='sent').length,last:e?{status:e.status,at:e.createdAt,errorCode:e.errorCode||null,reason:e.reason||null}:null};
        }
        return result;
    }
    async publish(primary){
        if(this.disabled||primary?.status!=='sent'||!primary.key||!primary.messageId)return;
        // Only the primary acknowledged send triggers mirrors. No replay/backfill on startup or toggle.
        await Promise.all(SHARING_KINDS.map(kind=>this.publishOne(primary,kind)));
    }
    async publishOne(primary,kind){
        if(!this.settings.active(kind)||this.disabled)return;
        const target=this.target(kind),key=hash(primary.key+'|'+kind+'|'+target);
        if(!target||this.data.entries.some(e=>e.key===key))return;
        const entry={key,primaryKey:primary.key,kind,target,epoch:this.settings.data.epochs[kind],status:'sending',createdAt:new Date(this.now()).toISOString(),win:null};
        if(isTelegram(kind)&&[primary.chatId,primary.requestedChannel].some(id=>String(id)===target))return;
        // Defensive de-duplication if two mirror kinds point at the same chat.
        if(isTelegram(kind)&&this.data.entries.some(e=>e.primaryKey===primary.key&&isTelegram(e.kind)&&(e.target===target||String(e.chatId)===target)))return;
        try{
            this.data.entries.push(entry);this.save();
            if(!this.active(entry)){entry.status='skipped';this.save();return;}
            let response;
            try{
                response=await boundedSend(()=>{
                    if(!this.active(entry)){const e=Error('disabled');e.statusCode=409;throw e;}
                    return isTelegram(kind)?this.telegramSend(target,formatSignal(primary.payload),{parse_mode:'HTML'}):this.xSend(copy(primary.payload));
                },this.timeoutMs);
                const id=isTelegram(kind)?response?.message_id:response?.id;
                if(isTelegram(kind)?(!Number.isInteger(id)||id<=0):!/^\d+$/.test(String(id||'')))throw Error('missing ack');
                entry.messageId=id;entry.chatId=isTelegram(kind)?(response.chat?.id??target):undefined;entry.status='sent';
            }catch(e){
                entry.errorCode=errorCode(e);entry.status=entry.errorCode>=400&&entry.errorCode<500?'declined':'uncertain';
                entry.reason=e?.safeReason||null;
                this.logger(`> ⚠️ ${kind==='x'?'X':kind==='groupTelegram'?'Maç Yakala Live':'Ek Telegram'} paylaşımı ${entry.status}; ana kanal etkilenmedi. Otomatik tekrar yok.`);
            }
            this.save();
        }catch(_){this.disabled=true;this.logger('> ⚠️ Ek paylaşım kaydı yazılamadı; yalnız ek paylaşımlar durduruldu.');}
    }
    async flushWins(){
        if(this.disabled||this.flushing)return 0;
        this.flushing=true;let count=0;
        try{
            for(const e of this.data.entries){
                if(!isTelegram(e.kind)||!this.active(e)||e.status!=='sent'||!e.messageId||['sent','sending','uncertain','failed'].includes(e.win?.status)||(e.win?.retryAt||0)>this.now())continue;
                const record=this.tracker.data.signals.find(s=>s.deliveryKey===e.primaryKey);
                if(!canNotifyWin(record,{now:this.now(),epoch:this.tracker.earlyWinDisabled?Infinity:this.tracker.earlyWinEpoch}))continue;
                const notification=record?.settlement?.result==='W'?'final':'early-over';
                e.win={status:'sending',notification};this.save();
                try{
                    const r=await boundedSend(()=>{
                        if(!this.active(e)){const error=Error('disabled');error.statusCode=409;throw error;}
                        return this.telegramSend(e.chatId,WIN_TEXT,{reply_parameters:JSON.stringify({message_id:e.messageId,allow_sending_without_reply:false})});
                    },this.timeoutMs);
                    e.win=Number.isInteger(r?.message_id)&&r.message_id>0?{status:'sent',messageId:r.message_id,notification}:{status:'uncertain',notification};
                    if(e.win.status==='sent')count++;
                }catch(error){
                    const code=errorCode(error);
                    e.win=code===429?{status:'retry',retryAt:this.now()+Math.max(1,Number(error.response?.body?.parameters?.retry_after)||60)*1000}:code>=400&&code<500?{status:'failed',errorCode:code}:{status:'uncertain'};
                }
                this.save();
            }
        }catch(_){this.disabled=true;this.logger('> ⚠️ Ek grup sonuç günlüğü hatalı; ana kanal etkilenmedi.');}
        finally{this.flushing=false;}
        return count;
    }
}
module.exports={SharingDelivery,boundedSend};
