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
const BUILD_VERSION = 'ml-strict-live-stats-ubuntu-v8-2026-08-23';

app.use(cors());
app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, 'public')
    )
);


// =========================================================
// ENV
// =========================================================

const apiFootballKey =
    process.env.API_FOOTBALL_KEY;

const telegramToken =
    process.env.TELEGRAM_BOT_TOKEN;

const kanalID =
    process.env.TELEGRAM_CHANNEL_ID;

const geminiKey =
    process.env.GEMINI_API_KEY;

const pythonBinary =
    process.env.PYTHON_BIN ||
    (
        process.platform === 'win32'
            ? 'python'
            : 'python3'
    );


// =========================================================
// API CLIENT
// =========================================================

const ipv4Agent = new https.Agent({
    family: 4
});


const apiClient = axios.create({

    baseURL:
        'https://v3.football.api-sports.io',

    headers: {
        'x-apisports-key':
            apiFootballKey
    },

    httpsAgent:
        ipv4Agent,

    timeout:
        15000
});


// =========================================================
// TELEGRAM
// =========================================================

const bot =
    telegramToken
        ? new TelegramBot(
            telegramToken,
            {
                polling: false
            }
        )
        : null;


// =========================================================
// GEMINI
// =========================================================

const genAI =
    geminiKey
        ? new GoogleGenerativeAI(
            geminiKey
        )
        : null;


// Gemini 3.5 Flash-Lite güncel ve stabil model.
// Yüksek hacimli otomasyon için uygun.
const GEMINI_MODEL =
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// =========================================================
// AYARLAR
// =========================================================

const VIP_LIGLER = [

    "Süper Lig",

    "Premier League",

    "La Liga",

    "Serie A",

    "Bundesliga",

    "Ligue 1",

    "UEFA Champions League",

    "UEFA Europa League",

    "Major League Soccer"
];

const DATA_FILE =
    path.join(
        __dirname,
        'dino_data.json'
    );


let state = {

    isRunning: false,

    // Başlangıç EDGE
    globalMinEdge: 3,

    scheduleEnabled: false,

    schedules: []

};


let isScanning = false;

let nextRunTime = 0;

let masterInterval = null;

let systemLogs = [];


// =========================================================
// API RATE LIMITER
// =========================================================
//
// PRO:
// 300 request / dakika
// 5 request / saniye
//
// Biz güvenli tarafta kalmak için
// maksimum 4 request / saniye kullanıyoruz.
// =========================================================

let apiQueue =
    Promise.resolve();

let lastApiRequestTime =
    0;

let quotaRemaining =
    null;


function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(resolve, ms)
    );

}


async function apiGet(url, config = {}) {

    let result;

    apiQueue =
        apiQueue.then(async () => {

            const now =
                Date.now();

            const elapsed =
                now -
                lastApiRequestTime;

            const minimumDelay =
                250;

            if (
                elapsed <
                minimumDelay
            ) {

                await sleep(
                    minimumDelay -
                    elapsed
                );

            }

            lastApiRequestTime =
                Date.now();


            try {

                result =
                    await apiClient.get(
                        url,
                        config
                    );


                const remaining =
                    result.headers[
                        'x-ratelimit-requests-remaining'
                    ];

                if (
                    remaining !== undefined
                ) {

                    quotaRemaining =
                        Number(
                            remaining
                        );

                }

            } catch (error) {

                if (
                    error.response &&
                    error.response.status === 429
                ) {

                    addSystemLog(
                        "> ⚠️ API 429! 15 saniye bekleniyor..."
                    );

                    await sleep(
                        15000
                    );

                    lastApiRequestTime =
                        Date.now();

                    result =
                        await apiClient.get(
                            url,
                            config
                        );

                } else {

                    throw error;

                }

            }

        });


    await apiQueue;

    return result;
}


// =========================================================
// LOG
// =========================================================

function addSystemLog(msg) {

    const time =
        new Date()
            .toLocaleTimeString(
                'en-GB',
                {
                    timeZone:
                        'Europe/Istanbul'
                }
            );


    const logMsg =
        `[${time}]${msg}`;


    console.log(
        logMsg
    );


    systemLogs.push(
        logMsg
    );


    if (
        systemLogs.length >
        80
    ) {

        systemLogs.shift();

    }

}


app.get(
    '/api/logs',
    (req, res) => {

        res.json(
            systemLogs
        );

    }
);


// =========================================================
// STATE
// =========================================================

function loadData() {

    try {

        if (
            fs.existsSync(
                DATA_FILE
            )
        ) {

            const savedState =
                JSON.parse(
                    fs.readFileSync(
                        DATA_FILE,
                        'utf8'
                    )
                );


            state = {
                ...state,
                ...savedState
            };


            addSystemLog(
                "> 💾 Kalıcı hafıza yüklendi."
            );

        } else {

            saveData();

        }

    } catch (err) {

        addSystemLog(
            "> ⚠️ Hafıza yüklenemedi."
        );

    }

}


function saveData() {

    try {

        fs.writeFileSync(

            DATA_FILE,

            JSON.stringify(
                state,
                null,
                2
            )

        );

    } catch (err) {

        addSystemLog(
            "> ⚠️ Hafıza kaydedilemedi."
        );

    }

}


function getCurrentTimeTR() {

    return new Date()
        .toLocaleTimeString(
            'en-GB',
            {
                timeZone:
                    'Europe/Istanbul',

                hour:
                    '2-digit',

                minute:
                    '2-digit'
            }
        );

}


// =========================================================
// MARKET İSİMLERİNİ STANDARDİZE ET
// =========================================================

function normalizeText(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, ' ');
}


function isTrueValue(value) {
    return value === true || value === 1 || normalizeText(value) === 'true';
}


function isClosed(value) {
    return value === true || value === 1 || normalizeText(value) === 'true';
}


function selectionIsUnavailable(value) {
    return [
        value?.suspended,
        value?.stopped,
        value?.blocked,
        value?.finished
    ].some(isClosed);
}


const CLOSED_FIXTURE_STATUSES = new Set([
    'ft', 'aet', 'pen', 'p', 'canc', 'abd', 'awd', 'wo',
    'pst', 'susp', 'int',
    'match finished', 'finished', 'after extra time', 'after penalties',
    'cancelled', 'canceled', 'abandoned', 'suspended', 'postponed',
    'interrupted', 'walkover', 'awarded'
]);


function fixtureAcikcaKapaliMi(match) {
    const fixture = match?.fixture || {};
    const status = fixture?.status || {};

    if (
        selectionIsUnavailable(match) ||
        selectionIsUnavailable(fixture) ||
        selectionIsUnavailable(status)
    ) {
        return true;
    }

    const statusValues = [status.short, status.long]
        .map(normalizeText)
        .filter(Boolean);

    return statusValues.some(value => CLOSED_FIXTURE_STATUSES.has(value));
}


function canliFixtureUygunMu(match, minMinute = 25, maxMinute = 80) {
    const dakika = Number(match?.fixture?.status?.elapsed);

    return (
        Number.isFinite(dakika) &&
        dakika >= minMinute &&
        dakika <= maxMinute &&
        !fixtureAcikcaKapaliMi(match)
    );
}


