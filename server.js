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
const { spawn } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// =========================================================
// EXPRESS
// =========================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================
// ENV
// =========================================================
const apiFootballKey = process.env.API_FOOTBALL_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const kanalID = process.env.TELEGRAM_CHANNEL_ID;
const geminiKey = process.env.GEMINI_API_KEY;
const pythonBinary = process.env.PYTHON_BIN || 'python';

// =========================================================
// API CLIENT
// =========================================================
const ipv4Agent = new https.Agent({ family: 4 });
const apiClient = axios.create({
    baseURL: 'https://v3.football.api-sports.io',
    headers: { 'x-apisports-key': apiFootballKey },
    httpsAgent: ipv4Agent,
    timeout: 15000
});

// =========================================================
// TELEGRAM & GEMINI
// =========================================================
const bot = telegramToken ? new TelegramBot(telegramToken, { polling: false }) : null;
const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
const GEMINI_MODEL = 'gemini-3.5-flash-lite';

// =========================================================
// AYARLAR
// =========================================================
const VIP_LIGLER = [
    "Süper Lig", "Premier League", "La Liga", "Serie A", "Bundesliga", 
    "Ligue 1", "UEFA Champions League", "UEFA Europa League", "Major League Soccer"
];

const DATA_FILE = path.join(__dirname, 'dino_data.json');

let state = {
    isRunning: false,
    globalMinEdge: 3,
    scheduleEnabled: false,
    schedules: []
};

let isScanning = false;
let nextRunTime = 0;
let masterInterval = null;
let systemLogs = [];
let apiQueue = Promise.resolve();
let lastApiRequestTime = 0;
let quotaRemaining = null;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function apiGet(url, config = {}) {
    let result;
    apiQueue = apiQueue.then(async () => {
        const now = Date.now();
        const elapsed = now - lastApiRequestTime;
        const minimumDelay = 250; // 4 request / sec
        
        if (elapsed < minimumDelay) await sleep(minimumDelay - elapsed);
        
        lastApiRequestTime = Date.now();
        try {
            result = await apiClient.get(url, config);
            const remaining = result.headers['x-ratelimit-requests-remaining'];
            if (remaining !== undefined) quotaRemaining = Number(remaining);
        } catch (error) {
            if (error.response && error.response.status === 429) {
                addSystemLog("> ⚠️ API 429! 15 saniye bekleniyor...");
                await sleep(15000);
                lastApiRequestTime = Date.now();
                result = await apiClient.get(url, config);
            } else { throw error; }
        }
    });
    await apiQueue;
    return result;
}

function addSystemLog(msg) {
    const time = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul' });
    const logMsg = `[${time}] ${msg}`;
    console.log(logMsg);
    systemLogs.push(logMsg);
    if (systemLogs.length > 80) systemLogs.shift();
}
app.get('/api/logs', (req, res) => { res.json(systemLogs); });

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const savedState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            state = { ...state, ...savedState };
            addSystemLog("> 💾 Kalıcı hafıza yüklendi.");
        } else { saveData(); }
    } catch (err) { addSystemLog("> ⚠️ Hafıza yüklenemedi."); }
}

function saveData() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); } 
    catch (err) { addSystemLog("> ⚠️ Hafıza kaydedilemedi."); }
}
function getCurrentTimeTR() {
    return new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
}

// =========================================================
// MARKET İSİMLERİNİ STANDARDİZE ET (Python ile BİREBİR)
// =========================================================
function normalizeMarketName(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    
    if (/^home$/i.test(text) || text === "1") return 'MS1';
    if (/^draw$/i.test(text) || text === "X") return 'X';
    if (/^away$/i.test(text) || text === "2") return 'MS2';
    
    let match = text.match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
    if (match) {
        const tip = match[1].toLowerCase();
        const barem = match[2];
        return `${barem}_${tip === 'over' ? 'UST' : 'ALT'}`;
    }
    return null;
}

