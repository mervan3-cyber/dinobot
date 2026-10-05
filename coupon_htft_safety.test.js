'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {CouponLab,VERSION,parseOddsRows,normalizedHtftProbabilities,teamSummary,buildPicks,settlePick,rankCouponRows}=require('./coupon_lab');
const codes=['0/0','0/1','0/2','1/0','1/1','1/2','2/0','2/1','2/2'];
const fixture={fixture:{id:77,date:'2026-10-05T20:00:00Z',status:{short:'NS'}},league:{id:39,season:2026,name:'Premier League'},teams:{home:{id:1},away:{id:2}}};
const prediction={percent:{home:55,draw:25,away:20},winnerId:1};
const profile={played:10,scoredPerGame:1.3,concededPerGame:1,scoringMinutes:{total:10,firstShare:40,secondShare:60},concedingMinutes:{total:10,firstShare:50,secondShare:50}};
const bets=[{id:1,name:'Match Winner',values:[{value:'Home',odd:'1.85'},{value:'Draw',odd:'3.25'},{value:'Away',odd:'4.75'}]},
    {id:7,name:'HT/FT Double',values:codes.map(value=>({value,odd:'5.00'}))},
    {id:12,name:'Double Chance',values:[{value:'Home/Away',odd:'1.33'}]},
    {id:20,name:'Double Chance - First Half',values:[{value:'Home/Away',odd:'1.80'}]},
    {id:11,name:'Highest Scoring Half',values:[{value:'Draw',odd:'3.00'}]}];
const oddsRow=(marketBets=bets,update='2026-10-05T12:00:00Z')=>({fixture:{id:77},update,bookmakers:[{id:8,name:'Bet365',bets:marketBets}]});
const odds=parseOddsRows([oddsRow()],8).get(77);
assert.equal(odds.doubleChance,undefined);
assert.deepEqual(odds.winner,{'1':1.85,X:3.25,'2':4.75});
assert.equal(Object.keys(odds.htft).length,9);
assert.equal(parseOddsRows([oddsRow(bets.filter(b=>b.id!==7))],8).size,0,'1X2/DC without HTFT are not candidates');
assert.equal(parseOddsRows([oddsRow()],6).size,0,'No fallback to unrequested bookmaker');
const partial={...odds,htft:{'0/1':4.5}};
assert.deepEqual(normalizedHtftProbabilities(partial.htft).probabilities,{});
assert.equal(normalizedHtftProbabilities(partial.htft).coverage,1);
assert(buildPicks(fixture,partial,prediction,profile,profile).every(p=>!p.support.selectionReady));
assert(buildPicks(fixture,odds,prediction,{...profile,scoringMinutes:{total:0,firstShare:null,secondShare:null}},profile).every(p=>!p.support.selectionReady));
assert(buildPicks(fixture,odds,prediction,{...profile,played:2},profile).every(p=>!p.support.selectionReady));
assert.equal(teamSummary({fixtures:{played:{home:10}},goals:{for:{total:{home:null}},against:{total:{home:null}}}},'home').scoredPerGame,null);
const changed=oddsRow(bets.map(b=>b.id===7?{...b,values:[{value:'0/1',odd:'7'}]}:b),'2026-10-05T15:00:00Z');
assert.deepEqual(parseOddsRows([changed,oddsRow()],8).get(77).htft,{'0/1':7},'No old odds fill-in to newer incomplete market');
const mixed=oddsRow();mixed.bookmakers.push({id:9,name:'Other',bets:[{id:7,name:'HT/FT Double',values:[{value:'0/1',odd:'90'}]}]});
assert.equal(parseOddsRows([mixed]).get(77).htft['0/1'],5,'Never mix bookmaker quotes');
const baseRow={id:'primary',fixtureId:77,policyVersion:VERSION,kickoff:fixture.fixture.date,candidateScore:55,picks:[buildPicks(fixture,odds,prediction,profile,profile)[0]]};
assert.equal(rankCouponRows([baseRow,{...baseRow,id:'duplicate'}, {...baseRow,id:'old',policyVersion:'old',candidateScore:90}, {...baseRow,id:'multi',picks:[...baseRow.picks,...baseRow.picks]}],10).length,1);

for(const half of ['0','1','2'])for(const full of ['0','1','2']){
    const score=token=>token==='1'?{home:2,away:1}:token==='2'?{home:1,away:2}:{home:1,away:1};
    const h=score(half),f=score(full);f.home+=3;f.away+=3;
    const finished={fixture:{status:{short:'FT'}},goals:f,score:{halftime:h,fulltime:f}};
    for(const selection of codes)assert.equal(settlePick({market:'İY/MS',selection},finished).won,selection===`${half}/${full}`);
}
const ft={fixture:{status:{short:'FT'}},goals:{home:2,away:1},score:{halftime:{home:0,away:0},fulltime:{home:2,away:1}}};
for(const bad of [null,undefined,'',false])assert.equal(settlePick({market:'İY/MS',selection:'0/1'},{...ft,score:{...ft.score,halftime:{home:bad,away:0}}}),null);
assert.equal(settlePick({market:'İY/MS',selection:'0/1'},{...ft,fixture:{status:{short:'2H'}}}),null);
assert.equal(settlePick({market:'İY/MS',selection:'0/0'},{...ft,fixture:{status:{short:'AET'}},goals:{home:3,away:2},score:{halftime:{home:0,away:0},fulltime:{home:1,away:1}}}).won,true);
assert.equal(settlePick({market:'İY/MS',selection:'0/1'},{...ft,fixture:{status:{short:'PEN'}},score:{halftime:{home:0,away:0}}}),null);
assert.equal(settlePick({market:'İY/MS',selection:'0/1'},{...ft,fixture:{status:{short:'AWD'}}}),null);
assert.equal(settlePick({market:'İY/MS',selection:'anything'},ft),null);