function hazirMacHalaUygunMu(mac) {
    return canliFixtureUygunMu({
        fixture: {
            status: {
                elapsed: mac?.dakika,
                short: mac?.status_short,
                long: mac?.status_long,
                finished: mac?.status_finished,
                stopped: mac?.status_stopped,
                blocked: mac?.status_blocked,
                suspended: mac?.status_suspended
            }
        }
    });
}


function parseTargetMarket(bet, value) {
    const betName = normalizeText(bet?.name);
    const selection = normalizeText(
        value?.value ?? value?.name ?? value?.selection
    );

    const matchWinnerNames = new Set([
        'match winner',
        '1x2',
        'fulltime result',
        'full time result',
        'fulltime 1x2',
        'full time 1x2'
    ]);

    if (matchWinnerNames.has(betName)) {
        if (['home', '1'].includes(selection)) return 'MS1';
        if (['draw', 'x'].includes(selection)) return 'X';
        if (['away', '2'].includes(selection)) return 'MS2';
        return null;
    }

    const totalGoalNames = new Set([
        'over/under line',
        'goals over/under',
        'total goals',
        'match goals',
        'total match goals'
    ]);

    if (!totalGoalNames.has(betName)) return null;

    const selectionMatch = selection.match(
        /^(over|under)(?:\s+(\d+(?:\.\d+)?))?$/
    );

    if (!selectionMatch) return null;

    const lineValue =
        value?.handicap ??
        value?.line ??
        selectionMatch[2];

    const line = Number.parseFloat(String(lineValue ?? ''));
    const allowedLines = [0.5, 1.5, 2.5, 3.5, 4.5];

    if (!Number.isFinite(line) || !allowedLines.includes(line)) {
        return null;
    }

    return `${line}_${selectionMatch[1] === 'over' ? 'UST' : 'ALT'}`;
}


// =========================================================
// LIVE ODDS PARSE
// =========================================================
//
// /odds/live çağrısını TEK SEFER yapıyoruz.
// Tüm maçların oranlarını buradan çıkarıyoruz.
// =========================================================

function parseLiveOdds(response) {

    const oddsMap = new Map();
    const fixtures = Array.isArray(response.data?.response)
        ? response.data.response
        : [];

    for (const fixtureOdds of fixtures) {
        if (fixtureAcikcaKapaliMi(fixtureOdds)) continue;

        const fixtureID = Number(fixtureOdds.fixture?.id);
        if (!fixtureID) continue;

        // /odds/live bookmaker filtresi sunmaz. Bookmaker bilgisi cevapta
        // açıkça yoksa kaynağı Bet365 olarak etiketlemiyoruz.
        const sources = [];

        if (Array.isArray(fixtureOdds.bookmakers)) {
            for (const bookmaker of fixtureOdds.bookmakers) {
                sources.push({
                    name: bookmaker.name || `Bookmaker ${bookmaker.id || ''}`.trim(),
                    bets: Array.isArray(bookmaker.bets)
                        ? bookmaker.bets
                        : (Array.isArray(bookmaker.odds) ? bookmaker.odds : [])
                });
            }
        }

        if (Array.isArray(fixtureOdds.odds)) {
            sources.push({
                name: 'API-Football Live Odds',
                bets: fixtureOdds.odds
            });
        }

        const grouped = new Map();

        for (const source of sources) {
            for (const bet of source.bets) {
                if (selectionIsUnavailable(bet)) continue;

                const values = Array.isArray(bet.values) ? bet.values : [];

                for (const value of values) {
                    if (selectionIsUnavailable(value)) continue;

                    const market = parseTargetMarket(bet, value);
                    if (!market) continue;

                    const odd = Number.parseFloat(String(value.odd ?? value.odds ?? ''));
                    if (!Number.isFinite(odd) || odd <= 1 || odd > 100) continue;

                    const candidate = {
                        market,
                        oran: odd,
                        bookmaker: source.name,
                        main: isTrueValue(value.main)
                    };

                    if (!grouped.has(market)) grouped.set(market, []);
                    grouped.get(market).push(candidate);
                }
            }
        }

        const marketMap = {};

        for (const [market, candidates] of grouped) {
            const mainCandidates = candidates.filter(candidate => candidate.main);
            const usableCandidates = mainCandidates.length > 0
                ? mainCandidates
                : candidates;

            // Sadece aynı, sıkı biçimde tanımlanmış market içindeki oranlar yarışır.
            const selected = usableCandidates.reduce(
                (best, candidate) =>
                    !best || candidate.oran > best.oran ? candidate : best,
                null
            );

            if (selected) {
                marketMap[market] = {
                    oran: selected.oran,
                    bookmaker: selected.bookmaker
                };
            }
        }

        if (Object.keys(marketMap).length > 0) {
            oddsMap.set(fixtureID, marketMap);
        }
    }

    return oddsMap;
}

// =========================================================
// FIXTURE STATISTICS
// =========================================================

const STAT_ALIASES = Object.freeze({
    total_shots: ['total shots', 'total shot', 'shots total'],
    shots_on_goal: ['shots on goal', 'shots on target', 'shot on target'],
    corner_kicks: ['corner kicks', 'corner kick', 'corners'],
    ball_possession: ['ball possession', 'possession'],
    yellow_cards: ['yellow cards', 'yellow card'],
    red_cards: ['red cards', 'red card'],
    fouls: ['fouls', 'fouls committed'],
    offsides: ['offsides', 'offside'],
    goalkeeper_saves: ['goalkeeper saves', 'goal keeper saves', 'saves'],
    expected_goals: ['expected goals', 'expected goal', 'xg']
});


const MODEL_STAT_FIELDS = [
    'home_shot', 'away_shot',
    'home_sot', 'away_sot',
    'home_corner', 'away_corner'
];


const PARSED_STAT_FIELDS = [
    ...MODEL_STAT_FIELDS,
    'home_possession', 'away_possession',
    'home_yellow', 'away_yellow',
    'home_red', 'away_red',
    'home_fouls', 'away_fouls',
    'home_offsides', 'away_offsides',
    'home_saves', 'away_saves',
    'home_xg', 'away_xg',
    'stats_team_count', 'stats_source'
];


function normalizeStatType(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}


function getStat(teamStats, statKey) {
    if (!Array.isArray(teamStats)) return null;

    const aliases = (
        STAT_ALIASES[statKey] || [statKey]
    ).map(normalizeStatType);

    const item = teamStats.find(
        candidate => aliases.includes(normalizeStatType(candidate?.type))
    );

    if (
        !item ||
        item.value === null ||
        item.value === undefined ||
        item.value === ''
    ) {
        return null;
    }

    const parsed = Number.parseFloat(
        String(item.value).replace('%', '').trim()
    );

    return Number.isFinite(parsed) ? parsed : null;
}


