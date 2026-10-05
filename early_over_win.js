'use strict';
// Notification evidence only. Never changes settlement, profit, or the model decision.
const POLICY=Object.freeze({version:1,minSeparationMs:60_000,maxGapMs:20*60_000,maxAgeMs:120_000});
const SOURCES=new Set(['live-fixtures','result-fixtures']);
const LIVE_STATUSES=new Set(['1H','HT','2H']);
const ms=v=>typeof v==='string'?Date.parse(v):NaN;
const nonNegativeInt=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const overLine=market=>/^\d+\.5_UST$/.test(String(market||''))?Number(String(market).split('_')[0]):null;
function metadata(observation,now){
    const start=ms(observation?.requestedAt),end=ms(observation?.receivedAt);
    if(!SOURCES.has(observation?.source)||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>now||now-end>POLICY.maxAgeMs||end-start>POLICY.maxAgeMs)return null;
    return {source:observation.source,requestedAt:observation.requestedAt,receivedAt:observation.receivedAt,
        id:observation.source+'|'+observation.requestedAt+'|'+observation.receivedAt};
}
function sampleFor(fixture,meta){
    const home=fixture?.goals?.home,away=fixture?.goals?.away,minute=fixture?.fixture?.status?.elapsed;
    const status=String(fixture?.fixture?.status?.short||'').toUpperCase();
    if(!LIVE_STATUSES.has(status)||!nonNegativeInt(home)||!nonNegativeInt(away)||!nonNegativeInt(minute)||minute>130)return null;
    return {...meta,home,away,total:home+away,minute,status};
}
function validSample(sample){
    return sample&&SOURCES.has(sample.source)&&sample.id===sample.source+'|'+sample.requestedAt+'|'+sample.receivedAt&&
        Number.isFinite(ms(sample.requestedAt))&&Number.isFinite(ms(sample.receivedAt))&&ms(sample.requestedAt)<=ms(sample.receivedAt)&&
        ms(sample.receivedAt)-ms(sample.requestedAt)<=POLICY.maxAgeMs&&LIVE_STATUSES.has(sample.status)&&
        nonNegativeInt(sample.home)&&nonNegativeInt(sample.away)&&sample.total===sample.home+sample.away&&nonNegativeInt(sample.minute)&&sample.minute<=130;
}
function pairValid(proof,record){
    const line=overLine(record?.market),a=proof?.first,b=proof?.last,sent=ms(record?.sentAt);
    return line!==null&&proof?.version===POLICY.version&&proof.market===record.market&&proof.fixtureId===Number(record.fixtureId)&&
        proof.state==='confirmed'&&proof.confirmedAt===b?.receivedAt&&validSample(a)&&validSample(b)&&a.id!==b.id&&
        Number.isFinite(sent)&&ms(a.requestedAt)>=sent&&ms(b.requestedAt)>ms(a.receivedAt)&&
        ms(b.receivedAt)-ms(a.receivedAt)>=POLICY.minSeparationMs&&ms(b.receivedAt)-ms(a.receivedAt)<=POLICY.maxGapMs&&
        a.total>line&&b.total>line&&b.total>=a.total&&b.minute>=a.minute&&a.minute>=Number(record.minute);
}
function observeOverWin(record,fixture,observation,{now=Date.now(),epoch=now}={}){
    const previous=record?.earlyOverWin||null,line=overLine(record?.market),meta=metadata(observation,now);
    if(!meta||line===null||!record?.deliveryKey||record?.settlement?.result||Number(fixture?.fixture?.id)!==Number(record.fixtureId))return previous;
    // Requests that began before the signal/this process are not post-entry evidence.
    if(ms(meta.requestedAt)<ms(record.sentAt)||!Number.isFinite(ms(record.sentAt))||ms(meta.requestedAt)<epoch)return previous;
    const prior=previous?.version===POLICY.version&&previous.market===record.market&&previous.fixtureId===Number(record.fixtureId)&&
        validSample(previous.first)&&validSample(previous.last)&&ms(previous.first.requestedAt)>=epoch?previous:null;
    if(prior&&(meta.id===prior.last.id||ms(meta.requestedAt)<=ms(prior.last.requestedAt)||ms(meta.receivedAt)<=ms(prior.last.receivedAt)))return previous;
    const sample=sampleFor(fixture,meta);
    // A fresh non-live/unknown score or a below-line correction revokes pending proof.
    if(!sample||sample.total<=line||!Number.isFinite(Number(record.minute))||sample.minute<Number(record.minute))return null;
    const first={version:POLICY.version,market:record.market,fixtureId:Number(record.fixtureId),state:'pending',first:sample,last:sample,confirmedAt:null};
    if(!prior||sample.total<prior.last.total||sample.minute<prior.last.minute||ms(sample.receivedAt)-ms(prior.first.receivedAt)>POLICY.maxGapMs)return first;
    // An overlapping request cannot corroborate the first response; corrections above still reset it.
    if(ms(sample.requestedAt)<=ms(prior.last.receivedAt))return previous;
    // On every new scan even confirmed proof starts a fresh two-response window.
    // A 429 retry must not rely on indefinitely old live evidence.
    if(prior.state==='confirmed')return first;
    const next={...prior,last:sample};
    if(ms(sample.receivedAt)-ms(prior.first.receivedAt)>=POLICY.minSeparationMs){next.state='confirmed';next.confirmedAt=sample.receivedAt;}
    return next;
}
function canNotifyWin(record,{now=Date.now(),epoch=Infinity}={}){
    if(record?.settlement?.result)return record.settlement.result==='W';
    const proof=record?.earlyOverWin;
    return pairValid(proof,record)&&ms(proof.first.requestedAt)>=epoch&&ms(proof.last.receivedAt)<=now&&now-ms(proof.last.receivedAt)<=POLICY.maxAgeMs;
}
module.exports={POLICY,observeOverWin,canNotifyWin,pairValid};
