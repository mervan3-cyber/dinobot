'use strict';
const fs = require('fs'), path = require('path');
const SHARING_KINDS = Object.freeze(['extraTelegram','groupTelegram','x']);
function atomicSave(file, data) {
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file+'.tmp',JSON.stringify(data),'utf8');
    fs.renameSync(file+'.tmp',file);
}
class SharingSettings {
    constructor({filePath, availability, identities=()=>({extraTelegram:'default',x:'default'})}) {
        Object.assign(this,{filePath,availability}); this.disabled = false;
        this.identities=()=>({groupTelegram:'default',...identities()});
        this.data = {version:1,revision:0,extraTelegram:false,groupTelegram:false,x:false,epochs:{extraTelegram:0,groupTelegram:0,x:0},targets:this.identities()};
    }
    load() {
        try {
            if (!fs.existsSync(this.filePath)) return;
            const d = JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if (d.version!==1 || !Number.isSafeInteger(d.revision) || d.revision<0 || ['extraTelegram','x'].some(k=>typeof d[k]!=='boolean'||!Number.isSafeInteger(d.epochs?.[k])||d.epochs[k]<0)) throw Error('invalid');
            const targets=this.identities();let changed=false;
            // Old two-target settings migrate without resetting their toggles or epochs.
            if(!Object.hasOwn(d,'groupTelegram') && !Object.hasOwn(d.epochs,'groupTelegram') && !Object.hasOwn(d.targets||{},'groupTelegram')){
                d.groupTelegram=false;d.epochs.groupTelegram=0;
                d.targets={...d.targets,groupTelegram:targets.groupTelegram};changed=true;
            }
            if(typeof d.groupTelegram!=='boolean'||!Number.isSafeInteger(d.epochs.groupTelegram)||d.epochs.groupTelegram<0)throw Error('invalid group settings');
            for(const k of SHARING_KINDS){
                // Env destination/account removal or replacement requires explicit re-enabling.
                // Returning to an old target must not revive its old pending winner replies.
                if(d.targets?.[k]!==targets[k] || (d[k]&&!this.availability()[k]?.configured)){
                    d[k]=false;d.epochs[k]++;changed=true;
                }
            }
            d.targets=targets;
            if(changed){d.revision++;atomicSave(this.filePath,d);}
            this.data=d;
        } catch (_) { this.disabled=true; }
    }
    active(kind) { return !!(!this.disabled && SHARING_KINDS.includes(kind) && this.data[kind] && this.availability()[kind]?.configured); }
    status() {
        const available=this.availability();
        const status={revision:this.data.revision,disabled:this.disabled};
        for(const kind of SHARING_KINDS)status[kind]={configured:false,reason:'Paylaşım hedefi yapılandırılmamış.',...available[kind],enabled:this.data[kind],active:this.active(kind)};
        return status;
    }
    update(input) {
        if (this.disabled) throw Error('Paylaşım ayar dosyası okunamadı; dosyayı kontrol edin.');
        if (!input || Object.keys(input).some(k=>!['revision',...SHARING_KINDS].includes(k)) || !Number.isSafeInteger(input.revision) || input.revision!==this.data.revision) throw Error('Ayarlar değişti. Sayfayı yenileyin.');
        const next=JSON.parse(JSON.stringify(this.data)), available=this.availability();
        for (const k of SHARING_KINDS) {
            if (input[k]===undefined) continue;
            if (typeof input[k]!=='boolean') throw Error('Aç/kapat değeri geçersiz.');
            if (input[k] && !available[k]?.configured) throw Error(available[k]?.reason || '.env yapılandırması eksik.');
            if (input[k]!==next[k]) {next[k]=input[k];next.epochs[k]++;}
        }
        next.revision++;
        try { atomicSave(this.filePath,next); } catch (_) { throw Error('Ayarlar diske yazılamadı; önceki ayarlar korunuyor.'); }
        this.data=next; return this.status();
    }
}
module.exports={SharingSettings,atomicSave,SHARING_KINDS};
