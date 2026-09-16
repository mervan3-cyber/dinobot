'use strict';
const fs = require('fs'), path = require('path');
function atomicSave(file, data) {
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file+'.tmp',JSON.stringify(data),'utf8');
    fs.renameSync(file+'.tmp',file);
}
class SharingSettings {
    constructor({filePath, availability, identities=()=>({extraTelegram:'default',x:'default'})}) {
        Object.assign(this,{filePath,availability,identities}); this.disabled = false;
        this.data = {version:1,revision:0,extraTelegram:false,x:false,epochs:{extraTelegram:0,x:0},targets:identities()};
    }
    load() {
        try {
            if (!fs.existsSync(this.filePath)) return;
            const d = JSON.parse(fs.readFileSync(this.filePath,'utf8'));
            if (d.version!==1 || !Number.isSafeInteger(d.revision) || d.revision<0 || ['extraTelegram','x'].some(k=>typeof d[k]!=='boolean'||!Number.isSafeInteger(d.epochs?.[k])||d.epochs[k]<0)) throw Error('invalid');
            const targets=this.identities();let changed=false;
            for(const k of ['extraTelegram','x']){
                // Env destination/account removal or replacement requires explicit re-enabling.
                // Returning to an old target must not revive its old pending winner replies.
                if(d.targets?.[k]!==targets[k] || (d[k]&&!this.availability()[k].configured)){
                    d[k]=false;d.epochs[k]++;changed=true;
                }
            }
            d.targets=targets;
            if(changed){d.revision++;atomicSave(this.filePath,d);}
            this.data=d;
        } catch (_) { this.disabled=true; }
    }
    active(kind) { return !this.disabled && this.data[kind] && this.availability()[kind].configured; }
    status() {
        const available=this.availability();
        return {revision:this.data.revision,disabled:this.disabled,extraTelegram:{...available.extraTelegram,enabled:this.data.extraTelegram,active:!!this.active('extraTelegram')},x:{...available.x,enabled:this.data.x,active:!!this.active('x')}};
    }
    update(input) {
        if (this.disabled) throw Error('Paylaşım ayar dosyası okunamadı; dosyayı kontrol edin.');
        if (!input || Object.keys(input).some(k=>!['revision','extraTelegram','x'].includes(k)) || !Number.isSafeInteger(input.revision) || input.revision!==this.data.revision) throw Error('Ayarlar değişti. Sayfayı yenileyin.');
        const next=JSON.parse(JSON.stringify(this.data)), available=this.availability();
        for (const k of ['extraTelegram','x']) {
            if (input[k]===undefined) continue;
            if (typeof input[k]!=='boolean') throw Error('Aç/kapat değeri geçersiz.');
            if (input[k] && !available[k].configured) throw Error(available[k].reason || '.env yapılandırması eksik.');
            if (input[k]!==next[k]) {next[k]=input[k];next.epochs[k]++;}
        }
        next.revision++;
        try { atomicSave(this.filePath,next); } catch (_) { throw Error('Ayarlar diske yazılamadı; önceki ayarlar korunuyor.'); }
        this.data=next; return this.status();
    }
}
module.exports={SharingSettings,atomicSave};