function takimStatsObjesiBul(statistics, team, fallbackIndex) {
    if (!Array.isArray(statistics) || statistics.length === 0) return null;

    const teamID = Number(team?.id);
    if (Number.isFinite(teamID) && teamID > 0) {
        const byID = statistics.find(item => Number(item?.team?.id) === teamID);
        if (byID) return byID;
    }

    const teamName = normalizeStatType(team?.name);
    if (teamName) {
        const byName = statistics.find(
            item => normalizeStatType(item?.team?.name) === teamName
        );
        if (byName) return byName;
    }

    // Bazı düşük kapsamlı liglerde team.id eksik gelebiliyor. İki takım da
    // mevcutsa API sırasını yalnızca son emniyet seçeneği olarak kullan.
    return statistics.length === 2
        ? statistics[fallbackIndex] || null
        : null;
}


function temelStatsTam(mac) {
    if (!mac) return false;

    return MODEL_STAT_FIELDS.map(field => mac[field]).every(value => {
        if (value === null || value === undefined || value === '') {
            return false;
        }

        return Number.isFinite(Number(value));
    });
}


// =========================================================
// STATISTICS EKLE
// =========================================================

function enrichFixturesWithStats(fixtures) {
    return fixtures.map(fixture => {
        const statistics = Array.isArray(fixture.statistics)
            ? fixture.statistics
            : [];
        const homeStatsObj = takimStatsObjesiBul(
            statistics,
            fixture.teams?.home,
            0
        );
        const awayStatsObj = takimStatsObjesiBul(
            statistics,
            fixture.teams?.away,
            1
        );
        const homeStats = homeStatsObj?.statistics;
        const awayStats = awayStatsObj?.statistics;

        // Maç bilgisini hiçbir zaman kaybetme. İstatistik yoksa null kalır;
        // yalnızca ML filtresi bu maçı Python'dan ayırır.
        return {
            fixture_id: Number(fixture.fixture?.id),
            mac_isim: `${fixture.teams?.home?.name || 'Ev Sahibi'} - ${fixture.teams?.away?.name || 'Deplasman'}`,
            lig: fixture.league?.name || 'Bilinmeyen Lig',
            dakika: fixture.fixture?.status?.elapsed ?? null,
            status_short: fixture.fixture?.status?.short ?? null,
            status_long: fixture.fixture?.status?.long ?? null,
            status_finished: fixture.fixture?.status?.finished ?? fixture.fixture?.finished ?? null,
            status_stopped: fixture.fixture?.status?.stopped ?? fixture.fixture?.stopped ?? null,
            status_blocked: fixture.fixture?.status?.blocked ?? fixture.fixture?.blocked ?? null,
            status_suspended: fixture.fixture?.status?.suspended ?? fixture.fixture?.suspended ?? null,
            skor: `${fixture.goals?.home ?? 0}-${fixture.goals?.away ?? 0}`,
            home_shot: getStat(homeStats, 'total_shots'),
            away_shot: getStat(awayStats, 'total_shots'),
            home_sot: getStat(homeStats, 'shots_on_goal'),
            away_sot: getStat(awayStats, 'shots_on_goal'),
            home_corner: getStat(homeStats, 'corner_kicks'),
            away_corner: getStat(awayStats, 'corner_kicks'),
            home_possession: getStat(homeStats, 'ball_possession'),
            away_possession: getStat(awayStats, 'ball_possession'),
            home_yellow: getStat(homeStats, 'yellow_cards'),
            away_yellow: getStat(awayStats, 'yellow_cards'),
            home_red: getStat(homeStats, 'red_cards'),
            away_red: getStat(awayStats, 'red_cards'),
            home_fouls: getStat(homeStats, 'fouls'),
            away_fouls: getStat(awayStats, 'fouls'),
            home_offsides: getStat(homeStats, 'offsides'),
            away_offsides: getStat(awayStats, 'offsides'),
            home_saves: getStat(homeStats, 'goalkeeper_saves'),
            away_saves: getStat(awayStats, 'goalkeeper_saves'),
            home_xg: getStat(homeStats, 'expected_goals'),
            away_xg: getStat(awayStats, 'expected_goals'),
            stats_team_count: statistics.length,
            stats_source: statistics.length > 0
                ? 'API-Football Fixture Statistics'
                : null
        };
    });
}

async function direktFixtureStatsGetir(fixture) {
    const fixtureID = Number(fixture?.fixture?.id);
    if (!fixtureID) return null;

    try {
        const response = await apiGet(
            `/fixtures/statistics?fixture=${fixtureID}`
        );
        const statistics = Array.isArray(response.data?.response)
            ? response.data.response
            : [];

        const macIsim = `${fixture.teams?.home?.name || 'Ev Sahibi'} - ${fixture.teams?.away?.name || 'Deplasman'}`;

        if (statistics.length === 0) {
            addSystemLog(
                `> 📭 ${macIsim} [fixture:${fixtureID}]: /fixtures/statistics results=0.`
            );
            return null;
        }

        const fixtureWithStats = {
            ...fixture,
            statistics
        };

        const enriched = enrichFixturesWithStats([fixtureWithStats])[0] || null;
        if (!enriched) return null;

        const bulunan = MODEL_STAT_FIELDS.filter(
            field => enriched[field] !== null && enriched[field] !== undefined
        );
        const eksik = MODEL_STAT_FIELDS.filter(
            field => enriched[field] === null || enriched[field] === undefined
        );
        const gelenTurler = Array.from(new Set(
            statistics.flatMap(item =>
                Array.isArray(item?.statistics)
                    ? item.statistics.map(stat => String(stat?.type || '')).filter(Boolean)
                    : []
            )
        ));

        addSystemLog(
            `> 📡 ${macIsim} [fixture:${fixtureID}]: API takım=${statistics.length}, model alanı=${bulunan.length}/6${eksik.length ? `, eksik=${eksik.join(',')}` : ', TAM'}.`
        );

        if (bulunan.length === 0 && gelenTurler.length > 0) {
            addSystemLog(
                `> 🧾 Fixture ${fixtureID}: API stat türleri: ${gelenTurler.slice(0, 24).join(' | ')}`
            );
        }

        return enriched;

    } catch (error) {
        addSystemLog(
            `> ⚠️ Fixture ${fixtureID} statistics hatası: ${error.message}`
        );
        return null;
    }
}


// =========================================================
// API FOOTBALL'DAN TÜM CANLI MAÇLARI HAZIRLA
// =========================================================

