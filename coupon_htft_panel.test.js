'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.className='';this.style={};this.value='';this.checked=false;}
    appendChild(child){this.children.push(child);return child;}
    replaceChildren(){this.children=[];}
}
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
const collect=element=>[element.textContent,...element.children.map(collect)].join(' ');
const pick=(selection,qualityScore=61)=>({market:'İY/MS',selection,odd:4.33,qualityScore,support:{htftMarketProbability:22,tier:'izlemelik'}});
const row=(id,passed=false)=>({id,selected:true,kickoff:'2099-10-05T19:00:00Z',fixtureDay:'2099-10-05',
    league:'League',home:{name:'Home'},away:{name:'Away'},odds:{htft:{'0/1':4.33},winner:{1:1.85,X:3.25,2:4.75}},
    picks:[pick('0/1')],alternatives:[pick('0/1'),pick('1/1',58),pick('0/0',55)],
    finalCheck:{status:passed?'passed':'waiting'},result:{status:passed?'settled':'pending',picks:passed?[{selection:'0/1',won:false}]:[]}});
let state={day:'2099-10-05',settings:{enabled:true,includeTomorrow:false,scanTime:'09:00',finalCheckMinutes:75,dailyLimit:200,maxCandidates:30,maxSelected:10},
    summary:{selected:2,candidates:2,passed:1},limits:{maxCandidates:30,maxSelected:10},api:{used:10,limit:200},candidates:[row(1),row(2,true)]};
const requests=[];
const context={window:{},document:{getElementById:node,createElement:tag=>new Element(tag)},Date,
    apiFetch:async(url,options)=>{requests.push({url,options});return state;},showToast:()=>{},setTimeout:()=>0};
vm.runInNewContext(fs.readFileSync('public/coupon_lab_panel.js','utf8'),context);
(async()=>{
    await context.window.fetchCouponLab();
    const rows=node('coupon-lab-rows').children;
    assert.equal(rows.length,2);assert.equal(rows[0].children.length,8);
    assert.equal(rows[0].children[5].children[0].className,'warning-text','Pending is not green approval');
    assert.equal(rows[1].children[5].children[0].className,'positive','Only final-checked primary is green');
    assert.equal(rows[0].children[5].children[1].className,'muted');
    assert.match(collect(rows[0].children[5].children[1]),/kupona dahil değil/);
    assert.doesNotMatch(collect(rows[0].children[4]),/ÇŞ/);
    assert.equal(rows[1].children[7].className,'warning-text','Loss must not appear green');
    assert.match(collect(node('coupon-lab-footnote')),/Puan başarı yüzdesi değildir/);
    await context.window.saveCouponLabSettings();
    const payload=JSON.parse(requests.find(r=>r.url==='/api/coupon-lab/settings').options.body);
    assert.equal(payload.maxDoubleChance,undefined);
    assert.equal(payload.maxSelected,10);
    state={...state,storageError:'Storage blocked'};await context.window.fetchCouponLab();
    assert.equal(node('coupon-lab-scan').disabled,true);
    assert.equal(node('coupon-lab-settle').disabled,true);
    assert.equal(node('coupon-lab-status').textContent.includes('Storage blocked'),true);
    console.log('HTFT panel: one primary, alternatives explicitly excluded, approval/loss colors, settings isolation and storage block passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
