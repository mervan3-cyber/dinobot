'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),M=require('./banko_model');
const C=require('./public/banko_choices');
const S=require('./public/banko_showroom');
// Storage schema stays v1 so existing sessions, frozen picks and API usage remain readable.
const VERSION='banko-coupon-lab-v1-2026-10-05';
const RUNTIME_VERSION='banko-showroom-paper-v1-2026-10-08';
class LiveDispatchDeferred extends Error {constructor(){super('Banko isteği canlı işlem için gönderilmeden ertelendi.');}}
const DEFAULTS=Object.freeze({enabled:true,dailyLimit:2000,maxCandidates:30,maxCoupons:1,minLegOdd:1.40,maxLegOdd:2.20,
    minCouponOdd:1.95,maxCouponOdd:2.40,minSingleOdd:1.80,maxSingleOdd:2.20,minModelProbability:65,minEdgePP:0,
    maxOddsAgeHours:6,precheckMinutes:75,autoPrecheck:true,allowedLeagueIds:[],women:true,
    marketFamilies:['goals','result','halves','btts','teamGoals','corners'],predictionContext:true});
function dayKey(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function dayAdd(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
function validDay(day){if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw new Error('Geçerli bir tarih seçin (YYYY-AA-GG).');return day;}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}
function schemaSettings(input,previous=DEFAULTS){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Ayar nesnesi gerekli.');const next=JSON.parse(JSON.stringify(previous));
    for(const key of ['enabled','autoPrecheck','women','predictionContext'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')throw new Error(key+' true/false olmalı.');next[key]=input[key];}
    const ranges={dailyLimit:[20,7500,true],maxCandidates:[1,100,true],minLegOdd:[1.4,3,false],maxLegOdd:[1.4,5,false],minCouponOdd:[1.8,4,false],maxCouponOdd:[1.8,5,false],minSingleOdd:[1.4,3,false],maxSingleOdd:[1.4,4,false],minModelProbability:[55,90,false],minEdgePP:[-10,20,false],maxOddsAgeHours:[1,24,true],precheckMinutes:[15,120,true]};
    for(const [key,[lo,hi,int]] of Object.entries(ranges))if(input[key]!==undefined){const n=M.finite(input[key]);if(n===null||n<lo||n>hi||int&&!Number.isInteger(n))throw new Error(key+` ${lo}–${hi} arasında ${int?'tam ':''}sayı olmalı.`);next[key]=n;}
    if(input.maxCoupons!==undefined){const n=M.finite(input.maxCoupons);if(!Number.isSafeInteger(n)||n<1)throw new Error('Kupon sayısı pozitif, güvenli bir tam sayı olmalı.');next.maxCoupons=n;}
    for(const [a,b] of [['minLegOdd','maxLegOdd'],['minCouponOdd','maxCouponOdd'],['minSingleOdd','maxSingleOdd']])if(next[a]>next[b])throw new Error('Minimum oran maksimumu aşamaz.');
    if(input.allowedLeagueIds!==undefined){if(!Array.isArray(input.allowedLeagueIds)||input.allowedLeagueIds.length>300||input.allowedLeagueIds.some(id=>!Number.isInteger(id)||id<1))throw new Error('Ligler pozitif kimlik dizisi olmalı.');next.allowedLeagueIds=[...new Set(input.allowedLeagueIds)];}
    if(input.marketFamilies!==undefined){if(!Array.isArray(input.marketFamilies)||!input.marketFamilies.length||input.marketFamilies.some(f=>!DEFAULTS.marketFamilies.includes(f)))throw new Error('En az bir geçerli market ailesi gerekli.');next.marketFamilies=[...new Set(input.marketFamilies)];}
    return next;
}
class BankoCoupon {
    constructor({directory,apiGet,canRun=()=>true,getQuotaRemaining=()=>null,reserve=1500,now=()=>new Date(),logger=()=>{},priorityLeagues=[],waitForLiveTick=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
        this.directory=directory;this.apiGet=apiGet;this.canRun=canRun;this.getQuotaRemaining=getQuotaRemaining;this.reserve=reserve;this.now=now;this.logger=logger;this.priority=new Set(priorityLeagues.map(M.normalize));
        this.files=directory?{data:path.join(directory,'dino_banko_coupon_v1.json'),usage:path.join(directory,'dino_banko_api_usage.json'),cache:path.join(directory,'dino_banko_cache_v1.json')}:{};this.requestCount=0;
        this.data={version:VERSION,settings:JSON.parse(JSON.stringify(DEFAULTS)),sessions:[],manualSelections:[],discoveries:{},latestJob:null};this.usage={};this.cache={};this.busy=false;this.storageError=null;this.task=Promise.resolve();this.waitForLiveTick=waitForLiveTick;
    }
    load(){try{
        for(const key of ['data','usage','cache'])if(this.files[key]&&fs.existsSync(this.files[key])){
            const item=JSON.parse(fs.readFileSync(this.files[key],'utf8'));if(!item||typeof item!=='object'||Array.isArray(item))throw Error('schema');
            if(key==='data'){if(item.version!==VERSION||!Array.isArray(item.sessions)||!item.discoveries||item.manualSelections!==undefined&&(!Array.isArray(item.manualSelections)||item.manualSelections.some(l=>!l||typeof l.id!=='string'||typeof l.sessionId!=='string'||!Number.isInteger(l.fixtureId)||!l.pick?.spec||!l.result||!['pending','won','lost'].includes(l.result.status)||!Array.isArray(l.priceHistory)||l.playedOdd!==null&&(!Number.isFinite(l.playedOdd)||l.playedOdd<=1))))throw Error('schema');this.data={...item,manualSelections:item.manualSelections||[],settings:schemaSettings(item.settings)};}
            else if(key==='usage'){if(Object.entries(item).some(([day,n])=>!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(n)||n<0))throw Error('ledger');this.usage=item;}
            else this.cache=item;
        }
        if(['running','waiting-live'].includes(this.data.latestJob?.status)){this.data.latestJob.status='interrupted';this.data.latestJob.message='Sunucu yeniden başladı. Kayıtlar korunuyor; manuel yeniden oluşturun.';}
        for(const s of this.data.sessions)if(s.status==='running'){s.status='interrupted';s.reason='Yeniden başlatma sırasında yarım kaldı; kupon oluşturulmadı.';}
    }catch(_){this.storageError='Banko dosyası okunamadı; geçmiş korunuyor. Dosyayı silmeden yedeği inceleyin.';}return this.status();}
    save(){if(this.storageError)throw Error(this.storageError);try{if(this.files.data)atomic(this.files.data,this.data);}catch(_){this.storageError='Banko geçmişi yazılamadı; güvenli şekilde durduruldu.';throw Error(this.storageError);}}
    saveUsage(){try{if(this.files.usage)atomic(this.files.usage,this.usage);}catch(_){this.storageError='Banko API bütçesi yazılamadı; yeni istek durduruldu.';throw Error(this.storageError);}}
    saveCache(){const time=this.now().getTime();this.cache=Object.fromEntries(Object.entries(this.cache).filter(([,e])=>Number.isFinite(e?.expires)&&e.expires>time).slice(-1200));try{if(this.files.cache)atomic(this.files.cache,this.cache);}catch(_){this.storageError='Banko önbelleği yazılamadı; işlemler durduruldu.';throw Error(this.storageError);}}
    settings(input){if(this.busy)throw Error('Banko işlemi sürerken ayar değiştirilemez.');const next=schemaSettings(input,this.data.settings),old=this.data.settings;this.data.settings=next;try{this.save();}catch(e){this.data.settings=old;throw e;}return this.status();}
    selectionContext(input){
        if(this.storageError)throw Error(this.storageError);if(this.busy)throw Error('Banko işlemi sürerken seçim kaydı değiştirilemez.');
        if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Seçim bilgisi gerekli.');
        const session=this.data.sessions.find(s=>s.id===input.sessionId&&s.date===validDay(input.date));
        if(!session||session.status!=='complete')throw Error('Tamamlanmış bir analiz sürümü seçin.');
        const row=session.candidates.find(r=>r.fixtureId===input.fixtureId),market=row?.markets?.find(m=>m.key===input.marketKey);
        const spec=market&&M.specFor(market.betId,market.selection);
        if(!row||!market||!spec||spec.kind==='corners'||!Number.isFinite(market.modelProbability)||!C.sameOutcome({...market,spec},market))throw Error('Bu marketin seçim/sonuçlandırma kuralı doğrulanmadı.');
        return {session,row,market};
    }
    selectionPrice(input){if(input===null||input===undefined||input==='')return null;const odd=M.finite(input);if(odd===null||odd<=1||odd>1000)throw Error('Oran 1’den büyük, en fazla 1000 olmalı.');return odd;}
    selectionTag(input){if(input===undefined)return '';if(typeof input!=='string'||input.length>80)throw Error('Kupon etiketi en fazla 80 karakter olmalı.');return input.trim();}
    previewSelection(input){const {session,row,market}=this.selectionContext(input),odd=this.selectionPrice(input.playedOdd);return {...C.priceCheck(row,market,session.settings,odd??market.odd,this.now()),enteredOdd:odd,checkedAt:this.now().toISOString()};}
    addSelection(input){
        const {session,row,market}=this.selectionContext(input),playedOdd=this.selectionPrice(input.playedOdd),tag=this.selectionTag(input.tag),priceCheck=C.priceCheck(row,market,session.settings,playedOdd??market.odd,this.now());
        if(!priceCheck.eligible&&input.allowRejected!==true)throw Error('Seçim şartları geçmiyor. Yalnız manuel takip için uyarıyı açıkça kabul edin.');
        const existing=this.data.manualSelections.find(l=>l.sessionId===session.id&&l.fixtureId===row.fixtureId&&C.sameOutcome(l.pick,market));
        if(existing)return {selection:JSON.parse(JSON.stringify(existing)),alreadySaved:true};
        const backup=C.alternative(row,session.settings),createdAt=this.now().toISOString(),result=row.marketResults?.[market.key];
        const entry={id:'banko-manual-'+crypto.randomUUID(),date:session.date,sessionId:session.id,fixtureId:row.fixtureId,match:row.match,kickoff:row.kickoff,league:row.league,
            pick:JSON.parse(JSON.stringify(market)),settings:JSON.parse(JSON.stringify(session.settings)),origin:market.key===row.pick?.key?'main':market.key===backup?.key?'backup':'analysis',
            tag,playedOdd,priceCheck,createdAt,timing:Date.parse(row.kickoff)>this.now().getTime()?'prematch':'retrospective',showroomSnapshot:S.snapshotFor(row),
            priceHistory:[],result:result&&['won','lost'].includes(result.status)?{...result,profitUnits:playedOdd===null?null:result.status==='won'?playedOdd-1:-1}:{status:'pending'}};
        this.data.manualSelections.push(entry);try{this.save();}catch(e){this.data.manualSelections.pop();throw e;}
        return {selection:JSON.parse(JSON.stringify(entry)),alreadySaved:false};
    }
    updateSelectionPrice(input){
        if(this.busy||this.storageError)throw Error(this.storageError||'Banko işlemi sürüyor.');
        const entry=this.data.manualSelections.find(l=>l.id===input?.id);if(!entry)throw Error('Kayıtlı seçim bulunamadı.');
        const playedOdd=this.selectionPrice(input.playedOdd),session=this.data.sessions.find(s=>s.id===entry.sessionId),row=session?.candidates.find(r=>r.fixtureId===entry.fixtureId);
        if(!row)throw Error('Seçimin özgün analiz kaydı bulunamadı.');
        const old=JSON.parse(JSON.stringify(entry)),tag=input.tag===undefined?entry.tag:this.selectionTag(input.tag);
        entry.priceHistory.push({changedAt:this.now().toISOString(),previousOdd:entry.playedOdd,newOdd:playedOdd,previousTag:entry.tag,newTag:tag});entry.playedOdd=playedOdd;entry.tag=tag;
        entry.priceCheck=C.priceCheck(row,entry.pick,entry.settings,playedOdd??entry.pick.odd,this.now());
        if(['won','lost'].includes(entry.result.status))entry.result.profitUnits=playedOdd===null?null:entry.result.status==='won'?playedOdd-1:-1;
        try{this.save();}catch(e){Object.keys(entry).forEach(k=>delete entry[k]);Object.assign(entry,old);throw e;}return JSON.parse(JSON.stringify(entry));
    }
    guard({allowLiveBusy=false,api=true}={}){if(this.storageError)throw Error(this.storageError);if(!this.data.settings.enabled)throw Error('Banko Kupon kapalı.');if(api){const day=dayKey(this.now()),used=this.usage[day]||0,remaining=M.finite(this.getQuotaRemaining());if(used>=this.data.settings.dailyLimit)throw Error('Banko günlük API bütçesi doldu.');if(remaining!==null&&remaining<=this.reserve)throw Error('Canlı sistem için genel API rezervi korundu.');}if(!allowLiveBusy&&!this.canRun())throw new LiveDispatchDeferred();}
    async waitForLive({api=false}={}){
        this.guard({allowLiveBusy:true,api});if(this.canRun())return;
        const job=this.data.latestJob,resumeMessage=job?.message||'Banko işlemi sürüyor';
        if(job){job.status='waiting-live';job.message='Canlı/İY-MS işlemini bekliyor · aynı kayıttan otomatik devam edecek';job.pausedAt=this.now().toISOString();job.pauseCount=(job.pauseCount||0)+1;this.save();}
        this.logger('> ⏸️ Banko: canlı işlem bekleniyor; kayıt ve ilerleme korunuyor.');
        // Wait outside the shared queue; otherwise the live job cannot finish its API work.
        while(!this.canRun()){this.guard({allowLiveBusy:true,api});await this.waitForLiveTick(1000);}
        this.guard({allowLiveBusy:true,api});
        if(job){job.status='running';job.message=resumeMessage;job.resumedAt=this.now().toISOString();job.pausedAt=null;this.save();}
        this.logger('> ▶️ Banko: aynı işlem kaldığı yerden devam ediyor.');
    }
    consume(){this.guard();const day=dayKey(this.now());this.usage[day]=(this.usage[day]||0)+1;this.saveUsage();this.requestCount++;}
    async call(endpoint,params={}){
        const url=endpoint+'?'+new URLSearchParams(params);
        for(;;){await this.waitForLive({api:true});let counted=false,response;
            try{response=await this.apiGet(url,{dinoMaxAttempts:1,dinoBeforeAttempt:()=>{if(counted)throw Error('Banko otomatik tekrar isteği engellendi.');this.consume();counted=true;}});}catch(error){
                if(this.storageError)throw Error(this.storageError);
                // Retry ONLY a local live guard before dispatch, never a sent/ambiguous/API error.
                if(!counted&&error instanceof LiveDispatchDeferred)continue;
                if(!counted){this.guard({allowLiveBusy:true});throw Error('Banko isteği API kuyruğunda çalıştırılamadı.');}
                throw Error('API isteği tamamlanamadı; gizli bağlantı ayrıntıları gösterilmedi.');
            }
            if(!counted)throw Error('API bütçe sayacı bağlanmamış; Banko güvenli şekilde durduruldu.');
            if(!response?.data||Object.keys(response.data.errors||{}).length)throw Error('API eksik/hatalı yanıt verdi; kayıt tamamlandı sayılmadı.');
            return response.data;
        }
    }
    async cached(key,ttl,loader){const old=this.cache[key];if(old&&old.expires>this.now().getTime())return JSON.parse(JSON.stringify(old.value));const value=await loader();this.cache[key]={expires:this.now().getTime()+ttl,value};return value;}
    validateScanDate(date){validDay(date);const today=dayKey(this.now());if(date<today)throw Error('Geçmiş güne yeni maç önü kuponu oluşturulmaz. Arşivden görüntüleyin; kör replay ayrı analizdir.');if(date>dayAdd(today,7))throw Error('En fazla 7 gün ileri tarih seçilebilir; marketler açılmamış olabilir.');}
    start(kind,date,sessionId){validDay(date);if(this.busy)throw Error('Banko işlemi zaten sürüyor.');this.guard({allowLiveBusy:true});if(['scan','discover'].includes(kind))this.validateScanDate(date);
        const session=sessionId?this.data.sessions.find(s=>s.id===sessionId&&s.date===date):[...this.data.sessions].reverse().find(s=>s.date===date&&s.status==='complete');
        if(['check','results'].includes(kind)&&!session)throw Error('Bu tarih için tamamlanmış kupon kaydı bulunamadı.');
        this.busy=true;const job={id:crypto.randomUUID(),kind,date,sessionId:session?.id||null,status:'running',startedAt:this.now().toISOString(),message:'Başlatılıyor',processed:0,total:0};this.data.latestJob=job;
        try{this.save();}catch(e){this.busy=false;throw e;}
        const requestStart=this.requestCount;
        this.task=Promise.resolve().then(async()=>{try{if(kind==='scan')await this.scan(date,job);else if(kind==='discover')await this.discover(date,job);else if(kind==='check')await this.checkSession(session,job);else if(kind==='results')await this.results(session,job);else throw Error('Bilinmeyen Banko işlemi.');job.status='complete';job.message=kind==='scan'?'Tarama tamamlandı':kind==='results'?'Sonuç kontrolü tamamlandı':'Kontrol tamamlandı';}
            catch(e){job.status='error';job.message=this.storageError||e.message;this.logger('> ⚠️ Banko: '+job.message);}
            finally{this.busy=false;job.completedAt=this.now().toISOString();job.apiUsed=this.requestCount-requestStart;try{this.save();this.saveCache();}catch(_){}}});return this.status(date);
    }
    async schedule(date){return this.cached('schedule:'+date,20*60000,async()=>{const r=await this.call('/fixtures',{date,timezone:'Europe/Istanbul'});return (r.response||[]).map(f=>({fixtureId:f.fixture?.id,kickoff:f.fixture?.date,status:f.fixture?.status?.short,leagueId:f.league?.id,league:f.league?.name,country:f.league?.country,season:f.league?.season,home:{id:f.teams?.home?.id,name:f.teams?.home?.name},away:{id:f.teams?.away?.id,name:f.teams?.away?.name}}));});}
    async discover(date,job){const fixtures=await this.schedule(date);const leagues=new Map();for(const f of fixtures){const old=leagues.get(f.leagueId)||{id:f.leagueId,name:f.league,country:f.country,matches:0};old.matches++;leagues.set(f.leagueId,old);}this.data.discoveries[date]={capturedAt:this.now().toISOString(),fixtures:fixtures.length,leagues:[...leagues.values()].sort((a,b)=>a.country.localeCompare(b.country)||a.name.localeCompare(b.name))};job.total=fixtures.length;job.processed=fixtures.length;this.save();return fixtures;}
    async leagueHistory(f,season,cutoffDay){const cutoff=Date.parse(dayAdd(cutoffDay,1)+'T00:00:00+03:00');return this.cached(`history:${f.leagueId}:${season}:${cutoffDay}`,12*3600000,async()=>{const r=await this.call('/fixtures',{league:f.leagueId,season,from:'2024-01-01',to:cutoffDay,timezone:'Europe/Istanbul'});return (r.response||[]).map(row=>M.pastFixture(row,cutoff)).filter(Boolean);});}
    async richHistory(ids){const missing=[...new Set(ids)].filter(id=>!this.cache['stats:'+id]||this.cache['stats:'+id].expires<=this.now().getTime());for(let i=0;i<missing.length;i+=5){const batch=missing.slice(i,i+5),r=await this.call('/fixtures',{ids:batch.join('-'),timezone:'Europe/Istanbul'});for(const f of r.response||[])if(batch.includes(f.fixture?.id))this.cache['stats:'+f.fixture.id]={expires:this.now().getTime()+3*86400000,value:M.slimRich(f)};}
        return Object.fromEntries(ids.map(id=>[id,this.cache['stats:'+id]?.value||{id,statistics:[],players:[]}]));}
    async coverage(f){return this.cached(`coverage:${f.leagueId}:${f.season}`,86400000,async()=>{const r=await this.call('/leagues',{id:f.leagueId,season:f.season});return r.response?.[0]?.seasons?.find(s=>s.year===f.season)?.coverage||null;});}
    async odds(fixtureId){let page=1,total=1,rows=[];do{const r=await this.call('/odds',{fixture:fixtureId,bookmaker:8,page});rows.push(...(r.response||[]));total=Number(r.paging?.total)||1;if(total>20)throw Error('Oran yanıtı 20 sayfayı aşıyor; yarım market onaylanmadı.');page++;}while(page<=total);return M.parseMarkets(rows,fixtureId,8);}
    async scan(date,job){
        const settings=JSON.parse(JSON.stringify(this.data.settings)),cutoffDay=dayAdd(dayKey(this.now()),-1),id='banko-'+crypto.randomUUID();
        const session={id,date,createdAt:this.now().toISOString(),version:VERSION,choicesVersion:C.VERSION,settings,inputCutoffDay:cutoffDay,status:'running',candidates:[],coupons:[],reason:null,apiStart:this.requestCount};job.sessionId=id;this.data.sessions.push(session);
        this.save();
        try{const fixtures=await this.discover(date,job);
        const wanted=fixtures.filter(f=>['NS','TBD'].includes(f.status)&&Date.parse(f.kickoff)>this.now().getTime()+30*60000&&(!settings.allowedLeagueIds.length||settings.allowedLeagueIds.includes(f.leagueId))&&(settings.women||!(/women|femen|feminin|\bw\b/i.test(f.league+' '+f.home.name+' '+f.away.name)))).sort((a,b)=>Number(this.priority.has(M.normalize(b.league)))-Number(this.priority.has(M.normalize(a.league)))||Date.parse(a.kickoff)-Date.parse(b.kickoff)||a.fixtureId-b.fixtureId).slice(0,settings.maxCandidates);
        job.total=wanted.length;job.processed=0;this.save();
        for(const f of wanted){await this.waitForLive();job.message=f.home.name+' - '+f.away.name;
            if(Date.parse(f.kickoff)<=this.now().getTime()+30*60000){job.processed++;this.save();continue;}
            const odds=await this.odds(f.fixtureId);
            const row={...f,id:id+':'+f.fixtureId,match:f.home.name+' - '+f.away.name,capturedAt:this.now().toISOString(),oddsUpdatedAt:odds.update,bookmaker:odds.bookmaker,markets:[],pick:null,reasons:[],risks:[],profiles:null,coverage:null};
            if(!odds.markets.length)row.reasons.push('Seçili Bet365 marketi açılmamış/yok');
            else{
                let history=await this.leagueHistory(f,f.season,cutoffDay);const teamCount=team=>history.filter(r=>r.homeId===team||r.awayId===team).length;
                if(teamCount(f.home.id)<20||teamCount(f.away.id)<20)history=[...new Map([...history,...await this.leagueHistory(f,f.season-1,cutoffDay)].map(r=>[r.id,r])).values()];
                history.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));if(history.some(r=>r.id===f.fixtureId))throw Error('Hedef maç geçmişe karıştı; Banko durduruldu.');
                const statsIds=[...new Set([f.home.id,f.away.id].flatMap(team=>history.filter(r=>r.homeId===team||r.awayId===team).slice(0,10).map(r=>r.id)))];
                const rich=await this.richHistory(statsIds),home=M.teamProfile(history,f.home.id,'home',rich),away=M.teamProfile(history,f.away.id,'away',rich);row.profiles={home,away};
                const base=history.slice(0,200);row.leagueBaseline={games:base.length,home:M.mean(base.map(r=>r.home)),away:M.mean(base.map(r=>r.away))};row.expectedGoals=M.expectedGoals(home,away,row.leagueBaseline);row.coverage=await this.coverage(f);
                row.h2h=history.filter(h=>[h.homeId,h.awayId].includes(f.home.id)&&[h.homeId,h.awayId].includes(f.away.id)).slice(0,5);
                row.markets=odds.markets;await this.waitForLive();this.evaluateCandidate(row,settings);
                row.risks.push('Ham model kalibre edilmedi; yüzde gerçek başarı garantisi değildir','Geçmiş yalnız bu ligdeki maçları kapsar; diğer kupalar/ligler form ve dinlenme hesabına dahil değildir');
                if(row.coverage?.injuries!==true)row.risks.push('Sakatlık veri kapsamı yok/bilinmiyor; eksik oyuncu yok anlamına gelmez');
                row.risks.push('Maç önü kadro/sakatlık kontrolü henüz yapılmadı');
                if(settings.predictionContext&&row.coverage?.predictions===true){const r=await this.call('/predictions',{fixture:f.fixtureId});const p=r.response?.[0]?.predictions;row.apiPrediction={advice:p?.advice||null,percent:p?.percent||null,contextOnly:true,capturedAt:this.now().toISOString()};}
            }
            session.candidates.push(row);job.processed++;this.save();this.saveCache();
        }
        // Recheck time/quote freshness after live pauses, without additional API requests.
        for(const row of session.candidates){await this.waitForLive();this.evaluateCandidate(row,settings);}
        session.coupons=M.optimize(session.candidates,settings,id);session.status='complete';if(!session.coupons.length)session.reason='İstenen güven/veri/oran şartlarında 1–2 ayaklı kupon bulunamadı. Ayak ekleyerek oran zorlanmadı.';session.completedAt=this.now().toISOString();
        session.predictionsSha256=crypto.createHash('sha256').update(JSON.stringify(session.coupons.map(c=>c.legs.map(l=>({fixtureId:l.fixtureId,pick:l.pick}))))).digest('hex');
        this.logger(`> 🎫 Banko LAB: ${date} · ${session.candidates.length} analiz · ${session.coupons.length} kupon · Telegram YOK.`);
        }catch(e){session.status='partial';session.reason=e.message;throw e;}finally{session.apiUsed=this.requestCount-session.apiStart;this.save();}
    }
    evaluateCandidate(row,settings){
        if(!row.profiles)return;
        row.markets=M.evaluateMarkets({update:row.oddsUpdatedAt,markets:row.markets},row.expectedGoals,row.profiles,settings,this.now(),row.kickoff);
        if(Date.parse(row.kickoff)<=this.now().getTime()+30*60000)for(const m of row.markets){m.eligible=false;m.reasons.push('Maç başlamış veya başlangıca 30 dakikadan az kalmış; yeni kupona alınmadı');}
        const eligible=row.markets.filter(m=>m.eligible).sort((a,b)=>b.modelProbability-a.modelProbability||b.dataScore-a.dataScore||a.betId-b.betId||a.selection.localeCompare(b.selection));row.pick=eligible[0]||null;
        const noPick='Sabit veri/oran/model şartlarını geçen market yok; seçim zorlanmadı';row.reasons=row.reasons.filter(r=>r!==noPick);if(!row.pick)row.reasons.push(noPick);
    }
    async checkSession(session,job,{automatic=false,onlyIds=null}={}){
        const ids=[...new Set(session.coupons.flatMap(c=>c.legs.filter(l=>l.result.status==='pending').map(l=>l.fixtureId)))].filter(id=>!onlyIds||onlyIds.includes(id));
        if(!ids.length){job.message='Kontrol edilecek bekleyen seçim yok';return;}job.total=ids.length;
        for(const id of ids){await this.waitForLive();const row=session.candidates.find(r=>r.fixtureId===id),response=await this.call('/fixtures',{id,timezone:'Europe/Istanbul'}),fresh=response.response?.[0],now=this.now(),reasons=[],warnings=[];
            if(!fresh||!['NS','TBD'].includes(fresh.fixture?.status?.short)||Date.parse(fresh.fixture?.date)<=now.getTime())reasons.push('Maç başlamış/durumu değişmiş; maç önü onayı yok');
            if(fresh&&fresh.fixture?.date&&Date.parse(fresh.fixture.date)!==Date.parse(row.kickoff))reasons.push('Başlangıç saati değişti; yeni kupon sürümü gerekli');
            let newOdds=null,injuries=null,lineups=null,quoteCheck=null;
            if(!reasons.length){const odds=await this.odds(id),quote=odds.markets.find(m=>m.key===row.pick.key);newOdds=quote?.odd||null;quoteCheck={odds,quote};
                const evaluated=quote&&M.evaluateMarkets({...odds,markets:[quote]},row.expectedGoals,row.profiles,session.settings,this.now(),row.kickoff)[0];if(!evaluated?.eligible)reasons.push('İlk seçim güncel oran/veri şartlarını artık geçmiyor');
                if(row.coverage?.injuries===true){const r=await this.call('/injuries',{fixture:id});injuries=(r.response||[]).map(x=>({team:x.team?.name,player:x.player?.name,reason:x.player?.reason,type:x.player?.type}));if(injuries.length)warnings.push(`${injuries.length} sakat/şüpheli oyuncu kaydı; önemini elle inceleyin`);}else warnings.push('Sakatlık kapsamı yok; eksik oyuncu durumu doğrulanamadı');
                if(row.coverage?.fixtures?.lineups===true&&Date.parse(row.kickoff)-now.getTime()<=60*60000){const r=await this.call('/fixtures/lineups',{fixture:id});lineups=(r.response||[]).map(t=>({team:t.team?.name,formation:t.formation,startXI:(t.startXI||[]).map(p=>p.player?.name)}));if(lineups.length!==2||lineups.some(t=>t.startXI.length!==11))warnings.push('İki takımın ilk 11 listesi henüz tam değil');}
                else warnings.push('İlk 11 henüz doğrulanmadı; maçtan 30–45 dakika önce manuel kontrol edin');
            }
            await this.waitForLive();if(Date.parse(row.kickoff)<=this.now().getTime()&&!reasons.length)reasons.push('Kontrol/bekleme sırasında maç başladı; maç önü onayı yok');
            if(quoteCheck?.quote&&!M.evaluateMarkets({...quoteCheck.odds,markets:[quoteCheck.quote]},row.expectedGoals,row.profiles,session.settings,this.now(),row.kickoff)[0]?.eligible&&!reasons.length)reasons.push('Bekleme sırasında kontrol oranı eskidi; maç önü onayı yok');
            const check={checkedAt:this.now().toISOString(),automatic,status:reasons.length?'rejected':warnings.length?'warning':'passed',originalOdd:row.pick.odd,currentOdd:newOdds,reasons,warnings,injuries,lineups};
            for(const coupon of session.coupons)for(const leg of coupon.legs)if(leg.fixtureId===id){leg.check=JSON.parse(JSON.stringify(check));if(automatic)leg.autoCheckedAt=now.toISOString();coupon.check.history.push({fixtureId:id,...check});}
            job.processed=(job.processed||0)+1;this.refreshCouponStates(session);this.save();
        }
    }
    refreshCouponStates(session){for(const coupon of session.coupons){const states=coupon.legs.map(l=>l.check?.status||'waiting');coupon.check.status=states.includes('rejected')?'rejected':states.includes('waiting')?'waiting':states.includes('warning')?'warning':'passed';coupon.check.currentOdd=coupon.legs.every(l=>l.check?.currentOdd)?coupon.legs.reduce((p,l)=>p*l.check.currentOdd,1):null;
        if(coupon.check.currentOdd!==null&&(coupon.check.currentOdd<session.settings.minCouponOdd||coupon.check.currentOdd>session.settings.maxCouponOdd)&&coupon.legs.length===2&&coupon.check.status==='passed')coupon.check.status='warning';
        if(coupon.legs.every(l=>['won','lost'].includes(l.result.status))){const won=coupon.legs.every(l=>l.result.status==='won');coupon.result={status:won?'won':'lost',profitUnits:won?coupon.originalOdd-1:-1,settledAt:this.now().toISOString()};}}
    }
    trackedMarkets(row,settings){return (row.markets||[]).filter(m=>m.spec&&m.spec.kind!=='corners'&&(C.accepted(m,settings)||m.key===row.pick?.key));}
    async results(session,job){
        const manual=(this.data.manualSelections||[]).filter(l=>l.date===session.date),now=this.now().getTime();
        const ids=[...new Set([...session.coupons.flatMap(c=>c.legs.filter(l=>l.result.status==='pending'&&Date.parse(l.kickoff)<now).map(l=>l.fixtureId)),
            ...manual.filter(l=>l.result.status==='pending'&&Date.parse(l.kickoff)<now).map(l=>l.fixtureId),
            ...session.candidates.filter(row=>Date.parse(row.kickoff)<now&&this.trackedMarkets(row,session.settings).some(m=>!['won','lost'].includes(row.marketResults?.[m.key]?.status))).map(row=>row.fixtureId)])];job.total=ids.length;
        for(let i=0;i<ids.length;i+=10){const batch=ids.slice(i,i+10),r=await this.call('/fixtures',{ids:batch.join('-'),timezone:'Europe/Istanbul'});for(const coupon of session.coupons)for(const leg of coupon.legs){if(!batch.includes(leg.fixtureId)||leg.result.status!=='pending')continue;const f=r.response?.find(f=>f.fixture?.id===leg.fixtureId);if(f)leg.result=M.settle(leg.pick,f);}
            for(const row of session.candidates){if(!batch.includes(row.fixtureId))continue;const f=r.response?.find(f=>f.fixture?.id===row.fixtureId);if(!f)continue;row.marketResults=row.marketResults||{};
                for(const m of this.trackedMarkets(row,session.settings))if(!['won','lost'].includes(row.marketResults[m.key]?.status))row.marketResults[m.key]={...M.settle(m,f),checkedAt:this.now().toISOString()};}
            for(const leg of manual){if(!batch.includes(leg.fixtureId)||leg.result.status!=='pending')continue;const f=r.response?.find(f=>f.fixture?.id===leg.fixtureId);if(f){const result=M.settle(leg.pick,f);leg.result={...result,profitUnits:['won','lost'].includes(result.status)&&leg.playedOdd!==null?(result.status==='won'?leg.playedOdd-1:-1):null,checkedAt:this.now().toISOString()};}}
            job.processed+=batch.length;this.refreshCouponStates(session);this.save();}
    }
    trackingSummary(session,manual){
        const count=list=>({total:list.length,won:list.filter(r=>r.status==='won').length,lost:list.filter(r=>r.status==='lost').length,pending:list.filter(r=>!['won','lost'].includes(r.status)).length});
        const model={main:[],backup:[],all:[]},seen=new Set();
        for(const row of session?.candidates||[]){const backup=C.alternative(row,session.settings);for(const [kind,m] of [['main',row.pick],['backup',backup]])if(m)model[kind].push(row.marketResults?.[m.key]||{status:'pending'});
            for(const m of this.trackedMarkets(row,session.settings)){const key=row.fixtureId+'|'+C.outcomeKey(m);if(!seen.has(key)){seen.add(key);model.all.push(row.marketResults?.[m.key]||{status:'pending'});}}}
        const unique=new Map();for(const l of manual){const key=l.fixtureId+'|'+C.outcomeKey(l.pick);if(!unique.has(key)||l.createdAt<unique.get(key).createdAt)unique.set(key,l);}
        return {manual:{records:manual.length,...count([...unique.values()].map(l=>l.result)),prospective:count([...unique.values()].filter(l=>l.timing==='prematch').map(l=>l.result)),retrospective:manual.filter(l=>l.timing!=='prematch').length},
            model:Object.fromEntries(Object.entries(model).map(([k,v])=>[k,count(v)])),modelVersion:session?.candidates.find(r=>r.pick)?.pick.modelVersion||null,
            disclaimer:'Manuel seçimler kullanıcı örneklemidir; bütün model başarısı değildir. Model grupları seçili taramaya aittir; bir maçın marketleri bağımsız örnek değildir. Yedek mevcut anlamsal kuralla hesaplanır.'};
    }
    async runDueChecks(){if(this.busy||this.storageError||!this.data.settings.enabled||!this.data.settings.autoPrecheck||!this.canRun())return;
        // Only the latest completed revision for each day is automatic. Old revisions remain manually checkable.
        const latestByDay=new Map();for(const s of this.data.sessions)if(s.status==='complete')latestByDay.set(s.date,s);
        const now=this.now(),due=[...latestByDay.values()].map(s=>({s,ids:[...new Set(s.coupons.flatMap(c=>c.legs.filter(l=>l.result.status==='pending'&&!l.autoCheckedAt&&Date.parse(l.kickoff)>now.getTime()&&Date.parse(l.kickoff)-now.getTime()<=this.data.settings.precheckMinutes*60000).map(l=>l.fixtureId)))]})).find(x=>x.ids.length);
        if(!due)return;this.busy=true;const job={id:crypto.randomUUID(),kind:'automatic-selected-precheck',date:due.s.date,sessionId:due.s.id,status:'running',startedAt:now.toISOString(),processed:0};this.data.latestJob=job;
        // Claim before I/O: failed/ambiguous automatic checks do not create an every-minute retry storm.
        for(const c of due.s.coupons)for(const l of c.legs)if(due.ids.includes(l.fixtureId))l.autoCheckedAt=now.toISOString();
        try{this.save();await this.checkSession(due.s,job,{automatic:true,onlyIds:due.ids});job.status='complete';}catch(e){job.status='error';job.message=e.message;}finally{this.busy=false;job.completedAt=this.now().toISOString();try{this.save();}catch(_){}}
    }
    status(date=dayKey(this.now()),sessionId=null){validDay(date);const sessions=this.data.sessions.filter(s=>s.date===date),session=sessionId?sessions.find(s=>s.id===sessionId):sessions.at(-1)||null,coupons=session?.coupons||[];
        const manual=(this.data.manualSelections||[]).filter(l=>l.date===date);
        // Old manual records resolve ONLY their original revision; no API call, model rerun or store mutation.
        const sessionsById=new Map(this.data.sessions.map(s=>[s.id,s]));
        const showroomManual=manual.map(l=>({...JSON.parse(JSON.stringify(l)),showroomContext:S.normalizeContext(l.showroomSnapshot||S.snapshotFor(sessionsById.get(l.sessionId)?.candidates?.find(r=>r.fixtureId===l.fixtureId)))}));
        return {success:true,version:VERSION,runtimeVersion:RUNTIME_VERSION,date,day:dayKey(this.now()),busy:this.busy,storageError:this.storageError,settings:JSON.parse(JSON.stringify(this.data.settings)),api:{used:this.usage[dayKey(this.now())]||0,limit:this.data.settings.dailyLimit,reserve:this.reserve,remaining:M.finite(this.getQuotaRemaining())},job:this.data.latestJob,
            manualSelections:showroomManual,trackingSummary:this.trackingSummary(session,manual),
            availableDates:[...new Set(this.data.sessions.map(s=>s.date))].sort().reverse(),sessions:sessions.map(s=>({id:s.id,createdAt:s.createdAt,status:s.status,couponCount:s.coupons.length})),session:session?JSON.parse(JSON.stringify(session)):null,discovery:this.data.discoveries[date]||null,
            summary:{candidates:session?.candidates.length||0,coupons:coupons.length,won:coupons.filter(c=>c.result.status==='won').length,lost:coupons.filter(c=>c.result.status==='lost').length,pending:coupons.filter(c=>c.result.status==='pending').length,profitUnits:coupons.filter(c=>c.result.status!=='pending').reduce((sum,c)=>sum+(c.result.profitUnits||0),0)},
            disclaimer:'Banko bir mod adıdır, garanti değildir. Ham model yüzdeleri kalibrasyonsuz LAB tahminidir. Tarama ve sonuçlar manuel; yalnız seçilen maçların kontrolü isteğe bağlı otomatiktir. Telegram gönderimi yok.'};
    }
}
module.exports={BankoCoupon,VERSION,RUNTIME_VERSION,DEFAULTS,dayKey,dayAdd,validDay,schemaSettings};
