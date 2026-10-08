'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const M=require('./banko_model'),C=require('./public/banko_choices'),{BankoCoupon,DEFAULTS,schemaSettings,VERSION}=require('./banko_coupon');
const now=new Date('2099-10-05T08:00:00Z'),kickoff='2099-10-05T19:00:00Z';
const profile={last20:{games:20},venueSummary:{games:10},stats:{'Corner Kicks':{games:10,mean:5}}};
const g={home:.65,away:.65,phase:{homeFirst:.3,awayFirst:.3,homeSecond:.35,awaySecond:.35}};
const markets=[[5,'Under 4.5'],[26,'Under 3.5'],[6,'Under 1.5'],[16,'Under 2.5'],[17,'Under 2.5'],[5,'Over 0.5'],[26,'Over 0.5'],[20,'Home/Draw'],[12,'Draw/Away'],[8,'No'],[27,'Yes']].map(([betId,selection])=>({betId,selection,key:betId+'|'+selection,odd:1.9,spec:M.specFor(betId,selection)}));
const profiles={home:profile,away:profile},settings=schemaSettings({}),odds={update:now.toISOString(),markets};
assert.equal(DEFAULTS.allowFullMatchUnder,false);assert.equal(DEFAULTS.allowSecondHalfUnder,false);
for(const key of ['allowFullMatchUnder','allowSecondHalfUnder'])for(const value of [null,0,1,'false',[],{}])assert.throws(()=>schemaSettings({[key]:value}));
const open=schemaSettings({allowFullMatchUnder:true,allowSecondHalfUnder:true}),closed=M.evaluateMarkets(odds,g,profiles,settings,now,kickoff),opened=M.evaluateMarkets(odds,g,profiles,open,now,kickoff);
for(let i=0;i<markets.length;i++){
    assert.equal(closed[i].modelProbability,opened[i].modelProbability,'Policy never changes model probabilities');
    assert.equal(closed[i].odd,opened[i].odd);assert.equal(closed[i].edgePP,opened[i].edgePP);assert.equal(closed[i].dataScore,opened[i].dataScore);
    const blocked=[5,26].includes(markets[i].betId)&&markets[i].spec.direction==='under';
    assert.equal(closed[i].eligible,blocked?false:opened[i].eligible,'Only full/second-half total UNDER is restricted');
    if(blocked){assert(opened[i].eligible);assert(C.policyReason(closed[i],settings));assert.equal(C.accepted(opened[i],settings),false,'Re-check even a pre-evaluated eligible quote');}
}
for(const [id,selection] of [[6,'Under 1.5'],[16,'Under 2.5'],[17,'Under 2.5'],[20,'Home/Draw']])assert(closed.find(m=>m.key===id+'|'+selection).eligible);
assert.equal(closed.find(m=>m.betId===6).spec.period,'first');assert.equal(closed.find(m=>m.betId===26).spec.period,'second','No relabeling/transplant of second-half prediction or odds');
assert.equal(closed.length,markets.length,'Blocked markets remain available for analysis');
const row={fixtureId:11,match:'Home - Away',kickoff,oddsUpdatedAt:odds.update,expectedGoals:g,profiles,markets:closed,pick:closed.find(m=>m.betId===16),reasons:[],capturedAt:now.toISOString()};
const full=opened.find(m=>m.betId===5&&m.spec.direction==='under'),second=opened.find(m=>m.betId===26&&m.spec.direction==='under');
assert.equal(C.alternative({...row,markets:[row.pick,full,second]},settings),null,'Closed UNDER cannot become an approved backup');
assert(C.priceCheck(row,full,settings,1.9,now).reasons.some(r=>r.includes('Maç toplamı ALT')));
assert(C.priceCheck(row,second,settings,1.9,now).reasons.some(r=>r.includes('İkinci yarı ALT')));
const legacySettings={...settings};delete legacySettings.allowFullMatchUnder;delete legacySettings.allowSecondHalfUnder;
assert(C.accepted(full,legacySettings),'Old scan policy retained');assert(C.accepted(second,legacySettings));assert(C.priceCheck(row,full,legacySettings,1.9,now).eligible);
const couponSettings={...settings,minSingleOdd:1.8,maxSingleOdd:2.2};
assert.equal(M.optimize([{...row,pick:full}],couponSettings,'x').length,0);assert.equal(M.optimize([{...row,pick:second}],couponSettings,'x').length,0);
assert.equal(M.optimize([row],couponSettings,'x').length,1,'Allowed team UNDER still gets a coupon');
const onlyFirst=schemaSettings({allowFullMatchUnder:true});assert.equal(C.policyReason(full,onlyFirst),null);assert(C.policyReason(second,onlyFirst));
const onlyFull=schemaSettings({allowSecondHalfUnder:true});assert(C.policyReason(full,onlyFull));assert.equal(C.policyReason(second,onlyFull),null);
let calls=0;const b=new BankoCoupon({now:()=>now,apiGet:()=>{calls++;throw Error('No API in policy test');}});
const rawRow={...row,markets:opened};b.evaluateCandidate(rawRow,settings);assert(!C.policyReason(rawRow.pick,settings));
const session={id:'policy-s',date:'2099-10-05',status:'complete',settings,candidates:[rawRow],coupons:[]};b.data.sessions.push(session);
assert.throws(()=>b.addSelection({date:session.date,sessionId:session.id,fixtureId:row.fixtureId,marketKey:full.key,playedOdd:1.9}),/yalnız manuel takip/i);
const manual=b.addSelection({date:session.date,sessionId:session.id,fixtureId:row.fixtureId,marketKey:full.key,playedOdd:1.9,allowRejected:true}).selection;
assert.equal(manual.origin,'analysis');assert.equal(manual.priceCheck.eligible,false);assert.equal(manual.pick.spec.period,'full');assert.equal(manual.result.status,'pending');assert.equal(calls,0);
// Loading an old store applies defaults to future scans, without rewriting archived snapshots or the file.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'banko-under-policy-')),file=path.join(dir,'dino_banko_coupon_v1.json');
const oldSession={...session,settings:legacySettings,candidates:[{...row,markets:opened,pick:full}],coupons:M.optimize([{...row,pick:full}],{...legacySettings,minSingleOdd:1.8,maxSingleOdd:2.2},'old')};
const data={version:VERSION,settings:legacySettings,sessions:[oldSession],manualSelections:[],discoveries:{},latestJob:null},text=JSON.stringify(data);fs.writeFileSync(file,text);
const loaded=new BankoCoupon({directory:dir,now:()=>now,apiGet:()=>{calls++;throw Error('No API');}});loaded.load();assert.equal(loaded.storageError,null);
assert.equal(loaded.data.settings.allowFullMatchUnder,false);assert.equal(loaded.data.settings.allowSecondHalfUnder,false);assert.equal(JSON.stringify(loaded.data.sessions),JSON.stringify(data.sessions));assert.equal(fs.readFileSync(file,'utf8'),text);assert.equal(calls,0);
const terminal={fixture:{status:{short:'FT'}},score:{fulltime:{home:4,away:0},halftime:{home:1,away:0}}};
assert.equal(M.settle({...full,spec:M.specFor(5,'Under 3.5')},terminal).status,'lost','Previously frozen UNDER results still settle');
assert.equal(M.settle({...second,spec:M.specFor(26,'Under 3.5')},terminal).status,'won');
console.log('Banko UNDER policy: independent flags, defaults/migration, unchanged probabilities/other markets, first-half independence, main/backup/coupon gates, explicit manual tracking, archived settlement and zero API passed.');
