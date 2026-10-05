'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),M=require('./banko_model');
const VERSION='banko-coupon-lab-v1-2026-10-05';
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
    const ranges={dailyLimit:[20,7500,true],maxCandidates:[1,100,true],maxCoupons:[1,2,true],minLegOdd:[1.4,3,false],maxLegOdd:[1.4,5,false],minCouponOdd:[1.8,4,false],maxCouponOdd:[1.8,5,false],minSingleOdd:[1.4,3,false],maxSingleOdd:[1.4,4,false],minModelProbability:[55,90,false],minEdgePP:[-10,20,false],maxOddsAgeHours:[1,24,true],precheckMinutes:[15,120,true]};
    for(const [key,[lo,hi,int]] of Object.entries(ranges))if(input[key]!==undefined){const n=M.finite(input[key]);if(n===null||n<lo||n>hi||int&&!Number.isInteger(n))throw new Error(key+` ${lo}–${hi} arasında ${int?'tam ':''}sayı olmalı.`);next[key]=n;}
    for(const [a,b] of [['minLegOdd','maxLegOdd'],['minCouponOdd','maxCouponOdd'],['minSingleOdd','maxSingleOdd']])if(next[a]>next[b])throw new Error('Minimum oran maksimumu aşamaz.');
    if(input.allowedLeagueIds!==undefined){if(!Array.isArray(input.allowedLeagueIds)||input.allowedLeagueIds.length>300||input.allowedLeagueIds.some(id=>!Number.isInteger(id)||id<1))throw new Error('Ligler pozitif kimlik dizisi olmalı.');next.allowedLeagueIds=[...new Set(input.allowedLeagueIds)];}
    if(input.marketFamilies!==undefined){if(!Array.isArray(input.marketFamilies)||!input.marketFamilies.length||input.marketFamilies.some(f=>!DEFAULTS.marketFamilies.includes(f)))throw new Error('En az bir geçerli market ailesi gerekli.');next.marketFamilies=[...new Set(input.marketFamilies)];}
    return next;
}
class BankoCoupon {
    constructor({directory,apiGet,canRun=()=>true,getQuotaRemaining=()=>null,reserve=1500,now=()=>new Date(),logger=()=>{},priorityLeagues=[]}={}){
        this.directory=directory;this.apiGet=apiGet;this.canRun=canRun;this.getQuotaRemaining=getQuotaRemaining;this.reserve=reserve;this.now=now;this.logger=logger;this.priority=new Set(priorityLeagues.map(M.normalize));
        this.files=directory?{data:path.join(directory,'dino_banko_coupon_v1.json'),usage:path.join(directory,'dino_banko_api_usage.json'),cache:path.join(directory,'dino_banko_cache_v1.json')}:{};this.requestCount=0;
        this.data={version:VERSION,settings:JSON.parse(JSON.stringify(DEFAULTS)),sessions:[],discoveries:{},latestJob:null};this.usage={};this.cache={};this.busy=false;this.storageError=null;this.task=Promise.resolve();
    }
    load(){try{
        for(const key of ['data','usage','cache'])if(this.files[key]&&fs.existsSync(this.files[key])){
            const item=JSON.parse(fs.readFileSync(this.files[key],'utf8'));if(!item||typeof item!=='object'||Array.isArray(item))throw Error('schema');
            if(key==='data'){if(item.version!==VERSION||!Array.isArray(item.sessions)||!item.discoveries)throw Error('schema');this.data={...item,settings:schemaSettings(item.settings)};}
            else if(key==='usage'){if(Object.entries(item).some(([day,n])=>!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(n)||n<0))throw Error('ledger');this.usage=item;}
            else this.cache=item;
        }
        if(this.data.latestJob?.status==='running'){this.data.latestJob.status='interrupted';this.data.latestJob.message='Sunucu yeniden başladı. Kayıtlar korunuyor; manuel yeniden oluşturun.';}
        for(const s of this.data.sessions)if(s.status==='running'){s.status='interrupted';s.reason='Yeniden başlatma sırasında yarım kaldı; kupon oluşturulmadı.';}
    }catch(_){this.storageError='Banko dosyası okunamadı; geçmiş korunuyor. Dosyayı silmeden yedeği inceleyin.';}return this.status();}
    save(){if(this.storageError)throw Error(this.storageError);try{if(this.files.data)atomic(this.files.data,this.data);}catch(_){this.storageError='Banko geçmişi yazılamadı; güvenli şekilde durduruldu.';throw Error(this.storageError);}}
    saveUsage(){try{if(this.files.usage)atomic(this.files.usage,this.usage);}catch(_){this.storageError='Banko API bütçesi yazılamadı; yeni istek durduruldu.';throw Error(this.storageError);}}
    saveCache(){const time=this.now().getTime();this.cache=Object.fromEntries(Object.entries(this.cache).filter(([,e])=>Number.isFinite(e?.expires)&&e.expires>time).slice(-1200));try{if(this.files.cache)atomic(this.files.cache,this.cache);}catch(_){this.storageError='Banko önbelleği yazılamadı; işlemler durduruldu.';throw Error(this.storageError);}}
    settings(input){if(this.busy)throw Error('Banko işlemi sürerken ayar değiştirilemez.');const next=schemaSettings(input,this.data.settings),old=this.data.settings;this.data.settings=next;try{this.save();}catch(e){this.data.settings=old;throw e;}return this.status();}
    guard(){if(this.storageError)throw Error(this.storageError);if(!this.data.settings.enabled)throw Error('Banko Kupon kapalı.');if(!this.canRun())throw Error('Canlı/İY-MS taraması başladı. Banko kayıtları korundu; tekrar manuel deneyin.');const day=dayKey(this.now()),used=this.usage[day]||0,remaining=M.finite(this.getQuotaRemaining());if(used>=this.data.settings.dailyLimit)throw Error('Banko günlük API bütçesi doldu.');if(remaining!==null&&remaining<=this.reserve)throw Error('Canlı sistem için genel API rezervi korundu.');}
    consume(){this.guard();const day=dayKey(this.now());this.usage[day]=(this.usage[day]||0)+1;this.saveUsage();this.requestCount++;}
    async call(endpoint,params={}){
        this.guard();const url=endpoint+'?'+new URLSearchParams(params);let counted=false,response;
        try{response=await this.apiGet(url,{dinoMaxAttempts:1,dinoBeforeAttempt:()=>{if(counted)throw Error('Banko otomatik tekrar isteği engellendi.');this.consume();counted=true;}});}catch(error){if(this.storageError)throw Error(this.storageError);if(!counted){this.guard();throw Error('Banko isteği API kuyruğunda çalıştırılamadı.');}throw Error('API isteği tamamlanamadı; gizli bağlantı ayrıntıları gösterilmedi.');}
        if(!counted)throw Error('API bütçe sayacı bağlanmamış; Banko güvenli şekilde durduruldu.');
        if(!response?.data||Object.keys(response.data.errors||{}).length)throw Error('API eksik/hatalı yanıt verdi; kayıt tamamlandı sayılmadı.');
        return response.data;
    }
    async cached(key,ttl,loader){const old=this.cache[key];if(old&&old.expires>this.now().getTime())return JSON.parse(JSON.stringify(old.value));const value=await loader();this.cache[key]={expires:this.now().getTime()+ttl,value};return value;}
    validateScanDate(date){validDay(date);const today=dayKey(this.now());if(date<today)throw Error('Geçmiş güne yeni maç önü kuponu oluşturulmaz. Arşivden görüntüleyin; kör replay ayrı analizdir.');if(date>dayAdd(today,7))throw Error('En fazla 7 gün ileri tarih seçilebilir; marketler açılmamış olabilir.');}
    start(kind,date,sessionId){validDay(date);if(this.busy)throw Error('Banko işlemi zaten sürüyor.');this.guard();if(['scan','discover'].includes(kind))this.validateScanDate(date);
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
        const settings=JSON.parse(JSON.stringify(this.data.settings)),fixtures=await this.discover(date,job),cutoffDay=dayAdd(dayKey(this.now()),-1),id='banko-'+crypto.randomUUID();
        const session={id,date,createdAt:this.now().toISOString(),version:VERSION,settings,inputCutoffDay:cutoffDay,status:'running',candidates:[],coupons:[],reason:null,apiStart:this.requestCount};job.sessionId=id;this.data.sessions.push(session);
        const wanted=fixtures.filter(f=>['NS','TBD'].includes(f.status)&&Date.parse(f.kickoff)>this.now().getTime()+30*60000&&(!settings.allowedLeagueIds.length||settings.allowedLeagueIds.includes(f.leagueId))&&(settings.women||!(/women|femen|feminin|\bw\b/i.test(f.league+' '+f.home.name+' '+f.away.name)))).sort((a,b)=>Number(this.priority.has(M.normalize(b.league)))-Number(this.priority.has(M.normalize(a.league)))||Date.parse(a.kickoff)-Date.parse(b.kickoff)||a.fixtureId-b.fixtureId).slice(0,settings.maxCandidates);
        job.total=wanted.length;job.processed=0;this.save();
        try{for(const f of wanted){this.guard();job.message=f.home.name+' - '+f.away.name;const odds=await this.odds(f.fixtureId);
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
                row.markets=M.evaluateMarkets(odds,row.expectedGoals,row.profiles,settings,this.now(),f.kickoff);
                const eligible=row.markets.filter(m=>m.eligible).sort((a,b)=>b.modelProbability-a.modelProbability||b.dataScore-a.dataScore||a.betId-b.betId||a.selection.localeCompare(b.selection));row.pick=eligible[0]||null;
                if(!row.pick)row.reasons.push('Sabit veri/oran/model şartlarını geçen market yok; seçim zorlanmadı');
                row.risks.push('Ham model kalibre edilmedi; yüzde gerçek başarı garantisi değildir','Geçmiş yalnız bu ligdeki maçları kapsar; diğer kupalar/ligler form ve dinlenme hesabına dahil değildir');
                if(row.coverage?.injuries!==true)row.risks.push('Sakatlık veri kapsamı yok/bilinmiyor; eksik oyuncu yok anlamına gelmez');
                row.risks.push('Maç önü kadro/sakatlık kontrolü henüz yapılmadı');
                if(settings.predictionContext&&row.coverage?.predictions===true){const r=await this.call('/predictions',{fixture:f.fixtureId});const p=r.response?.[0]?.predictions;row.apiPrediction={advice:p?.advice||null,percent:p?.percent||null,contextOnly:true,capturedAt:this.now().toISOString()};}
            }
            session.candidates.push(row);job.processed++;this.save();this.saveCache();
        }
        session.coupons=M.optimize(session.candidates,settings,id);session.status='complete';if(!session.coupons.length)session.reason='İstenen güven/veri/oran şartlarında 1–2 ayaklı kupon bulunamadı. Ayak ekleyerek oran zorlanmadı.';session.completedAt=this.now().toISOString();
        session.predictionsSha256=crypto.createHash('sha256').update(JSON.stringify(session.coupons.map(c=>c.legs.map(l=>({fixtureId:l.fixtureId,pick:l.pick}))))).digest('hex');
        this.logger(`> 🎫 Banko LAB: ${date} · ${session.candidates.length} analiz · ${session.coupons.length} kupon · Telegram YOK.`);
        }catch(e){session.status='partial';session.reason=e.message;throw e;}finally{session.apiUsed=this.requestCount-session.apiStart;this.save();}
    }
    async checkSession(session,job,{automatic=false,onlyIds=null}={}){
        const ids=[...new Set(session.coupons.flatMap(c=>c.legs.filter(l=>l.result.status==='pending').map(l=>l.fixtureId)))].filter(id=>!onlyIds||onlyIds.includes(id));
        if(!ids.length){job.message='Kontrol edilecek bekleyen seçim yok';return;}job.total=ids.length;
        for(const id of ids){this.guard();const row=session.candidates.find(r=>r.fixtureId===id),response=await this.call('/fixtures',{id,timezone:'Europe/Istanbul'}),fresh=response.response?.[0],now=this.now(),reasons=[],warnings=[];
            if(!fresh||!['NS','TBD'].includes(fresh.fixture?.status?.short)||Date.parse(fresh.fixture?.date)<=now.getTime())reasons.push('Maç başlamış/durumu değişmiş; maç önü onayı yok');
            if(fresh&&fresh.fixture?.date&&Date.parse(fresh.fixture.date)!==Date.parse(row.kickoff))reasons.push('Başlangıç saati değişti; yeni kupon sürümü gerekli');
            let newOdds=null,injuries=null,lineups=null;
            if(!reasons.length){const odds=await this.odds(id),quote=odds.markets.find(m=>m.key===row.pick.key);newOdds=quote?.odd||null;
                const evaluated=quote&&M.evaluateMarkets({...odds,markets:[quote]},row.expectedGoals,row.profiles,session.settings,now,row.kickoff)[0];if(!evaluated?.eligible)reasons.push('İlk seçim güncel oran/veri şartlarını artık geçmiyor');
                if(row.coverage?.injuries===true){const r=await this.call('/injuries',{fixture:id});injuries=(r.response||[]).map(x=>({team:x.team?.name,player:x.player?.name,reason:x.player?.reason,type:x.player?.type}));if(injuries.length)warnings.push(`${injuries.length} sakat/şüpheli oyuncu kaydı; önemini elle inceleyin`);}else warnings.push('Sakatlık kapsamı yok; eksik oyuncu durumu doğrulanamadı');
                if(row.coverage?.fixtures?.lineups===true&&Date.parse(row.kickoff)-now.getTime()<=60*60000){const r=await this.call('/fixtures/lineups',{fixture:id});lineups=(r.response||[]).map(t=>({team:t.team?.name,formation:t.formation,startXI:(t.startXI||[]).map(p=>p.player?.name)}));if(lineups.length!==2||lineups.some(t=>t.startXI.length!==11))warnings.push('İki takımın ilk 11 listesi henüz tam değil');}
                else warnings.push('İlk 11 henüz doğrulanmadı; maçtan 30–45 dakika önce manuel kontrol edin');
            }
            const check={checkedAt:now.toISOString(),automatic,status:reasons.length?'rejected':warnings.length?'warning':'passed',originalOdd:row.pick.odd,currentOdd:newOdds,reasons,warnings,injuries,lineups};
            for(const coupon of session.coupons)for(const leg of coupon.legs)if(leg.fixtureId===id){leg.check=JSON.parse(JSON.stringify(check));if(automatic)leg.autoCheckedAt=now.toISOString();coupon.check.history.push({fixtureId:id,...check});}
            job.processed=(job.processed||0)+1;this.refreshCouponStates(session);this.save();
        }
    }
    refreshCouponStates(session){for(const coupon of session.coupons){const states=coupon.legs.map(l=>l.check?.status||'waiting');coupon.check.status=states.includes('rejected')?'rejected':states.includes('waiting')?'waiting':states.includes('warning')?'warning':'passed';coupon.check.currentOdd=coupon.legs.every(l=>l.check?.currentOdd)?coupon.legs.reduce((p,l)=>p*l.check.currentOdd,1):null;
        if(coupon.check.currentOdd!==null&&(coupon.check.currentOdd<session.settings.minCouponOdd||coupon.check.currentOdd>session.settings.maxCouponOdd)&&coupon.legs.length===2&&coupon.check.status==='passed')coupon.check.status='warning';
        if(coupon.legs.every(l=>['won','lost'].includes(l.result.status))){const won=coupon.legs.every(l=>l.result.status==='won');coupon.result={status:won?'won':'lost',profitUnits:won?coupon.originalOdd-1:-1,settledAt:this.now().toISOString()};}}
    }
    async results(session,job){const ids=[...new Set(session.coupons.flatMap(c=>c.legs.filter(l=>l.result.status==='pending'&&Date.parse(l.kickoff)<this.now().getTime()).map(l=>l.fixtureId)))];job.total=ids.length;
        for(let i=0;i<ids.length;i+=10){const batch=ids.slice(i,i+10),r=await this.call('/fixtures',{ids:batch.join('-'),timezone:'Europe/Istanbul'});for(const coupon of session.coupons)for(const leg of coupon.legs){if(!batch.includes(leg.fixtureId)||leg.result.status!=='pending')continue;const f=r.response?.find(f=>f.fixture?.id===leg.fixtureId);if(f)leg.result=M.settle(leg.pick,f);}
            job.processed+=batch.length;this.refreshCouponStates(session);this.save();}
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
        return {success:true,version:VERSION,date,day:dayKey(this.now()),busy:this.busy,storageError:this.storageError,settings:JSON.parse(JSON.stringify(this.data.settings)),api:{used:this.usage[dayKey(this.now())]||0,limit:this.data.settings.dailyLimit,reserve:this.reserve,remaining:M.finite(this.getQuotaRemaining())},job:this.data.latestJob,
            availableDates:[...new Set(this.data.sessions.map(s=>s.date))].sort().reverse(),sessions:sessions.map(s=>({id:s.id,createdAt:s.createdAt,status:s.status,couponCount:s.coupons.length})),session:session?JSON.parse(JSON.stringify(session)):null,discovery:this.data.discoveries[date]||null,
            summary:{candidates:session?.candidates.length||0,coupons:coupons.length,won:coupons.filter(c=>c.result.status==='won').length,lost:coupons.filter(c=>c.result.status==='lost').length,pending:coupons.filter(c=>c.result.status==='pending').length,profitUnits:coupons.filter(c=>c.result.status!=='pending').reduce((sum,c)=>sum+(c.result.profitUnits||0),0)},
            disclaimer:'Banko bir mod adıdır, garanti değildir. Ham model yüzdeleri kalibrasyonsuz LAB tahminidir. Tarama ve sonuçlar manuel; yalnız seçilen maçların kontrolü isteğe bağlı otomatiktir. Telegram gönderimi yok.'};
    }
}
module.exports={BankoCoupon,VERSION,DEFAULTS,dayKey,dayAdd,validDay,schemaSettings};
