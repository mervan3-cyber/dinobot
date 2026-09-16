'use strict';
const crypto=require('crypto'),https=require('https');
const {formatSignal}=require('./mac_yakala_telegram');
const ENDPOINT='https://api.x.com/2/tweets';
const encode=value=>encodeURIComponent(String(value)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
function oauthHeader({method='POST',url=ENDPOINT,credentials,nonce=crypto.randomBytes(24).toString('hex'),timestamp=Math.floor(Date.now()/1000),form={}}) {
    const parsed=new URL(url);
    const oauth={oauth_consumer_key:credentials.apiKey,oauth_nonce:nonce,oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(timestamp),oauth_token:credentials.accessToken,oauth_version:'1.0'};
    // JSON bodies are not OAuth form parameters. Only OAuth + query params are signed for /2/tweets.
    const parameters=[...Object.entries(oauth),...parsed.searchParams.entries(),...Object.entries(form)].map(([k,v])=>[encode(k),encode(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0);
    const base=[method.toUpperCase(),parsed.origin+parsed.pathname,parameters.map(([k,v])=>k+'='+v).join('&')].map(encode).join('&');
    oauth.oauth_signature=crypto.createHmac('sha1',encode(credentials.apiSecret)+'&'+encode(credentials.accessSecret)).update(base).digest('base64');
    return 'OAuth '+Object.keys(oauth).sort().map(k=>`${encode(k)}="${encode(oauth[k])}"`).join(', ');
}
function formatXSignal(record) {
    // Strip only our markup, then decode escaped content. No silent truncation or reply thread.
    return formatSignal(record).replace(/<\/?b>/g,'').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').normalize('NFC');
}
function transport({headers,body,timeoutMs=12000}) {
    return new Promise((resolve,reject)=>{
        let settled=false,timer;
        const finish=(fn,value)=>{if(!settled){settled=true;clearTimeout(timer);fn(value);}};
        const req=https.request(ENDPOINT,{method:'POST',headers},res=>{
            const chunks=[];let size=0;
            res.on('data',chunk=>{size+=chunk.length;if(size>131072){req.destroy();finish(reject,Error('oversized'));}else chunks.push(chunk);});
            res.on('error',()=>finish(reject,Error('connection')));
            res.on('end',()=>finish(resolve,{statusCode:res.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
        });
        req.on('error',()=>finish(reject,Error('connection')));
        timer=setTimeout(()=>{req.destroy();finish(reject,Error('timeout'));},timeoutMs);
        req.end(body);
    });
}
function createXPublisher({credentials,request=transport}) {
    return async record=>{
        const body=JSON.stringify({text:formatXSignal(record)});
        let response;
        try {response=await request({headers:{Authorization:oauthHeader({credentials}),'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body});}
        catch(_){throw Error('X gönderim sonucu belirsiz.');}
        if(response.statusCode<200||response.statusCode>=300){
            const e=Error('X isteği reddedildi.');e.statusCode=response.statusCode;
            e.safeReason=({400:'X metni kabul etmedi; uzunluk ve gönderi izinlerini kontrol edin.',401:'X kullanıcı anahtarları geçersiz.',403:'X yazma yetkisi/hesap erişimi reddedildi.',429:'X hız veya kullanım limiti.'})[response.statusCode]||'X API hatası.';
            throw e;
        }
        let data;try{data=JSON.parse(response.body)?.data;}catch(_){throw Error('X yanıtı belirsiz.');}
        if(!/^\d+$/.test(String(data?.id||'')))throw Error('X gönderi kimliği alınamadı.');
        return {id:String(data.id)};
    };
}
module.exports={createXPublisher,formatXSignal,oauthHeader};
