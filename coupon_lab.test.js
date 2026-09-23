const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {CouponLab, parseOddsRows, buildPicks, settlePick} = require('./coupon_lab');

function oddsFixture(id=101) {
    return {fixture:{id},update:'2026-09-23T06:00:00Z',bookmakers:[{id:8,name:'Bet365',bets:[
        {name:'Match Winner',values:[{value:'Home',odd:'1.60'},{value:'Draw',odd:'3.80'},{value:'Away',odd:'5.00'}]},
        {name:'Double Chance',values:[{value:'Home/Draw',odd:'1.25'},{value:'Draw/Away',odd:'2.10'}]},
        {name:'Half Time/Full Time',values:[{value:'Draw/Home',odd:'4.50'},{value:'Home/Home',odd:'2.40'},{value:'Draw/Draw',odd:'5.00'}]}
    ]}]};
}

{
    const parsed=parseOddsRows([oddsFixture()],8).get(101);
    assert.deepStrictEqual(parsed.winner,{1:1.6,X:3.8,2:5});
    assert.deepStrictEqual(parsed.doubleChance,{'1X':1.25,'X2':2.1});
    assert.strictEqual(parsed.htft['0/1'],4.5);
    assert.strictEqual(parsed.htft['1/1'],2.4);
}

{
    const fixture={teams:{home:{id:1,name:'Ev'},away:{id:2,name:'Dep.'}}};
    const odds=parseOddsRows([oddsFixture()],8).get(101);
    const prediction={winnerId:1,winnerName:'Ev',winOrDraw:true,underOver:'Over 2.5',goals:{home:2,away:1},percent:{home:61,draw:24,away:15}};
    const home={scoringMinutes:{firstShare:40,secondShare:60}};
    const away={scoringMinutes:{firstShare:50,secondShare:50}};
    const picks=buildPicks(fixture,odds,prediction,home,away);
    assert.deepStrictEqual(picks.map(item=>item.selection),['1X','0/1']);
    assert.ok(picks.every(item=>item.labOnly===true));
}

{
    const fixture={fixture:{status:{short:'FT'}},goals:{home:2,away:1},score:{halftime:{home:0,away:0}}};
    assert.strictEqual(settlePick({market:'İY/MS',selection:'0/1'},fixture).won,true);
    assert.strictEqual(settlePick({market:'Çifte Şans',selection:'X2'},fixture).won,false);
}

(async()=>{
    const temp=path.join(os.tmpdir(),`coupon-lab-test-${process.pid}-${Date.now()}.json`);
    const calls=[];
    const fixture={
        fixture:{id:101,date:'2026-09-23T15:00:00Z',status:{short:'NS'}},
        league:{id:39,name:'Premier League',country:'England',season:2026},
        teams:{home:{id:1,name:'Ev'},away:{id:2,name:'Dep.'}}
    };
    const tomorrowFixture={
        fixture:{id:202,date:'2026-09-24T15:00:00Z',status:{short:'NS'}},
        league:{id:39,name:'Premier League',country:'England',season:2026},
        teams:{home:{id:3,name:'Yarın Ev'},away:{id:4,name:'Yarın Dep.'}}
    };
    const minute={
        '0-15':{total:1},'16-30':{total:1},'31-45':{total:1},
        '46-60':{total:2},'61-75':{total:2},'76-90':{total:3}
    };
    const apiGet=async url=>{
        calls.push(url);
        if(url.startsWith('/odds/bookmakers'))return {data:{response:[{id:8,name:'Bet365'}]}};
        if(url.startsWith('/fixtures?date='))return {data:{response:[url.includes('2026-09-24')?tomorrowFixture:fixture]}};
        if(url.startsWith('/odds?date='))return {data:{response:[oddsFixture(url.includes('2026-09-24')?202:101)],paging:{total:1}}};
        if(url.startsWith('/predictions?fixture='))return {data:{response:[{predictions:{winner:{id:1,name:'Ev'},win_or_draw:true,under_over:'Over 2.5',goals:{home:'2',away:'1'},advice:'Double chance : Ev or draw',percent:{home:'61%',draw:'24%',away:'15%'}}}]}};
        if(url.startsWith('/teams/statistics?'))return {data:{response:{fixtures:{played:{home:10,away:10}},goals:{for:{total:{home:15,away:12},average:{home:'1.5',away:'1.2'},minute},against:{total:{home:8,away:14},average:{home:'0.8',away:'1.4'},minute}},clean_sheet:{home:4,away:2},failed_to_score:{home:1,away:3}}}};
        throw new Error(`unexpected ${url}`);
    };
    const lab=new CouponLab({filePath:temp,apiGet,getQuotaRemaining:()=>7000,canRun:()=>true,dailyLimit:200,reserve:1000,maxCandidates:30,maxSelected:10,scanHour:9,bookmakerName:'Bet365'});
    lab.load();
    const now=new Date('2026-09-23T06:00:00Z');
    const status=await lab.scanToday({mode:'manual',now});
    assert.strictEqual(status.latestScan.day,'2026-09-23');
    assert.strictEqual(status.latestScan.fixtures,1);
    assert.strictEqual(status.latestScan.marketFixtures,1);
    assert.strictEqual(status.summary.candidates,1);
    assert.strictEqual(status.summary.selected,1);
    assert.deepStrictEqual(status.candidates[0].picks.map(item=>item.selection),['1X','0/1']);
    assert.ok(calls.every(url=>!url.includes('/odds/live')&&!url.includes('/fixtures/statistics')));
    assert.ok(calls.some(url=>url==='/fixtures?date=2026-09-23&timezone=Europe%2FIstanbul'));
    assert.strictEqual(lab.shouldAutoScan(now),false);
    const changed=lab.applySettings({enabled:true,includeTomorrow:true,scanTime:'08:35',finalCheckMinutes:60,dailyLimit:250,maxCandidates:24,maxSelected:8});
    assert.deepStrictEqual(changed.settings,{enabled:true,includeTomorrow:true,scanTime:'08:35',finalCheckMinutes:60,dailyLimit:250,maxCandidates:24,maxSelected:8});
    const twoDayStatus=await lab.scanToday({mode:'manual',now:new Date('2026-09-23T06:01:00Z')});
    assert.deepStrictEqual(twoDayStatus.latestScan.days,['2026-09-23','2026-09-24']);
    assert.strictEqual(twoDayStatus.summary.candidates,2);
    assert.ok(twoDayStatus.candidates.some(item=>item.fixtureDay==='2026-09-24'));
    assert.strictEqual(lab.data.candidates.filter(item=>item.fixtureId===101 && item.active!==false).length,1);
    assert.ok(calls.some(url=>url==='/fixtures?date=2026-09-24&timezone=Europe%2FIstanbul'));
    assert.throws(()=>lab.applySettings({scanTime:'25:00'}),/SS:DD/);
    assert.throws(()=>lab.applySettings({maxCandidates:4,maxSelected:5}),/büyük olamaz/);
    const restored=new CouponLab({filePath:temp,apiGet,getQuotaRemaining:()=>7000,canRun:()=>true});
    restored.load();
    assert.deepStrictEqual(restored.settingsSnapshot(),changed.settings);
    fs.rmSync(temp,{force:true});
    console.log('Coupon LAB: market intersection, cached team profiles, LAB picks, persistent panel settings, budget and isolation passed.');
})().catch(error=>{console.error(error);process.exit(1);});
