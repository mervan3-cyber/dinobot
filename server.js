require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ipv4Agent = new https.Agent({ family: 4 });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API ve KEY AYARLARI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const apiFootballKey = process.env.API_FOOTBALL_KEY;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const kanalID = process.env.TELEGRAM_CHANNEL_ID; 

const VIP_LIGLER = ["Süper Lig", "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "UEFA Champions League", "UEFA Europa League", "Major League Soccer"];

const DATA_FILE = path.join(__dirname, 'dino_data.json');

let state = {
    isRunning: false,
    globalMinEdge: 5,  // Senin tavsiyene göre 5'e çektik
    scheduleEnabled: false,
    schedules: [] 
};

let isScanning = false;
let nextRunTime = 0;
let masterInterval = null;
let systemLogs = [];

function addSystemLog(msg) {
    const time = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul' });
    const logMsg = `[${time}] ${msg}`;
    console.log(logMsg); 
    systemLogs.push(logMsg);
    if (systemLogs.length > 40) systemLogs.shift();
}

app.get('/api/logs', (req, res) => res.json(systemLogs));

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const savedState = JSON.parse(fs.readFileSync(DATA_FILE));
            state = { ...state, ...savedState };
            addSystemLog("> Kalıcı Hafıza başarıyla yüklendi.");
        } else {
            saveData();
        }
    } catch (err) {}
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch (err) {}
}

function getCurrentTimeTR() {
    return new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
}