// =========================================================
// LIVE ODDS PARSE (101 ve 29 gibi çöp oranları filtrele)
// =========================================================
function parseLiveOdds(response) {
    const oddsMap = new Map();
    const fixtures = response.data && Array.isArray(response.data.response) ? response.data.response : [];
    
    for (const fixtureOdds of fixtures) {
        const fixtureID = Number(fixtureOdds.fixture?.id);
        if (!fixtureID) continue;
        if (!oddsMap.has(fixtureID)) oddsMap.set(fixtureID, {});
        
        const marketMap = oddsMap.get(fixtureID);
        const bookmakers = Array.isArray(fixtureOdds.bookmakers) ? fixtureOdds.bookmakers : [];
        if (Array.isArray(fixtureOdds.odds)) bookmakers.push({ name: 'API', bets: fixtureOdds.odds });

        for (const bookmaker of bookmakers) {
            const bookmakerName = bookmaker.name || `Bookmaker ${bookmaker.id || ''}`;
            const bets = Array.isArray(bookmaker.bets) ? bookmaker.bets : (Array.isArray(bookmaker.odds) ? bookmaker.odds : []);

            for (const bet of bets) {
                if (bet.stopped === true || bet.blocked === true) continue;
                
                // SADECE ID 1 (MS) VE ID 5 (ALT/UST) İÇİN ÇALIŞ
                if (bet.id !== 1 && bet.id !== 5) continue;

                const values = Array.isArray(bet.values) ? bet.values : [];
                for (const value of values) {
                    if (value.stopped === true) continue;
                    
                    const market = normalizeMarketName(value.value);
                    if (!market) continue;
                    
                    // Oran temizleme: Virgül vb varsa düzelt, stringi floata çevir
                    let rawOdd = String(value.odd).replace(',', '.');
                    const odd = parseFloat(rawOdd);

                    // KRİTİK FİLTRE: Maç sonu ve Alt/Üst oranları 1.01'den küçük, 25'ten büyük OLAMAZ.
                    // Eğer 29, 101, 41 geliyorsa bu API'nin o markette hata yaptığını gösterir, çöpe at.
                    if (!Number.isFinite(odd) || odd <= 1.01 || odd > 25.0) continue;

                    if (!marketMap[market] || odd > marketMap[market].oran) {
                        marketMap[market] = { oran: odd, bookmaker: bookmakerName };
                    }
                }
            }
        }
    }
    return oddsMap;
}

