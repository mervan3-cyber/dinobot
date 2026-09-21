'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
assert.equal(html,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
class Element {
    constructor(tagName='div'){this.tagName=tagName;this.children=[];this._text='';this.style={};this.dataset={};this.hidden=false;this.classList={add(){},remove(){},toggle(){}};}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(v){this._text=String(v);this.children=[];}
    get options(){return this.children;}
    replaceChildren(...children){this._text='';this.children=[];children.forEach(c=>this.appendChild(c));}
    appendChild(c){c.parentNode=this;this.children.push(c);return c;}append(...children){children.forEach(c=>this.appendChild(c));}
    addEventListener(){}click(){}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
    querySelectorAll(selector){return this.children.flatMap(c=>[...(selector===c.tagName?[c]:[]),...c.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const elements=new Map(ids.map(id=>[id,new Element()])),anchors=[];
const document={body:new Element('body'),getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],
    createElement(tag){const el=new Element(tag);if(tag==='a')anchors.push(el);return el;}};
const context=vm.createContext({document,window:{location:{protocol:'https:',origin:'https://offline.test'}},URLSearchParams,
    setInterval(){},setTimeout(){},clearTimeout(){},fetch(){throw Error('No live requests');}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'public/v23_filter_panel.js'),'utf8'),context);
for(const [,script]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))vm.runInContext(script,context);

const el=id=>elements.get(id);
const statuses=[];
context.checkStatus=async()=>{};
context.showToast=(message,error)=>statuses.push({message,error});
vm.runInContext("isBotRunning=true;autoScanEnabled=true;nextRunTarget=Date.now()+125000;",context);
context.renderAdaptiveScanState();
assert.equal(el('adaptive-scan-enabled').checked,false);
assert.match(el('adaptive-scan-status').textContent,/normal 10/);
(async()=>{
    let sent;
    context.apiFetch=async(_url,options)=>{sent=JSON.parse(options.body);return {success:true,state:{adaptiveScanEnabled:sent.adaptiveScanEnabled}};};
    await context.saveAdaptiveScan(true);
    assert.deepEqual(sent,{adaptiveScanEnabled:true});assert.equal(el('adaptive-scan-enabled').checked,true);
    assert.equal(el('adaptive-scan-enabled').disabled,false);
    vm.runInContext("latestAdaptiveScan={enabled:true,active:true,reasonLabel:'Uygun tam-stat maç var · 5 dakika',candidateCount:6};",context);
    context.renderAdaptiveScanState();
    assert.match(el('adaptive-scan-status').textContent,/6 uygun maç/);assert.match(el('adaptive-scan-status').textContent,/Sonraki: 2:/);
    vm.runInContext("latestAdaptiveScan={enabled:true,active:false,reasonLabel:'API kota rezervi · 10 dakika',candidateCount:6};",context);
    context.renderAdaptiveScanState();assert.match(el('adaptive-scan-status').textContent,/kota rezervi/);
    context.apiFetch=async()=>({success:false,message:'Disk dolu'});
    await context.saveAdaptiveScan(false);assert.equal(el('adaptive-scan-enabled').checked,true,'Failed save rolls back');
    assert.equal(statuses.at(-1).error,true);
    context.apiFetch=async(_url,options)=>({success:true,state:{adaptiveScanEnabled:JSON.parse(options.body).adaptiveScanEnabled}});
    await context.saveAdaptiveScan(false);assert.equal(el('adaptive-scan-enabled').checked,false);
    vm.runInContext("autoScanEnabled=false;latestAdaptiveScan={reasonLabel:'Otomatik tarama kapalı',candidateCount:6};",context);
    context.updateNextRunCountdown();assert.match(el('adaptive-scan-status').textContent,/Otomatik tarama kapalı/);
    assert(!el('adaptive-scan-status').textContent.includes('Sonraki:'));
    console.log('Adaptive panel: default-off, strict boolean payload, saved toggle, candidate/countdown, reserve display, failed-save rollback and paused state passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

