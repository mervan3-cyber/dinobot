'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {createRequire}=require('module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'v24-transition-server-'));
const localRequire=createRequire(path.join(__dirname,'server.js'));
const routes=new Map(),sends=[],timers=[],required=[];
const app={use(){},get(route,fn){for(const key of [].concat(route))routes.set(key,fn);},post(){},listen(_port,fn){fn();}};
function express(){return app;}express.json=express.static=()=>()=>{};
const score16={MODEL:{version:'offline16',policy:{defaultMinimumOdd:1.5}},scoreMarket:(m,k)=>({selectorProbability:m.p16??(k.startsWith('MS')?65:74)}),policyCheck:()=>({eligible:true})};
const score18={MODEL:{version:'offline18'},scoreMarket:()=>({v18Probability:70})};
const external={dotenv:{config(){}},express,cors:()=>()=>{},axios:{create:()=>({get(){throw Error('No live API allowed');}})},
    'node-telegram-bot-api':class{async sendMessage(channel,text,options){sends.push({channel,text,options});return {message_id:sends.length,chat:{id:channel}};}},
    '@google/generative-ai':{GoogleGenerativeAI:class{}},child_process:{spawn(){throw Error('No live Python allowed');}},
    './dino_selector_v2':score16,'./dino_selector_v18':score18};
const retired=['dino_v23_filter_history_v2.json','dino_v23_goal_history.json','dino_v23_goal_cache.json','dino_v24_weekend_guard_history.json'];
for(const name of retired)fs.writeFileSync(path.join(root,name),'retired evidence preserved: '+name);
const ctx=vm.createContext({require(name){required.push(name);return Object.hasOwn(external,name)?external[name]:localRequire(name);},__dirname:root,
    process:{env:{TELEGRAM_BOT_TOKEN:'offline',TELEGRAM_CHANNEL_ID:'offline',TELEGRAM_EXTRA_CHAT_ID:'-1002',MAC_YAKALA_V21_TELEGRAM_ENABLED:'true',MAC_YAKALA_V22_TELEGRAM_ENABLED:'true',DINO_V23_SHADOW_ENABLED:'true',DINO_V24_WEEKEND_GUARD_HISTORY_FILE:path.join(root,retired[3])},platform:process.platform},
    console:{log(){},warn(){},error(){}},Date,Buffer,URL,URLSearchParams,
    setInterval(fn,ms){timers.push({fn,ms});return {unref(){}};},setTimeout(){},setImmediate(){},clearInterval(){},clearTimeout(){}});
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.doesNotMatch(source,/new FilterLab|v23GoalLab|v23YerelArsivBakimi|v24WeekendGuardTracker|v24WeekendGuardLab/);
vm.runInContext(source+`
globalThis.api={botuCalistir,signalTracker,v24ShadowTracker,oldTelegramTracker,v24GeminiWeekendLab,paylasilanSinyalSonuclariniGuncelle,sharingSettings,sharingDelivery,
    logs:()=>systemLogs,
    setup(mac,initial,fresh,options={}) {
        let calls=0; globalThis.api.freshChecks=0;
        canliMaclariHazirla=async()=>[mac];hazirMacHalaUygunMu=()=>true;temelStatsTam=()=>true;
        golgeGucBaglamlariniTopla=async()=>new Map();yapayZekaAnaliziYap=async()=>[calls++?fresh:initial];
        sinyalOncesiVerileriYenileVeDogrula=async()=>{
            globalThis.api.freshChecks++; const at=new Date().toISOString();
            mac.stats_validation={status:options.invalid?'failed':'passed',verifiedAt:at};
            mac.stats_received_at=at;mac.stats_identity_verified=true;mac._v23EventsAt=at;
            if(options.badEvents)mac._v23Events=[];
            return {ok:!options.invalid,verifiedAt:at,validation:mac.stats_validation};
        };
        sinyalOncesiCanlilikDogrula=async(_mac,groups)=>{
            if(options.finalMinute!==undefined)mac.dakika=options.finalMinute;
            if(options.finalOdd!==undefined)groups[0].oran=options.finalOdd;
            if(options.finalAwayPre!==undefined)mac.prematch_p_away=options.finalAwayPre;
            return !options.finalFailure;
        };
        geminiYorumuYaz=async()=> '2.5 üstü ihtimalini destekliyor.';
    },
    settle(ids) {apiGet=async()=>({data:{response:ids.map(id=>({fixture:{id,status:{short:'FT'}},score:{fulltime:{home:1,away:4}}}))}});}
};`,ctx);
const api=ctx.api;
function mac(id,score='1-0',market='1.5_UST',minute=30,extra={}) {const goals=score.split('-').map(Number);return {
    fixture_id:id,mac_isim:'Home W - Away W',lig:'Women League',league_id:900,home_team_id:10,away_team_id:20,
    dakika:minute,skor:score,status_short:minute>45?'2H':'1H',home_shot:8,home_sot:2,away_shot:8,away_sot:2,
    canli_oranlar:{[market]:{oran:market.startsWith('MS')?1.6:1.8,bookmaker:'Offline'}},prematch_available:true,
    prematch_totals:{'1.5':{over:.8,under:.2},'2.5':{over:.65,under:.35},'3.5':{over:.4,under:.6},'4.5':{over:.3,under:.7}},
    prematch_p_home:.6,prematch_p_draw:.2,prematch_p_away:.2,
    _v23Events:Array.from({length:goals[0]+goals[1]},(_,i)=>({type:'Goal',detail:'Normal Goal',team:{id:i<goals[0]?10:20},player:{id:100+i},time:{elapsed:10+i}})),...extra};}
