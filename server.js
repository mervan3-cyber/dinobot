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

// SISTEM DEGISKENLERI (Panelden degisecek)
let botInterval = null;
let isRunning = false;
let globalMinOran = 1.40;
let globalMinGuven = 70;

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
        console.error("API Hatasi:", error.message);
        return [];
    }
}

async function telegramaGonder(mac, analiz) {
    const mesaj = `🔥 *DİNO İDDAA CANLI FIRSAT* 🔥\n------------------------------------------------\n⚽️ *Maç:* ${mac.mac}\n🏆 *Lig:* ${mac.lig}\n⏱ *Dakika:* ${mac.dakika} | *Skor:* ${mac.skor}\n\n🎯 *Tahmin:* ${analiz.tahmin}\n📈 *Değer (Oran):* ${analiz.oran}\n⚡️ *Güven Puanı:* %${analiz.guven_puani}\n📊 *Dino Baskı Endeksi:* ${analiz.baski_endeksi}\n\n🦖 *Yapay Zeka Analizi:*\n_${analiz.gerekce}_\n------------------------------------------------`;
    try {
        await bot.sendMessage(kanalID, mesaj, { parse_mode: "Markdown" });
    } catch (error) {
        console.error("Telegram hatasi:", error.message);
    }
}

async function botuCalistir() {
    if(!isRunning) return;
    console.log("Tarama basladi...");
    const macListesi = await canliMaclariHazirla();
    if (macListesi.length === 0) return;

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
}

// API ENDPOINT'LERI (Netlify'dan gelen komutlari dinler)
app.post('/api/start', (req, res) => {
    if (!isRunning) {
        isRunning = true;
        botuCalistir(); // Ilk taramayi hemen yap
        botInterval = setInterval(botuCalistir, 15 * 60 * 1000); // Sonra 15 dakikada bir (900.000 ms)
        res.json({ success: true, message: "Bot başlatıldı." });
    } else {
        res.json({ success: false, message: "Bot zaten çalışıyor." });
    }
});

app.post('/api/stop', (req, res) => {
    isRunning = false;
    if (botInterval) clearInterval(botInterval);
    res.json({ success: true, message: "Bot durduruldu." });
});

app.post('/api/settings', (req, res) => {
    globalMinOran = parseFloat(req.body.oran) || globalMinOran;
    globalMinGuven = parseInt(req.body.guven) || globalMinGuven;
    res.json({ success: true, message: `Ayarlar: Oran ${globalMinOran}, Guven ${globalMinGuven}` });
});

app.get('/api/status', (req, res) => {
    res.json({ isRunning, globalMinOran, globalMinGuven });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dino Backend ${PORT} portunda calisiyor.`));
