'use strict';
// One selected Istanbul calendar day only. A range never rolls into tomorrow.
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function minute(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Tarama saati SS:DD biçiminde, 00:00–23:59 arasında olmalı.');const [h,m]=value.split(':').map(Number);return h*60+m;}
function normalize(settings={}){const mode=settings.scanWindowMode===undefined?'all-day':settings.scanWindowMode,from=settings.scanFrom===undefined?'00:00':settings.scanFrom,to=settings.scanTo===undefined?'23:59':settings.scanTo;
    if(!['all-day','range'].includes(mode))throw Error('Tarama zamanı Tüm gün veya Saat aralığı olmalı.');
    const a=minute(from),b=minute(to);if(mode==='range'&&a>b)throw Error('Başlangıç saati bitişi aşamaz. Geceyi geçen aralık yerine seçili gün için ayrı taramalar yapın.');
    return {scanWindowMode:mode,scanFrom:from,scanTo:to};}
function contains(kickoff,date,settings={}){const time=Date.parse(kickoff);if(!Number.isFinite(time))return false;const p=Object.fromEntries(formatter.formatToParts(new Date(time)).map(x=>[x.type,x.value]));
    if(`${p.year}-${p.month}-${p.day}`!==date)return false;const s=normalize(settings);if(s.scanWindowMode==='all-day')return true;const n=Number(p.hour)*60+Number(p.minute);return n>=minute(s.scanFrom)&&n<=minute(s.scanTo);}
function label(settings={}){const s=normalize(settings);return s.scanWindowMode==='range'?`${s.scanFrom}–${s.scanTo} TSİ`:'Tüm gün (TSİ)';}
module.exports={minute,normalize,contains,label};
