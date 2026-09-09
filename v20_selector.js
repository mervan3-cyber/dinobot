'use strict';
const fs=require('fs'),path=require('path');
const F=require('./v20_features');
function sigmoid(x){return 1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));}
function predict(model,features){
    const x=model.features.map(k=>F.num(features[k]));let raw;
    if(model.type==='logistic' || model.type==='residual'){
        const missing=x.map(v=>!Number.isFinite(v));
        const z=x.map((v,i)=>missing[i]?model.median[i]:v).concat(model.indicators.map(i=>Number(missing[i])))
            .map((v,i)=>{const n=(v-model.mean[i])/model.scale[i];return model.type==='residual'?Math.max(-5,Math.min(5,n)):n;});
        raw=model.coefficients.map((coeff,c)=>coeff.reduce((v,w,i)=>v+w*z[i],model.intercept[c]));
        if(model.type==='residual'){
            if(model.binary){let p=F.num(features.price_raw);if(!Number.isFinite(p) || p===0)p=.5;p=Math.max(.001,Math.min(.999,p));raw[0]+=Math.log(p/(1-p));}
            else{let p=['MS1','X','MS2'].map(k=>F.num(features['price_'+k]));if(p.some(v=>!Number.isFinite(v)||v<=0))p=[1/3,1/3,1/3];const t=p.reduce((a,b)=>a+b,0);raw=raw.map((r,i)=>r+Math.log(Math.max(.001,Math.min(.999,p[i]/t))));}
        }
    }else if(model.type==='hist'){
        raw=[...model.baseline];
        for(const trees of model.trees)for(let c=0;c<trees.length;c++){
            const nodes=trees[c];let ni=0;
            while(!nodes[ni].leaf){const n=nodes[ni],v=x[n.feature];ni=(!Number.isFinite(v)?n.missingLeft:v<=n.threshold)?n.left:n.right;}
            raw[c]+=nodes[ni].value;
        }
    }else throw new Error('Unsupported V20 artifact');
    if(raw.length===1){const p=sigmoid(raw[0]);return [1-p,p];}
    const mx=Math.max(...raw),v=raw.map(x=>Math.exp(Math.max(-35,x-mx))),total=v.reduce((a,b)=>a+b,0);
    return v.map(p=>p/total);
}
function decreasingProjection(values){
    const blocks=[];
    values.forEach((v,i)=>{
        blocks.push({sum:v,count:1,start:i,end:i});
        while(blocks.length>1 && blocks.at(-2).sum/blocks.at(-2).count<blocks.at(-1).sum/blocks.at(-1).count){
            const b=blocks.pop(),a=blocks.pop();blocks.push({sum:a.sum+b.sum,count:a.count+b.count,start:a.start,end:b.end});
        }
    });
    const out=[...values];for(const b of blocks)for(let i=b.start;i<=b.end;i++)out[i]=b.sum/b.count;return out;
}
function eligible(score,minute,policy){
    return minute>=25 && minute<=80 && score.odds>=policy.minimumOdds && score.odds<=4 &&
        score.probability/100>=policy.minimumProbability-1e-12 && score.edgeRaw/100>=policy.minimumEdge-1e-12;
}
class V20Engine{
    constructor({modelPath=path.join(__dirname,'v20_model.json'),policyPath=path.join(__dirname,'v20_policy.json')}={}){
        this.model=null;this.policy=null;this.history=new Map();this.error=null;
        try{this.model=JSON.parse(fs.readFileSync(modelPath,'utf8'));const p=JSON.parse(fs.readFileSync(policyPath,'utf8'));this.policy=p.policy || p;}
        catch(error){this.error=String(error.message);}
    }
    evaluate(mac,context,capturedAt=new Date().toISOString()){
        const s=F.fromMac(mac,capturedAt,context);
        if(!this.model || !this.policy)return {available:false,reason:'V20 model/policy unavailable',scores:[],selected:null,snapshot:s};
        if(!F.validState(s))return {available:false,reason:'Invalid or missing live core statistics',scores:[],selected:null,snapshot:s};
        const history=this.history.get(s.fixtureId)||[],scores=[],overs=[];
        for(const market of F.MARKETS.filter(m=>m.endsWith('_UST'))){
            const line=Number(market.split('_')[0]),odds=F.num(s.markets[market]?.odds);
            if(s.homeScore+s.awayScore>line || !(odds>1 && odds<=30))continue;
            const p=predict(this.model.families.over,F.marketFeatures(s,market,history))[1];overs.push({market,odds,p});
        }
        const projected=decreasingProjection(overs.map(x=>x.p));
        overs.forEach((r,i)=>scores.push({market:r.market,odds:r.odds,probability:100*projected[i],edgeRaw:100*(projected[i]-1/r.odds),ev:projected[i]*r.odds-1}));
        const rp=predict(this.model.families.result,F.resultFeatures(s,history));
        ['MS1','X','MS2'].forEach((market,i)=>{const odds=F.num(s.markets[market]?.odds);if(odds>1 && odds<=30)scores.push({market,odds,probability:100*rp[i],edgeRaw:100*(rp[i]-1/odds),ev:rp[i]*odds-1});});
        scores.forEach(r=>r.eligible=eligible(r,s.minute,this.policy));
        const ordered=scores.filter(r=>r.eligible).sort((a,b)=>b.probability-a.probability || b.ev-a.ev || F.MARKETS.indexOf(a.market)-F.MARKETS.indexOf(b.market));
        if(!history.some(p=>p.at===s.at && p.minute===s.minute && p.homeScore===s.homeScore && p.awayScore===s.awayScore)){
            history.push(s);history.sort((a,b)=>a.at.localeCompare(b.at));this.history.set(s.fixtureId,history.slice(-24));
        }
        const cutoff=new Date(capturedAt).getTime()-8*3600000;
        for(const [id,rows] of this.history)if(new Date(rows.at(-1).at).getTime()<cutoff)this.history.delete(id);
        return {available:true,modelVersion:this.model.version,reason:null,scores,selected:ordered[0]||null,snapshot:s};
    }
}
module.exports={V20Engine,predict,decreasingProjection,eligible};