async function canliMaclariHazirla() {

    if (
        !apiFootballKey ||
        !apiFootballKey.trim()
    ) {

        addSystemLog(
            "> ❌ API_FOOTBALL_KEY bulunamadı."
        );

        return [];

    }


    try {

        // -------------------------------------------------
        // 1) TÜM CANLI MAÇLAR
        // -------------------------------------------------

        const liveResponse =
            await apiGet(
                '/fixtures?live=all'
            );


        const allLiveFixtures =
            liveResponse.data?.response ||
            [];


        addSystemLog(
            `> 🌍 API canlı maç sayısı: ${allLiveFixtures.length}`
        );


        // -------------------------------------------------
        // 25-80 DAKİKA
        // -------------------------------------------------

        let uygunMaclar =
            allLiveFixtures.filter(
                match => canliFixtureUygunMu(match)
            );


        // VIP ligleri öne al
        uygunMaclar.sort(
            (a, b) => {

                const vipA =
                    VIP_LIGLER.includes(
                        a.league.name
                    )
                        ? 1
                        : 0;


                const vipB =
                    VIP_LIGLER.includes(
                        b.league.name
                    )
                        ? 1
                        : 0;


                return vipB - vipA;

            }
        );


        addSystemLog(
            `> ⏱️ /fixtures kaynağında 25-80 dakika aralığında ${uygunMaclar.length} maç bulundu.`
        );


        // -------------------------------------------------
        // 2) LIVE ODDS - TEK İSTEK
        // -------------------------------------------------

        addSystemLog(
            "> 💰 Tüm canlı oranlar tek API isteğiyle çekiliyor..."
        );


        const oddsResponse =
            await apiGet(
                '/odds/live'
            );


        const oddsMap =
            parseLiveOdds(
                oddsResponse
            );


        // /fixtures?live=all ile /odds/live kapsamları anlık olarak farklı
        // olabiliyor. Odds cevabındaki canlı fixture'ları da aday havuzuna ekle.
        const oddsLiveFixtures = Array.isArray(oddsResponse.data?.response)
            ? oddsResponse.data.response
            : [];
        const mergedFixtures = new Map();

        for (const match of uygunMaclar) {
            mergedFixtures.set(Number(match.fixture?.id), match);
        }

        for (const match of oddsLiveFixtures) {
            if (canliFixtureUygunMu(match)) {
                const fixtureID = Number(match.fixture?.id);
                if (fixtureID && !mergedFixtures.has(fixtureID)) {
                    mergedFixtures.set(fixtureID, match);
                }
            }
        }

        uygunMaclar = Array.from(mergedFixtures.values());
        uygunMaclar.sort((a, b) => {
            const vipA = VIP_LIGLER.includes(a.league?.name) ? 1 : 0;
            const vipB = VIP_LIGLER.includes(b.league?.name) ? 1 : 0;
            return vipB - vipA;
        });

        addSystemLog(
            `> 🌐 Birleştirilmiş 25-80 dakika aday havuzu: ${uygunMaclar.length} maç.`
        );


        addSystemLog(
            `> 💰 Oran bulunan fixture: ${oddsMap.size}`
        );


        // -------------------------------------------------
        // ORANI OLAN MAÇLARI SEÇ
        // -------------------------------------------------

        const oddsCandidates =
            uygunMaclar.filter(
                match =>
                    oddsMap.has(
                        Number(
                            match.fixture.id
                        )
                    )
            );


        addSystemLog(
            `> 🎯 Oranı bulunan ${oddsCandidates.length} maç Python öncesi aşamaya geçti.`
        );


        if (
            oddsCandidates.length === 0
        ) {

            return [];

        }


        // -------------------------------------------------
        // 3) İSTATİSTİKLERİ 20'Lİ GRUPLARLA AL
        // -------------------------------------------------

        const fixtureMap =
            new Map();


        for (
            let i = 0;
            i <
            oddsCandidates.length;
            i += 20
        ) {

            const chunk =
                oddsCandidates.slice(
                    i,
                    i + 20
                );


            const ids =
                chunk
                    .map(
                        m =>
                            m.fixture.id
                    )
                    .join('-');


            addSystemLog(
                `> 📊 İstatistik grubu ${Math.floor(i / 20) + 1}: ${chunk.length} maç`
            );


            const statsResponse =
                await apiGet(
                    `/fixtures?ids=${ids}`
                );


            const returned =
                statsResponse.data?.response ||
                [];


            for (
                const fixture
                of returned
            ) {

                fixtureMap.set(
                    Number(
                        fixture.fixture.id
                    ),
                    fixture
                );

            }

        }


        // -------------------------------------------------
        // 4) MAC VERİLERİNİ OLUŞTUR
        // -------------------------------------------------

        const macVerileri = [];


        for (
            const match
            of oddsCandidates
        ) {

            const fixtureID =
                Number(
                    match.fixture.id
                );


            let fixture =
                fixtureMap.get(
                    fixtureID
                ) || match;


            if (
                fixture.goals?.home === null ||
                fixture.goals?.home === undefined ||
                fixture.goals?.away === null ||
                fixture.goals?.away === undefined
            ) {
                const detailResponse = await apiGet(
                    `/fixtures?id=${fixtureID}`
                );
                const detailedFixture = Array.isArray(detailResponse.data?.response)
                    ? detailResponse.data.response[0]
                    : null;

                if (!detailedFixture) {
                    addSystemLog(
                        `> ⚠️ Fixture ${fixtureID}: güncel skor detayı alınamadı, modelden çıkarıldı.`
                    );
                    continue;
                }

                fixture = detailedFixture;
            }


            // /fixtures?ids cevabı, ilk canlı listeye göre daha günceldir.
            // Maç bu sırada 80'i geçtiyse veya bittiyse modele kesinlikle girmez.
            if (!canliFixtureUygunMu(fixture)) {
                const dakika = fixture.fixture?.status?.elapsed ?? '?';
                const status = fixture.fixture?.status?.short ?? fixture.fixture?.status?.long ?? '?';
                addSystemLog(
                    `> ⛔ Fixture ${fixtureID}: güncel durum ${dakika}' / ${status}; modelden çıkarıldı.`
                );
                continue;
            }


            if (
                fixture.goals?.home === null ||
                fixture.goals?.home === undefined ||
                fixture.goals?.away === null ||
                fixture.goals?.away === undefined
            ) {
                addSystemLog(
                    `> ⚠️ Fixture ${fixtureID}: güncel skor eksik, modelden çıkarıldı.`
                );
                continue;
            }


            let enriched =
                enrichFixturesWithStats(
                    [fixture]
                )[0];


            if (!temelStatsTam(enriched)) {

                addSystemLog(
                    `> 🔄 ${enriched.mac_isim} [fixture:${fixtureID}]: /fixtures/statistics çağrılıyor.`
                );

                const fallbackStats = await direktFixtureStatsGetir(fixture);

                if (fallbackStats) {
                    for (const field of PARSED_STAT_FIELDS) {
                        if (
                            fallbackStats[field] !== null &&
                            fallbackStats[field] !== undefined
                        ) {
                            enriched[field] = fallbackStats[field];
                        }
                    }
                }

            }


            if (!temelStatsTam(enriched)) {
                addSystemLog(
                    `> ⛔ ${enriched.mac_isim}: altı temel canlı istatistik tamamlanamadı; Python'a gönderilmeyecek.`
                );
            }


            const liveOdds =
                oddsMap.get(
                    fixtureID
                );


            if (
                !liveOdds ||
                Object.keys(
                    liveOdds
                ).length === 0
            ) {

                continue;

            }


            enriched.canli_oranlar =
                liveOdds;

            enriched.model_hazir = temelStatsTam(enriched);


            macVerileri.push(
                enriched
            );


            addSystemLog(
                `> 🔍 RAW ORAN (${enriched.mac_isim}): Market Sayısı: ${Object.keys(liveOdds).length}`
            );

        }


        return macVerileri;

    } catch (error) {

        addSystemLog(
            `> ❌ API HATASI: ${error.response?.status || ''} ${error.message}`
        );


        return [];

    }

}


