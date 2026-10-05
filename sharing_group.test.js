'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {SharingSettings}=require('./sharing_settings');
const {SharingDelivery}=require('./sharing_delivery');
const {formatSignal,WIN_TEXT}=require('./mac_yakala_telegram');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mac-yakala-group-'));
const file=name=>path.join(root,name);
const ready=()=>({extraTelegram:{configured:true},groupTelegram:{configured:true},x:{configured:true}});
let identities={extraTelegram:'old-channel',groupTelegram:'live-group',x:'old-x'};
function settings(name='settings.json') {const s=new SharingSettings({filePath:file(name),availability:ready,identities:()=>({...identities})});s.load();return s;}
const primary=(key='p1')=>({status:'sent',key,messageId:10,chatId:'-1001',requestedChannel:'@main',payload:{fixtureId:1,signalSources:['V24'],market:'1.5_UST',odds:1.6,minute:35,score:'1-0',match:'Home - Away',league:'Test',analysis:'Canlı veri değerlendirmesi.'}});
async function main(){
    const old={version:1,revision:12,extraTelegram:true,x:true,epochs:{extraTelegram:3,x:8},targets:{extraTelegram:'old-channel',x:'old-x'}};
    fs.writeFileSync(file('settings.json'),JSON.stringify(old));
    const s=settings();
    assert.equal(s.disabled,false);assert.equal(s.data.revision,13);assert.equal(s.data.groupTelegram,false);assert.equal(s.data.epochs.groupTelegram,0);
    for(const k of ['extraTelegram','x']){assert.equal(s.data[k],old[k]);assert.equal(s.data.epochs[k],old.epochs[k]);assert.equal(s.data.targets[k],old.targets[k]);}
    assert.equal(s.active('extraTelegram'),true);assert.equal(s.active('x'),true);
    assert.throws(()=>s.update({revision:12,groupTelegram:true}),/yenileyin/);
    assert.throws(()=>s.update({revision:13,groupTelegram:'true'}),/geçersiz/);
    const restart=settings();assert.equal(restart.data.revision,13,'Migration is one-time');
    const calls=[],xCalls=[],tracker={data:{signals:[]}};
    const opts={filePath:file('delivery.json'),settings:s,tracker,extraChatId:'-1002',groupChatId:'-1004308912742',xIdentity:'old-x',
        telegramSend:async(chat,text,options)=>{calls.push({chat:String(chat),text,options});return {message_id:calls.length,chat:{id:chat}};},xSend:async p=>{xCalls.push(p);return {id:String(100+xCalls.length)};}};
    const delivery=new SharingDelivery(opts);delivery.load();assert.equal(calls.length,0);
    // Old ledgers and their pending winner replies retain the original channel epoch.
    const historical={key:'old-entry',primaryKey:'old-main',kind:'extraTelegram',target:'-1002',chatId:'-1002',epoch:3,status:'sent',messageId:77,win:null};
    delivery.data.entries.push(historical);delivery.save();delivery.load();assert.deepEqual(delivery.data.entries[0],historical);
    tracker.data.signals.push({deliveryKey:'old-main',settlement:{result:'W'}});
    assert.equal(await delivery.flushWins(),1);assert.equal(JSON.parse(calls[0].options.reply_parameters).message_id,77);
    s.update({revision:13,groupTelegram:true});assert.equal(calls.length,1,'Enable sends nothing');
    assert.equal(s.data.epochs.extraTelegram,3);assert.equal(s.data.epochs.x,8);
    await delivery.publish({status:'uncertain',key:'failed',messageId:9});assert.equal(calls.length,1,'Only acknowledged main sends fan out');
    const p=primary();await Promise.all([delivery.publish(p),delivery.publish(p)]);
    assert.equal(calls.length,3);assert.equal(xCalls.length,1);assert.equal(tracker.data.signals.length,1,'Mirrors never create shared signal rows');
    assert.deepEqual(calls.slice(1).map(c=>c.chat),['-1002','-1004308912742']);
    assert(calls.slice(1).every(c=>c.text===formatSignal(p.payload)&&c.options.parse_mode==='HTML'));
    tracker.data.signals.push({deliveryKey:p.key,settlement:{result:'W'}});
    assert.equal(await delivery.flushWins(),2);assert.equal(await delivery.flushWins(),0);
    for(const sent of delivery.data.entries.filter(e=>e.primaryKey===p.key&&e.kind!=='x')){
        const reply=calls.find(c=>c.chat===sent.chatId&&c.text===WIN_TEXT&&JSON.parse(c.options.reply_parameters).message_id===sent.messageId);
        assert(reply);assert.equal(JSON.parse(reply.options.reply_parameters).allow_sending_without_reply,false);
    }
    const restored=new SharingDelivery(opts);restored.load();await restored.publish(p);await restored.flushWins();assert.equal(calls.length,5);
    // Group failure cannot suppress the existing channel or X.
    const logs=[],failed=new SharingDelivery({...opts,filePath:file('failed.json'),logger:m=>logs.push(m),telegramSend:async(chat,...args)=>{
        if(chat===opts.groupChatId)throw {response:{body:{error_code:403}},secret:'never-log-this'};
        return opts.telegramSend(chat,...args);
    }});
    await failed.publish(primary('p2'));assert.equal(failed.data.entries.find(e=>e.kind==='groupTelegram').status,'declined');
    assert.equal(failed.data.entries.find(e=>e.kind==='extraTelegram').status,'sent');assert.equal(failed.data.entries.find(e=>e.kind==='x').status,'sent');
    await failed.publish(primary('p2'));assert.equal(failed.data.entries.length,3);assert(!JSON.stringify(logs).includes('never-log-this'));
    // A group timeout remains uncertain and is not automatically repeated after restart.
    const timeout=new SharingDelivery({...opts,filePath:file('timeout.json'),timeoutMs:5,telegramSend:(chat,...args)=>chat===opts.groupChatId?new Promise(()=>{}):opts.telegramSend(chat,...args)});
    await timeout.publish(primary('p3'));assert.equal(timeout.data.entries.find(e=>e.kind==='groupTelegram').status,'uncertain');
    timeout.load();await timeout.publish(primary('p3'));assert.equal(timeout.data.entries.length,3);
    // Off/on invalidates pending group replies, not the old channel's replies.
    const late=primary('p4');await delivery.publish(late);
    const groupEpoch=s.data.epochs.groupTelegram;
    s.update({revision:s.data.revision,groupTelegram:false});s.update({revision:s.data.revision,groupTelegram:true});
    assert.equal(s.data.epochs.groupTelegram,groupEpoch+2);assert.equal(s.data.epochs.extraTelegram,3);
    tracker.data.signals.push({deliveryKey:late.key,settlement:{result:'W'}});
    assert.equal(await delivery.flushWins(),1,'Only existing channel can reply to pre-toggle pending win');
    identities={...identities,groupTelegram:'replacement'};
    const changed=settings();assert.equal(changed.active('groupTelegram'),false);assert.equal(changed.active('extraTelegram'),true);assert.equal(changed.active('x'),true);
    assert.equal(changed.data.epochs.extraTelegram,3);assert.equal(changed.data.epochs.x,8);
    // Runtime defense also deduplicates two mirror kinds aimed at the same chat.
    const duplicate=new SharingDelivery({...opts,filePath:file('duplicate.json'),groupChatId:'-1002'});
    await duplicate.publish(primary('duplicate'));assert.equal(duplicate.data.entries.filter(e=>e.kind!=='x').length,1);
    const sameMain=new SharingDelivery({...opts,filePath:file('same-main.json'),groupChatId:'-1001'});
    await sameMain.publish(primary('same-main'));assert(!sameMain.data.entries.some(e=>e.kind==='groupTelegram'));
    fs.writeFileSync(file('corrupt.json'),JSON.stringify({...old,groupTelegram:true}));
    const corrupt=settings('corrupt.json');assert(corrupt.disabled);assert.equal(fs.readFileSync(file('corrupt.json'),'utf8'),JSON.stringify({...old,groupTelegram:true}));
    const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
    const config=source.slice(source.indexOf('const extraChatId ='),source.indexOf('// V20 emekli:'));
    function serverConfig(env={},mainChat='-1001',botReady=true,mainEntries=[]){
        const ctx=vm.createContext({process:{env},bot:botReady?{sendMessage(){throw Error('No live send');}}:null,kanalID:mainChat,telegramDelivery:{data:{entries:mainEntries}},
            SharingSettings,SharingDelivery,crypto,path,__dirname:root,signalTracker:tracker,createXPublisher:()=>()=>{},addSystemLog(){},app:{get(){},post(){}}});
        vm.runInContext(config+';globalThis.result={sharingSettings,sharingDelivery,groupChatId};',ctx);return ctx.result;
    }
    const defaultConfig=serverConfig({TELEGRAM_EXTRA_CHAT_ID:'-1002'});
    assert.equal(defaultConfig.groupChatId,'-1004308912742');assert.equal(defaultConfig.sharingSettings.status().groupTelegram.configured,true);
    assert.equal(defaultConfig.sharingDelivery.groupChatId,defaultConfig.groupChatId);assert.equal(defaultConfig.sharingSettings.active('groupTelegram'),false);
    assert.equal(serverConfig({TELEGRAM_GROUP_CHAT_ID:'-1009'}).groupChatId,'-1009');
    for(const env of [{TELEGRAM_GROUP_CHAT_ID:''},{TELEGRAM_GROUP_CHAT_ID:'@group'},{TELEGRAM_GROUP_CHAT_ID:'-1001'},{TELEGRAM_EXTRA_CHAT_ID:'-1004308912742'}])assert.equal(serverConfig(env).sharingSettings.status().groupTelegram.configured,false);
    assert.equal(serverConfig({},'-1001',false).sharingSettings.status().groupTelegram.configured,false);
    assert.equal(serverConfig({},'@main',true,[{status:'sent',requestedChannel:'@main',chatId:-1004308912742}]).sharingSettings.status().groupTelegram.configured,false);
    // Panel wiring, save payload and rollback work independently of the existing toggle.
    const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');assert.equal(html,fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8'));
    assert(html.includes('id="sharing-groupTelegram"'));assert(html.includes("saveSharing('groupTelegram', this.checked)"));
    const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',addEventListener(){},classList:{add(){},remove(){}}});return nodes.get(id);};
    let request;
    const ctx=vm.createContext({window:{location:{origin:'http://127.0.0.1',protocol:'http:'}},document:{getElementById:get,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},
        setInterval(){},setTimeout(){},console,URLSearchParams,fetch:async(url,options)=>{request={url,options};return {ok:true,json:async()=>s.status()};}});
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);vm.runInContext('authenticated=true',ctx);
    ctx.renderSharing({...s.status(),delivery:delivery.status()});assert.equal(get('sharing-groupTelegram').checked,true);assert.equal(get('sharing-extraTelegram').checked,true);
    await ctx.saveSharing('groupTelegram',false);assert.deepEqual(JSON.parse(request.options.body),{revision:s.data.revision,groupTelegram:false});
    ctx.fetch=async()=>({ok:false,status:400,json:async()=>({error:'Disk hatası'})});
    await ctx.saveSharing('groupTelegram',false);assert.equal(get('sharing-groupTelegram').checked,true);assert.equal(get('sharing-extraTelegram').checked,true);assert.match(get('sharing-message').textContent,/Disk hatası/);
    const legacyStatus=s.status();delete legacyStatus.groupTelegram;ctx.renderSharing(legacyStatus);assert.equal(get('sharing-groupTelegram').disabled,true);
    console.log('Live group tests OK: v1 migration, existing targets preserved, isolated fan-out/replies, restart/toggle/target locks, failures, duplicates, server configuration and panel.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
    if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('mac-yakala-group-'))fs.rmSync(root,{recursive:true,force:true});
});