// -----------------------------------------------------------------------------------
// 1. API-FOOTBALL VERI CEKME
// -----------------------------------------------------------------------------------
async function canliMaclariHazirla() {
    try {
        if(!apiFootballKey || apiFootballKey.trim() === '') {
            addSystemLog("> ⚠️ HATA: .env dosyasındaki API_FOOTBALL_KEY boş!");
            return [];
        }

        const response = await axios.get('https://v3.football.api-sports.io/fixtures?live=all', { 
            headers: { 'x-apisports-key': apiFootballKey },
            httpsAgent: ipv4Agent, timeout: 10000 
        });
        
        const maclar = response.data.response;
        if (!maclar || maclar.length === 0) return [];

        let uygunMaclar = maclar.filter(m => 
            m.fixture.status.elapsed >= 25 && 
            m.fixture.status.elapsed <= 80 &&
            VIP_LIGLER.includes(m.league.name)
        );

        let macVerileri = [];
        const onEleme = uygunMaclar; // Slice kaldırıldı, tüm VIP'ler taranıyor

        for (const mac of onEleme) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const macIsim = `${mac.teams.home.name} - ${mac.teams.away.name}`;
            
            try {
                const oddsResponse = await axios.get(`https://v3.football.api-sports.io/odds/live?fixture=${mac.fixture.id}`, { 
                    headers: { 'x-apisports-key': apiFootballKey },
                    httpsAgent: ipv4Agent, timeout: 8000
                });
                
                let canliOranlar = oddsResponse.data.response?.[0]?.odds;
                let oranObjesi = {};

                if (canliOranlar && canliOranlar.length > 0) {
                    addSystemLog(`> 🔍 RAW ORAN (${macIsim}): Market Sayısı: ${canliOranlar.length}`);

                    canliOranlar.forEach(market => {
                        if (market.values && market.values.length > 0) {
                            market.values.forEach(v => {
                                // Sadece ihtiyacımız olan MS ve UST marketlerini
                                // Python'un ÇIKARDIĞI isim formatıyla BİREBİR aynı olacak şekilde ekliyoruz.
                                if (market.id == 1 && (v.value === 'Home' || v.value === '1')) oranObjesi['MS1'] = parseFloat(v.odd);
                                if (market.id == 1 && (v.value === 'Draw' || v.value === 'X')) oranObjesi['X'] = parseFloat(v.odd);
                                if (market.id == 1 && (v.value === 'Away' || v.value === '2')) oranObjesi['MS2'] = parseFloat(v.odd);
                                
                                if (market.id == 5 && v.value.includes('Over')) {
                                    // Örnek: v.value = "Over 2.5"
                                    let baremSayi = v.value.split(' ')[1]; // "2.5"
                                    if(baremSayi) {
                                        // "2.5_UST" yapalım ki tahmin_yap.py deki 2.5_UST ile BİREBİR uyuşsun
                                        let baremAnahtar = baremSayi + '_UST'; 
                                        oranObjesi[baremAnahtar] = parseFloat(v.odd);
                                    }
                                }
                            });
                        }
                    });
                } else {
                     addSystemLog(`> ⚠️ ${macIsim} oranları (bahis şirketlerince) KAPALI.`);
                }

                await new Promise(resolve => setTimeout(resolve, 300));
                const statsResponse = await axios.get(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${mac.fixture.id}`, { 
                    headers: { 'x-apisports-key': apiFootballKey },
                    httpsAgent: ipv4Agent, timeout: 8000
                });
                
                let stats = statsResponse.data.response;
                if(!stats || stats.length < 2) continue;
                
                let home_stats = stats[0].statistics;
                let away_stats = stats[1].statistics;
                
                const getStat = (teamStats, statName) => {
                    let s = teamStats.find(x => x.type === statName);
                    return s && s.value ? parseInt(s.value) : 0;
                };

                macVerileri.push({
                    mac_isim: macIsim,
                    lig: mac.league.name,
                    dakika: mac.fixture.status.elapsed,
                    skor: `${mac.goals.home}-${mac.goals.away}`,
                    home_shot: getStat(home_stats, 'Total Shots'),
                    away_shot: getStat(away_stats, 'Total Shots'),
                    home_sot: getStat(home_stats, 'Shots on Goal'),
                    away_sot: getStat(away_stats, 'Shots on Goal'),
                    home_corner: getStat(home_stats, 'Corner Kicks'),
                    away_corner: getStat(away_stats, 'Corner Kicks'),
                    canli_oranlar: oranObjesi
                });
            } catch (innerErr) { continue; }
        }
        return macVerileri;
    } catch (error) {
        addSystemLog(`> ⚠️ API HATASI: ${error.message}`);
        return [];
    }
}

// -----------------------------------------------------------------------------------
// 2. PYTHON (MATEMATİK / VALUE ENGINE) KISMI
// -----------------------------------------------------------------------------------
function yapayZekaAnaliziYap(mac) {
    return new Promise((resolve, reject) => {
        const p = mac;
        const pythonKomutu = `python3 tahmin_yap.py ${p.dakika} ${p.home_shot} ${p.away_shot} ${p.home_sot} ${p.away_sot} ${p.home_corner} ${p.away_corner}`;

        exec(pythonKomutu, (hata, stdout, stderr) => {
            if (hata) {
                addSystemLog(`> ⚠️ PYTHON HATASI (${p.mac_isim}): ${hata.message}`);
                resolve(null); return;
            }
            try {
                const dinoOlasiliklari = JSON.parse(stdout);
                if (dinoOlasiliklari.hata) { resolve(null); return; }
                
                addSystemLog(`> 🩺 RÖNTGEN (${p.mac_isim}) -> Oranlar: ${JSON.stringify(p.canli_oranlar)}`);

                let enIyiFirsat = null;
                let enYuksekEdge = 0; 

                // HİÇBİR İSİM DEĞİŞİKLİĞİ YAPMADAN DİREKT EŞLEŞTİRME
                for (const [market, piyasaOrani] of Object.entries(p.canli_oranlar)) {
                    // Python'dan da MS1 veya 2.5_UST diye geliyor, bizde de öyle kayıtlı.
                    const pyMarket = market.toUpperCase(); 
                    const dinoYuzde = dinoOlasiliklari[pyMarket];

                    // Eşleşme yoksa atla
                    if (dinoYuzde === undefined || isNaN(piyasaOrani) || piyasaOrani <= 1) {
                        continue;
                    }

                    const piyasaYuzde = (1 / piyasaOrani) * 100;
                    const edge = dinoYuzde - piyasaYuzde;

                    // SENİN İSTEDİĞİN O EFSANE DEBUG LOGU:
                    addSystemLog(`> [VALUE TEST] ${p.mac_isim} | ${pyMarket} | Dino: ${dinoYuzde} | Oran: ${piyasaOrani} | Piyasa: ${piyasaYuzde.toFixed(1)} | EDGE: ${edge.toFixed(1)}`);

                    if (edge > enYuksekEdge && edge >= state.globalMinEdge) {
                        enYuksekEdge = edge;
                        enIyiFirsat = {
                            market: pyMarket,
                            edge: edge.toFixed(1),
                            dino_yuzde: dinoYuzde,
                            oran: piyasaOrani,
                            piyasa_yuzde: piyasaYuzde.toFixed(1)
                        };
                    }
                }
                resolve(enIyiFirsat);
            } catch (err) { resolve(null); }
        });
    });
}

// -----------------------------------------------------------------------------------
// 3. GEMINI (ANALİST / YORUMCU) KISMI VE ANA DÖNGÜ
// -----------------------------------------------------------------------------------
const GEMINI_INSTRUCTION = `Sen uzman bir spor veri analisti ve iddaa yorumcususun. 
Arka planda çalışan Python Yapay Zeka modelimiz bir maçta 'Value (Değer)' buldu ve bahis kararı verdi.
Görevin, bu maçın canlı istatistiklerine bakarak kullanıcılara bu bahsin NEDEN mantıklı olduğunu açıklayan, 3-4 cümlelik kısa, ikna edici ve profesyonel bir analiz metni yazmaktır.
Sadece analizi yaz, başlık veya tahmin kısımlarını yazma. İstatistikleri (şut, korner, baskı) kesinlikle kullanarak yorumla.`;

async function botuCalistir() {
    if (isScanning) return;
    isScanning = true;
    try {
        addSystemLog(`> 🔍 Otomatik tarama başlatıldı...`);
        const macListesi = await canliMaclariHazirla();
        
        if (macListesi.length === 0) {
            addSystemLog("> ℹ️ Kriterlere uygun aktif maç bulunamadı.");
            isScanning = false; return;
        }

        addSystemLog(`> 📊 Toplam ${macListesi.length} VIP maç bulundu. Python Motoru ateşlendi...`);
        let onaylanan = 0;
        
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" }); 

        for (const mac of macListesi) {
            const firsat = await yapayZekaAnaliziYap(mac);
            
            if (firsat) {
                addSystemLog(`> 🧠 Edge Bulundu (${mac.mac_isim}). Gemini yorumu yazıyor...`);
                let aiYorumu = "Yapay zeka sistemimiz istatistiksel bir avantaj yakaladı. Baskının sonuca dönüşmesi bekleniyor."; 
                
                try {
                    const prompt = `${GEMINI_INSTRUCTION}\n\nMaç: ${mac.mac_isim}\nDakika: ${mac.dakika}\nSkor: ${mac.skor}\nİstatistikler: ${mac.home_shot} Şut (${mac.home_sot} İsabet), ${mac.home_corner} Korner vs ${mac.away_shot} Şut (${mac.away_sot} İsabet), ${mac.away_corner} Korner.\nSeçilen Bahis: ${firsat.market}\nAvantaj (Edge): +${firsat.edge}%\n\nSadece analiz metnini yaz:`;
                    const result = await model.generateContent(prompt);
                    aiYorumu = result.response.text().trim().replace(/```/g, "");
                } catch (geminiErr) {
                    addSystemLog(`> ⚠️ GEMINI HATASI: ${geminiErr.message}`);
                }

                const mesaj = `🔥 *DİNO VALUE ALARM* 🔥\n--------------------------------------\n⚽️ *Maç:* ${mac.mac_isim}\n🏆 *Lig:* ${mac.lig}\n⏱ *Dakika:* ${mac.dakika} | *Skor:* ${mac.skor}\n\n🎯 *Value Market:* ${firsat.market}\n📈 *EDGE (Avantaj):* +${firsat.edge}%\n💵 *Canlı Oran:* ${firsat.oran}\n🦖 *Dino İhtimali:* %${firsat.dino_yuzde}\n\n📝 *Dino Analiz:*\n_${aiYorumu}_\n--------------------------------------`;
                
                try {
                    await bot.sendMessage(kanalID, mesaj, { parse_mode: "Markdown" });
                    addSystemLog(`> ✅ SİNYAL GÖNDERİLDİ: ${mac.mac_isim} | Edge: +${firsat.edge}`);
                    onaylanan++;
                } catch (e) { addSystemLog(`> ⚠️ TELEGRAM HATASI: ${e.message}`); }
            } else {
                addSystemLog(`> ❌ ${mac.mac_isim} pas geçildi (Yeterli Value Bulunamadı)`);
            }
        }
        addSystemLog(`> 🏁 Tarama bitti. ${onaylanan} efsane maç yakalandı.`);
    } finally {
        isScanning = false;
    }
}

