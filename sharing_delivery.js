'use strict';
const fs=require('fs'),crypto=require('crypto');
const {atomicSave}=require('./sharing_settings');
const {formatSignal,WIN_TEXT}=require('./mac_yakala_telegram');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const copy=s=>JSON.parse(JSON.stringify(s));
const errorCode=e=>Number(e?.statusCode||e?.response?.body?.error_code)||null;
function boundedSend(action,ms=15000) {
    let timer;
    return Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),ms);})]).finally(()=>clearTimeout(timer));
}
class SharingDelivery {
    constructor({filePath,settings,tracker,extraChatId='',xIdentity='',telegramSend,xSend,logger=()=>{},now=Date.now,timeoutMs=15000}) {
        Object.assign(this,{filePath,settings,tracker,extraChatId:String(extraChatId),xIdentity,telegramSend,xSend,logger,now,timeoutMs});
        this.data={version:1,entries:[]};this.disabled=false;this.flushing=false;
    }
    save() {try{atomicSave(this.filePath,this.data);}catch(e){this.disabled=true;throw e;}}
    load() {
        try {
            if(!fs.existsSync(this.filePath))return;
            const d=JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if(d.version!==1||!Array.isArray(d.entries)||d.entries.some(e=>!e.key||!e.primaryKey||!['extraTelegram','x'].includes(e.kind)||!['sending','sent','declined','uncertain','skipped'].includes(e.status)||!Number.isSafeInteger(e.epoch)))throw Error('invalid');
            this.data=d;
            for(const e of d.entries){if(e.status==='sending')e.status='uncertain';if(e.win?.status==='sending')e.win.status='uncertain';}
            this.save();
        }catch(_){this.disabled=true;this.logger('> ⚠️ Ek paylaşım günlüğü hatalı; ana Telegram etkilenmedi, ek paylaşımlar kapalı.');}
    }
    target(kind){return kind==='extraTelegram'?this.extraChatId:this.xIdentity;}
    active(e){return !this.disabled&&this.settings.active(e.kind)&&e.target===this.target(e.kind)&&e.epoch===this.settings.data.epochs[e.kind];}
    status(){
        const result={disabled:this.disabled};
        for(const kind of ['extraTelegram','x']){
            const entries=this.data.entries.filter(e=>e.kind===kind&&e.target===this.target(kind));
            const e=entries[entries.length-1];
            result[kind]={sent:entries.filter(e=>e.status==='sent').length,last:e?{status:e.status,at:e.createdAt,errorCode:e.errorCode||null,reason:e.reason||null}:null};
        }
        return result;
    }
    async publish(primary){
        if(this.disabled||primary?.status!=='sent'||!primary.key||!primary.messageId)return;
        // Only the primary acknowledged send triggers mirrors. No replay/backfill on startup or toggle.
        await Promise.all(['extraTelegram','x'].map(kind=>this.publishOne(primary,kind)));
    }
    async publishOne(primary,kind){
        if(!this.settings.active(kind)||this.disabled)return;
        const target=this.target(kind),key=hash(primary.key+'|'+kind+'|'+target);
        if(!target||this.data.entries.some(e=>e.key===key))return;
        const entry={key,primaryKey:primary.key,kind,target,epoch:this.settings.data.epochs[kind],status:'sending',createdAt:new Date(this.now()).toISOString(),win:null};
        if(kind==='extraTelegram'&&[primary.chatId,primary.requestedChannel].some(id=>String(id)===target))return;
        try{
            this.data.entries.push(entry);this.save();
            if(!this.active(entry)){entry.status='skipped';this.save();return;}
            let response;
            try{
                response=await boundedSend(()=>{
                    if(!this.active(entry)){const e=Error('disabled');e.statusCode=409;throw e;}
                    return kind==='extraTelegram'?this.telegramSend(target,formatSignal(primary.payload),{parse_mode:'HTML'}):this.xSend(copy(primary.payload));
                },this.timeoutMs);
                const id=kind==='extraTelegram'?response?.message_id:response?.id;
                if(kind==='extraTelegram'?(!Number.isInteger(id)||id<=0):!/^\d+$/.test(String(id||'')))throw Error('missing ack');
                entry.messageId=id;entry.chatId=kind==='extraTelegram'?(response.chat?.id??target):undefined;entry.status='sent';
            }catch(e){
                entry.errorCode=errorCode(e);entry.status=entry.errorCode>=400&&entry.errorCode<500?'declined':'uncertain';
                entry.reason=e?.safeReason||null;
                this.logger(`> ⚠️ ${kind==='x'?'X':'Ek Telegram'} paylaşımı ${entry.status}; ana kanal etkilenmedi. Otomatik tekrar yok.`);
            }
            this.save();
        }catch(_){this.disabled=true;this.logger('> ⚠️ Ek paylaşım kaydı yazılamadı; yalnız ek paylaşımlar durduruldu.');}
    }
    async flushWins(){
        if(this.disabled||this.flushing)return 0;
        this.flushing=true;let count=0;
        try{
            for(const e of this.data.entries){
                if(e.kind!=='extraTelegram'||!this.active(e)||e.status!=='sent'||!e.messageId||['sent','sending','uncertain','failed'].includes(e.win?.status)||(e.win?.retryAt||0)>this.now())continue;
                if(this.tracker.data.signals.find(s=>s.deliveryKey===e.primaryKey)?.settlement?.result!=='W')continue;
                e.win={status:'sending'};this.save();
                try{
                    const r=await boundedSend(()=>{
                        if(!this.active(e)){const error=Error('disabled');error.statusCode=409;throw error;}
                        return this.telegramSend(e.chatId,WIN_TEXT,{reply_parameters:JSON.stringify({message_id:e.messageId,allow_sending_without_reply:false})});
                    },this.timeoutMs);
                    e.win=Number.isInteger(r?.message_id)&&r.message_id>0?{status:'sent',messageId:r.message_id}:{status:'uncertain'};
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