// =========================================================
// PYTHON TOPLU VALUE ENGINE
// =========================================================
//
// Python artık her maç için ayrı ayrı çalışmıyor.
// 100 maçı tek seferde gönderiyoruz.
// Modeller bir kere yükleniyor.
// =========================================================

function yapayZekaAnaliziYap(
    maclar
) {

    return new Promise(
        (resolve) => {

            if (
                !Array.isArray(
                    maclar
                ) ||
                maclar.length === 0
            ) {

                resolve([]);

                return;

            }


            const python =
                spawn(
                    pythonBinary,
                    [
                        path.join(
                            __dirname,
                            'tahmin_yap.py'
                        )
                    ],
                    {
                        cwd:
                            __dirname,

                        windowsHide:
                            true
                    }
                );


            let stdout =
                '';

            let stderr =
                '';


            python.stdout.on(
                'data',
                data => {

                    stdout +=
                        data.toString();

                }
            );


            python.stderr.on(
                'data',
                data => {

                    stderr +=
                        data.toString();

                }
            );


            python.on(
                'error',
                error => {

                    addSystemLog(
                        `> ❌ PYTHON BAŞLATILAMADI: ${error.message}`
                    );

                    resolve([]);

                }
            );


            python.on(
                'close',
                code => {

                    if (
                        code !== 0
                    ) {

                        addSystemLog(
                            `> ❌ PYTHON HATASI. Kod: ${code}`
                        );


                        if (
                            stderr.trim()
                        ) {

                            addSystemLog(
                                `> PYTHON: ${stderr.trim().slice(0, 300)}`
                            );

                        }


                        resolve([]);

                        return;

                    }


                    try {

                        const sonuc =
                            JSON.parse(
                                stdout
                            );


                        if (
                            sonuc.hata
                        ) {

                            addSystemLog(
                                `> ❌ PYTHON: ${sonuc.hata}`
                            );

                            resolve([]);

                            return;

                        }


                        resolve(
                            sonuc
                        );

                    } catch (error) {

                        addSystemLog(
                            `> ❌ PYTHON JSON PARSE HATASI: ${error.message}`
                        );


                        addSystemLog(
                            `> PYTHON ÇIKTI: ${stdout.slice(0, 500)}`
                        );


                        resolve([]);

                    }

                }
            );


            python.stdin.write(
                JSON.stringify(
                    maclar
                )
            );


            python.stdin.end();

        }
    );

}


// =========================================================
// VALUE ENGINE
// =========================================================

// İstatistik gelmeyen maçlar yalnızca dakika + skor modeliyle değerlendirilir.
// Bu model için doğruluk öncelikli, değiştirilemeyen ek bir güvenlik kapısı vardır.
// Genel EDGE ayarı daha aşağı çekilse bile fallback sinyalleri gevşemez.
const SCORE_ONLY_GUARD = Object.freeze({
    minMinute: 60,
    minResultProbability: 85,
    minTotalProbability: 80,
    minEdge: 10,
    maxOdd: 2.50,
    maxSignalsPerScan: 1
});


const SCORE_ONLY_RESULT_MARKETS = new Set([
    'MS1',
    'X',
    'MS2'
]);


function scoreOnlyGuvenlikNedeni(
    mac,
    dino,
    market,
    dinoYuzde,
    piyasaOrani,
    edge
) {
    if (dino?.MODEL_VARYANTI !== 'score_only') {
        return null;
    }

    const dakika = Number(mac?.dakika);
    if (!Number.isFinite(dakika) || dakika < SCORE_ONLY_GUARD.minMinute) {
        return `dakika ${dakika || '?'} < ${SCORE_ONLY_GUARD.minMinute}`;
    }

    const gerekliOlasilik = SCORE_ONLY_RESULT_MARKETS.has(market)
        ? SCORE_ONLY_GUARD.minResultProbability
        : SCORE_ONLY_GUARD.minTotalProbability;

    if (dinoYuzde < gerekliOlasilik) {
        return `olasılık %${dinoYuzde} < %${gerekliOlasilik}`;
    }

    if (edge < SCORE_ONLY_GUARD.minEdge) {
        return `EDGE %${edge.toFixed(1)} < %${SCORE_ONLY_GUARD.minEdge}`;
    }

    if (piyasaOrani > SCORE_ONLY_GUARD.maxOdd) {
        return `oran ${piyasaOrani} > ${SCORE_ONLY_GUARD.maxOdd}`;
    }

    return null;
}

function valueAnaliziYap(
    mac,
    dino
) {

    let enIyiFirsat =
        null;


    let enYuksekEdge =
        Number(
            state.globalMinEdge
        );


    const markets =
        Object.entries(
            mac.canli_oranlar
        );


    for (
        const [
            market,
            oddsData
        ]
        of markets
    ) {

        const piyasaOrani =
            typeof oddsData === 'object'
                ? Number(
                    oddsData.oran
                )
                : Number(
                    oddsData
                );


        if (
            !Number.isFinite(
                piyasaOrani
            ) ||
            piyasaOrani <= 1
        ) {

            continue;

        }


        const dinoYuzde =
            Number(
                dino[market]
            );


        if (
            !Number.isFinite(
                dinoYuzde
            )
        ) {

            continue;

        }


        const piyasaYuzde =
            (
                1 /
                piyasaOrani
            ) *
            100;


        const edge =
            dinoYuzde -
            piyasaYuzde;


        const scoreOnlyRedNedeni = scoreOnlyGuvenlikNedeni(
            mac,
            dino,
            market,
            dinoYuzde,
            piyasaOrani,
            edge
        );


        addSystemLog(
            `> 🧪 ${mac.mac_isim} | ${market} | Dino:%${dinoYuzde} | Oran:${piyasaOrani} | Piyasa:%${piyasaYuzde.toFixed(1)} | EDGE:${edge.toFixed(1)}`
        );


        if (scoreOnlyRedNedeni) {
            if (edge >= Number(state.globalMinEdge)) {
                addSystemLog(
                    `> 🛡️ ${mac.mac_isim} | ${market}: fallback güvenlik filtresi reddetti (${scoreOnlyRedNedeni}).`
                );
            }
            continue;
        }


        if (
            edge >=
            enYuksekEdge
        ) {

            enYuksekEdge =
                edge;


            enIyiFirsat = {

                market:
                    market,

                edge:
                    edge.toFixed(1),

                dino_yuzde:
                    dinoYuzde,

                oran:
                    piyasaOrani,

                piyasa_yuzde:
                    piyasaYuzde.toFixed(1),

                bookmaker:
                    typeof oddsData === 'object'
                        ? oddsData.bookmaker
                        : 'Bilinmiyor'

            };

        }

    }


    return enIyiFirsat;

}


// =========================================================
// GEMINI ANALİZİ
// =========================================================