// --------- ZAMANLAYICI VE API ENDPOINTLERI ---------
function masterClock() {
    if (!state.isRunning) return;
    const nowTime = getCurrentTimeTR();
    let activeSchedule = null;

    if (state.scheduleEnabled && state.schedules.length > 0) {
        for (let s of state.schedules) {
            let inWindow = (s.start <= s.end) ? (nowTime >= s.start && nowTime <= s.end) : (nowTime >= s.start || nowTime <= s.end);
            if (inWindow) activeSchedule = s;
            else if (s.hasRanSingle) { s.hasRanSingle = false; saveData(); }
        }
    } else if (!state.scheduleEnabled) {
        activeSchedule = { mode: 'loop' };
    }

    if (activeSchedule) {
        if (state.scheduleEnabled && activeSchedule.mode === 'single') {
            if (!activeSchedule.hasRanSingle) { botuCalistir(); activeSchedule.hasRanSingle = true; saveData(); }
        } else {
            const nowMs = Date.now();
            let beklemeSuresi = 15 * 60 * 1000;
            if (activeSchedule.mode === '5 Dakikada Bir Tara') beklemeSuresi = 5 * 60 * 1000;
            if (nowMs >= nextRunTime) { botuCalistir(); nextRunTime = nowMs + beklemeSuresi; }
        }
    }
}

