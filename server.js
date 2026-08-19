require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const apiFootballKey = process.env.API_FOOTBALL_KEY;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const kanalID = process.env.TELEGRAM_CHANNEL_ID;

const VIP_LIGLER = ["Süper Lig", "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "UEFA Champions League", "UEFA Europa League", "Major League Soccer"];

const SYSTEM_INSTRUCTION = `Sen uzman bir spor veri bilimcisi ve acimasiz bir 'Value Bet' analistisin. 
Sana iletilen mac istatistiklerini ve gercek Bet365 canli oranlarini analiz et.

KESIN KURALLAR:
1. HER DURUMDA ANALIZ YAP: Mac ne kadar kisir veya oran ne kadar dusuk olursa olsun PAS gecmek veya analizi reddetmek YASAKTIR.
2. ISTATISTIK SARTI: 'gerekce' icinde karari destekleyen sahadaki RAKAMSAL verileri belirtmek zorundasin.
3. BAREM SARTI: Asya handikap KULLANMAK YASAKTIR. Net iddaa baremleri kullan.
4. DINO BASKI ENDEKSI: Hucum baskisini gosteren ozel bir yuzdelik skor uret.

Cikti Formati: {"tahmin": "1.5 UST", "guven_puani": 75, "oran": 1.45, "baski_endeksi": "%88", "gerekce": "..."}`;

// SISTEM DEGISKENLERI
let isRunning = false;
let isScanning = false; // Spam tiklamayi onlemek icin kilit
let globalMinOran = 1.40;
let globalMinGuven = 70;

// ZAMANLAYICI DEGISKENLERI (COKLU LISTE)
let scheduleEnabled = false;
let schedules = []; 
let nextRunTime = 0;
let masterInterval = null;

function getCurrentTimeTR() {
    return new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
}

async function canliMaclariHazirla() {
    try {
        const response = await axios.get('https://v3.football.api-sports.io/fixtures?live=all', { headers: { 'x-apisports-key': apiFootballKey } });
        const maclar = response.data.response;
        if (!maclar || maclar.length === 0) return [];

        let uygunMaclar = maclar.filter(m => m.fixture.status.elapsed >= 25 && m.fixture.status.elapsed <= 80);
        uygunMaclar.sort((a, b) => (VIP_LIGLER.includes(b.league.name) ? 1 : 0) - (VIP_LIGLER.includes(a.league.name) ? 1 : 0));

        let macVerileri = [];
        const onEleme = uygunMaclar.slice(0, 4);

        for (const mac of onEleme) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const oddsResponse = await axios.get(`https://v3.football.api-sports.io/odds/live?fixture=${mac.fixture.id}`, { headers: { 'x-apisports-key': apiFootballKey } });
            let canliOranlar = oddsResponse.data.response?.[0]?.odds;
            if (!canliOranlar) continue; 

            await new Promise(resolve => setTimeout(resolve, 2000));
            const statsResponse = await axios.get(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${mac.fixture.id}`, { headers: { 'x-apisports-key': apiFootballKey } });
            
            macVerileri.push({
                mac: `${mac.teams.home.name} - ${mac.teams.away.name}`,
                lig: mac.league.name,
                dakika: mac.fixture.status.elapsed,
                skor: `${mac.goals.home}-${mac.goals.away}`,
                istatistikler: statsResponse.data.response,
                canli_oranlar: canliOranlar
            });
        }
        return macVerileri;
    } catch (error) {
        return [];
    }
}

async function telegramaGonder(mac, analiz) {
    const mesaj = `🔥 *DİNO İDDAA CANLI FIRSAT* 🔥\n------------------------------------------------\n⚽️ *Maç:* ${mac.mac}\n🏆 *Lig:* ${mac.lig}\n⏱ *Dakika:* ${mac.dakika} | *Skor:* ${mac.skor}\n\n🎯 *Tahmin:* ${analiz.tahmin}\n📈 *Değer (Oran):* ${analiz.oran}\n⚡️ *Güven Puanı:* %${analiz.guven_puani}\n📊 *Dino Baskı Endeksi:* ${analiz.baski_endeksi}\n\n🦖 *Yapay Zeka Analizi:*\n_${analiz.gerekce}_\n------------------------------------------------`;
    try {
        await bot.sendMessage(kanalID, mesaj, { parse_mode: "Markdown" });
    } catch (error) {}
}

async function botuCalistir() {
    if (isScanning) {
        console.log(`[${getCurrentTimeTR()}] Tarama zaten devam ediyor, bu istek atlandi.`);
        return;
    }
    isScanning = true;
    try {
        console.log(`[${getCurrentTimeTR()}] Tarama basladi...`);
        const macListesi = await canliMaclariHazirla();
        if (macListesi.length === 0) {
            isScanning = false;
            return;
        }

        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" }); 
        let onaylanan = 0, istek = 0;

        for (const mac of macListesi) {
            if (onaylanan >= 3 || istek >= 5) break;
            istek++;
            try {
                const prompt = SYSTEM_INSTRUCTION + "\n\nAnaliz Edilecek Mac Verisi:\n" + JSON.stringify(mac);
                const result = await model.generateContent(prompt);
                let aiYaniti = result.response.text().trim().replace(/```json/g, "").replace(/```/g, "");
                const analiz = JSON.parse(aiYaniti);

                if (parseFloat(analiz.oran) >= globalMinOran && analiz.guven_puani >= globalMinGuven) {
                    await telegramaGonder(mac, analiz);
                    onaylanan++;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (err) { }
        }
    } finally {
        isScanning = false;
        console.log(`[${getCurrentTimeTR()}] Tarama bitti.`);
    }
}

// ANA KONTROL SAATI (Coklu Liste Destekli)
function masterClock() {
    if (!isRunning) return;

    const nowTime = getCurrentTimeTR();
    let activeSchedule = null;

    if (scheduleEnabled && schedules.length > 0) {
        for (let s of schedules) {
            let inWindow = false;
            if (s.start <= s.end) {
                inWindow = (nowTime >= s.start && nowTime <= s.end);
            } else { // Gece yarisini gecen saatler
                inWindow = (nowTime >= s.start || nowTime <= s.end);
            }

            if (inWindow) {
                activeSchedule = s;
            } else {
                s.hasRanSingle = false; 
            }
        }
    } else if (!scheduleEnabled) {
        activeSchedule = { mode: 'loop' };
    }

    if (activeSchedule) {
        if (scheduleEnabled && activeSchedule.mode === 'single') {
            if (!activeSchedule.hasRanSingle) {
                botuCalistir();
                activeSchedule.hasRanSingle = true; 
            }
        } else {
            const nowMs = Date.now();
            if (nowMs >= nextRunTime) {
                botuCalistir();
                nextRunTime = nowMs + (15 * 60 * 1000); 
            }
        }
    }
}


// --- API ENDPOINT'LERI ---

app.post('/api/start', (req, res) => {
    if (!isRunning) {
        isRunning = true;
        nextRunTime = 0; 
        masterInterval = setInterval(masterClock, 60000); 
        masterClock(); 
        res.json({ success: true, message: "Sistem Ana Şalteri AÇILDI." });
    } else {
        res.json({ success: false, message: "Sistem zaten çalışıyor." });
    }
});

app.post('/api/stop', (req, res) => {
    isRunning = false;
    if (masterInterval) clearInterval(masterInterval);
    res.json({ success: true, message: "Sistem Ana Şalteri KAPATILDI." });
});

app.post('/api/force-scan', (req, res) => {
    if (!isRunning) {
        return res.json({ success: false, message: "HATA: Önce Sistem Şalterini AÇMALISIN!" });
    }
    if (isScanning) {
        return res.json({ success: false, message: "Şu an zaten bir tarama yapılıyor. Lütfen bekle." });
    }
    
    // Asenkron olarak tetikle, cevap bekleme
    botuCalistir().catch(console.error);
    res.json({ success: true, message: "⚡ Manuel Hızlı Tarama tetiklendi! Arka planda maçlar aranıyor..." });
});

app.post('/api/settings', (req, res) => {
    globalMinOran = parseFloat(req.body.oran) || globalMinOran;
    globalMinGuven = parseInt(req.body.guven) || globalMinGuven;
    res.json({ success: true, message: `Filtreler güncellendi: Min Oran ${globalMinOran}` });
});

app.post('/api/schedule', (req, res) => {
    scheduleEnabled = !!req.body.enabled;
    const incomingSchedules = req.body.schedules || [];
    
    schedules = incomingSchedules.map(inc => {
        const existing = schedules.find(s => s.id === inc.id);
        return {
            ...inc,
            hasRanSingle: existing ? existing.hasRanSingle : false
        };
    });
    
    res.json({ success: true, message: `Zamanlayıcı Programı Kaydedildi. (${schedules.length} Görev)` });
});

app.get('/api/status', (req, res) => {
    res.json({ 
        isRunning, 
        globalMinOran, 
        globalMinGuven,
        scheduleEnabled,
        schedules
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dino Backend V4 ${PORT} portunda calisiyor.`));
