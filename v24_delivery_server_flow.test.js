'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm');
const {createRequire}=require('module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'v24-delivery-sync-')),localRequire=createRequire(path.join(__dirname,'server.js'));
const routes=new Map(),sends=[],logs=[];let sendMode='ok';
const app={use(){},get(p,f){for(const k of [].concat(p))routes.set(k,f);},post(){},listen(_p,f){f();}};
function express(){return app;}express.json=express.static=()=>()=>{};
const external={dotenv:{config(){}},express,cors:()=>()=>{},axios:{create:()=>({get(){throw Error('No real API');}})},
    'node-telegram-bot-api':class{async sendMessage(channel,text,options){sends.push({channel,text,options});if(sendMode==='timeout')throw Error('offline timeout');
        if(sendMode==='400')throw Object.assign(Error('offline declined'),{response:{body:{error_code:400}}});return {message_id:sends.length,chat:{id:channel}};}},
    '@google/generative-ai':{GoogleGenerativeAI:class{}},child_process:{spawn(){throw Error('No real Python');}},
    './dino_selector_v2':{MODEL:{version:'offline',policy:{defaultMinimumOdd:1.5}},scoreMarket:m=>({selectorProbability:m.p16??68.4}),policyCheck:()=>({eligible:true})},
    './dino_selector_v18':{MODEL:{version:'offline'},scoreMarket:()=>({v18Probability:75})}};
const ctx=vm.createContext({require:k=>Object.hasOwn(external,k)?external[k]:localRequire(k),__dirname:root,
    process:{env:{TELEGRAM_BOT_TOKEN:'offline',TELEGRAM_CHANNEL_ID:'offline'},platform:process.platform},console:{log(v){logs.push(v);},warn(){},error(){}},
    Date,Buffer,URL,URLSearchParams,setInterval(){return {unref(){}};},setTimeout(){},clearInterval(){},clearTimeout(){},setImmediate(){}});
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
vm.runInContext(source+`
globalThis.api={botuCalistir,signalTracker,v24ShadowTracker,candidateTracker,telegramDelivery,telegramRouter,
    setup(mac,initial,fresh,options={}){
        let modelCalls=0;globalThis.api.freshChecks=0;globalThis.api.commentCalls=0;globalThis.api.finalChecks=0;
        canliMaclariHazirla=async()=>[mac];hazirMacHalaUygunMu=()=>true;temelStatsTam=()=>true;golgeGucBaglamlariniTopla=async()=>new Map();
        yapayZekaAnaliziYap=async()=>[modelCalls++?fresh:initial];
        sinyalOncesiVerileriYenileVeDogrula=async()=>{
            globalThis.api.freshChecks++;if(options.freshP16!==undefined)mac.p16=options.freshP16;
            const at=new Date().toISOString();mac.stats_validation={status:options.invalid?'failed':'passed',verifiedAt:at};
            mac._v23EventsAt=at;mac.stats_received_at=at;mac.stats_identity_verified=true;
            return {ok:!options.invalid,verifiedAt:at,validation:mac.stats_validation};
        };
        sinyalOncesiCanlilikDogrula=async(_mac,groups)=>{
            globalThis.api.finalChecks++;
            if(options.finalMinute!==undefined)mac.dakika=options.finalMinute;
            if(options.finalOdd!==undefined)groups[0].oran=options.finalOdd;
            if(options.badEvents)mac._v23Events=[];
            if(options.staleStats)mac.stats_validation.verifiedAt=new Date(Date.now()-120001).toISOString();
            if(options.finalFailure){mac._v24FinalGateAudit={status:'blocked',reason:'Son kontrol: skor değişti.',codes:['FINAL_SCORE_CHANGED'],checkedAt:new Date().toISOString()};return false;}
            return true;
        };
        geminiYorumuYaz=async()=>{globalThis.api.commentCalls++;return 'unused comment';};
    }
};`,ctx);
const api=ctx.api;
function match(id,p16=68.4){return {fixture_id:id,mac_isim:'Offline Home - Offline Away',lig:'Test League',league_id:900,
    home_team_id:10,away_team_id:20,skor:'0-1',dakika:44,status_short:'1H',p16,
    home_shot:5,home_sot:2,home_corner:2,away_shot:6,away_sot:3,away_corner:1,
    canli_oranlar:{'2.5_UST':{oran:1.55}},prematch_available:true,prematch_totals:{'2.5':{over:.65,under:.35}},
    prematch_p_home:.3,prematch_p_draw:.2,prematch_p_away:.5,
    _v23Events:[{type:'Goal',detail:'Normal Goal',team:{id:20},player:{id:1},time:{elapsed:12}}]};}
const dino=p=>({'2.5_UST':p,MODEL_VARYANTI:'live_plus_prematch'});
async function run(mac,options={},initial=50.8,fresh=50.8){api.setup(mac,dino(initial),dino(fresh),options);await api.botuCalistir();}
(async()=>{
    // Regression: an old LAB candidate triggers the common fresh check; fresh V24 itself qualifies.
    await run(match(1,64),{freshP16:68.4},63,50.8);
    assert(api.v24ShadowTracker.data.signals.some(s=>s.fixtureId===1),'Fresh V24 Ana LAB did qualify');
    assert.equal(sends.length,1,'Fresh-qualified V24 must not be silently dropped by the initial-source set');
    assert(api.signalTracker.data.signals.some(s=>s.fixtureId===1));assert.equal(api.finalChecks,1);
    assert.equal(api.commentCalls,0,'Unused Gemini generation must not delay V24 final verification');
    await run(match(1));assert.equal(sends.length,1,'Same fixture is still locked after successful send');
    await run(match(2),{finalFailure:true});assert.equal(sends.length,1);
    const rejected=api.candidateTracker.data.records.filter(r=>r.fixtureId===2&&r.liveDeliveryCheck).at(-1);
    assert(rejected);assert(rejected.liveDeliveryCheck.codes.includes('FINAL_SCORE_CHANGED'));
    assert(api.v24ShadowTracker.data.signals.some(s=>s.fixtureId===2),'Final rejection does not erase honest LAB observations');
    await run(match(3),{finalMinute:71});assert.equal(sends.length,1);
    const late=api.candidateTracker.data.records.filter(r=>r.fixtureId===3&&r.liveDeliveryCheck).at(-1);
    assert(late.liveDeliveryCheck.codes.includes('MINUTE_OUTSIDE'));
    await run(match(4),{finalOdd:2});assert.equal(sends.length,1);
    const edge=api.candidateTracker.data.records.filter(r=>r.fixtureId===4&&r.liveDeliveryCheck).at(-1);
    assert(edge.liveDeliveryCheck.codes.includes('DINO_EDGE_OUTSIDE'));
    await run(match(5),{badEvents:true});assert.equal(sends.length,1);
    assert(api.candidateTracker.data.records.filter(r=>r.fixtureId===5&&r.liveDeliveryCheck).at(-1).liveDeliveryCheck.codes.includes('EVENT_SCORE_MISMATCH'));
    await run(match(6),{invalid:true});assert.equal(sends.length,1);
    sendMode='timeout';await run(match(7));assert.equal(sends.length,2);
    assert.equal(api.telegramDelivery.data.entries.find(e=>e.payload.fixtureId===7).status,'uncertain');
    assert.equal(api.candidateTracker.data.records.filter(r=>r.fixtureId===7&&r.liveDeliveryCheck).at(-1).liveDeliveryCheck.status,'uncertain');
    sendMode='ok';await run(match(7));assert.equal(sends.length,2,'Uncertain writes cannot auto-repeat');
    sendMode='400';await run(match(8));assert.equal(sends.length,3);
    sendMode='ok';await run(match(8));assert.equal(sends.length,4,'Explicit Telegram rejection can retry on a new fresh evaluation');
    await run(match(9),{finalFailure:true});assert.equal(sends.length,4);
    await run(match(9));assert.equal(sends.length,5,'A failed final check does not lock future newly qualified live entries');
    assert.equal(api.v24ShadowTracker.data.signals.filter(s=>s.fixtureId===9).length,1,'LAB first observation remains locked separately');
    await run(match(10),{staleStats:true});assert.equal(sends.length,5);
    assert(api.candidateTracker.data.records.filter(r=>r.fixtureId===10&&r.liveDeliveryCheck).at(-1).liveDeliveryCheck.codes.includes('STATS_STALE_OR_FUTURE'));
    api.telegramDelivery.disabled=true;await run(match(11));assert.equal(sends.length,5);
    assert(api.candidateTracker.data.records.filter(r=>r.fixtureId===11&&r.liveDeliveryCheck).at(-1).liveDeliveryCheck.codes.includes('DELIVERY_DISABLED'));
    api.telegramDelivery.disabled=false;
    const res={json(v){this.value=v;}};routes.get('/api/test-lab-comparison')({query:{}},res);
    const main=res.value.v24Shadow.signals;
    assert.equal(main.find(s=>s.fixtureId===1).deliveryView.status,'sent');
    assert.equal(main.find(s=>s.fixtureId===2).deliveryView.status,'blocked');
    assert.equal(main.find(s=>s.fixtureId===7).deliveryView.status,'uncertain');
    assert.equal(main.find(s=>s.fixtureId===8).deliveryView.status,'sent');
    const originalRecordSent=api.signalTracker.recordSent;
    api.signalTracker.recordSent=()=>{throw Error('offline shared tracker write failure');};
    await run(match(12));assert.equal(sends.length,6);
    assert.equal(api.telegramDelivery.data.entries.find(e=>e.payload.fixtureId===12).status,'sent');
    assert.equal(api.candidateTracker.data.records.filter(r=>r.fixtureId===12&&r.liveDeliveryCheck).at(-1).liveDeliveryCheck.status,'sent',
        'A confirmed Telegram receipt is not misclassified when shared tracker persistence fails');
    api.signalTracker.recordSent=originalRecordSent;
    await run(match(12));assert.equal(sends.length,6,'Confirmed receipt stays locked even if shared write failed');
    const persisted=JSON.parse(fs.readFileSync(api.candidateTracker.filePath,'utf8'));
    assert(persisted.records.some(r=>r.liveDeliveryCheck?.codes?.includes('FINAL_SCORE_CHANGED')),'Reasons persist beyond the 80-line log ring');
    console.log('V24 real server delivery: fresh-only qualification, final gates retained, no Gemini wait, persisted skip reasons, LAB delivery view, successful/rejected/uncertain first-fixture semantics passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
    if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('v24-delivery-sync-'))fs.rmSync(root,{recursive:true,force:true});
});