function takimCanliStatOzeti(mac, prefix, label) {
    const alanlar = [
        [`${prefix}_shot`, 'toplam şut', ''],
        [`${prefix}_sot`, 'isabetli şut', ''],
        [`${prefix}_corner`, 'korner', ''],
        [`${prefix}_possession`, 'topa sahip olma', '%'],
        [`${prefix}_yellow`, 'sarı kart', ''],
        [`${prefix}_red`, 'kırmızı kart', ''],
        [`${prefix}_fouls`, 'faul', ''],
        [`${prefix}_offsides`, 'ofsayt', ''],
        [`${prefix}_saves`, 'kaleci kurtarışı', ''],
        [`${prefix}_xg`, 'xG', '']
    ];

    const parcalar = alanlar
        .filter(([field]) => mac?.[field] !== null && mac?.[field] !== undefined)
        .map(([field, name, suffix]) => `${name}: ${mac[field]}${suffix}`);

    return parcalar.length > 0
        ? `${label}: ${parcalar.join(', ')}`
        : null;
}


function mevcutCanliStatSatirlari(mac) {
    return [
        takimCanliStatOzeti(mac, 'home', 'Ev sahibi'),
        takimCanliStatOzeti(mac, 'away', 'Deplasman')
    ].filter(Boolean);
}

async function geminiYorumuYaz(
    mac,
    firsat
) {

    if (
        !genAI
    ) {

        return "İstatistiksel model canlı verilerde pozitif value tespit etti.";

    }


    try {

        const model =
            genAI.getGenerativeModel({
                model:
                    GEMINI_MODEL
            });

        const statsLines = mevcutCanliStatSatirlari(mac);
        const statsAvailable = statsLines.length > 0;
        const modelStatsComplete = temelStatsTam(mac);
        const statsDescription = statsAvailable
            ? `${statsLines.join('\n')}\nModel için gerekli altı temel alan: ${modelStatsComplete ? 'eksiksiz' : 'kısmi'}.`
            : 'Şut, isabetli şut ve korner verileri API tarafından sağlanmadı. Bu değerleri tahmin etme veya sıfır kabul etme.';
        const analysisRule = statsAvailable
            ? 'Yalnızca yukarıda açıkça verilen canlı istatistikleri, skor ve dakikayı kullan. Eksik alanları tahmin etme.'
            : 'Yalnızca skor, dakika, seçilmiş market ve model olasılığını kullan; bulunmayan canlı istatistikleri uydurma.';


        const prompt = `
Sen uzman bir canlı futbol veri analistisin.

Python tabanlı istatistiksel modelimiz bu maçta pozitif bahis value'su tespit etti.

Maç:
${mac.mac_isim}

Lig:
${mac.lig}

Dakika:
${mac.dakika}

Skor:
${mac.skor}

Canlı veri:
${statsDescription}

Seçilen market:
${firsat.market}

Canlı oran:
${firsat.oran}

Dino olasılığı:
%${firsat.dino_yuzde}

Piyasa olasılığı:
%${firsat.piyasa_yuzde}

EDGE:
+${firsat.edge}%

Görevin:
Bu value'nun istatistiksel olarak neden oluştuğunu 3 kısa cümlede profesyonel biçimde açıkla.

${analysisRule}

Tahmin dışında yeni bir bahis önermeye çalışma.

Sadece analiz metnini yaz.
`;


        const result =
            await model.generateContent(
                prompt
            );


        return result
            .response
            .text()
            .trim()
            .replace(
                /```/g,
                ''
            );

    } catch (error) {

        addSystemLog(
            `> ⚠️ GEMINI HATASI: ${error.message}`
        );


        return "İstatistiksel model canlı verilerde pozitif value tespit etti.";

    }

}




// =========================================================
// TELEGRAM
// =========================================================

function telegramHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}


function statGoster(value) {
    return value === null || value === undefined
        ? 'Veri yok'
        : value;
}


function telegramStatDegeri(value, suffix = '') {
    return value === null || value === undefined
        ? 'Veri yok'
        : `${telegramHtml(value)}${suffix}`;
}


function telegramEkStatsSatirlari(mac) {
    const satirlar = [];
    const herhangi = fields => fields.some(
        field => mac?.[field] !== null && mac?.[field] !== undefined
    );
    const kartOzeti = (yellow, red) => {
        const parcalar = [];
        if (yellow !== null && yellow !== undefined) {
            parcalar.push(`${telegramHtml(yellow)}S`);
        }
        if (red !== null && red !== undefined) {
            parcalar.push(`${telegramHtml(red)}K`);
        }
        return parcalar.length > 0 ? parcalar.join('/') : 'Veri yok';
    };

    if (herhangi(['home_possession', 'away_possession'])) {
        satirlar.push(
            `⚽️ Topa sahip olma: Ev ${telegramStatDegeri(mac.home_possession, '%')} | Dep ${telegramStatDegeri(mac.away_possession, '%')}`
        );
    }

    if (herhangi(['home_yellow', 'away_yellow', 'home_red', 'away_red'])) {
        satirlar.push(
            `🟨 Kartlar: Ev ${kartOzeti(mac.home_yellow, mac.home_red)} | Dep ${kartOzeti(mac.away_yellow, mac.away_red)}`
        );
    }

    if (herhangi(['home_fouls', 'away_fouls', 'home_offsides', 'away_offsides'])) {
        satirlar.push(
            `🚩 Faul/Ofsayt: Ev ${telegramStatDegeri(mac.home_fouls)}/${telegramStatDegeri(mac.home_offsides)} | Dep ${telegramStatDegeri(mac.away_fouls)}/${telegramStatDegeri(mac.away_offsides)}`
        );
    }

    if (herhangi(['home_xg', 'away_xg', 'home_saves', 'away_saves'])) {
        satirlar.push(
            `🧤 xG/Kurtarış: Ev ${telegramStatDegeri(mac.home_xg)}/${telegramStatDegeri(mac.home_saves)} | Dep ${telegramStatDegeri(mac.away_xg)}/${telegramStatDegeri(mac.away_saves)}`
        );
    }

    return satirlar.join('\n');
}


async function sinyalOncesiCanlilikDogrula(mac) {
    try {
        const response = await apiGet(
            `/fixtures?id=${Number(mac.fixture_id)}`
        );
        const latest = Array.isArray(response.data?.response)
            ? response.data.response[0]
            : null;

        if (!latest || !canliFixtureUygunMu(latest)) {
            const dakika = latest?.fixture?.status?.elapsed ?? '?';
            const status = latest?.fixture?.status?.short ?? latest?.fixture?.status?.long ?? 'veri yok';
            addSystemLog(
                `> ⛔ ${mac.mac_isim}: sinyal öncesi canlılık reddedildi (${dakika}' / ${status}).`
            );
            return false;
        }

        const latestHome = latest.goals?.home;
        const latestAway = latest.goals?.away;

        if (
            latestHome === null || latestHome === undefined ||
            latestAway === null || latestAway === undefined
        ) {
            addSystemLog(
                `> ⛔ ${mac.mac_isim}: sinyal öncesi güncel skor alınamadı.`
            );
            return false;
        }

        const latestScore = `${latestHome}-${latestAway}`;
        if (latestScore !== mac.skor) {
            addSystemLog(
                `> ⛔ ${mac.mac_isim}: skor ${mac.skor} → ${latestScore} değişti; eski model sonucu gönderilmedi.`
            );
            return false;
        }

        mac.dakika = latest.fixture.status.elapsed;
        mac.status_short = latest.fixture.status.short ?? null;
        mac.status_long = latest.fixture.status.long ?? null;

        return true;

    } catch (error) {
        // Güncel durum doğrulanamıyorsa yanlışlıkla bitmiş maç göndermek yerine
        // güvenli tarafta kalıp bu sinyali atlıyoruz.
        addSystemLog(
            `> ⛔ ${mac.mac_isim}: sinyal öncesi canlılık doğrulanamadı (${error.message}).`
        );
        return false;
    }
}

