'use strict';
const assert=require('assert/strict');
const tariff=require('./v24_tariff');
function over(extra={},policy=tariff.POLICY){return tariff.overCheck({market:'1.5_UST',score:'1-0',minute:50,odds:1.8,prematchSupport:70,dinoProbability:50,v16Probability:65,v18Probability:70,eventScoreStatus:'approve',...extra},{policy});}
assert.equal(tariff.POLICY.over.branches.B.v16Minimum,65);
assert.deepEqual(tariff.POLICY.over.branches.B.prematchByMarket,{'1.5_UST':70,'2.5_UST':32,'3.5_UST':30,'4.5_UST':25});
assert.deepEqual(tariff.POLICY.over.branches.A.prematchByMarket,{'2.5_UST':52,'3.5_UST':25,'4.5_UST':25});
assert.equal(tariff.POLICY.over.branches.SNIPER.prematchByMarket['1.5_UST'],75);
for(const [market,score,pre]of [['1.5_UST','1-0',70],['2.5_UST','2-0',32],['3.5_UST','3-0',30],['4.5_UST','4-0',25]]){
    assert.equal(over({market,score,prematchSupport:pre,v16Probability:64.99}).eligible,false,`${market}: reject below65`);
    const ok=over({market,score,prematchSupport:pre});assert.equal(ok.eligible,true);assert.equal(ok.branch,'B');assert.equal(ok.thresholds.v16,65);
    assert.equal(over({market,score,prematchSupport:pre-.01}).eligible,false,`${market}: original pre gate`);
}
assert.equal(over({market:'2.5_UST',score:'1-1',prematchSupport:32}).eligible,true,'No unapproved 1-1 ban');
assert.equal(over({market:'2.5_UST',score:'1-0',prematchSupport:52,v16Probability:65}).eligible,true,'A minimum65 unchanged');
assert.equal(over({market:'2.5_UST',score:'1-0',prematchSupport:52,v16Probability:64.99}).eligible,false);
assert.equal(over({score:'0-0',prematchSupport:75,v16Probability:72,dinoProbability:50}).eligible,true,'Sniper pre75 inclusive');
assert.equal(over({score:'0-0',prematchSupport:74.99,v16Probability:72,dinoProbability:50}).eligible,false);
assert.equal(over({score:'0-0',prematchSupport:75,v16Probability:71.99,dinoProbability:50}).eligible,false,'Sniper V16 minimum72 unchanged');
assert.equal(over({eventScoreStatus:'reject'}).eligible,false);
assert.equal(over({eventScoreStatus:'insufficient'}).eligible,false);
assert.equal(over({odds:2,dinoProbability:50}).eligible,true);
assert.equal(over({odds:2,dinoProbability:50.1}).eligible,false);
assert.equal(over({odds:1.5,dinoProbability:45}).eligible,true,'Dino edge has no new negative floor');
for(const policy of Object.values(tariff.POLICIES)){
    assert.equal(policy.over.branches.B.v16Minimum,65,'Policies inheriting main share B65');
    assert.equal(policy.over.branches.SNIPER.prematchByMarket['1.5_UST'],75);
    assert.equal(policy.telegram,policy.key==='main');
    assert.equal(over({v16Probability:64.99},policy).eligible,false);
    assert.equal(over({},policy).eligible,true);
}
assert.equal(over({minute:25}).eligible,true);assert.equal(over({minute:70}).eligible,true);assert.equal(over({minute:71}).eligible,false);
assert.equal(tariff.POLICY.maximumSignalsPerFixture,1);assert.equal(tariff.POLICY.womenExcluded,false);
assert.deepEqual(tariff.POLICY.priority,['SNIPER','B','A','MS']);
assert.equal(tariff.winnerCheck({market:'MS2',score:'0-1',minute:25,odds:1.75,prematchSupport:36,v16Probability:60,eventScoreStatus:'approve'}).eligible,true,'MS V16 minimum60 unchanged with approved pre36');
console.log('PASS: B V16 minimum65 and Sniper pre75 boundaries; B pre/A/MS/edge/events/priority and inherited LAB policies preserved.');