(async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'coupon-htft-safety-'));
    const file=path.join(root,'history.json'),stamp=new Date().toISOString();
    const old={id:'old',fixtureId:77,day:'2026-10-05',capturedAt:stamp,kickoff:fixture.fixture.date,selected:true,active:true,
        picks:[{market:'Çifte Şans',selection:'1X',odd:1.18},{market:'İY/MS',selection:'0/1',odd:4.33}],
        finalCheck:{status:'waiting'},result:{status:'pending',picks:[]}};
    fs.writeFileSync(file,JSON.stringify({version:'old',scans:[],candidates:[old],usage:{'2026-10-05':12},settings:{enabled:true,maxDoubleChance:5},teamCache:{}}));
    const restored=new CouponLab({filePath:file,apiGet:async()=>{throw Error('unused');}});restored.load();
    assert.equal(restored.data.candidates[0].picks.length,2,'Historical predictions preserved');
    assert.equal(restored.data.candidates[0].active,false);
    assert.equal(restored.data.candidates[0].selected,false);
    assert.equal(restored.settingsSnapshot().maxDoubleChance,undefined);
    assert.equal(restored.usageToday(new Date('2026-10-05T10:00:00Z')),12);
    restored.save();
    const reopened=new CouponLab({filePath:file,apiGet:async()=>{throw Error('unused');}});reopened.load();
    assert.equal(reopened.status().archivedCandidates,1);
    fs.writeFileSync(path.join(root,'broken.json'),'{ invalid');
    const blocked=new CouponLab({filePath:path.join(root,'broken.json'),apiGet:async()=>{throw Error('must not call');}});blocked.load();
    await assert.rejects(blocked.scanToday(),/geçmişi okunamadı/);
    assert.equal(blocked.running,false);
    assert.equal(fs.readFileSync(path.join(root,'broken.json'),'utf8'),'{ invalid');
    let calls=[];
    const apiGet=async url=>{calls.push(url);if(url.startsWith('/fixtures?id='))return {data:{response:[fixture]}};
        if(url.startsWith('/odds?fixture='))return {data:{response:[oddsRow()]}};
        if(url.startsWith('/predictions?'))return {data:{response:[{predictions:{winner:{id:1},percent:{home:'55%',draw:'25%',away:'20%'}}}]}};
        if(url.startsWith('/fixtures?ids='))return {data:{response:[{...ft,fixture:{id:77,status:{short:'FT'}},score:{halftime:{home:null,away:null},fulltime:{home:2,away:1}}}]}};
        throw Error('Unexpected URL');};
    const lab=new CouponLab({apiGet,reserve:1000});lab.data.bookmaker={id:8,name:'Bet365'};
    const row={...baseRow,profiles:{home:profile,away:profile},prediction,selected:true,active:true,finalCheck:{status:'waiting'},result:{status:'pending'},capturedAt:stamp,day:'2026-10-05'};
    lab.data.candidates=[row];
    await lab.finalCheck(row,new Date('2026-10-05T19:00:00Z'));
    assert.equal(row.finalCheck.status,'passed');assert.equal(calls.length,3);
    assert.equal(row.picks.length,1);
    calls=[];row.finalCheck={status:'waiting'};
    const firstCheck=lab.runDueFinalChecks(new Date('2026-10-05T19:00:00Z'));
    assert.equal(lab.running,true);
    assert.equal(await lab.runDueFinalChecks(new Date('2026-10-05T19:00:00Z')),0,'Overlapping clock does not re-check');
    assert.equal(await firstCheck,1);
    assert.equal(calls.length,3,'Exactly one fixture/odds/prediction batch');
    assert.equal(lab.running,false);
    calls=[];await lab.settlePending(new Date('2026-10-05T23:00:00Z'));
    assert.equal(row.result.status,'pending');assert.match(row.result.reason,/eksik/);
    assert.equal(calls.length,1);
    const invalid=new CouponLab({apiGet:async()=>({data:{errors:{token:'redacted'},response:[]}})});
    await assert.rejects(invalid.call('/odds'),/servis hata/);
    fs.rmSync(root,{recursive:true,force:true});
    console.log('HTFT safety: real market ID isolation, single primary, data gates, legacy history, null scores, regulation-time settlement and final checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