async function telegramSinyaliGonder(
    mac,
    firsat,
    yorum
) {

    if (!hazirMacHalaUygunMu(mac)) {
        addSystemLog(
            `> ⛔ ${mac.mac_isim}: Telegram güvenlik filtresi maçı reddetti (${mac.dakika}' / ${mac.status_short || mac.status_long || '?'}).`
        );
        return false;
    }

    if (
        !bot ||
        !kanalID
    ) {

        addSystemLog(
            "> ⚠️ Telegram ayarları eksik."
        );

        return false;

    }


    const ekCanliStats = telegramEkStatsSatirlari(mac);


    const mesaj =

`🔥 <b>DİNO VALUE ALARM</b> 🔥
--------------------------------------
⚽️ <b>Maç:</b> ${telegramHtml(mac.mac_isim)}
🏆 <b>Lig:</b> ${telegramHtml(mac.lig)}
⏱ <b>Dakika:</b> ${telegramHtml(mac.dakika)} | <b>Skor:</b> ${telegramHtml(mac.skor)}

🎯 <b>Value Market:</b> ${telegramHtml(firsat.market)}
📈 <b>EDGE:</b> +${telegramHtml(firsat.edge)}%
💵 <b>Canlı Oran:</b> ${telegramHtml(firsat.oran)}
🏦 <b>Kaynak:</b> ${telegramHtml(firsat.bookmaker)}
🦖 <b>Dino İhtimali:</b> %${telegramHtml(firsat.dino_yuzde)}
📊 <b>Piyasa İhtimali:</b> %${telegramHtml(firsat.piyasa_yuzde)}
🧠 <b>Model:</b> ${temelStatsTam(mac) ? 'Canlı istatistik modeli' : 'Dakika + skor fallback modeli (sıkı güvenlik)'}

📌 <b>Canlı İstatistikler</b>
🏠 ${telegramHtml(statGoster(mac.home_shot))} Şut | ${telegramHtml(statGoster(mac.home_sot))} İsabet | ${telegramHtml(statGoster(mac.home_corner))} Korner
✈️ ${telegramHtml(statGoster(mac.away_shot))} Şut | ${telegramHtml(statGoster(mac.away_sot))} İsabet | ${telegramHtml(statGoster(mac.away_corner))} Korner${ekCanliStats ? `\n${ekCanliStats}` : ''}

📝 <b>Dino Analiz:</b>
<i>${telegramHtml(yorum)}</i>

--------------------------------------`;


    try {

        await bot.sendMessage(
            kanalID,
            mesaj,
            {
                parse_mode:
                    'HTML'
            }
        );


        return true;

    } catch (error) {

        addSystemLog(
            `> ⚠️ TELEGRAM HATASI: ${error.message}`
        );


        return false;

    }

}



// =========================================================
// ANA TARAMA
// =========================================================

