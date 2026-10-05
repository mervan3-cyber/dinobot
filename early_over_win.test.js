'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {POLICY,observeOverWin,canNotifyWin}=require('./early_over_win');
const {SignalTracker}=require('./signal_tracker');
const {TelegramDelivery,WIN_TEXT}=require('./mac_yakala_telegram');
const {SharingSettings}=require('./sharing_settings');
const {SharingDelivery}=require('./sharing_delivery');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-yakala-early-over-'));
let now=Date.parse('2026-10-05T10:00:00Z'),behavior='ok';
const epoch=now,stamp=()=>new Date(now).toISOString(),calls=[];
const record={fixtureId:1,deliveryKey:'entry',sentAt:stamp(),market:'1.5_UST',minute:35,settlement:{result:null,profit:null}};
const fixture=(id=1,home=1,away=1,status='2H',minute=85)=>({fixture:{id,status:{short:status,elapsed:minute}},goals:{home,away}});
const observation=(source='live-fixtures',start=now,end=now)=>({source,requestedAt:new Date(start).toISOString(),receivedAt:new Date(end).toISOString()});
const apply=(r,f=fixture(),o=observation())=>({...r,earlyOverWin:observeOverWin(r,f,o,{now,epoch})});
const allowed=r=>canNotifyWin(r,{now,epoch});
async function main(){
    let r=apply(record);assert.equal(r.earlyOverWin.state,'pending');assert(!allowed(r));
    assert.deepEqual(apply(r).earlyOverWin,r.earlyOverWin,'Same request cannot count twice');
    now+=30_000;r=apply(r);assert.equal(r.earlyOverWin.state,'pending');assert(!allowed(r));
    now+=30_000;r=apply(r);assert(allowed(r),'Inclusive 60-second separation with two independent responses');
    assert.equal(r.settlement.result,null);assert.equal(r.settlement.profit,null);
    assert(!canNotifyWin({...r,market:'MS1'},{now,epoch}));assert(!canNotifyWin({...r,market:'1.5_ALT'},{now,epoch}));
    assert(!allowed({...r,earlyOverWin:{...r.earlyOverWin,first:r.earlyOverWin.last}}));
    assert(!allowed({...r,earlyOverWin:{...r.earlyOverWin,fixtureId:999}}));
    assert(!allowed({...r,settlement:{result:'VOID'}}));assert(!allowed({...r,settlement:{result:'L'}}));
    assert(canNotifyWin({market:'MS2',settlement:{result:'W'}},{now,epoch}));
    now+=POLICY.maxAgeMs+1;assert(!allowed(r),'Stale proof cannot fire a delayed notification');
    // Fresh below-line and above-line score corrections restart proof, even before 60s.
    r=apply(record);now+=30_000;r=apply(r,fixture(1,1,0));assert.equal(r.earlyOverWin,null);
    now+=30_000;r=apply(r);assert(!allowed(r));now+=60_000;r=apply(r);assert(allowed(r));
    now+=10_000;r=apply(r,fixture(1,0,1));assert(!allowed(r));assert.equal(r.earlyOverWin,null);
    r=apply(record,fixture(1,2,1));now+=60_000;r=apply(r,fixture(1,1,1));assert(!allowed(r));assert.equal(r.earlyOverWin.state,'pending','Correction still above threshold does not corroborate the old score');
    now+=60_000;r=apply(r);assert(allowed(r));
    for(const status of ['ET','BT','P','PEN','AET','FT','SUSP','ABD','CANC','NS'])assert.equal(apply(r,fixture(1,2,1,status),observation('result-fixtures',now+1,now+1)).earlyOverWin,r.earlyOverWin,'Future response ignored');
    now+=1000;
    for(const status of ['ET','BT','P','PEN','AET','FT','SUSP','ABD','CANC','NS'])assert.equal(apply(r,fixture(1,2,1,status)).earlyOverWin,null,status+' cannot prove a live regulation-time win');
    for(const bad of [fixture(1,null,1),fixture(1,'1',1),fixture(1,-1,4),fixture(1,1,1,'2H',null),fixture(1,1,1,'2H',20)])assert.equal(apply(r,bad).earlyOverWin,null);
    assert.deepEqual(apply(r,fixture(999)).earlyOverWin,r.earlyOverWin,'Wrong fixture cannot alter this signal');
    assert.equal(apply(record,fixture(),observation('odds-fixtures')).earlyOverWin,null);
    assert.equal(apply(record,fixture(),observation('live-fixtures',now-500_000,now)).earlyOverWin,null,'Slow/stale response ignored');
    assert.equal(apply(record,fixture(),observation('live-fixtures',epoch-1000,epoch)).earlyOverWin,null,'Pre-entry response ignored');
    let pending=apply(record);now+=POLICY.maxGapMs+1;pending=apply(pending);assert.equal(pending.earlyOverWin.state,'pending','Long gap requires a new first check');
    // Overlapping fetches cannot count as independent corroboration.
    pending=apply(record);const firstAt=now;now+=60_000;
    const overlap=apply(pending,fixture(),observation('result-fixtures',firstAt,now));assert.deepEqual(overlap.earlyOverWin,pending.earlyOverWin);
    for(const [market,goals]of [['0.5_UST',1],['1.5_UST',2],['2.5_UST',3],['3.5_UST',4],['4.5_UST',5]]){
        const base={...record,market};let a=apply(base,fixture(1,goals,0,'1H',40));now+=60_000;a=apply(a,fixture(1,goals,0,'HT',45));assert(allowed(a),market);
    }
    // Real history and persistent reply journals, including both Telegram mirrors.
    const historyFile=path.join(root,'history.json'),ledgerFile=path.join(root,'delivery.json');
    let tracker=new SignalTracker({filePath:historyFile,strict:true,now:()=>now});tracker.load();
    const send=async(chat,text,options)=>{calls.push({chat:String(chat),text,options});if(text===WIN_TEXT&&behavior==='timeout')throw Error('timeout');
        if(text===WIN_TEXT&&behavior==='429')throw {response:{body:{error_code:429,parameters:{retry_after:2}}}};
        return {message_id:calls.length,chat:{id:chat}};};
    let delivery=new TelegramDelivery({filePath:ledgerFile,tracker,send,now:()=>now,liveSource:'V24'});delivery.load();
    const settings=new SharingSettings({filePath:path.join(root,'settings.json'),availability:()=>({extraTelegram:{configured:true},groupTelegram:{configured:true},x:{configured:false}})});
    settings.load();settings.update({revision:0,extraTelegram:true,groupTelegram:true});
    const mirrorOptions={filePath:path.join(root,'mirrors.json'),settings,tracker,extraChatId:'-1002',groupChatId:'-1004308912742',telegramSend:send,now:()=>now};
    let mirrors=new SharingDelivery(mirrorOptions);mirrors.load();
    const payload=(id,market='1.5_UST')=>({fixtureId:id,signalType:'strong',sentAt:stamp(),signalSources:['V24'],minute:35,score:'1-0',market,odds:1.6,match:'Home - Away',league:'Test',analysis:'Canlı veriler.',statsValidation:{status:'passed'},entryAudit:{eventScore:{status:'approve'}}});
    const p=payload(50);assert(await delivery.publish('-1001',p));await mirrors.publish(delivery.findSent('-1001',p));const before=calls.length;
    tracker.observeLiveFixtures([fixture(50)],observation());assert.equal(await delivery.flushWins(),0);assert.equal(await mirrors.flushWins(),0);
    now+=5*60_000;tracker.observeLiveFixtures([fixture(50)],observation('result-fixtures'));
    assert.equal(await delivery.flushWins(),1);assert.equal(await mirrors.flushWins(),2);assert.equal(calls.length,before+3);
    const signal=tracker.data.signals.find(s=>s.fixtureId===50);assert.equal(signal.settlement.result,null);assert.equal(signal.settlement.profit,null);assert.equal(tracker.summary().overall.wins,0);
    for(const entry of [...delivery.data.entries,...mirrors.data.entries].filter(e=>e.status==='sent')){
        const reply=calls.find(c=>c.chat===String(entry.chatId)&&c.text===WIN_TEXT&&JSON.parse(c.options.reply_parameters).message_id===entry.messageId);assert(reply);
        assert.equal(JSON.parse(reply.options.reply_parameters).allow_sending_without_reply,false);assert.equal(entry.win.notification,'early-over');
    }
    tracker.settleFixture({fixture:{id:50,status:{short:'FT'}},score:{fulltime:{home:1,away:1}}});assert.equal(signal.settlement.result,'W');
    assert.equal(await delivery.flushWins(),0);assert.equal(await mirrors.flushWins(),0,'FT cannot repeat early replies');
    now+=1000;tracker=new SignalTracker({filePath:historyFile,strict:true,now:()=>now});tracker.load();
    delivery=new TelegramDelivery({filePath:ledgerFile,tracker,send,now:()=>now,liveSource:'V24'});delivery.load();
    mirrors=new SharingDelivery({...mirrorOptions,tracker});mirrors.load();assert.equal(await delivery.flushWins(),0);assert.equal(await mirrors.flushWins(),0);
    // A pending first observation does not survive process restart as valid evidence.
    const restartPayload=payload(51);assert(await delivery.publish('-1001',restartPayload));tracker.observeLiveFixtures([fixture(51)],observation());
    now+=5*60_000;tracker=new SignalTracker({filePath:historyFile,strict:true,now:()=>now});tracker.load();delivery=new TelegramDelivery({filePath:ledgerFile,tracker,send,now:()=>now,liveSource:'V24'});delivery.load();
    tracker.observeLiveFixtures([fixture(51)],observation());assert.equal(await delivery.flushWins(),0);now+=60_000;tracker.observeLiveFixtures([fixture(51)],observation());assert.equal(await delivery.flushWins(),1);
    // VAR correction after an early notice still grades the final result honestly.
    const s51=tracker.data.signals.find(s=>s.fixtureId===51);tracker.settleFixture({fixture:{id:51,status:{short:'FT'}},score:{fulltime:{home:1,away:0}}});assert.equal(s51.settlement.result,'L');assert.equal(s51.settlement.profit,-1);assert.equal(await delivery.flushWins(),0);
    // Missing/duplicate batches cannot corroborate.
    const p52=payload(52);assert(await delivery.publish('-1001',p52));tracker.observeLiveFixtures([fixture(52)],observation());now+=60_000;
    assert.equal(tracker.observeLiveFixtures([fixture(52),fixture(52)],observation()),0);assert.equal(await delivery.flushWins(),0);
    tracker.observeLiveFixtures([fixture(52)],observation());behavior='429';assert.equal(await delivery.flushWins(),0);behavior='ok';now+=2100;assert.equal(await delivery.flushWins(),1);assert.equal(await delivery.flushWins(),0);
    const p53=payload(53);assert(await delivery.publish('-1001',p53));tracker.observeLiveFixtures([fixture(53)],observation());now+=60_000;tracker.observeLiveFixtures([fixture(53)],observation());behavior='timeout';assert.equal(await delivery.flushWins(),0);behavior='ok';
    delivery.load();assert.equal(await delivery.flushWins(),0,'Uncertain early reply never gets blindly repeated at FT');tracker.settleFixture({fixture:{id:53,status:{short:'FT'}},score:{fulltime:{home:2,away:1}}});assert.equal(await delivery.flushWins(),0);
    // Failed proof persistence rolls back the in-memory approval, not just the disk.
    const p54=payload(54);assert(await delivery.publish('-1001',p54));tracker.observeLiveFixtures([fixture(54)],observation());now+=60_000;
    const save=tracker.save;tracker.save=()=>{throw Error('disk');};assert.throws(()=>tracker.observeLiveFixtures([fixture(54)],observation()),/disk/);tracker.save=save;
    assert(tracker.earlyWinDisabled);assert.equal(await delivery.flushWins(),0);assert.equal(tracker.data.signals.find(s=>s.fixtureId===54).earlyOverWin.state,'pending');
    console.log('Early OVER tests passed: two fresh requests, 60s boundary, VAR resets, stale/overlap/restart safety, regulation only, independent replies, final grading unchanged and persistent no-duplicate/error locks.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('mac-yakala-early-over-'))fs.rmSync(root,{recursive:true,force:true});});
