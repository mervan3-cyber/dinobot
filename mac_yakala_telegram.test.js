'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {SignalTracker}=require('./signal_tracker');
const {createRouter,TelegramDelivery,formatSignal,WIN_TEXT,FOOTER}=require('./mac_yakala_telegram');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-yakala-telegram-'));
const deliveries=[];let sequence=100,behavior='ok',now=Date.parse('2026-09-16T12:00:00Z');
const tracker=new SignalTracker({filePath:path.join(root,'history.json'),strict:true});tracker.load();
const filePath=path.join(root,'delivery.json');
const send=async(channel,text,options)=>{
    deliveries.push({channel,text,options});
    if(behavior==='timeout')throw Error('timeout');
    if(behavior==='400')throw Object.assign(Error('missing reply'),{response:{body:{error_code:400}}});
    if(behavior==='429')throw Object.assign(Error('rate limited'),{response:{body:{error_code:429,parameters:{retry_after:2}}}});
    return {message_id:sequence++,chat:{id:-1234}};
};
const makeDelivery=()=>new TelegramDelivery({filePath,tracker,send,now:()=>now});
let delivery=makeDelivery();delivery.load();
const model={MODEL:{version:'test'},scoreMarket:()=>({selectorProbability:65,v18Probability:65})};
const router=()=>createRouter({delivery,channel:'@channel',v16Model:model,v18Model:model,prematchSupport:()=>80,prematchSource:()=>null,
    alreadyDecided:(market,score)=>Number(market.split('_')[0])<score.split('-').map(Number).reduce((a,b)=>a+b),liveSnapshot:()=>({})});
const mac=(id,minute=35,score='0-0')=>({fixture_id:id,mac_isim:'Home <&> Away',lig:'Test League',dakika:minute,skor:score,
    stats_validation:{status:'passed',verifiedAt:new Date(now).toISOString()},canli_oranlar:{'1.5_UST':{oran:1.6}}});
