'use strict';
function registerBankoRoutes(app,{banko,apiReady=()=>true}={}){
    app.get('/api/banko-coupon',(req,res)=>{try{const status=banko.status(req.query.date||undefined,req.query.session||null);if(req.query.summary==='1')status.session=status.session?{id:status.session.id,status:status.session.status}:null;return res.json(status);}catch(e){return res.status(400).json({success:false,error:e.message});}});
    app.post('/api/banko-coupon/settings',(req,res)=>{try{return res.json({...banko.settings(req.body||{}),message:'Banko ayarları kaydedildi; mevcut kupon sürümleri değiştirilmedi.'});}catch(e){return res.status(banko.busy?409:400).json({success:false,error:e.message});}});
    // Local panel writes only. Existing panel auth protects these routes; no provider key/API call is needed.
    for(const [route,method] of [['price-preview','previewSelection'],['selection','addSelection'],['selection-price','updateSelectionPrice']])app.post('/api/banko-coupon/'+route,(req,res)=>{
        try{const value=banko[method](req.body||{});return res.json({success:true,...(method==='previewSelection'?{priceCheck:value}:method==='addSelection'?value:{selection:value})});}
        catch(e){return res.status(banko.busy?409:400).json({success:false,error:e.message});}
    });
    for(const kind of ['scan','discover','check','results'])app.post('/api/banko-coupon/'+kind,(req,res)=>{
        if(!apiReady())return res.status(503).json({success:false,error:'API_FOOTBALL_KEY bulunamadı.'});
        try{const status=banko.start(kind,req.body?.date,req.body?.sessionId||null);return res.status(202).json({success:true,message:kind==='results'?'Manuel sonuç kontrolü başladı.':'Banko işlemi başladı.',...status});}
        catch(e){return res.status(409).json({success:false,error:e.message});}
    });
}
module.exports={registerBankoRoutes};
