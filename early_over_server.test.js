'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {createRequire}=require('module'),localRequire=createRequire(path.join(__dirname,'server.js'));
const {SignalTracker}=require('./signal_tracker'),telegram=require('./mac_yakala_telegram'),{SharingDelivery}=require('./sharing_delivery');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-yakala-early-server-'));
let now=Date.parse('2026-10-05T12:00:00Z');const sends=[],requests=[],timers=[];
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const app={use(){},get(){},post(){},listen(_p,fn){fn();}};
function express(){return app;}express.json=express.static=()=>()=>{};
const external={dotenv:{config(){}},express,cors:()=>()=>{},axios:{create:()=>({get(){throw Error('No real network');}})},
    'node-telegram-bot-api':class {async sendMessage(chat,text,options){sends.push({chat:String(chat),text,options});return {message_id:sends.length,chat:{id:chat}};}},
    '@google/generative-ai':{GoogleGenerativeAI:class{}},child_process:{spawn(){throw Error('No model execution');}},
    './signal_tracker':{...localRequire('./signal_tracker'),SignalTracker:class extends SignalTracker {constructor(options){super({...options,now:()=>now});}}},
    './mac_yakala_telegram':{...telegram,TelegramDelivery:class extends telegram.TelegramDelivery {constructor(options){super({...options,now:()=>now});}}},
    './sharing_delivery':{SharingDelivery:class extends SharingDelivery {constructor(options){super({...options,now:()=>now});}}}};
const ctx=vm.createContext({require:name=>Object.hasOwn(external,name)?external[name]:localRequire(name),__dirname:root,
    process:{env:{TELEGRAM_BOT_TOKEN:'offline',TELEGRAM_CHANNEL_ID:'-1001',TELEGRAM_EXTRA_CHAT_ID:'-1002',API_FOOTBALL_KEY:'offline'},platform:process.platform},
    console:{log(){},warn(){},error(){}},Date:Clock,Buffer,URL,URLSearchParams,
    setInterval(fn,ms){timers.push({fn,ms});return {unref(){}};},setTimeout(){},setImmediate(){},clearInterval(){},clearTimeout(){}});
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
vm.runInContext(source+`
globalThis.api={signalTracker,telegramDelivery,sharingSettings,sharingDelivery,canliMaclariHazirla,paylasilanSinyalSonuclariniGuncelle,
    setFixtures(fixtures,requests) {apiGet=async(url)=>{requests.push(url);if(url==='/fixtures?live=all')return {data:{response:fixtures}};if(url==='/odds/live')return {data:{response:[]}};
        if(url.startsWith('/fixtures?ids=')){const ids=url.split('=')[1].split('-').map(Number);return {data:{response:fixtures.filter(f=>ids.includes(Number(f.fixture.id)))}};}
        throw Error('Unexpected football request: '+url);};}
};`,ctx);
const api=ctx.api,stamp=()=>new Date(now).toISOString();
const fixture=(id,home,away,status='2H',minute=85)=>({fixture:{id,status:{short:status,elapsed:minute}},goals:{home,away},score:{fulltime:status==='FT'?{home,away}:{home:null,away:null}},league:{id:900,name:'Test'}});
const payload=(id,market='1.5_UST')=>({fixtureId:id,signalType:'strong',sentAt:stamp(),signalSources:['V24'],minute:35,score:'1-0',market,odds:1.6,match:'Home - Away',league:'Test',analysis:'Test',statsValidation:{status:'passed'},entryAudit:{eventScore:{status:'approve'}}});
const drain=()=>new Promise(setImmediate);
(async()=>{
    api.sharingSettings.update({revision:0,extraTelegram:true,groupTelegram:true});
    const p=payload(100);assert(await api.telegramDelivery.publish('-1001',p));await api.sharingDelivery.publish(api.telegramDelivery.findSent('-1001',p));
    const original=sends.slice(),before=sends.length;api.setFixtures([fixture(100,1,1)],requests);
    assert.equal((await api.canliMaclariHazirla()).length,0,'85-minute fixture never enters model candidates');await drain();assert.equal(sends.length,before);
    now+=5*60_000;assert.equal((await api.canliMaclariHazirla()).length,0);await drain();assert.equal(sends.length,before+3);
    assert.deepEqual(requests,['/fixtures?live=all','/odds/live','/fixtures?live=all','/odds/live'],'Early notifier adds no football request');
    for(const message of original){const reply=sends.slice(before).find(s=>s.chat===message.chat);assert(reply);assert.equal(JSON.parse(reply.options.reply_parameters).message_id,sends.indexOf(message)+1);}
    assert.equal(api.signalTracker.data.signals[0].settlement.result,null);assert.equal(api.signalTracker.summary().overall.wins,0);
    now+=60_000;api.setFixtures([fixture(100,1,1,'FT',90)],requests);const firstFinal=sends.length;
    await api.paylasilanSinyalSonuclariniGuncelle({manuel:true});assert.equal(sends.length,firstFinal);assert.equal(api.signalTracker.data.signals[0].settlement.result,'W');
    assert.equal(requests.at(-1),'/fixtures?ids=100','Normal existing result batch still closes the final score');
    // The existing result batch can provide the second confirmation, without any new endpoint.
    now+=60_000;const p2=payload(101);assert(await api.telegramDelivery.publish('-1001',p2));await api.sharingDelivery.publish(api.telegramDelivery.findSent('-1001',p2));
    api.setFixtures([fixture(101,1,1)],requests);await api.canliMaclariHazirla();await drain();const secondBefore=sends.length,requestBefore=requests.length;
    now+=60_000;await api.paylasilanSinyalSonuclariniGuncelle({manuel:true});assert.equal(sends.length,secondBefore+3);assert.deepEqual(requests.slice(requestBefore),['/fixtures?ids=101']);
    assert.equal(api.signalTracker.data.signals.find(s=>s.fixtureId===101).settlement.result,null);
    // MS remains pending while leading, and early-score rollback waits for two new responses.
    now+=60_000;const ms=payload(102,'MS2');assert(await api.telegramDelivery.publish('-1001',ms));const msBefore=sends.length;
    for(let i=0;i<2;i++){api.setFixtures([fixture(102,0,2)],requests);await api.canliMaclariHazirla();await drain();now+=5*60_000;}assert.equal(sends.length,msBefore);
    assert.equal(api.signalTracker.data.signals.find(s=>s.fixtureId===102).settlement.result,null);
    assert(!timers.some(t=>/erken|early/i.test(t.fn.name)),'No extra polling timer');
    const observer=source.slice(source.indexOf('async function erkenUstKazanimlariniGozle'),source.indexOf('async function paylasilanSinyalSonuclariniGuncelle'));
    assert.doesNotMatch(observer,/apiGet|Python|setInterval/);
    console.log('Early OVER real server flow passed: raw 85+ minute score feed, separate responses/own replies, existing batch second check, final grading, unchanged MS and exactly zero new football requests/timers.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('mac-yakala-early-server-'))fs.rmSync(root,{recursive:true,force:true});});