// =========================================================
// FIXTURE STATISTICS
// =========================================================
function getStat(teamStats, statName) {
    if (!Array.isArray(teamStats)) return 0;
    const item = teamStats.find(x => x.type === statName);
    if (!item || item.value === null || item.value === undefined) return 0;
    const parsed = parseFloat(String(item.value).replace('%', ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function enrichFixturesWithStats(fixtures) {
    return fixtures.map(fixture => {
        const statistics = Array.isArray(fixture.statistics) ? fixture.statistics : [];
        if (statistics.length < 2) return null;
        
        const homeID = fixture.teams.home.id;
        const awayID = fixture.teams.away.id;
        
        const homeStatsObj = statistics.find(x => x.team?.id === homeID);
        const awayStatsObj = statistics.find(x => x.team?.id === awayID);
        if (!homeStatsObj || !awayStatsObj) return null;
        
        return {
            fixture_id: fixture.fixture.id,
            mac_isim: `${fixture.teams.home.name} - ${fixture.teams.away.name}`,
            lig: fixture.league.name,
            dakika: fixture.fixture.status.elapsed,
            skor: `${fixture.goals.home ?? 0}-${fixture.goals.away ?? 0}`,
            home_shot: getStat(homeStatsObj.statistics, 'Total Shots'),
            away_shot: getStat(awayStatsObj.statistics, 'Total Shots'),
            home_sot: getStat(homeStatsObj.statistics, 'Shots on Goal'),
            away_sot: getStat(awayStatsObj.statistics, 'Shots on Goal'),
            home_corner: getStat(homeStatsObj.statistics, 'Corner Kicks'),
            away_corner: getStat(awayStatsObj.statistics, 'Corner Kicks')
        };
    }).filter(Boolean);
}

// =========================================================
// CANLI MAÇ HAZIRLA
// =========================================================
async function canliMaclariHazirla() {
    if (!apiFootballKey || !apiFootballKey.trim()) { addSystemLog("> ❌ API_FOOTBALL_KEY bulunamadı."); return []; }
    
    try {
        const liveResponse = await apiGet('/fixtures?live=all');
        const allLiveFixtures = liveResponse.data?.response || [];
        
        let uygunMaclar = allLiveFixtures.filter(match => {
            const dakika = Number(match.fixture?.status?.elapsed);
            return (dakika >= 25 && dakika <= 80);
        });
        
        // VIP ligleri öne al ama diğerlerini silme (senin isteğine göre, istersen sadece VIP yapabilirsin)
        uygunMaclar.sort((a, b) => {
            const vipA = VIP_LIGLER.includes(a.league.name) ? 1 : 0;
            const vipB = VIP_LIGLER.includes(b.league.name) ? 1 : 0;
            return vipB - vipA;
        });

        if (uygunMaclar.length === 0) return [];
        
        addSystemLog("> 💰 Tüm canlı oranlar tek API isteğiyle çekiliyor...");
        const oddsResponse = await apiGet('/odds/live');
        const oddsMap = parseLiveOdds(oddsResponse);
        
        const oddsCandidates = uygunMaclar.filter(match => oddsMap.has(Number(match.fixture.id)));
        if (oddsCandidates.length === 0) return [];

        const fixtureMap = new Map();
        for (let i = 0; i < oddsCandidates.length; i += 20) {
            const chunk = oddsCandidates.slice(i, i + 20);
            const ids = chunk.map(m => m.fixture.id).join('-');
            const statsResponse = await apiGet(`/fixtures?ids=${ids}`);
            const returned = statsResponse.data?.response || [];
            for (const fixture of returned) {
                fixtureMap.set(Number(fixture.fixture.id), fixture);
            }
        }

        const macVerileri = [];
        for (const match of oddsCandidates) {
            const fixtureID = Number(match.fixture.id);
            const fixture = fixtureMap.get(fixtureID);
            if (!fixture) continue;
            
            const enriched = enrichFixturesWithStats([fixture])[0];
            if (!enriched) continue;
            
            const liveOdds = oddsMap.get(fixtureID);
            if (!liveOdds || Object.keys(liveOdds).length === 0) continue;
            
            enriched.canli_oranlar = liveOdds;
            macVerileri.push(enriched);
        }
        return macVerileri;
    } catch (error) {
        addSystemLog(`> ❌ API HATASI: ${error.message}`);
        return [];
    }
}

// =========================================================
// PYTHON
// =========================================================
function yapayZekaAnaliziYap(maclar) {
    return new Promise((resolve) => {
        if (!Array.isArray(maclar) || maclar.length === 0) { resolve([]); return; }
        const python = spawn(pythonBinary, [path.join(__dirname, 'tahmin_yap.py')], { cwd: __dirname, windowsHide: true });
        
        let stdout = ''; let stderr = '';
        python.stdout.on('data', data => { stdout += data.toString(); });
        python.stderr.on('data', data => { stderr += data.toString(); });
        python.on('error', error => { resolve([]); });
        
        python.on('close', code => {
            if (code !== 0) { resolve([]); return; }
            try {
                const sonuc = JSON.parse(stdout);
                if (sonuc.hata) { resolve([]); return; }
                resolve(sonuc);
            } catch (error) { resolve([]); }
        });
        
        python.stdin.write(JSON.stringify(maclar));
        python.stdin.end();
    });
}

function valueAnaliziYap(mac, dino) {
    let enIyiFirsat = null;
    let enYuksekEdge = Number(state.globalMinEdge);

    for (const [market, oddsData] of Object.entries(mac.canli_oranlar)) {
        const piyasaOrani = typeof oddsData === 'object' ? Number(oddsData.oran) : Number(oddsData);
        if (!Number.isFinite(piyasaOrani) || piyasaOrani <= 1) continue;
        
        // Node'daki MS1 ile Python'daki MS1 artık tamamen aynı
        const pyMarket = market.toUpperCase();
        const dinoYuzde = Number(dino[pyMarket]);
        if (!Number.isFinite(dinoYuzde)) continue;

        const piyasaYuzde = (1 / piyasaOrani) * 100;
        const edge = dinoYuzde - piyasaYuzde;

        if (edge >= enYuksekEdge) {
            enYuksekEdge = edge;
            enIyiFirsat = {
                market: pyMarket,
                edge: edge.toFixed(1),
                dino_yuzde: dinoYuzde.toFixed(1),
                oran: piyasaOrani,
                piyasa_yuzde: piyasaYuzde.toFixed(1),
                bookmaker: typeof oddsData === 'object' ? oddsData.bookmaker : 'API'
            };
        }
    }
    return enIyiFirsat;
}

// =========================================================
// GEMINI & TELEGRAM
// =========================================================
async function geminiYorumuYaz(mac, firsat) {
    if (!genAI) return "İstatistiksel model pozitif value tespit etti.";
    try {
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const prompt = `Futbol veri analistisin. Python modelimiz Value buldu.
Maç: ${mac.mac_isim}, Dakika: ${mac.dakika}, Skor: ${mac.skor}
Ev Sahibi: ${mac.home_shot} Şut, ${mac.home_sot} İsabet, ${mac.home_corner} Korner
Deplasman: ${mac.away_shot} Şut, ${mac.away_sot} İsabet, ${mac.away_corner} Korner
Seçilen Bahis: ${firsat.market}, Avantaj: +${firsat.edge}%
Bu value'nun istatistiksel nedenini şut/korner verilerini kullanarak 2 cümlede profesyonelce açıkla. Başlık/Tahmin yazma.`;
        
        const result = await model.generateContent(prompt);
        return result.response.text().trim().replace(/```/g, '');
    } catch (error) { return "İstatistiksel model pozitif value tespit etti."; }
}

async function telegramSinyaliGonder(mac, firsat, yorum) {
    if (!bot || !kanalID) return false;
    const mesaj = `🔥 *DİNO VALUE ALARM* 🔥\n--------------------------------------\n⚽️ *Maç:* ${mac.mac_isim}\n🏆 *Lig:* ${mac.lig}\n⏱ *Dakika:* ${mac.dakika} | *Skor:* ${mac.skor}\n\n🎯 *Value Market:* ${firsat.market}\n📈 *EDGE:* +${firsat.edge}%\n💵 *Canlı Oran:* ${firsat.oran}\n🏦 *Kaynak:* ${firsat.bookmaker}\n🦖 *Dino İhtimali:* %${firsat.dino_yuzde}\n📊 *Piyasa İhtimali:* %${firsat.piyasa_yuzde}\n\n📌 *Canlı İstatistikler*\n🏠 ${mac.home_shot} Şut | ${mac.home_sot} İsabet | ${mac.home_corner} Korner\n✈️ ${mac.away_shot} Şut | ${mac.away_sot} İsabet | ${mac.away_corner} Korner\n\n📝 *Dino Analiz:*\n_${yorum}_\n--------------------------------------`;
    try { await bot.sendMessage(kanalID, mesaj, { parse_mode: 'Markdown' }); return true; } 
    catch (error) { return false; }
}

// =========================================================
// ANA DÖNGÜ
// =========================================================
async function botuCalistir() {
    if (isScanning) return;
    isScanning = true;
    try {
        const macListesi = await canliMaclariHazirla();
        if (macListesi.length === 0) return;
        
        const dinoSonuclari = await yapayZekaAnaliziYap(macListesi);
        if (!Array.isArray(dinoSonuclari)) return;

        for (let i = 0; i < macListesi.length; i++) {
            const mac = macListesi[i];
            const dino = dinoSonuclari[i];
            if (!dino || Object.keys(dino).length === 0) continue;
            
            // Eğer istatistikler sıfırsa (0 Şut 0 Korner), bu maçı GÜVENLİK için tamamen pas geç!
            if (mac.home_shot === 0 && mac.away_shot === 0 && mac.home_corner === 0 && mac.away_corner === 0) continue;

            const firsat = valueAnaliziYap(mac, dino);
            if (!firsat) continue;

            const yorum = await geminiYorumuYaz(mac, firsat);
            await telegramSinyaliGonder(mac, firsat, yorum);
        }
    } catch (error) {} 
    finally { isScanning = false; }
}

function masterClock() {
    if (!state.isRunning) return;
    const nowMs = Date.now();
    let beklemeSuresi = 15 * 60 * 1000;
    if (nowMs >= nextRunTime) { botuCalistir(); nextRunTime = nowMs + beklemeSuresi; }
}

app.post('/api/start', (req, res) => {
    if (state.isRunning) return res.json({ success: false });
    state.isRunning = true; saveData(); nextRunTime = 0; 
    masterInterval = setInterval(masterClock, 60000); masterClock(); 
    res.json({ success: true });
});
app.post('/api/stop', (req, res) => {
    state.isRunning = false; saveData(); 
    if (masterInterval) clearInterval(masterInterval);
    res.json({ success: true });
});
app.post('/api/force-scan', (req, res) => {
    if (!state.isRunning || isScanning) return res.json({ success: false });
    botuCalistir().catch(console.error); res.json({ success: true });
});
app.get('/api/settings', (req, res) => { res.json(state); });
app.post('/api/settings', (req, res) => {
    if (req.body.oran !== undefined) state.globalMinEdge = parseFloat(req.body.oran);
    saveData(); res.json({ success: true, state: state });
});
app.get('/api/status', (req, res) => {
    res.json({ isRunning: state.isRunning, isScanning: isScanning, minEdge: state.globalMinEdge, nextRunTime: nextRunTime, quotaRemaining: quotaRemaining });
});

loadData();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    addSystemLog(`> 🚀 DINO PRO (Filtreli & Stabil) Başlatıldı! Port: ${PORT}`);
    if (state.isRunning) { masterInterval = setInterval(masterClock, 60000); masterClock(); }
});