app.post('/api/start', (req, res) => {
    if (!state.isRunning) {
        state.isRunning = true; saveData(); nextRunTime = 0; 
        addSystemLog("> ⚡ Sistem Ana Şalteri AÇILDI.");
        masterInterval = setInterval(masterClock, 60000); masterClock(); 
        res.json({ success: true, message: "Sistem açıldı." });
    } else { res.json({ success: false, message: "Sistem zaten çalışıyor." }); }
});

app.post('/api/stop', (req, res) => {
    state.isRunning = false; saveData(); 
    addSystemLog("> 🛑 Sistem Ana Şalteri KAPATILDI.");
    if (masterInterval) clearInterval(masterInterval);
    res.json({ success: true, message: "Sistem durduruldu." });
});

app.post('/api/force-scan', (req, res) => {
    if (!state.isRunning) return res.json({ success: false, message: "HATA" });
    if (isScanning) return res.json({ success: false, message: "Tarama yapiliyor" });
    addSystemLog("> 🚀 Manuel Hızlı Tarama tetiklendi!");
    botuCalistir().catch(console.error);
    res.json({ success: true, message: "Basladi" });
});

app.post('/api/settings', (req, res) => {
    state.globalMinEdge = parseFloat(req.body.oran) || state.globalMinEdge;
    saveData(); 
    addSystemLog(`> ⚙️ EDGE Filtresi güncellendi: Min EDGE %${state.globalMinEdge}`);
    res.json({ success: true, message: "Kaydedildi" });
});

app.post('/api/schedule', (req, res) => {
    state.scheduleEnabled = !!req.body.enabled;
    const incomingSchedules = req.body.schedules || [];
    state.schedules = incomingSchedules.map(inc => {
        const existing = state.schedules.find(s => s.id === inc.id);
        return { ...inc, hasRanSingle: existing ? existing.hasRanSingle : false };
    });
    saveData(); 
    addSystemLog(`> ⏰ Zamanlayıcı Programı kaydedildi (${state.schedules.length} görev).`);
    res.json({ success: true, message: "Kaydedildi" });
});

app.get('/api/status', (req, res) => res.json(state));

loadData();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    addSystemLog(`> 🌐 DINO VALUE ENGINE V12 (LABORATUVAR) Başlatıldı! Port: ${PORT}`);
    if (state.isRunning) { masterInterval = setInterval(masterClock, 60000); masterClock(); }
});
