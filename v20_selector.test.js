'use strict';
const assert=require('assert/strict');
const {predict,decreasingProjection,eligible}=require('./v20_selector');
const F=require('./v20_features');
assert.deepEqual(decreasingProjection([.9,.6,.8,.4]),[.9,.7,.7,.4]);
assert.deepEqual(predict({type:'hist',features:['x'],baseline:[0],trees:[[[{leaf:false,feature:0,threshold:1,left:1,right:2,missingLeft:true},{leaf:true,value:1},{leaf:true,value:-1}]]]},{}),[1-1/(1+Math.exp(-1)),1/(1+Math.exp(-1))]);
assert(!eligible({odds:1.49,probability:90,edgeRaw:10},50,{minimumOdds:1.5,minimumProbability:.7,minimumEdge:0}));
assert(Number.isNaN(F.num(null)));assert.equal(F.num(0),0);
function state(minute,shot,status='1H') {return {at:`2026-09-01T10:${minute}:00Z`,minute,status,homeScore:0,awayScore:0,stats:{home:{shots:shot,shotsOnGoal:1,corners:0},away:{shots:2,shotsOnGoal:0,corners:1}},markets:{},pre:{}};}
const old=state(25,5),now=state(35,4),f=F.stateFeatures(now,[old]);
assert(Number.isNaN(f.seq_home_shots));assert.equal(f.seq_away_shots,0);
assert.equal(F.stateFeatures(state(55,7,'2H'),[old]).seq_available,0);
assert.equal(F.stateFeatures(state(35,7),[old]).seq_home_shots,2);
console.log('V20 missing-value, monotonicity, probability and causal-delta tests passed.');