const dino=(market,p=54)=>({[market]:p,MODEL_VARYANTI:'live_plus_prematch'});
async function run(m,options={},freshP=54){api.setup(m,dino(Object.keys(m.canli_oranlar)[0]),dino(Object.keys(m.canli_oranlar)[0],freshP),options);await api.botuCalistir();}
(async()=>{
    for(const [id,score,market,branch]of [[1,'0-0','1.5_UST','SNIPER'],[2,'1-0','1.5_UST','B'],[3,'0-1','2.5_UST','A'],[4,'0-1','MS2','MS']]) {
        const extra=branch==='MS'?{prematch_p_home:.4,prematch_p_away:.4}:{};
        await run(mac(id,score,market,30,extra));assert.equal(sends.length,id,api.logs().slice(-12).join('\n'));
        const s=api.signalTracker.data.signals.find(x=>x.fixtureId===id);assert(s);assert.equal(s.matchedFilters[0],branch);
        assert.deepEqual(Array.from(s.signalSources),['V24']);assert(s.entryAudit.eventScore.status==='approve');
        assert(sends.at(-1).text.includes('Model:</b> V24'));assert(!sends.at(-1).text.includes('Öncelikli modelimiz'));
        assert.equal(api.freshChecks,1,'LABs reuse the same fresh check');
    }
    assert(api.oldTelegramTracker.data.signals.length>0,'Former rules still run locally even when their environment flags were true');
    await run(mac(1));assert.equal(sends.length,4,'Repeated fixture cannot emit a second branch');
    await run(mac(5),{invalid:true});assert.equal(sends.length,4);
    await run(mac(6),{badEvents:true});assert.equal(sends.length,4,'Events required for live V24');
    await run(mac(7),{finalMinute:71});assert.equal(sends.length,4,'Minute crossing the V24 boundary blocks live delivery');
    await run(mac(8),{finalOdd:2});assert.equal(sends.length,4,'Actual final odd must keep Dino edge<=0');
    await run(mac(9),{},44);assert.equal(sends.length,4,'Failed fresh model probability cannot send');
    await run(mac(10),{finalOdd:1.7});assert.equal(sends.length,5);assert.equal(api.signalTracker.data.signals.at(-1).odds,1.7);
    for(const [id,market]of [[11,'3.5_ALT'],[12,'X']])await run(mac(id,'1-0',market));
    assert.equal(sends.length,5,'No unapproved ALT or X live markets');
    const statusResponse={json(v){this.value=v;}};routes.get('/api/status')({},statusResponse);
    assert.deepEqual(Array.from(statusResponse.value.marketTariff.telegramSources),['V24']);
    assert.equal(statusResponse.value.marketTariff.maximumSignalsPerFixture,1);
    assert.equal(routes.has('/api/v24-weekend-guard-history'),false);assert.equal(routes.has('/api/v23-goal-history'),false);
    assert(routes.has('/api/old-telegram-lab-history/export'));assert(routes.has('/api/v24-weekend-quiet-history'));
    assert(!required.includes('./v23_filter_lab'),'Retired collector is not even imported at boot');
    assert(!timers.some(t=>/v23|guard/i.test(t.fn.name)),'No retired collector/guard timer');
    api.settle([1,2,3,4,10]);await api.paylasilanSinyalSonuclariniGuncelle({manuel:true});
    assert(api.signalTracker.data.signals.every(s=>s.settlement?.result==='W'));
    assert(api.oldTelegramTracker.data.signals.some(s=>s.settlement),'Former Telegram LAB settles through shared result batch');
    for(const name of retired)assert.equal(fs.readFileSync(path.join(root,name),'utf8'),'retired evidence preserved: '+name);
    // Real production fan-out: main ack triggers both Telegram mirrors, not new model/API work.
    const before=sends.length,signalsBefore=api.signalTracker.data.signals.length;
    assert.equal(api.sharingSettings.active('groupTelegram'),false);
    assert.equal(api.sharingSettings.status().groupTelegram.configured,true);
    api.sharingSettings.update({revision:api.sharingSettings.data.revision,extraTelegram:true,groupTelegram:true});
    assert.equal(sends.length,before,'Enabling a new destination never backfills old signals');
    await run(mac(13));await new Promise(setImmediate);
    assert.equal(sends.length,before+3,'One main + existing channel + new Live group');
    const fanout=sends.slice(before);assert.deepEqual(fanout.map(s=>String(s.channel)).sort(),['-1002','-1004308912742','offline'].sort());
    assert(fanout.every(s=>s.text===fanout[0].text),'Exact same live V24 signal');
    assert.equal(api.signalTracker.data.signals.length,signalsBefore+1,'Mirrors do not duplicate shared signal counters');
    assert.equal(api.freshChecks,1,'No extra football API/model validation for group mirroring');
    const priorWins=sends.length;api.settle([13]);await api.paylasilanSinyalSonuclariniGuncelle({manuel:true});
    assert.equal(sends.length,priorWins+3,'Each destination replies to its own winning signal');
    for(const original of fanout){const win=sends.slice(priorWins).find(s=>String(s.channel)===String(original.channel));assert(win);assert.equal(JSON.parse(win.options.reply_parameters).message_id,sends.indexOf(original)+1);}
    await run(mac(13));await new Promise(setImmediate);assert.equal(sends.length,priorWins+3,'No duplicate send to any destination');
    const msBefore=sends.length;
    await run(mac(60,'0-1','MS2',30,{prematch_p_home:.6,prematch_p_away:.35999}));
    assert.equal(sends.length,msBefore,'MS2 uses the away prematch, not the stronger home side');
    await run(mac(61,'0-1','MS2',30,{prematch_p_away:null}));
    assert.equal(sends.length,msBefore,'Missing MS prematch cannot send');
    await run(mac(62,'0-1','MS2',30,{prematch_p_home:.4,prematch_p_away:.4}),{finalAwayPre:.35});
    assert.equal(sends.length,msBefore,'Prematch below 36 at the final check cannot send');
    assert(!api.signalTracker.data.signals.some(s=>s.fixtureId===62),'Rejected MS does not consume the shared signal lock');
    await run(mac(62,'0-1','MS2',30,{prematch_p_home:.44,prematch_p_away:.36}));await new Promise(setImmediate);
    assert.equal(sends.length,msBefore+3,'Exact 36 passes and fans out once to all three destinations');
    const acceptedMs=api.signalTracker.data.signals.find(s=>s.fixtureId===62);
    assert.equal(acceptedMs.prematchMarketSupport,36);assert.equal(acceptedMs.entryAudit.thresholds.prematch,36);
    await run(mac(62,'0-1','MS2',30,{prematch_p_away:.8}));await new Promise(setImmediate);
    assert.equal(sends.length,msBefore+3,'MS prematch update does not bypass the first signal lock');
    console.log('V24 real server flow (offline): all live arms and women, no V21/V22 sends, fresh/final gates, single fixture lock, legacy LAB settlement, no retired modules/timers/routes and byte-preserved archives passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
    if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('v24-transition-server-'))fs.rmSync(root,{recursive:true,force:true});
});