const dino=(p=60)=>({'1.5_UST':p,MODEL_VARYANTI:'live_plus_prematch'});
const chosen=(m,p=60)=>router().select({mac:m,dino:dino(p),liveOnlyDino:null});
const payload=(m,g)=>router().record(m,g,'Canlı hücum verileri değerlendirildi. Bir gol daha gerekiyor.',new Date(now).toISOString());
const settle=(id,home,away,status='FT')=>tracker.settleFixture({fixture:{id,status:{short:status}},score:{fulltime:{home,away}}});
(async()=>{
    let m=mac(1),groups=chosen(m);
    assert.equal(groups.length,1);assert.deepEqual(groups[0].choices.map(c=>c.source),['V21']);
    assert(await delivery.publish('@channel',payload(m,groups[0])));
    assert.equal(chosen(m).length,0,'Own source cannot emit repeatedly');
    now+=25*60*1000;m=mac(1,60,'1-0');groups=chosen(m,54);
    assert.deepEqual(groups[0].choices.map(c=>c.source),['V22']);
    assert(await delivery.publish('@channel',payload(m,groups[0])),'V21 35 / V22 60 same market must both send');
    assert.equal(tracker.data.signals.length,2);assert.equal(tracker.data.signals[0].market,tracker.data.signals[1].market);
    assert.deepEqual(tracker.data.signals.map(s=>s.minute),[35,60]);
    m=mac(2,60,'1-0');groups=chosen(m);
    assert.deepEqual(groups[0].choices.map(c=>c.source),['V22','V21']);
    assert(await delivery.publish('@channel',payload(m,groups[0])));
    assert.equal(deliveries.length,3,'Exact overlap is one message, not a consensus prerequisite');
    const text=deliveries[2].text;
    assert.match(text,/MAÇ YAKALA/);assert.match(text,/Model:<\/b> V22/);assert.match(text,/Model:<\/b> V21/);
    assert.match(text,/1\.5 ÜST • 💰 ORAN: 1\.600/);assert.match(text,/Home &lt;&amp;&gt; Away/);assert(text.endsWith(FOOTER));
    assert(!/Dino|DİNO|EDGE|Kaynak:|Karar Motoru|Piyasa|Pre-Match|İhtimal/i.test(text));
    assert.equal(await delivery.flushWins(),0,'No celebration on live/unsettled records');
    settle(1,1,1);assert.equal(await delivery.flushWins(),2,'Each separately sent entry gets its own reply');
    const replies=deliveries.filter(d=>d.text===WIN_TEXT);
    assert.deepEqual(replies.map(d=>JSON.parse(d.options.reply_parameters).message_id),[100,101]);
    assert(replies.every(d=>d.channel===-1234&&!JSON.parse(d.options.reply_parameters).allow_sending_without_reply));
    assert.equal(await delivery.flushWins(),0);
    delivery=makeDelivery();delivery.load();assert.equal(await delivery.flushWins(),0,'Restart cannot repeat successful replies');
    settle(2,0,1);assert.equal(await delivery.flushWins(),0,'No loss notification');
    assert.equal(tracker.data.signals[2].settlement.result,'L','Loss remains in statistics');
    // Explicit Telegram rejection is retryable using a freshly generated signal, never old cached odds.
    behavior='400';m=mac(3);groups=chosen(m);assert.equal(await delivery.publish('@channel',payload(m,groups[0])),false);
    behavior='ok';assert.equal(delivery.hasSource('@channel','V21',3),false);assert(await delivery.publish('@channel',payload(m,chosen(m)[0])));
    // A timeout may already have delivered: automatic repetition is unsafe.
    behavior='timeout';m=mac(4);assert.equal(await delivery.publish('@channel',payload(m,chosen(m)[0])),false);
    behavior='ok';delivery=makeDelivery();delivery.load();assert(delivery.hasSource('@channel','V21',4));
    assert.equal(chosen(m).length,0);
    // Rate limit on a win is retried after the delay, and never after success.
    settle(3,2,0);behavior='429';assert.equal(await delivery.flushWins(),0);const before=deliveries.length;
    assert.equal(await delivery.flushWins(),0);assert.equal(deliveries.length,before);
    now+=2100;behavior='ok';assert.equal(await delivery.flushWins(),1);assert.equal(await delivery.flushWins(),0);
    // Closed/changed final odds can remove V21 while preserving independently eligible V22.
    m=mac(5,60,'1-0');groups=chosen(m);groups[0].oran=1.5;
    assert.deepEqual(payload(m,groups[0]).signalSources,['V22']);
    assert(await delivery.publish('@channel',payload(m,groups[0])));settle(5,2,0);behavior='400';
    assert.equal(await delivery.flushWins(),0);behavior='ok';assert.equal(await delivery.flushWins(),0,'Missing original reply never becomes a standalone post');
    // A journal acknowledgement repairs missing shared history without another external send.
    const ack=delivery.data.entries.find(e=>e.payload.fixtureId===5&&e.status==='sent');
    tracker.data.signals=tracker.data.signals.filter(s=>s.deliveryKey!==ack.key);tracker.save();
    const sentBefore=deliveries.length;delivery=makeDelivery();delivery.load();
    assert(tracker.data.signals.some(s=>s.deliveryKey===ack.key));assert.equal(deliveries.length,sentBefore);
    // Losing just the journal must not replay either signals or already sent wins.
    const missingPath=path.join(root,'missing-ledger.json');
    const missing=new TelegramDelivery({filePath:missingPath,tracker,send});missing.load();
    assert(missing.disabled);assert(!fs.existsSync(missingPath));assert.equal(await missing.flushWins(),0);
    // Regulation-time totals never settle using extra-time/penalty goals.
    m=mac(6);assert(await delivery.publish('@channel',payload(m,chosen(m)[0])));
    assert.equal(tracker.settleFixture({fixture:{id:6,status:{short:'AET'}},goals:{home:2,away:1}}),0);
    assert.equal(tracker.settleFixture({fixture:{id:6,status:{short:'PEN'}},goals:{home:5,away:4}}),0);
    assert.equal(await delivery.flushWins(),0);
    settle(6,1,0,'AET');assert.equal(tracker.data.signals.find(s=>s.fixtureId===6).settlement.result,'L');
    // Corrupt existing history and journals fail closed and preserve bytes.
    const bad=path.join(root,'bad.json');fs.writeFileSync(bad,'{broken');
    const stopped=new TelegramDelivery({filePath:bad,tracker,send});stopped.load();assert(stopped.disabled);assert.equal(fs.readFileSync(bad,'utf8'),'{broken');
    assert.throws(()=>new SignalTracker({filePath:bad,strict:true}).load());
    // Long/malicious analysis is escaped, shortened and cannot leak model internals.
    assert(!formatSignal({...tracker.data.signals[0],analysis:'EDGE %90 garantili Dino value.'}).includes('%90'));
    console.log('Maç Yakala Telegram: independent source locks; same market at 35/60; combined exact entry; concise escaped message; persisted reply-only wins; loss retention; restart/rejection/429/timeout/disk-recovery checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