async function botuCalistir() {
    if (isScanning) return;
    isScanning = true;

    try {
        addSystemLog('> 🔍 ML taraması başlatıldı...');

        const hazirlananMaclar = await canliMaclariHazirla();
        const canliMaclar = hazirlananMaclar.filter(hazirMacHalaUygunMu);

        if (canliMaclar.length !== hazirlananMaclar.length) {
            addSystemLog(
                `> ⛔ Model öncesi canlılık filtresi ${hazirlananMaclar.length - canliMaclar.length} maçı çıkardı.`
            );
        }

        // Python modeli yalnızca iki takım için şut, isabetli şut ve korner
        // alanlarının tamamı gerçek API verisi olarak mevcutsa çalışır.
        // score_only modeli dosyada geriye dönük uyumluluk için kalır fakat
        // canlı sinyal hattında hiçbir zaman çağrılmaz.
        const macListesi = canliMaclar.filter(temelStatsTam);
        const statsEksikMacSayisi = canliMaclar.length - macListesi.length;

        addSystemLog(
            `> 📡 İstatistik kapsamı: ${macListesi.length} tam | ${statsEksikMacSayisi} eksik ve engellendi.`
        );

        if (statsEksikMacSayisi > 0) {
            addSystemLog(
                `> 🛡️ ${statsEksikMacSayisi} maç canlı istatistikleri eksik olduğu için Python'a hiç gönderilmedi.`
            );
        }

        if (macListesi.length === 0) {
            addSystemLog('> ℹ️ Oranı ve altı temel canlı istatistiği eksiksiz olan maç bulunamadı. Sinyal üretilmedi.');
            return;
        }

        addSystemLog(
            `> 📊 Python canlı istatistik modeline yalnızca ${macListesi.length} tam istatistikli maç gönderiliyor.`
        );

        const dinoSonuclari = await yapayZekaAnaliziYap(macListesi);
        if (
            !Array.isArray(dinoSonuclari) ||
            dinoSonuclari.length !== macListesi.length
        ) {
            addSystemLog(
                `> ❌ Model sonuç hizası geçersiz: ${macListesi.length} maç / ${Array.isArray(dinoSonuclari) ? dinoSonuclari.length : 0} sonuç. Tarama iptal edildi.`
            );
            return;
        }

        let onaylanan = 0;
        for (let i = 0; i < macListesi.length; i++) {
            const mac = macListesi[i];
            const dino = dinoSonuclari[i];

            if (!dino || dino.HATA || Object.keys(dino).length === 0) {
                addSystemLog(
                    `> ⚠️ ${mac.mac_isim}: model sonucu geçersiz${dino?.HATA ? ` (${dino.HATA})` : ''}.`
                );
                continue;
            }

            addSystemLog(
                `> 🩺 ML (${mac.mac_isim}) | Varyant: ${dino.MODEL_VARYANTI || 'live_only'} | ${JSON.stringify(dino)}`
            );

            const firsat = valueAnaliziYap(mac, dino);
            if (!firsat) {
                addSystemLog(
                    `> ❌ ${mac.mac_isim} pas geçildi (EDGE veya güvenlik filtresini geçemedi).`
                );
                continue;
            }

            if (dino.MODEL_VARYANTI === 'score_only') {
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: Python beklenmedik şekilde score_only döndürdü; sinyal engellendi.`
                );
                continue;
            }

            addSystemLog(
                `> 🚨 ML VALUE: ${mac.mac_isim} | ${firsat.market} | +${firsat.edge}%`
            );

            // Gemini yalnızca ML sonucunu açıklar; market/oran seçmez.
            const yorum = await geminiYorumuYaz(mac, firsat);

            // Telegram'dan hemen önce fixture'ı API'den yeniden doğrula.
            // Skor değiştiyse model sonucu artık eski olduğu için bu tur gönderme.
            if (!await sinyalOncesiCanlilikDogrula(mac)) {
                continue;
            }

            const gonderildi = await telegramSinyaliGonder(mac, firsat, yorum);

            if (gonderildi) {
                onaylanan++;
                addSystemLog(
                    `> ✅ ML SİNYALİ GÖNDERİLDİ: ${mac.mac_isim} | ${firsat.market}`
                );
            }
        }

        addSystemLog(`> 🏁 ML taraması bitti. ${onaylanan} maç gönderildi.`);
        if (quotaRemaining !== null) {
            addSystemLog(`> 📦 API kalan günlük istek: ${quotaRemaining}`);
        }

    } catch (error) {
        addSystemLog(`> ❌ ANA TARAMA HATASI: ${error.message}`);
    } finally {
        isScanning = false;
    }
}

// =========================================================
// ZAMANLAYICI
// =========================================================

function masterClock() {

    if (
        !state.isRunning
    ) {

        return;

    }


    const nowTime =
        getCurrentTimeTR();


    let activeSchedule =
        null;


    if (
        state.scheduleEnabled &&
        state.schedules.length > 0
    ) {

        for (
            const s
            of state.schedules
        ) {

            const inWindow =
                (
                    s.start <=
                    s.end
                )
                    ? (
                        nowTime >= s.start &&
                        nowTime <= s.end
                    )
                    : (
                        nowTime >= s.start ||
                        nowTime <= s.end
                    );


            if (
                inWindow
            ) {

                activeSchedule =
                    s;

            } else if (
                s.hasRanSingle
            ) {

                s.hasRanSingle =
                    false;

                saveData();

            }

        }

    } else if (
        !state.scheduleEnabled
    ) {

        activeSchedule = {
            mode:
                'loop'
        };

    }


    if (
        !activeSchedule
    ) {

        return;

    }


    if (
        state.scheduleEnabled &&
        activeSchedule.mode ===
        'single'
    ) {

        if (
            !activeSchedule.hasRanSingle
        ) {

            botuCalistir();

            activeSchedule.hasRanSingle =
                true;

            saveData();

        }


        return;

    }


    let beklemeSuresi =
        15 *
        60 *
        1000;


    if (
        activeSchedule.mode ===
        '5 Dakikada Bir Tara'
    ) {

        beklemeSuresi =
            5 *
            60 *
            1000;

    }


    const nowMs =
        Date.now();


    if (
        nowMs >=
        nextRunTime
    ) {

        botuCalistir();

        nextRunTime =
            nowMs +
            beklemeSuresi;

    }

}


// =========================================================
// API: START
// =========================================================

app.post(
    '/api/start',
    (req, res) => {

        if (
            state.isRunning
        ) {

            return res.json({
                success:
                    false,

                message:
                    'Sistem zaten çalışıyor.'
            });

        }


        state.isRunning =
            true;


        saveData();


        nextRunTime =
            0;


        addSystemLog(
            "> ⚡ Sistem Ana Şalteri AÇILDI."
        );


        masterInterval =
            setInterval(
                masterClock,
                60000
            );


        masterClock();


        res.json({
            success:
                true,

            message:
                'Sistem açıldı.'
        });

    }
);


// =========================================================
// API: STOP
// =========================================================

app.post(
    '/api/stop',
    (req, res) => {

        state.isRunning =
            false;


        saveData();


        addSystemLog(
            "> 🛑 Sistem Ana Şalteri KAPATILDI."
        );


        if (
            masterInterval
        ) {

            clearInterval(
                masterInterval
            );

            masterInterval =
                null;

        }


        res.json({
            success:
                true,

            message:
                'Sistem durduruldu.'
        });

    }
);


// =========================================================
// API: FORCE SCAN
// =========================================================

app.post(
    '/api/force-scan',
    (req, res) => {

        if (
            !state.isRunning
        ) {

            return res.json({

                success:
                    false,

                message:
                    'Sistem kapalı.'

            });

        }


        if (
            isScanning
        ) {

            return res.json({

                success:
                    false,

                message:
                    'Tarama zaten yapılıyor.'

            });

        }


        addSystemLog(
            "> 🚀 Manuel Hızlı Tarama tetiklendi!"
        );


        botuCalistir()
            .catch(
                console.error
            );


        res.json({

            success:
                true,

            message:
                'Tarama başladı.'

        });

    }
);


// =========================================================
// API: SETTINGS
// =========================================================

app.get(
    '/api/settings',
    (req, res) => {

        res.json(
            state
        );

    }
);


app.post(
    '/api/settings',
    (req, res) => {

        if (
            req.body.oran !== undefined
        ) {

            const yeniEdge =
                parseFloat(
                    req.body.oran
                );


            if (
                Number.isFinite(
                    yeniEdge
                )
            ) {

                state.globalMinEdge =
                    yeniEdge;

            }

        }


        if (
            req.body.scheduleEnabled !== undefined
        ) {

            state.scheduleEnabled =
                Boolean(
                    req.body.scheduleEnabled
                );

        }


        if (
            Array.isArray(
                req.body.schedules
            )
        ) {

            state.schedules =
                req.body.schedules;

        }


        saveData();


        addSystemLog(
            `> ⚙️ Ayarlar güncellendi. Minimum EDGE: %${state.globalMinEdge}`
        );


        res.json({

            success:
                true,

            state:
                state

        });

    }
);


// =========================================================
// API: STATUS
// =========================================================

app.get(
    '/api/status',
    (req, res) => {

        res.json({

            buildVersion:
                BUILD_VERSION,

            isRunning:
                state.isRunning,

            isScanning:
                isScanning,

            minEdge:
                state.globalMinEdge,

            scoreOnlyGuard:
                SCORE_ONLY_GUARD,

            nextRunTime:
                nextRunTime,

            quotaRemaining:
                quotaRemaining

        });

    }
);


// =========================================================
// BAŞLAT
// =========================================================

loadData();


const PORT =
    process.env.PORT ||
    3000;


app.listen(
    PORT,
    () => {

        addSystemLog(
            `> 🦖 DINO SERVER çalışıyor. Port: ${PORT}`
        );


        addSystemLog(
            `> 🧩 Sürüm: ${BUILD_VERSION}`
        );


        addSystemLog(
            `> 🎯 Minimum EDGE: %${state.globalMinEdge}`
        );


        addSystemLog(
            `> 🛡️ Fallback koruması: ${SCORE_ONLY_GUARD.minMinute}'+ | MS %${SCORE_ONLY_GUARD.minResultProbability}+ | Gol %${SCORE_ONLY_GUARD.minTotalProbability}+ | EDGE %${SCORE_ONLY_GUARD.minEdge}+ | Oran ≤${SCORE_ONLY_GUARD.maxOdd} | Tarama limiti ${SCORE_ONLY_GUARD.maxSignalsPerScan}`
        );


        addSystemLog(
            `> 🐍 Python: ${pythonBinary}`
        );


        addSystemLog(
            "> 🚀 API-FOOTBALL Pro tarama motoru hazır."
        );

    }
);
