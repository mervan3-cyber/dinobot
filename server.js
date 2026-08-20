require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

const DATA_FILE = path.join(__dirname, 'dino_data.json');

let state = {
    isRunning: false,
    globalMinOran: 1.40,
    globalMinGuven: 70,
    scheduleEnabled: false,
    schedules: [] 
};

let isScanning = false;
let nextRunTime = 0;
let masterInterval = null;

// --- CANLI RADAR (LOG) SISTEMI ---
let systemLogs = [];

function addSystemLog(msg) {
    const time = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul' });
    const logMsg = `[${time}] ${msg}`;
    console.log(logMsg); // Siyah ekrana yazdır (pm2 logs için)
    
    // Panele gidecek olan diziye ekle (en fazla 40 satır tut)
    systemLogs.push(logMsg);
    if (systemLogs.length > 40) {
        systemLogs.shift();
    }
}

// Yeni API Endpoint: Panel buraya istek atıp logları alacak
app.get('/api/logs', (req, res) => {
    res.json(systemLogs);
});


function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const rawData = fs.readFileSync(DATA_FILE);
            const savedState = JSON.parse(rawData);
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
    if (isScanning) return;
    isScanning = true;
    try {
        addSystemLog(`> 🔍 Otomatik tarama başlatıldı...`);
        const macListesi = await canliMaclariHazirla();
        
        if (macListesi.length === 0) {
            addSystemLog("> ℹ️ Kriterlere uygun (VIP Lig, 25-80. dk) aktif maç bulunamadı.");
            isScanning = false;
            return;
        }

        addSystemLog(`> 📊 Toplam ${macListesi.length} uygun maç bulundu. Analiz ediliyor...`);
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

                if (parseFloat(analiz.oran) >= state.globalMinOran && analiz.guven_puani >= state.globalMinGuven) {
                    await telegramaGonder(mac, analiz);
                    addSystemLog(`> ✅ ${mac.mac} için sinyal gönderildi (Oran: ${analiz.oran}, Güven: ${analiz.guven_puani})`);
                    onaylanan++;
                } else {
                    addSystemLog(`> ❌ ${mac.mac} pas geçildi (Oran: ${analiz.oran}, Güven: ${analiz.guven_puani})`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (err) { }
        }
        addSystemLog(`> 🏁 Tarama bitti. ${onaylanan} maç Telegram'a iletildi.`);
    } finally {
        isScanning = false;
    }
}

function masterClock() {
    if (!state.isRunning) return;
    const nowTime = getCurrentTimeTR();
    let activeSchedule = null;

    if (state.scheduleEnabled && state.schedules.length > 0) {
        for (let s of state.schedules) {
            let inWindow = false;
            if (s.start <= s.end) {
                inWindow = (nowTime >= s.start && nowTime <= s.end);
            } else { 
                inWindow = (nowTime >= s.start || nowTime <= s.end);
            }
            if (inWindow) {
                activeSchedule = s;
            } else {
                if (s.hasRanSingle) {
                   s.hasRanSingle = false; 
                   saveData(); 
                }
            }
        }
    } else if (!state.scheduleEnabled) {
        activeSchedule = { mode: 'loop' };
    }

    if (activeSchedule) {
        if (state.scheduleEnabled && activeSchedule.mode === 'single') {
            if (!activeSchedule.hasRanSingle) {
                botuCalistir();
                activeSchedule.hasRanSingle = true; 
                saveData(); 
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

app.post('/api/start', (req, res) => {
    if (!state.isRunning) {
        state.isRunning = true;
        saveData(); 
        nextRunTime = 0; 
        addSystemLog("> ⚡ Sistem Ana Şalteri AÇILDI.");
        masterInterval = setInterval(masterClock, 60000); 
        masterClock(); 
        res.json({ success: true, message: "Sistem açıldı." });
    } else {
        res.json({ success: false, message: "Sistem zaten çalışıyor." });
    }
});

app.post('/api/stop', (req, res) => {
    state.isRunning = false;
    saveData(); 
    addSystemLog("> 🛑 Sistem Ana Şalteri KAPATILDI.");
    if (masterInterval) clearInterval(masterInterval);
    res.json({ success: true, message: "Sistem durduruldu." });
});

app.post('/api/force-scan', (req, res) => {
    if (!state.isRunning) {
        return res.json({ success: false, message: "HATA" });
    }
    if (isScanning) {
        return res.json({ success: false, message: "Tarama yapiliyor" });
    }
    addSystemLog("> 🚀 Manuel Hızlı Tarama tetiklendi!");
    botuCalistir().catch(console.error);
    res.json({ success: true, message: "Basladi" });
});

app.post('/api/settings', (req, res) => {
    state.globalMinOran = parseFloat(req.body.oran) || state.globalMinOran;
    state.globalMinGuven = parseInt(req.body.guven) || state.globalMinGuven;
    saveData(); 
    addSystemLog(`> ⚙️ Filtreler güncellendi: Min Oran ${state.globalMinOran}, Min Güven ${state.globalMinGuven}`);
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
    addSystemLog(`> ⏰ Zamanlayıcı Programı kaydedildi (${state.schedules.length} görev). Aktif: ${state.scheduleEnabled}`);
    res.json({ success: true, message: "Kaydedildi" });
});

app.get('/api/status', (req, res) => {
    res.json(state);
});

loadData();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    addSystemLog(`> 🌐 Dino Backend V7 Başlatıldı. Port: ${PORT}`);
    if (state.isRunning) {
        masterInterval = setInterval(masterClock, 60000);
        masterClock();
    }
});
