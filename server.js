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
const { SignalTracker } = require('./signal_tracker');
const { CandidateTracker } = require('./candidate_tracker');
const {
    parsePrematchOddsPayload,
    PrematchOddsCache
} = require('./prematch_odds');
const {
    ShadowPowerCache,
    parseTeamStatisticsPayload,
    parseStandingsPayload,
    parsePredictionsPayload,
    standingByTeam,
    deriveStrengthSnapshot,
    buildMarketShadowAssessment
} = require('./shadow_power');
const dinoSelectorV2 = require('./dino_selector_v2');

const { GoogleGenerativeAI } = require('@google/generative-ai');


// =========================================================
// EXPRESS
// =========================================================

const app = express();
const BUILD_VERSION = 'ml-stacked-selector-verified-ubuntu-v16.0-2026-08-30';

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
        30000
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

const SIGNAL_HISTORY_FILE =
    path.join(
        __dirname,
        'dino_signal_history.json'
    );

const CANDIDATE_HISTORY_FILE =
    path.join(
        __dirname,
        'dino_candidate_history.json'
    );

const PREMATCH_CACHE_FILE =
    path.join(
        __dirname,
        'dino_prematch_cache.json'
    );

const SHADOW_POWER_CACHE_FILE =
    path.join(
        __dirname,
        'dino_shadow_power_cache.json'
    );

const SIGNAL_RULES = Object.freeze({
    shadow: Object.freeze({
        minProbability: 60,
        maxProbabilityExclusive: 70,
        minMinuteExclusive: 40,
        maxMinute: 80
    }),
    surprise: Object.freeze({
        minProbability: 70,
        maxProbabilityExclusive: 75,
        minMinute: 50,
        maxMinute: 80
    }),
    strong: Object.freeze({
        minProbability: 75,
        minMinute: 50,
        maxMinute: 80
    })
});

const TELEGRAM_MIN_MINUTE = 50;
const TELEGRAM_MAX_MINUTE = 80;
const MIN_SIGNAL_ODD = 1.40;

// V16 ikinci katman: eski Dino yüzdesini tek başına karar kabul etmez.
// Canlı tempo, skor, piyasa ve pre-match verisini birlikte yeniden puanlar.
// 1.40 kör testte doğruluk modu olarak üstün çıktı. İstenirse sunucuda
// DINO_V2_MIN_ODD=1.60 ile yükseltilebilir; 1.60 geçmiş kör testte daha
// düşük isabet verdiği için varsayılan yapılmamıştır.
const DINO_V2_SELECTOR_ENABLED =
    String(process.env.DINO_V2_SELECTOR_ENABLED || 'true').toLowerCase() !== 'false';
const DINO_V2_MIN_ODD = Number(process.env.DINO_V2_MIN_ODD) ||
    Number(dinoSelectorV2.MODEL.policy.defaultMinimumOdd);

// Kiralama hedefinde doğruluk önceliği: Telegram yalnızca gerçekten
// pre-match + canlı istatistik modeline geçen maçları kabul eder.
const PRECISION_MODE = Object.freeze({
    requirePrematchOneXTwo: true,
    requireExactPrematchTotal: true,
    minPrematchTotalSupport: 45
});

const FRESH_SIGNAL_VALIDATION = Object.freeze({
    required: true,
    failClosed: true,
    minimumMinute: TELEGRAM_MIN_MINUTE,
    maximumMinute: TELEGRAM_MAX_MINUTE,
    refreshFixture: true,
    refreshStatistics: true,
    refreshLiveOdds: true,
    rerunPython: true
});

const PREFERRED_PREMATCH_BOOKMAKER_NAME =
    process.env.PREMATCH_BOOKMAKER_NAME || 'Bet365';

let preferredPrematchBookmakerId =
    Number(process.env.PREMATCH_BOOKMAKER_ID) || null;

const PREMATCH_SUCCESS_TTL_MS = 8 * 24 * 60 * 60 * 1000;
const PREMATCH_MISS_TTL_MS = 60 * 60 * 1000;

// V16'da bu kaynaklar Python yüzdesini değiştirmez; ancak takım/lig kimliği,
// örneklem ve API prediction eksiksiz doğrulanmadan Telegram kapısı açılmaz.
const SHADOW_POWER_ENABLED = true;
const SHADOW_TEAM_STATS_TTL_MS = 12 * 60 * 60 * 1000;
const SHADOW_STANDINGS_TTL_MS = 60 * 60 * 1000;
const SHADOW_PREDICTION_TTL_MS = 36 * 60 * 60 * 1000;
const SHADOW_MISS_TTL_MS = 30 * 60 * 1000;
const SHADOW_ERROR_TTL_MS = 15 * 60 * 1000;
const SHADOW_MIN_QUOTA_REMAINING = Math.max(
    250,
    Number(process.env.SHADOW_MIN_QUOTA_REMAINING) || 1500
);

const SIGNAL_RESULT_REFRESH_MS =
    10 * 60 * 1000;

const SIGNAL_RESULT_BATCH_SIZE =
    20;


let state = {

    isRunning: false,

    // Başlangıç EDGE
    globalMinEdge: 3,

    // Ana sistem açıkken periyodik taramayı ayrıca açıp kapatır.
    // Kapalıyken paneldeki manuel "Şimdi Tara" çalışmaya devam eder.
    autoScanEnabled: true,

    scheduleEnabled: false,

    schedules: [],

    // Telegram'a başarıyla gönderilen türler fixture ID altında ayrı tutulur.
    // Her maç bir sürpriz ve bir güçlü sinyal hakkına sahiptir.
    sentFixtures: {}

};


let isScanning = false;

let nextRunTime = 0;

let masterInterval = null;

let systemLogs = [];

let isSignalResultRefreshing = false;

let signalResultInterval = null;

const signalTracker = new SignalTracker({
    filePath: SIGNAL_HISTORY_FILE,
    logger: message => addSystemLog(message)
});

const candidateTracker = new CandidateTracker({
    filePath: CANDIDATE_HISTORY_FILE,
    logger: message => addSystemLog(message),
    maxRecords: 50000
});

const prematchOddsCache = new PrematchOddsCache({
    filePath: PREMATCH_CACHE_FILE,
    logger: message => addSystemLog(message)
});

const shadowPowerCache = new ShadowPowerCache({
    filePath: SHADOW_POWER_CACHE_FILE,
    logger: message => addSystemLog(message)
});

let shadowPowerSnapshot = {
    enabled: SHADOW_POWER_ENABLED,
    decisionImpact: DINO_V2_SELECTOR_ENABLED,
    updatedAt: null,
    requestedMatches: 0,
    collectedMatches: 0,
    teamStatsComplete: 0,
    standingsComplete: 0,
    predictionsAvailable: 0,
    identityVerified: 0,
    sampleAdequate: 0,
    fullyVerified: 0,
    skippedForQuota: false,
    cache: null
};


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

const COVERAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let leagueCoverageCache = new Map();
let leagueCoverageLoadedAt = 0;
let statisticsCoverageSnapshot = {
    updatedAt: null,
    totalCandidates: 0,
    supportedCount: 0,
    unsupportedCount: 0,
    unknownCount: 0,
    completeStatsCount: 0,
    incompleteStatsCount: 0,
    supportedLeagues: [],
    unsupportedLeagues: [],
    unknownLeagues: [],
    matches: []
};


function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(resolve, ms)
    );

}


async function apiGet(url, config = {}) {
    const requestedAttempts = Number(config?.dinoMaxAttempts);
    const maximumAttempts = Number.isFinite(requestedAttempts)
        ? Math.max(1, Math.min(Math.floor(requestedAttempts), 3))
        : 3;
    const requestConfig = { ...config };
    delete requestConfig.dinoMaxAttempts;

    const queuedRequest = apiQueue
        .catch(() => undefined)
        .then(async () => {
            let lastError = null;

            for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
                const elapsed = Date.now() - lastApiRequestTime;
                const minimumDelay = 250;

                if (elapsed < minimumDelay) {
                    await sleep(minimumDelay - elapsed);
                }

                lastApiRequestTime = Date.now();

                try {
                    const result = await apiClient.get(url, requestConfig);
                    const remaining = result.headers[
                        'x-ratelimit-requests-remaining'
                    ];

                    if (remaining !== undefined) {
                        quotaRemaining = Number(remaining);
                    }

                    return result;
                } catch (error) {
                    lastError = error;
                    const status = Number(error.response?.status);
                    const timeoutOrNetwork =
                        error.code === 'ECONNABORTED' ||
                        error.code === 'ETIMEDOUT' ||
                        !error.response;
                    const retryable = status === 429 || status >= 500 || timeoutOrNetwork;

                    if (!retryable || attempt >= maximumAttempts) {
                        error.message = `${url}: ${error.message}`;
                        throw error;
                    }

                    const waitMs = status === 429
                        ? 15000
                        : attempt * 5000;
                    addSystemLog(
                        `> ⚠️ API geçici hata [${url}] (${error.message}). ${Math.round(waitMs / 1000)} sn sonra ${attempt + 1}/${maximumAttempts} deneniyor.`
                    );
                    await sleep(waitMs);
                }
            }

            throw lastError || new Error(`${url}: API isteği tamamlanamadı.`);
        });

    // Tek timeout kuyruk zincirini kalıcı olarak reddedilmiş bırakmaz.
    // Hatayı yalnızca bu isteğin çağrıcısı alır.
    apiQueue = queuedRequest.then(
        () => undefined,
        () => undefined
    );

    return queuedRequest;
}


// =========================================================
// LİG / SEZON CANLI İSTATİSTİK KAPSAMI
// =========================================================

function coverageKey(leagueID, season) {
    const id = Number(leagueID);
    const year = Number(season);
    return Number.isFinite(id) && Number.isFinite(year)
        ? `${id}:${year}`
        : null;
}


function coverageResponseIsle(items) {
    if (!Array.isArray(items)) return;

    for (const item of items) {
        const leagueID = Number(item?.league?.id);
        const leagueName = item?.league?.name || 'Bilinmeyen Lig';
        const country = item?.country?.name || null;
        const seasons = Array.isArray(item?.seasons) ? item.seasons : [];

        for (const season of seasons) {
            const key = coverageKey(leagueID, season?.year);
            if (!key) continue;

            const raw = season?.coverage?.fixtures?.statistics_fixtures;
            const supported = raw === true
                ? true
                : raw === false
                    ? false
                    : null;

            leagueCoverageCache.set(key, {
                leagueID,
                leagueName,
                country,
                season: Number(season.year),
                supported
            });
        }
    }
}


async function coverageCacheYukle() {
    const cacheFresh =
        leagueCoverageCache.size > 0 &&
        Date.now() - leagueCoverageLoadedAt < COVERAGE_CACHE_TTL_MS;

    if (cacheFresh) return;

    try {
        const response = await apiGet('/leagues?current=true');
        coverageResponseIsle(response.data?.response || []);
        leagueCoverageLoadedAt = Date.now();
        addSystemLog(
            `> 🗺️ Lig istatistik kapsamı yenilendi: ${leagueCoverageCache.size} lig/sezon kaydı.`
        );
    } catch (error) {
        addSystemLog(
            `> ⚠️ Lig coverage listesi alınamadı: ${error.message}. Bilinmeyen ligler doğrudan maç istatistiğiyle doğrulanacak.`
        );
    }
}


async function fixtureCoverageGetir(fixture) {
    const leagueID = Number(fixture?.league?.id);
    const season = Number(fixture?.league?.season);
    const key = coverageKey(leagueID, season);

    if (!key) {
        return {
            supported: null,
            leagueID,
            leagueName: fixture?.league?.name || 'Bilinmeyen Lig',
            season
        };
    }

    await coverageCacheYukle();

    if (leagueCoverageCache.has(key)) {
        return leagueCoverageCache.get(key);
    }

    // current=true listesinde bulunmayan özel sezon/kupa için yalnızca bir kez
    // lig-sezon detayı sorulur ve sonuç aynı altı saatlik cache'e eklenir.
    try {
        const response = await apiGet(
            `/leagues?id=${leagueID}&season=${season}`
        );
        coverageResponseIsle(response.data?.response || []);
    } catch (error) {
        addSystemLog(
            `> ⚠️ Coverage detayı alınamadı (${fixture?.league?.name || leagueID} ${season}): ${error.message}`
        );
    }

    return leagueCoverageCache.get(key) || {
        supported: null,
        leagueID,
        leagueName: fixture?.league?.name || 'Bilinmeyen Lig',
        season
    };
}


function coverageLigListesi(rows, status) {
    const unique = new Map();
    for (const row of rows.filter(item => item.coverageStatus === status)) {
        const key = `${row.leagueID}:${row.season}`;
        if (!unique.has(key)) {
            unique.set(key, {
                leagueID: row.leagueID,
                league: row.league,
                season: row.season
            });
        }
    }
    return Array.from(unique.values());
}


async function istatistikCoverageFiltrele(fixtures) {
    const rows = [];
    const allowed = [];

    for (const fixture of fixtures) {
        const coverage = await fixtureCoverageGetir(fixture);
        const coverageStatus = coverage.supported === true
            ? 'supported'
            : coverage.supported === false
                ? 'unsupported'
                : 'unknown';
        const row = {
            fixtureID: Number(fixture?.fixture?.id),
            match: `${fixture?.teams?.home?.name || 'Ev Sahibi'} - ${fixture?.teams?.away?.name || 'Deplasman'}`,
            leagueID: Number(fixture?.league?.id),
            league: fixture?.league?.name || coverage.leagueName || 'Bilinmeyen Lig',
            season: Number(fixture?.league?.season),
            minute: fixture?.fixture?.status?.elapsed ?? null,
            coverageStatus,
            statisticsChecked: false,
            actualStatsComplete: null,
            statsTeamCount: null,
            prematchAvailable: null,
            prematchSource: null
        };
        rows.push(row);

        // Yalnızca açıkça false olan ligleri çıkar. Metadata bulunamazsa gerçek
        // /fixtures/statistics cevabı son ve daha kesin kontrolü yapar.
        if (coverageStatus !== 'unsupported') {
            fixture.stats_coverage = coverageStatus;
            allowed.push(fixture);
        }
    }

    statisticsCoverageSnapshot = {
        updatedAt: new Date().toISOString(),
        totalCandidates: rows.length,
        supportedCount: rows.filter(row => row.coverageStatus === 'supported').length,
        unsupportedCount: rows.filter(row => row.coverageStatus === 'unsupported').length,
        unknownCount: rows.filter(row => row.coverageStatus === 'unknown').length,
        completeStatsCount: 0,
        incompleteStatsCount: 0,
        supportedLeagues: coverageLigListesi(rows, 'supported'),
        unsupportedLeagues: coverageLigListesi(rows, 'unsupported'),
        unknownLeagues: coverageLigListesi(rows, 'unknown'),
        matches: rows
    };

    return allowed;
}


function coverageSnapshotMacGuncelle(mac) {
    const fixtureID = Number(mac?.fixture_id);
    const row = statisticsCoverageSnapshot.matches.find(
        item => Number(item.fixtureID) === fixtureID
    );
    if (!row) return;

    row.statisticsChecked = true;
    row.actualStatsComplete = temelStatsTam(mac);
    row.statsTeamCount = Number(mac?.stats_team_count || 0);
    row.prematchAvailable = mac?.prematch_available === true;
    row.prematchSource = mac?.prematch_source || null;
    statisticsCoverageSnapshot.completeStatsCount =
        statisticsCoverageSnapshot.matches.filter(
            item => item.statisticsChecked && item.actualStatsComplete === true
        ).length;
    statisticsCoverageSnapshot.incompleteStatsCount =
        statisticsCoverageSnapshot.matches.filter(
            item => item.statisticsChecked && item.actualStatsComplete === false
        ).length;
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


            if (
                !state.sentFixtures ||
                typeof state.sentFixtures !== 'object' ||
                Array.isArray(state.sentFixtures)
            ) {
                state.sentFixtures = {};
            }


            gonderilenFixtureKayitlariniTemizle(false);


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


const SENT_FIXTURE_TTL_MS =
    36 * 60 * 60 * 1000;


function fixtureKaydiSonGonderimZamani(kayit) {
    if (!kayit || typeof kayit !== 'object') return null;

    const zamanlar = [
        kayit.sentAt,
        kayit.legacy?.sentAt,
        kayit.surprise?.sentAt,
        kayit.strong?.sentAt
    ]
        .map(Number)
        .filter(Number.isFinite);

    return zamanlar.length > 0
        ? Math.max(...zamanlar)
        : null;
}


function gonderilenFixtureKayitlariniTemizle(kaydet = true) {
    if (
        !state.sentFixtures ||
        typeof state.sentFixtures !== 'object' ||
        Array.isArray(state.sentFixtures)
    ) {
        state.sentFixtures = {};
        if (kaydet) saveData();
        return;
    }

    const simdi = Date.now();
    let degisti = false;

    for (const [fixtureID, kayit] of Object.entries(state.sentFixtures)) {
        const sentAt = fixtureKaydiSonGonderimZamani(kayit);
        if (
            !Number.isFinite(sentAt) ||
            simdi - sentAt > SENT_FIXTURE_TTL_MS
        ) {
            delete state.sentFixtures[fixtureID];
            degisti = true;
        }
    }

    if (degisti && kaydet) {
        saveData();
    }
}


function sinyalTuruAnahtari(value) {
    return value === 'strong'
        ? 'strong'
        : 'surprise';
}


function fixtureGonderimKaydi(mac, sinyalTuru) {
    const fixtureID = Number(mac?.fixture_id);
    if (!Number.isFinite(fixtureID) || fixtureID <= 0) {
        return null;
    }

    gonderilenFixtureKayitlariniTemizle(false);
    const tur = sinyalTuruAnahtari(sinyalTuru);
    const kayit = state.sentFixtures?.[String(fixtureID)] || null;

    if (kayit?.[tur]) return kayit[tur];

    // dino_data.json silinse bile paylaşılan sinyal geçmişi ikinci bir
    // güvenlik katmanı olarak aynı türün yeniden gönderilmesini önler.
    if (signalTracker.hasSignal(fixtureID, tur)) {
        return {
            sentAt: null,
            market: null,
            fromHistory: true
        };
    }

    return null;
}


function fixtureGonderildiKaydet(mac, firsat) {
    const fixtureID = Number(mac?.fixture_id);
    if (!Number.isFinite(fixtureID) || fixtureID <= 0) {
        addSystemLog(
            `> ⚠️ ${mac?.mac_isim || 'Bilinmeyen maç'}: fixture ID olmadığı için tekrar kilidi kaydedilemedi.`
        );
        return;
    }

    if (
        !state.sentFixtures ||
        typeof state.sentFixtures !== 'object' ||
        Array.isArray(state.sentFixtures)
    ) {
        state.sentFixtures = {};
    }

    const fixtureKey = String(fixtureID);
    const oncekiKayit = state.sentFixtures[fixtureKey];
    const tur = sinyalTuruAnahtari(firsat?.sinyal_turu);

    // Eski sürümün tek kayıtlı yapısını sakla fakat yeni sürümde sürpriz ve
    // güçlü haklarını birbirinden bağımsız yönet.
    const temelKayit = oncekiKayit && typeof oncekiKayit === 'object'
        ? (
            oncekiKayit.sentAt && !oncekiKayit.surprise && !oncekiKayit.strong
                ? { legacy: { ...oncekiKayit } }
                : { ...oncekiKayit }
        )
        : {};

    temelKayit[tur] = {
        sentAt: Date.now(),
        match: mac?.mac_isim || null,
        market: firsat?.market || null,
        odds: firsat?.oran ?? null,
        minute: mac?.dakika ?? null,
        score: mac?.skor || null
    };

    state.sentFixtures[fixtureKey] = temelKayit;

    gonderilenFixtureKayitlariniTemizle(false);
    saveData();
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


function telegramMacHalaUygunMu(mac) {
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
    }, TELEGRAM_MIN_MINUTE, TELEGRAM_MAX_MINUTE);
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
// PRE-MATCH ODDS + CACHE
// =========================================================

let prematchBookmakerLookupDone = false;


async function preferredPrematchBookmakerIdCoz() {
    if (preferredPrematchBookmakerId || prematchBookmakerLookupDone) {
        return preferredPrematchBookmakerId;
    }

    prematchBookmakerLookupDone = true;

    try {
        const response = await apiGet(
            '/odds/bookmakers',
            {
                params: {
                    search: PREFERRED_PREMATCH_BOOKMAKER_NAME
                }
            }
        );
        const bookmakers = Array.isArray(response.data?.response)
            ? response.data.response
            : [];
        const wanted = normalizeText(PREFERRED_PREMATCH_BOOKMAKER_NAME);
        const selected = bookmakers.find(
            bookmaker => normalizeText(bookmaker?.name) === wanted
        ) || bookmakers.find(
            bookmaker => normalizeText(bookmaker?.name).includes(wanted)
        );
        const resolvedId = Number(selected?.id);

        if (Number.isFinite(resolvedId) && resolvedId > 0) {
            preferredPrematchBookmakerId = resolvedId;
            addSystemLog(
                `> 🧭 Pre-match öncelikli kaynak çözüldü: ${selected.name} [${resolvedId}].`
            );
        }
    } catch (error) {
        addSystemLog(
            `> ⚠️ Pre-match bookmaker kimliği çözülemedi; piyasa konsensüsü denenecek (${error.message}).`
        );
    }

    return preferredPrematchBookmakerId;
}


function prematchOneXTwoTam(result) {
    const oneXTwo = result?.oneXTwo;
    return ['home', 'draw', 'away'].every(key => {
        const value = Number(oneXTwo?.[key]);
        return Number.isFinite(value) && value > 0 && value < 1;
    });
}


async function prematchOddsGetir(fixtureId) {
    const numericFixtureId = Number(fixtureId);
    if (!Number.isFinite(numericFixtureId) || numericFixtureId <= 0) return null;

    const cached = prematchOddsCache.get(numericFixtureId);
    if (cached) {
        return cached.status === 'ok' ? cached.result : null;
    }

    try {
        const bookmakerId = await preferredPrematchBookmakerIdCoz();
        const payloads = [];

        if (bookmakerId) {
            const preferredResponse = await apiGet(
                '/odds',
                {
                    params: {
                        fixture: numericFixtureId,
                        bookmaker: bookmakerId
                    }
                }
            );
            payloads.push(preferredResponse.data || {});
        }

        let combinedPayload = {
            response: payloads.flatMap(payload =>
                Array.isArray(payload?.response) ? payload.response : []
            )
        };
        let parsed = parsePrematchOddsPayload(combinedPayload, {
            preferredBookmakerId: bookmakerId,
            preferredBookmakerName: PREFERRED_PREMATCH_BOOKMAKER_NAME
        });

        // Tercih edilen bookmaker bu fixture'da yoksa ilk sayfadaki farklı
        // bookmaker'ları konsensüs olarak kullan. Kaynak etiketi gerçek cevaptan gelir.
        if (
            !bookmakerId ||
            !prematchOneXTwoTam(parsed) ||
            Object.keys(parsed?.totals || {}).length < 5
        ) {
            const fallbackResponse = await apiGet(
                '/odds',
                {
                    params: {
                        fixture: numericFixtureId,
                        page: 1
                    }
                }
            );
            payloads.push(fallbackResponse.data || {});
            combinedPayload = {
                response: payloads.flatMap(payload =>
                    Array.isArray(payload?.response) ? payload.response : []
                )
            };
            parsed = parsePrematchOddsPayload(combinedPayload, {
                preferredBookmakerId: bookmakerId,
                preferredBookmakerName: PREFERRED_PREMATCH_BOOKMAKER_NAME
            });
        }

        if (!prematchOneXTwoTam(parsed)) {
            prematchOddsCache.set(numericFixtureId, null, {
                status: 'missing',
                ttlMs: PREMATCH_MISS_TTL_MS
            });
            return null;
        }

        const result = {
            ...parsed,
            fixtureId: numericFixtureId,
            fetchedAt: new Date().toISOString()
        };
        prematchOddsCache.set(numericFixtureId, result, {
            status: 'ok',
            ttlMs: PREMATCH_SUCCESS_TTL_MS
        });
        return result;

    } catch (error) {
        prematchOddsCache.set(numericFixtureId, null, {
            status: 'missing',
            ttlMs: PREMATCH_MISS_TTL_MS
        });
        addSystemLog(
            `> ⚠️ Fixture ${numericFixtureId} pre-match oranı alınamadı (${error.message}).`
        );
        return null;
    }
}


function prematchVerisiniMacaEkle(mac, prematch) {
    const oneXTwo = prematch?.oneXTwo || null;
    mac.prematch_available = prematchOneXTwoTam(prematch);
    mac.prematch_p_home = mac.prematch_available ? Number(oneXTwo.home) : null;
    mac.prematch_p_draw = mac.prematch_available ? Number(oneXTwo.draw) : null;
    mac.prematch_p_away = mac.prematch_available ? Number(oneXTwo.away) : null;
    mac.prematch_source = mac.prematch_available ? oneXTwo.source : null;
    mac.prematch_bookmaker_id = mac.prematch_available
        ? oneXTwo.bookmakerId ?? null
        : null;
    mac.prematch_totals = prematch?.totals && typeof prematch.totals === 'object'
        ? prematch.totals
        : {};
}


function prematchMarketDestegi(mac, market) {
    const probabilityPercent = value => {
        if (value === null || value === undefined || value === '') return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric * 100 : null;
    };

    if (market === 'MS1') return probabilityPercent(mac?.prematch_p_home);
    if (market === 'X') return probabilityPercent(mac?.prematch_p_draw);
    if (market === 'MS2') return probabilityPercent(mac?.prematch_p_away);

    const match = String(market || '').match(/^(\d+(?:\.\d+)?)_(ALT|UST)$/);
    if (!match) return null;

    const total = mac?.prematch_totals?.[String(Number(match[1]))];
    const rawValue = match[2] === 'UST' ? total?.over : total?.under;
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const value = Number(rawValue);
    return Number.isFinite(value) ? value * 100 : null;
}


function prematchMarketKaynagi(mac, market) {
    const match = String(market || '').match(/^(\d+(?:\.\d+)?)_(ALT|UST)$/);
    if (match) {
        return mac?.prematch_totals?.[String(Number(match[1]))]?.source || null;
    }
    return mac?.prematch_source || null;
}


// =========================================================
// KARARA KAPALI API GÜÇ GÖLGE TESTİ
// =========================================================

function golgeCacheAnahtari(...parts) {
    const normalized = parts.map(Number);
    return normalized.every(Number.isFinite)
        ? normalized.join(':')
        : null;
}


async function cacheliGolgeApiGetir({
    bucket,
    key,
    url,
    parser,
    successTtlMs
}) {
    if (!key) {
        return {
            status: 'invalid_key',
            fetchedAt: null,
            fromCache: false,
            result: { available: false }
        };
    }

    const cached = shadowPowerCache.get(bucket, key);
    if (cached) {
        return {
            status: cached.status,
            fetchedAt: cached.fetchedAt,
            fromCache: true,
            result: cached.result || { available: false }
        };
    }

    try {
        const response = await apiGet(url, {
            timeout: 10000,
            dinoMaxAttempts: 1
        });
        const parsed = parser(response.data || {});
        const available = parsed?.available === true;
        const status = available ? 'ok' : 'missing';
        shadowPowerCache.set(bucket, key, parsed, {
            status,
            ttlMs: available ? successTtlMs : SHADOW_MISS_TTL_MS
        });
        const saved = shadowPowerCache.get(bucket, key);
        return {
            status,
            fetchedAt: saved?.fetchedAt || new Date().toISOString(),
            fromCache: false,
            result: parsed
        };
    } catch (error) {
        const result = {
            available: false,
            error: error.message
        };
        shadowPowerCache.set(bucket, key, result, {
            status: 'error',
            ttlMs: SHADOW_ERROR_TTL_MS
        });
        return {
            status: 'error',
            fetchedAt: new Date().toISOString(),
            fromCache: false,
            result
        };
    }
}


function golgeKaynakOzeti(entry) {
    return {
        status: entry?.status || 'missing',
        fetchedAt: entry?.fetchedAt || null,
        fromCache: entry?.fromCache === true
    };
}


async function golgeGucBaglamiGetir(mac) {
    const fixtureId = Number(mac?.fixture_id);
    const leagueId = Number(mac?.league_id);
    const season = Number(mac?.season);
    const homeTeamId = Number(mac?.home_team_id);
    const awayTeamId = Number(mac?.away_team_id);

    if (
        ![fixtureId, leagueId, season, homeTeamId, awayTeamId]
            .every(value => Number.isFinite(value) && value > 0)
    ) {
        return {
            enabled: true,
            decisionImpact: DINO_V2_SELECTOR_ENABLED,
            available: false,
            capturedAt: new Date().toISOString(),
            reason: 'fixture_league_season_or_team_id_missing'
        };
    }

    const standingsKey = golgeCacheAnahtari(leagueId, season);
    const homeStatsKey = golgeCacheAnahtari(leagueId, season, homeTeamId);
    const awayStatsKey = golgeCacheAnahtari(leagueId, season, awayTeamId);

    // Lig tablosu ve takım verileri diskte cache'lenir. V16 bunları yalnız
    // ikinci katman ön elemesini geçen kısa listedeki maçlar için çağırır.
    const standingsEntry = await cacheliGolgeApiGetir({
        bucket: 'standings',
        key: standingsKey,
        url: `/standings?league=${leagueId}&season=${season}`,
        parser: payload => parseStandingsPayload(payload, {
            leagueId,
            season
        }),
        successTtlMs: SHADOW_STANDINGS_TTL_MS
    });
    const homeStatsEntry = await cacheliGolgeApiGetir({
        bucket: 'teamStats',
        key: homeStatsKey,
        url: `/teams/statistics?league=${leagueId}&season=${season}&team=${homeTeamId}`,
        parser: payload => parseTeamStatisticsPayload(payload, {
            teamId: homeTeamId,
            leagueId,
            season
        }),
        successTtlMs: SHADOW_TEAM_STATS_TTL_MS
    });
    const awayStatsEntry = await cacheliGolgeApiGetir({
        bucket: 'teamStats',
        key: awayStatsKey,
        url: `/teams/statistics?league=${leagueId}&season=${season}&team=${awayTeamId}`,
        parser: payload => parseTeamStatisticsPayload(payload, {
            teamId: awayTeamId,
            leagueId,
            season
        }),
        successTtlMs: SHADOW_TEAM_STATS_TTL_MS
    });
    const predictionEntry = await cacheliGolgeApiGetir({
        bucket: 'predictions',
        key: String(fixtureId),
        url: `/predictions?fixture=${fixtureId}`,
        parser: payload => parsePredictionsPayload(payload, {
            fixtureId,
            leagueId,
            homeTeamId,
            awayTeamId
        }),
        successTtlMs: SHADOW_PREDICTION_TTL_MS
    });

    const standings = standingsEntry.result || { available: false };
    const homeStanding = standingByTeam(standings, homeTeamId);
    const awayStanding = standingByTeam(standings, awayTeamId);
    const homeStats = homeStatsEntry.result || { available: false };
    const awayStats = awayStatsEntry.result || { available: false };
    const prediction = predictionEntry.result || { available: false };
    const strength = deriveStrengthSnapshot(
        homeStats,
        awayStats,
        homeStanding,
        awayStanding
    );

    const teamStatsComplete =
        homeStats.available === true &&
        awayStats.available === true;
    const standingsComplete = Boolean(homeStanding && awayStanding);
    const predictionsAvailable = prediction.available === true;
    const homeVenuePlayed = Number(homeStats?.home?.played);
    const awayVenuePlayed = Number(awayStats?.away?.played);
    const minimumVenueSample = 5;
    const sampleAdequate =
        Number.isFinite(homeVenuePlayed) &&
        Number.isFinite(awayVenuePlayed) &&
        homeVenuePlayed >= minimumVenueSample &&
        awayVenuePlayed >= minimumVenueSample;
    const identityVerified =
        homeStats?.validation?.identityValid === true &&
        awayStats?.validation?.identityValid === true &&
        standings?.validation?.identityValid === true &&
        prediction?.validation?.identityValid === true;
    const fullyVerified =
        teamStatsComplete &&
        standingsComplete &&
        predictionsAvailable &&
        identityVerified &&
        sampleAdequate;

    return {
        enabled: true,
        decisionImpact: DINO_V2_SELECTOR_ENABLED,
        available:
            teamStatsComplete ||
            standingsComplete ||
            predictionsAvailable,
        capturedAt: new Date().toISOString(),
        fixtureId,
        leagueId,
        season,
        teams: {
            home: {
                id: homeTeamId,
                name: mac?.home_team_name || null
            },
            away: {
                id: awayTeamId,
                name: mac?.away_team_name || null
            }
        },
        coverage: {
            teamStatsComplete,
            standingsComplete,
            predictionsAvailable
        },
        validation: {
            identityVerified,
            sampleAdequate,
            fullyVerified,
            minimumVenueSample,
            homeVenuePlayed: Number.isFinite(homeVenuePlayed)
                ? homeVenuePlayed
                : null,
            awayVenuePlayed: Number.isFinite(awayVenuePlayed)
                ? awayVenuePlayed
                : null,
            teamStatsIdentity: {
                home: homeStats?.validation || null,
                away: awayStats?.validation || null
            },
            standingsIdentity: standings?.validation || null,
            predictionIdentity: prediction?.validation || null
        },
        teamStats: {
            home: homeStats,
            away: awayStats
        },
        standings: {
            home: homeStanding,
            away: awayStanding
        },
        prediction,
        strength,
        sources: {
            standings: golgeKaynakOzeti(standingsEntry),
            homeTeamStats: golgeKaynakOzeti(homeStatsEntry),
            awayTeamStats: golgeKaynakOzeti(awayStatsEntry),
            prediction: golgeKaynakOzeti(predictionEntry)
        },
        note: 'Kimlik, sezon/lig, ev-deplasman örneklemi ve API prediction yüzdeleri doğrulanmış gölge test verisidir; Python, EDGE, filtre ve Telegram kararına etkisi yoktur.'
    };
}


async function golgeGucBaglamlariniTopla(maclar) {
    const matches = Array.isArray(maclar) ? maclar : [];
    const contexts = new Map();
    const quotaLow =
        quotaRemaining !== null &&
        Number(quotaRemaining) <= SHADOW_MIN_QUOTA_REMAINING;

    if (!SHADOW_POWER_ENABLED || matches.length === 0 || quotaLow) {
        shadowPowerSnapshot = {
            enabled: SHADOW_POWER_ENABLED,
            decisionImpact: DINO_V2_SELECTOR_ENABLED,
            updatedAt: new Date().toISOString(),
            requestedMatches: matches.length,
            collectedMatches: 0,
            teamStatsComplete: 0,
            standingsComplete: 0,
            predictionsAvailable: 0,
            identityVerified: 0,
            sampleAdequate: 0,
            fullyVerified: 0,
            skippedForQuota: quotaLow,
            cache: shadowPowerCache.summary()
        };
        if (quotaLow) {
            addSystemLog(
                `> 🧪 Gölge güç testi kota korumasıyla atlandı: kalan ${quotaRemaining}, koruma sınırı ${SHADOW_MIN_QUOTA_REMAINING}.`
            );
        }
        return contexts;
    }

    addSystemLog(
        `> 🧬 V16 güç doğrulaması başlıyor: ${matches.length} ön aday. Kimlik, takım örneklemi, standings ve API prediction tam değilse sinyal kapalı.`
    );

    for (const mac of matches) {
        const context = await golgeGucBaglamiGetir(mac);
        contexts.set(Number(mac.fixture_id), context);
        const coverage = context?.coverage || {};
        addSystemLog(
            `> 🧬 ${mac.mac_isim}: takım=${coverage.teamStatsComplete ? 'TAM' : 'YOK'} | tablo=${coverage.standingsComplete ? 'TAM' : 'YOK'} | prediction=${coverage.predictionsAvailable ? 'VAR' : 'YOK'} | kimlik=${context?.validation?.identityVerified ? 'OK' : 'EKSİK'} | örneklem=${context?.validation?.sampleAdequate ? 'OK' : 'YETERSİZ'} | ${context?.validation?.fullyVerified ? 'V16 ONAY' : 'V16 RED'}.`
        );

        const sourceStatuses = Object.values(context?.sources || {})
            .map(source => source?.status);
        if (sourceStatuses.filter(status => status === 'error').length >= 3) {
            addSystemLog(
                '> ⚠️ Gölge endpointlerde yaygın bağlantı hatası görüldü; ana taramayı uzatmamak için kalan gölge çağrıları bu turda atlandı.'
            );
            break;
        }
    }

    const values = [...contexts.values()];
    shadowPowerSnapshot = {
        enabled: true,
        decisionImpact: DINO_V2_SELECTOR_ENABLED,
        updatedAt: new Date().toISOString(),
        requestedMatches: matches.length,
        collectedMatches: values.filter(context => context?.available).length,
        teamStatsComplete: values.filter(
            context => context?.coverage?.teamStatsComplete
        ).length,
        standingsComplete: values.filter(
            context => context?.coverage?.standingsComplete
        ).length,
        predictionsAvailable: values.filter(
            context => context?.coverage?.predictionsAvailable
        ).length,
        identityVerified: values.filter(
            context => context?.validation?.identityVerified
        ).length,
        sampleAdequate: values.filter(
            context => context?.validation?.sampleAdequate
        ).length,
        fullyVerified: values.filter(
            context => context?.validation?.fullyVerified
        ).length,
        skippedForQuota: false,
        cache: shadowPowerCache.summary()
    };

    return contexts;
}


function golgeBaglaminiKayitlaraEkle(records, contexts) {
    if (!Array.isArray(records) || !(contexts instanceof Map)) return;

    for (const record of records) {
        const context = contexts.get(Number(record?.fixtureId));
        if (!context) continue;
        record.shadowContext = context;
        record.shadowAssessment = record?.market
            ? buildMarketShadowAssessment(context, record.market)
            : null;
    }
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


function skorParcala(skor) {
    const match = String(skor || '').match(/^(\d+)\s*-\s*(\d+)$/);
    if (!match) return null;
    return {
        home: Number(match[1]),
        away: Number(match[2])
    };
}


function temelStatDegerleri(mac) {
    return MODEL_STAT_FIELDS.map(field => Number(mac?.[field]));
}


function temelStatImzasi(mac) {
    if (!temelStatsTam(mac)) return null;
    return temelStatDegerleri(mac).join('|');
}


function kayitCanliStatsiniMacaCevir(record) {
    const home = record?.liveStats?.home || {};
    const away = record?.liveStats?.away || {};
    return {
        skor: record?.score || null,
        home_shot: home.shots,
        away_shot: away.shots,
        home_sot: home.shotsOnGoal,
        away_sot: away.shotsOnGoal,
        home_corner: home.corners,
        away_corner: away.corners
    };
}


function tazeCanliStatsTutarlilikKontrolu(tazeMac, oncekiMac = null) {
    const reasons = [];

    if (!temelStatsTam(tazeMac)) {
        reasons.push('altı temel canlı istatistik eksik');
    } else {
        const values = temelStatDegerleri(tazeMac);
        if (values.some(value => value < 0)) {
            reasons.push('negatif canlı istatistik değeri');
        }

        const homeShot = Number(tazeMac.home_shot);
        const awayShot = Number(tazeMac.away_shot);
        const homeSot = Number(tazeMac.home_sot);
        const awaySot = Number(tazeMac.away_sot);
        if (homeSot > homeShot || awaySot > awayShot) {
            reasons.push('isabetli şut toplam şuttan büyük');
        }

        const score = skorParcala(tazeMac.skor);
        if (!score) {
            reasons.push('güncel skor ayrıştırılamadı');
        } else {
            // Tek bir kendi kalesine gol olasılığına tolerans tanınır. Daha
            // büyük fark canlı istatistiğin donduğuna dair güçlü kanıttır.
            if (
                score.home > homeSot + 1 ||
                score.away > awaySot + 1 ||
                score.home + score.away > homeSot + awaySot + 1
            ) {
                reasons.push('skor ile isabetli şut arasında açık çelişki');
            }
        }
    }

    if (oncekiMac && temelStatsTam(oncekiMac) && temelStatsTam(tazeMac)) {
        const oncekiValues = temelStatDegerleri(oncekiMac);
        const tazeValues = temelStatDegerleri(tazeMac);
        if (tazeValues.some((value, index) => value < oncekiValues[index])) {
            reasons.push('kümülatif canlı istatistik önceki taramaya göre azaldı');
        }

        if (
            String(oncekiMac.skor || '') !== String(tazeMac.skor || '') &&
            temelStatImzasi(oncekiMac) === temelStatImzasi(tazeMac)
        ) {
            reasons.push('skor değiştiği hâlde şut/isabet/korner verisi donmuş');
        }
    }

    return {
        ok: reasons.length === 0,
        reasons: [...new Set(reasons)]
    };
}


function tazeStatlariMacaUygula(mac, freshStats) {
    for (const field of PARSED_STAT_FIELDS) {
        if (freshStats?.[field] !== null && freshStats?.[field] !== undefined) {
            mac[field] = freshStats[field];
        }
    }
    mac.stats_source = 'API-Football Fixture Statistics (Pre-Signal Verified)';
    mac.model_hazir = temelStatsTam(mac);
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
            league_id: Number(fixture.league?.id),
            season: Number(fixture.league?.season),
            home_team_id: Number(fixture.teams?.home?.id),
            home_team_name: fixture.teams?.home?.name || null,
            away_team_id: Number(fixture.teams?.away?.id),
            away_team_name: fixture.teams?.away?.name || null,
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


async function sinyalOncesiVerileriYenileVeDogrula(mac) {
    const verifiedAt = new Date().toISOString();
    const originalScore = String(mac?.skor || '');
    const originalStatsSignature = temelStatImzasi(mac);
    const previousRecord = typeof candidateTracker.latestFixtureMoment === 'function'
        ? candidateTracker.latestFixtureMoment(mac?.fixture_id)
        : null;
    const previousMac = previousRecord
        ? kayitCanliStatsiniMacaCevir(previousRecord)
        : null;

    try {
        const fixtureResponse = await apiGet(
            `/fixtures?id=${Number(mac.fixture_id)}`
        );
        const latest = Array.isArray(fixtureResponse.data?.response)
            ? fixtureResponse.data.response[0]
            : null;

        if (
            !latest ||
            !canliFixtureUygunMu(
                latest,
                TELEGRAM_MIN_MINUTE,
                TELEGRAM_MAX_MINUTE
            )
        ) {
            const minute = latest?.fixture?.status?.elapsed ?? '?';
            const status = latest?.fixture?.status?.short ?? latest?.fixture?.status?.long ?? 'veri yok';
            return {
                ok: false,
                reason: `güncel canlılık uygun değil (${minute}' / ${status})`,
                verifiedAt
            };
        }

        const latestHome = latest.goals?.home;
        const latestAway = latest.goals?.away;
        if (
            latestHome === null || latestHome === undefined ||
            latestAway === null || latestAway === undefined
        ) {
            return {
                ok: false,
                reason: 'güncel skor alınamadı',
                verifiedAt
            };
        }

        const freshStats = await direktFixtureStatsGetir(latest);
        if (!freshStats || !temelStatsTam(freshStats)) {
            return {
                ok: false,
                reason: 'taze /fixtures/statistics cevabında altı temel alan tamamlanamadı',
                verifiedAt
            };
        }

        const currentReferenceCheck = tazeCanliStatsTutarlilikKontrolu(
            freshStats,
            mac
        );
        const previousMomentCheck = tazeCanliStatsTutarlilikKontrolu(
            freshStats,
            previousMac
        );
        const reasons = [...new Set([
            ...currentReferenceCheck.reasons,
            ...previousMomentCheck.reasons
        ])];

        if (reasons.length > 0) {
            return {
                ok: false,
                reason: reasons.join('; '),
                reasons,
                verifiedAt,
                previousCapturedAt: previousRecord?.capturedAt || null
            };
        }

        const liveOddsResponse = await apiGet(
            '/odds/live',
            {
                params: {
                    fixture: Number(mac.fixture_id)
                }
            }
        );
        const refreshedOdds = parseLiveOdds(liveOddsResponse).get(
            Number(mac.fixture_id)
        );
        if (!refreshedOdds || Object.keys(refreshedOdds).length === 0) {
            return {
                ok: false,
                reason: 'sinyal öncesi taze canlı oran bulunamadı',
                verifiedAt
            };
        }

        mac.dakika = latest.fixture.status.elapsed;
        mac.status_short = latest.fixture.status.short ?? null;
        mac.status_long = latest.fixture.status.long ?? null;
        mac.status_finished = latest.fixture.status.finished ?? latest.fixture.finished ?? null;
        mac.status_stopped = latest.fixture.status.stopped ?? latest.fixture.stopped ?? null;
        mac.status_blocked = latest.fixture.status.blocked ?? latest.fixture.blocked ?? null;
        mac.status_suspended = latest.fixture.status.suspended ?? latest.fixture.suspended ?? null;
        mac.skor = `${latestHome}-${latestAway}`;
        tazeStatlariMacaUygula(mac, freshStats);
        mac.canli_oranlar = refreshedOdds;

        const validation = {
            status: 'passed',
            verifiedAt,
            source: mac.stats_source,
            previousCapturedAt: previousRecord?.capturedAt || null,
            scoreChangedBeforeRecheck: originalScore !== mac.skor,
            statsChangedBeforeRecheck:
                originalStatsSignature !== temelStatImzasi(mac),
            liveOddsRefreshed: true,
            checks: {
                sixCoreStatsComplete: true,
                shotsOnGoalNotAboveShots: true,
                scoreShotsConsistent: true,
                cumulativeStatsNonDecreasing: true,
                frozenStatsNotDetected: true
            }
        };
        mac.stats_validation = validation;

        addSystemLog(
            `> ✅ ${mac.mac_isim}: sinyal öncesi skor + canlı stats + oran taze doğrulandı (${mac.dakika}' / ${mac.skor}).`
        );

        return {
            ok: true,
            verifiedAt,
            validation
        };
    } catch (error) {
        return {
            ok: false,
            reason: `taze veri doğrulama hatası: ${error.message}`,
            verifiedAt
        };
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

        uygunMaclar = await istatistikCoverageFiltrele(uygunMaclar);

        addSystemLog(
            `> 🧭 Coverage filtresi: ${statisticsCoverageSnapshot.supportedCount} destekli | ${statisticsCoverageSnapshot.unsupportedCount} desteklenmiyor | ${statisticsCoverageSnapshot.unknownCount} bilinmiyor.`
        );

        if (statisticsCoverageSnapshot.supportedLeagues.length > 0) {
            addSystemLog(
                `> ✅ İstatistik destekli canlı ligler: ${statisticsCoverageSnapshot.supportedLeagues.map(item => `${item.league} (${item.season})`).join(' | ')}`
            );
        }

        if (statisticsCoverageSnapshot.unsupportedLeagues.length > 0) {
            addSystemLog(
                `> 🚫 İstatistik kapsamı olmayan ve çıkarılan ligler: ${statisticsCoverageSnapshot.unsupportedLeagues.map(item => `${item.league} (${item.season})`).join(' | ')}`
            );
        }

        if (statisticsCoverageSnapshot.unknownLeagues.length > 0) {
            addSystemLog(
                `> ❓ Coverage bilgisi bulunamayan ligler gerçek /fixtures/statistics cevabıyla kontrol edilecek: ${statisticsCoverageSnapshot.unknownLeagues.map(item => `${item.league} (${item.season})`).join(' | ')}`
            );
        }

        addSystemLog(
            `> 🎛️ Coverage filtresinden sonra ${uygunMaclar.length} canlı aday kaldı.`
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
        let prematchTamMacSayisi = 0;
        let prematchEksikMacSayisi = 0;


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

            // Pre-match verisi yalnızca canlı istatistiği gerçekten tam olan
            // adaylar için çekilir. Sonuç fixture bazında diske önbelleklenir;
            // sonraki 10 dakikalık taramalar yeni API isteği üretmez.
            const prematch = enriched.model_hazir
                ? await prematchOddsGetir(fixtureID)
                : null;
            prematchVerisiniMacaEkle(enriched, prematch);

            if (enriched.prematch_available) {
                prematchTamMacSayisi++;
                addSystemLog(
                    `> 🧭 ${enriched.mac_isim}: pre-match hazır (${enriched.prematch_source}).`
                );
            } else {
                prematchEksikMacSayisi++;
                addSystemLog(
                    `> 🟠 ${enriched.mac_isim}: pre-match 1X2 bulunamadı; yalnız gölge denetimde kalacak.`
                );
            }

            coverageSnapshotMacGuncelle(enriched);


            macVerileri.push(
                enriched
            );


            addSystemLog(
                `> 🔍 RAW ORAN (${enriched.mac_isim}): Market Sayısı: ${Object.keys(liveOdds).length}`
            );

        }


        addSystemLog(
            `> 📈 Gerçek maç istatistiği sonucu: ${statisticsCoverageSnapshot.completeStatsCount} tam | ${statisticsCoverageSnapshot.incompleteStatsCount} eksik.`
        );

        addSystemLog(
            `> 🧭 Pre-match kapsamı: ${prematchTamMacSayisi} hazır | ${prematchEksikMacSayisi} eksik. Önbellek: ${JSON.stringify(prematchOddsCache.summary())}`
        );

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

function sinyalTuruBelirle(mac, dinoYuzde) {
    const dakika = Number(mac?.dakika);
    if (!Number.isFinite(dakika)) return null;

    if (
        dinoYuzde >= SIGNAL_RULES.strong.minProbability &&
        dakika >= SIGNAL_RULES.strong.minMinute &&
        dakika <= SIGNAL_RULES.strong.maxMinute
    ) {
        return 'strong';
    }

    if (
        dinoYuzde >= SIGNAL_RULES.surprise.minProbability &&
        dinoYuzde < SIGNAL_RULES.surprise.maxProbabilityExclusive &&
        dakika >= SIGNAL_RULES.surprise.minMinute &&
        dakika <= SIGNAL_RULES.surprise.maxMinute
    ) {
        return 'surprise';
    }

    if (
        dinoYuzde >= SIGNAL_RULES.shadow.minProbability &&
        dinoYuzde < SIGNAL_RULES.shadow.maxProbabilityExclusive &&
        dakika > SIGNAL_RULES.shadow.minMinuteExclusive &&
        dakika <= SIGNAL_RULES.shadow.maxMinute
    ) {
        return 'shadow';
    }

    return null;
}


function firsatAdayiDahaIyiMi(yeniAday, mevcutAday) {
    if (!mevcutAday) return true;

    const yeniSelector = Number(yeniAday?.selector_yuzde);
    const mevcutSelector = Number(mevcutAday?.selector_yuzde);
    if (Number.isFinite(yeniSelector) && Number.isFinite(mevcutSelector)) {
        if (yeniSelector !== mevcutSelector) return yeniSelector > mevcutSelector;
    } else if (Number.isFinite(yeniSelector)) {
        return true;
    }

    const yeniOlasilik = Number(yeniAday?.dino_yuzde);
    const mevcutOlasilik = Number(mevcutAday?.dino_yuzde);
    if (yeniOlasilik !== mevcutOlasilik) {
        return yeniOlasilik > mevcutOlasilik;
    }

    return Number(yeniAday?.edge) > Number(mevcutAday?.edge);
}


function toplamGolMarketiSkoraGoreSonuclanmisMi(market, skor) {
    const marketMatch = String(market || '').match(
        /^(\d+(?:\.\d+)?)_(ALT|UST)$/
    );
    const scoreMatch = String(skor || '').match(/^(\d+)\s*-\s*(\d+)$/);
    if (!marketMatch || !scoreMatch) return false;

    const line = Number(marketMatch[1]);
    const totalGoals = Number(scoreMatch[1]) + Number(scoreMatch[2]);
    return Number.isFinite(line) && Number.isFinite(totalGoals) && totalGoals > line;
}


function adayDenetimKaydiOlustur({
    scanId,
    capturedAt,
    mac,
    dino,
    market,
    oddsData,
    piyasaOrani,
    dinoYuzde,
    piyasaYuzde,
    edge,
    sinyalTuru,
    liveOnlyDino,
    selectorScore,
    selectorPolicy
}) {
    const liveOnlyProbability = Number(liveOnlyDino?.[market]);
    const prematchSupport = prematchMarketDestegi(mac, market);
    return {
        recordId: `${scanId}-${Number(mac.fixture_id)}-${market}`,
        scanId,
        capturedAt,
        fixtureId: Number(mac.fixture_id),
        match: mac.mac_isim,
        league: mac.lig,
        minute: Number(mac.dakika),
        score: mac.skor,
        statusShort: mac.status_short || null,
        market,
        signalClass: sinyalTuru,
        dinoProbability: dinoYuzde,
        odds: piyasaOrani,
        marketProbability: Number.isFinite(piyasaYuzde)
            ? Number(piyasaYuzde.toFixed(1))
            : null,
        edge: Number.isFinite(edge)
            ? Number(edge.toFixed(1))
            : null,
        bookmaker: oddsData && typeof oddsData === 'object'
            ? oddsData.bookmaker
            : 'Bilinmiyor',
        modelVariant: dino?.MODEL_VARYANTI || 'live_only',
        liveOnlyProbability: Number.isFinite(liveOnlyProbability)
            ? liveOnlyProbability
            : null,
        prematchProbabilityDelta: Number.isFinite(liveOnlyProbability)
            ? Number((dinoYuzde - liveOnlyProbability).toFixed(1))
            : null,
        prematchAvailable: mac?.prematch_available === true,
        prematchSource: mac?.prematch_source || null,
        prematchProbabilities: mac?.prematch_available
            ? {
                home: Number(mac.prematch_p_home),
                draw: Number(mac.prematch_p_draw),
                away: Number(mac.prematch_p_away)
            }
            : null,
        prematchMarketSupport: Number.isFinite(prematchSupport)
            ? Number(prematchSupport.toFixed(1))
            : null,
        prematchMarketSource: prematchMarketKaynagi(mac, market),
        statsSource: mac.stats_source || null,
        statsComplete: temelStatsTam(mac),
        liveStats: paylasilanCanliStatsAnlikGoruntusu(mac),
        minimumEdgeAtEvaluation: Number(state.globalMinEdge),
        minimumOddAtEvaluation: DINO_V2_SELECTOR_ENABLED
            ? DINO_V2_MIN_ODD
            : MIN_SIGNAL_ODD,
        minimumSignalMinuteAtEvaluation: TELEGRAM_MIN_MINUTE,
        selectorV2Enabled: DINO_V2_SELECTOR_ENABLED,
        selectorV2Probability: Number.isFinite(Number(selectorScore?.selectorProbability))
            ? Number(Number(selectorScore.selectorProbability).toFixed(1))
            : null,
        selectorV2RawProbability: Number.isFinite(Number(selectorScore?.selectorRawProbability))
            ? Number(Number(selectorScore.selectorRawProbability).toFixed(1))
            : null,
        selectorV2Threshold: Number(dinoSelectorV2.MODEL.policy.threshold * 100),
        selectorV2MinimumOdd: DINO_V2_MIN_ODD,
        selectorV2Eligible: selectorPolicy?.eligible === true,
        selectorV2Reasons: Array.isArray(selectorPolicy?.reasons)
            ? selectorPolicy.reasons
            : [],
        decision: 'evaluating',
        decisionDetail: null
    };
}


const MODEL_MARKET_PATTERN = /^(MS1|X|MS2|[0-4]\.5_(ALT|UST))$/;


function selectorV2OnAdayMi(mac, dino, liveOnlyDino) {
    if (!DINO_V2_SELECTOR_ENABLED) return true;
    const marketNames = [...new Set([
        ...Object.keys(mac?.canli_oranlar || {}),
        ...Object.keys(dino || {}).filter(key => MODEL_MARKET_PATTERN.test(key))
    ])];
    const fullyVerifiedPlaceholder = {
        validation: { fullyVerified: true }
    };
    return marketNames.some(market => {
        const score = dinoSelectorV2.scoreMarket(
            mac,
            market,
            dino,
            liveOnlyDino,
            null
        );
        return dinoSelectorV2.policyCheck(
            mac,
            score,
            fullyVerifiedPlaceholder,
            DINO_V2_MIN_ODD
        ).eligible;
    });
}


function valueAnalizleriYap(mac, dino, { scanId, capturedAt, liveOnlyDino } = {}) {
    const secilenler = { surprise: null, strong: null };
    const auditRecords = [];
    const minimumEdge = Number(state.globalMinEdge);
    const liveOdds = mac.canli_oranlar || {};
    const marketNames = [...new Set([
        ...Object.keys(liveOdds),
        ...Object.keys(dino || {}).filter(key => MODEL_MARKET_PATTERN.test(key))
    ])];
    const activeScanId = scanId || `scan-${Date.now()}`;
    const activeCapturedAt = capturedAt || new Date().toISOString();
    const selectorShadowContext = mac?._selectorShadowContext || null;

    for (const market of marketNames) {
        const oddsData = liveOdds[market];
        const piyasaOrani = oddsData && typeof oddsData === 'object'
            ? Number(oddsData.oran)
            : Number(oddsData);
        const dinoYuzde = Number(dino[market]);
        if (!Number.isFinite(dinoYuzde)) continue;

        const usableOdd = Number.isFinite(piyasaOrani) && piyasaOrani > 1;
        const piyasaYuzde = usableOdd ? (1 / piyasaOrani) * 100 : null;
        const edge = usableOdd ? dinoYuzde - piyasaYuzde : null;
        const legacySinyalTuru = sinyalTuruBelirle(mac, dinoYuzde);
        const selectorScore = DINO_V2_SELECTOR_ENABLED
            ? dinoSelectorV2.scoreMarket(
                mac,
                market,
                dino,
                liveOnlyDino,
                selectorShadowContext
            )
            : null;
        const selectorPolicy = DINO_V2_SELECTOR_ENABLED
            ? dinoSelectorV2.policyCheck(
                mac,
                selectorScore,
                selectorShadowContext,
                DINO_V2_MIN_ODD
            )
            : null;
        const sinyalTuru = DINO_V2_SELECTOR_ENABLED
            ? (selectorPolicy?.eligible ? 'strong' : null)
            : legacySinyalTuru;
        const turEtiketi = DINO_V2_SELECTOR_ENABLED
            ? (selectorPolicy?.eligible ? 'V16 UYGUN' : 'V16 RED')
            : sinyalTuru === 'strong'
                ? 'GÜÇLÜ'
                : sinyalTuru === 'surprise'
                    ? 'SÜRPRİZ'
                    : sinyalTuru === 'shadow'
                        ? 'GÖLGE'
                        : 'SINIF DIŞI';

        const auditRecord = adayDenetimKaydiOlustur({
            scanId: activeScanId,
            capturedAt: activeCapturedAt,
            mac,
            dino,
            market,
            oddsData,
            piyasaOrani: usableOdd ? piyasaOrani : null,
            dinoYuzde,
            piyasaYuzde,
            edge,
            sinyalTuru,
            liveOnlyDino,
            selectorScore,
            selectorPolicy
        });
        auditRecords.push(auditRecord);

        if (!usableOdd) {
            auditRecord.decision = 'live_odds_missing';
            auditRecord.decisionDetail = 'Model tahmini var fakat bu market için kullanılabilir canlı oran yok.';
            continue;
        }

        const scoreOnlyRedNedeni = scoreOnlyGuvenlikNedeni(
            mac,
            dino,
            market,
            dinoYuzde,
            piyasaOrani,
            edge
        );
        addSystemLog(
            `> 🧪 ${mac.mac_isim} | ${market} | Dino:%${dinoYuzde} | V2:${Number.isFinite(Number(selectorScore?.selectorProbability)) ? `%${Number(selectorScore.selectorProbability).toFixed(1)}` : '-'} | Oran:${piyasaOrani} | Piyasa:%${piyasaYuzde.toFixed(1)} | EDGE:${edge.toFixed(1)} | ${turEtiketi}`
        );

        if (toplamGolMarketiSkoraGoreSonuclanmisMi(market, mac.skor)) {
            auditRecord.decision = 'market_already_decided';
            auditRecord.decisionDetail = `Mevcut skor ${mac.skor}, ${market} çizgisini zaten sonuçlandırdı.`;
            continue;
        }

        if (scoreOnlyRedNedeni) {
            auditRecord.decision = 'fallback_security';
            auditRecord.decisionDetail = scoreOnlyRedNedeni;
            continue;
        }

        if (DINO_V2_SELECTOR_ENABLED && !selectorPolicy?.eligible) {
            auditRecord.decision = 'selector_v2_rejected';
            auditRecord.decisionDetail = `V16 ikinci katman reddetti: ${(selectorPolicy?.reasons || []).join(', ') || 'puan üretilemedi'}.`;
            continue;
        }

        if (
            !DINO_V2_SELECTOR_ENABLED &&
            !sinyalTuru &&
            dinoYuzde >= SIGNAL_RULES.surprise.minProbability &&
            Number(mac?.dakika) < TELEGRAM_MIN_MINUTE
        ) {
            auditRecord.decision = 'signal_minute_waiting';
            auditRecord.decisionDetail = `Dino sınıfı uygun fakat Telegram kapısı ${TELEGRAM_MIN_MINUTE}. dakikada açılır.`;
            continue;
        }

        if (!DINO_V2_SELECTOR_ENABLED && !sinyalTuru) {
            auditRecord.decision = 'class_outside';
            auditRecord.decisionDetail = 'Dino ihtimali ve dakika, gölge/sürpriz/güçlü sınıfına uymadı.';
            continue;
        }

        const activeMinimumOdd = DINO_V2_SELECTOR_ENABLED
            ? DINO_V2_MIN_ODD
            : MIN_SIGNAL_ODD;
        if (piyasaOrani < activeMinimumOdd) {
            auditRecord.decision = 'odds_below_minimum';
            auditRecord.decisionDetail = `Canlı oran ${piyasaOrani}, minimum ${activeMinimumOdd.toFixed(2)} altında.`;
            continue;
        }

        if (!DINO_V2_SELECTOR_ENABLED && edge < minimumEdge) {
            auditRecord.decision = 'edge_below_minimum';
            auditRecord.decisionDetail = `EDGE %${edge.toFixed(1)}, minimum %${minimumEdge} altında.`;
            continue;
        }

        if (!DINO_V2_SELECTOR_ENABLED && sinyalTuru === 'shadow') {
            auditRecord.decision = 'shadow_probability';
            auditRecord.decisionDetail = 'Dino %60–69.9: Telegram dışı gölge sinyal olarak kaydedildi.';
            continue;
        }

        if (
            PRECISION_MODE.requirePrematchOneXTwo &&
            dino?.MODEL_VARYANTI !== 'live_plus_prematch'
        ) {
            auditRecord.decision = 'prematch_missing';
            auditRecord.decisionDetail = 'Precision modunda pre-match 1X2 zorunlu; maç live_only kaldı.';
            continue;
        }

        const totalMarket = /_(ALT|UST)$/.test(market);
        if (totalMarket && PRECISION_MODE.requireExactPrematchTotal) {
            const prematchSupport = prematchMarketDestegi(mac, market);
            if (!Number.isFinite(prematchSupport)) {
                auditRecord.decision = 'prematch_total_missing';
                auditRecord.decisionDetail = `${market} çizgisi için pre-match ÜST/ALT desteği bulunamadı.`;
                continue;
            }
            if (prematchSupport < PRECISION_MODE.minPrematchTotalSupport) {
                auditRecord.decision = 'prematch_total_conflict';
                auditRecord.decisionDetail = `Pre-match ${market} desteği %${prematchSupport.toFixed(1)}, gereken %${PRECISION_MODE.minPrematchTotalSupport} altında.`;
                continue;
            }
        }

        auditRecord.decision = 'eligible_not_selected';
        auditRecord.decisionDetail = DINO_V2_SELECTOR_ENABLED
            ? 'V16 ikinci katmanı ve bütün doğrulama kapılarını geçti; maç içi en iyi market seçimi bekleniyor.'
            : 'Bütün temel filtreleri geçti; sınıf içi seçim bekliyor.';

        const aday = {
            market,
            sinyal_turu: sinyalTuru,
            edge: edge.toFixed(1),
            dino_yuzde: dinoYuzde,
            oran: piyasaOrani,
            piyasa_yuzde: piyasaYuzde.toFixed(1),
            bookmaker: typeof oddsData === 'object' ? oddsData.bookmaker : 'Bilinmiyor',
            model_varyanti: dino?.MODEL_VARYANTI || 'live_only',
            live_only_yuzde: Number.isFinite(Number(liveOnlyDino?.[market]))
                ? Number(liveOnlyDino[market])
                : null,
            prematch_destek_yuzde: Number.isFinite(prematchMarketDestegi(mac, market))
                ? Number(prematchMarketDestegi(mac, market).toFixed(1))
                : null,
            prematch_kaynak: prematchMarketKaynagi(mac, market),
            selector_yuzde: Number.isFinite(Number(selectorScore?.selectorProbability))
                ? Number(selectorScore.selectorProbability.toFixed(1))
                : null,
            selector_raw_yuzde: Number.isFinite(Number(selectorScore?.selectorRawProbability))
                ? Number(selectorScore.selectorRawProbability.toFixed(1))
                : null,
            selector_model_surumu: dinoSelectorV2.MODEL.version,
            auditRecord
        };

        if (firsatAdayiDahaIyiMi(aday, secilenler[sinyalTuru])) {
            secilenler[sinyalTuru] = aday;
        }
    }

    for (const selected of Object.values(secilenler).filter(Boolean)) {
        selected.auditRecord.decision = 'selected_for_class';
        selected.auditRecord.decisionDetail = DINO_V2_SELECTOR_ENABLED
            ? 'V16 ikinci katmanda gerçekleşme olasılığı en yüksek doğrulanmış market.'
            : 'Sınıfındaki en yüksek Dino ihtimalli uygun market.';
    }

    return {
        selections: [secilenler.strong, secilenler.surprise].filter(Boolean),
        auditRecords
    };
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
        const prematchDescription = mac?.prematch_available
            ? `Kaynak: ${mac.prematch_source}\nEv: %${(Number(mac.prematch_p_home) * 100).toFixed(1)} | Beraberlik: %${(Number(mac.prematch_p_draw) * 100).toFixed(1)} | Deplasman: %${(Number(mac.prematch_p_away) * 100).toFixed(1)}\nSeçilen market pre-match desteği: ${Number.isFinite(Number(firsat?.prematch_destek_yuzde)) ? `%${firsat.prematch_destek_yuzde}` : 'Bu çizgide veri yok'}`
            : 'Pre-match veri yok.';


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

Pre-match piyasa verisi:
${prematchDescription}

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

${analysisRule} Pre-match yüzdeleri mevcutsa takım gücü bağlamı olarak kullan; bunları canlı istatistik diye sunma.

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


function paylasilanCanliStatsAnlikGoruntusu(mac) {
    return {
        home: {
            shots: mac?.home_shot ?? null,
            shotsOnGoal: mac?.home_sot ?? null,
            corners: mac?.home_corner ?? null,
            possession: mac?.home_possession ?? null,
            yellowCards: mac?.home_yellow ?? null,
            redCards: mac?.home_red ?? null,
            fouls: mac?.home_fouls ?? null,
            offsides: mac?.home_offsides ?? null,
            saves: mac?.home_saves ?? null,
            xg: mac?.home_xg ?? null
        },
        away: {
            shots: mac?.away_shot ?? null,
            shotsOnGoal: mac?.away_sot ?? null,
            corners: mac?.away_corner ?? null,
            possession: mac?.away_possession ?? null,
            yellowCards: mac?.away_yellow ?? null,
            redCards: mac?.away_red ?? null,
            fouls: mac?.away_fouls ?? null,
            offsides: mac?.away_offsides ?? null,
            saves: mac?.away_saves ?? null,
            xg: mac?.away_xg ?? null
        }
    };
}


function paylasilanSinyaliKaydet(mac, firsat, yorum, telegramMesaji) {
    try {
        const kayit = signalTracker.recordSent({
            fixtureId: mac?.fixture_id,
            signalType: firsat?.sinyal_turu,
            sentAt: new Date().toISOString(),
            telegramMessageId: telegramMesaji?.message_id ?? null,
            match: mac?.mac_isim,
            league: mac?.lig,
            minute: mac?.dakika,
            score: mac?.skor,
            market: firsat?.market,
            dinoProbability: firsat?.dino_yuzde,
            edge: firsat?.edge,
            odds: firsat?.oran,
            bookmaker: firsat?.bookmaker,
            marketProbability: firsat?.piyasa_yuzde,
            modelVariant: firsat?.model_varyanti,
            liveOnlyProbability: firsat?.live_only_yuzde,
            selectorV2Probability: firsat?.selector_yuzde,
            selectorV2RawProbability: firsat?.selector_raw_yuzde,
            selectorV2ModelVersion: firsat?.selector_model_surumu,
            prematchSource: mac?.prematch_source,
            prematchProbabilities: mac?.prematch_available
                ? {
                    home: mac.prematch_p_home,
                    draw: mac.prematch_p_draw,
                    away: mac.prematch_p_away
                }
                : null,
            prematchMarketSupport: firsat?.prematch_destek_yuzde,
            prematchMarketSource: firsat?.prematch_kaynak,
            statsSource: mac?.stats_source,
            statsValidation: mac?.stats_validation || null,
            liveStats: paylasilanCanliStatsAnlikGoruntusu(mac),
            analysis: yorum
        });

        addSystemLog(
            `> 🗃️ Paylaşılan sinyal kaydedildi: ${kayit.match} | ${kayit.signalType === 'strong' ? 'GÜÇLÜ' : 'SÜRPRİZ'} | ${kayit.market}`
        );
    } catch (error) {
        // Telegram gönderilmiş olsa bile takip dosyası hatası aynı mesajın
        // yeniden atılmasına sebep olmamalı; gönderim kilidi ayrı tutulur.
        addSystemLog(
            `> ⚠️ Paylaşılan sinyal takip dosyasına yazılamadı: ${error.message}`
        );
    }
}


async function sinyalOncesiCanlilikDogrula(mac) {
    try {
        const response = await apiGet(
            `/fixtures?id=${Number(mac.fixture_id)}`
        );
        const latest = Array.isArray(response.data?.response)
            ? response.data.response[0]
            : null;

        if (
            !latest ||
            !canliFixtureUygunMu(
                latest,
                TELEGRAM_MIN_MINUTE,
                TELEGRAM_MAX_MINUTE
            )
        ) {
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

    if (!telegramMacHalaUygunMu(mac)) {
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

    const gucluSinyal = firsat?.sinyal_turu === 'strong';
    const sinyalBasligi = DINO_V2_SELECTOR_ENABLED
        ? '🧬 DİNO V16 DOĞRULANMIŞ SİNYAL'
        : gucluSinyal
        ? '🟢 DİNO GÜÇLÜ SİNYAL'
        : '🟡 DİNO SÜRPRİZ SİNYAL';
    const sinyalAciklamasi = DINO_V2_SELECTOR_ENABLED
        ? 'İkinci katman doğruluk sinyali'
        : gucluSinyal
        ? 'Doğruluk öncelikli güçlü sinyal'
        : 'Risk almak isteyenler için sürpriz sinyal';
    const modelEtiketi = DINO_V2_SELECTOR_ENABLED
        ? 'Dino + piyasa + pre-match + canlı tempo ikinci katmanı'
        : firsat?.model_varyanti === 'live_plus_prematch'
        ? 'Canlı istatistik + pre-match modeli'
        : 'Canlı istatistik modeli';
    const prematchSatiri = mac?.prematch_available
        ? `\n🧭 <b>Pre-Match:</b> ${telegramHtml(mac.prematch_source)} | 1:%${telegramHtml((Number(mac.prematch_p_home) * 100).toFixed(1))} X:%${telegramHtml((Number(mac.prematch_p_draw) * 100).toFixed(1))} 2:%${telegramHtml((Number(mac.prematch_p_away) * 100).toFixed(1))}`
        : '';
    const prematchMarketSatiri = Number.isFinite(Number(firsat?.prematch_destek_yuzde))
        ? `\n🧩 <b>Pre-Match Market Desteği:</b> %${telegramHtml(firsat.prematch_destek_yuzde)}`
        : '';
    const liveOnlySatiri = Number.isFinite(Number(firsat?.live_only_yuzde))
        ? `\n🔬 <b>Live-Only Karşılığı:</b> %${telegramHtml(firsat.live_only_yuzde)}`
        : '';
    const statsDogrulamaSatiri = mac?.stats_validation?.status === 'passed'
        ? '\n🛡️ <b>Taze Veri:</b> Skor + canlı stats + oran doğrulandı'
        : '';


    const mesaj =

`<b>${sinyalBasligi}</b>
--------------------------------------
⚽️ <b>Maç:</b> ${telegramHtml(mac.mac_isim)}
🏆 <b>Lig:</b> ${telegramHtml(mac.lig)}
⏱ <b>Dakika:</b> ${telegramHtml(mac.dakika)} | <b>Skor:</b> ${telegramHtml(mac.skor)}

🏷️ <b>Sinyal Sınıfı:</b> ${telegramHtml(sinyalAciklamasi)}

🎯 <b>Value Market:</b> ${telegramHtml(firsat.market)}
💵 <b>Canlı Oran:</b> ${telegramHtml(firsat.oran)}
🏦 <b>Kaynak:</b> ${telegramHtml(firsat.bookmaker)}
🧬 <b>V16 Gerçekleşme Puanı:</b> %${telegramHtml(firsat.selector_yuzde ?? '-')}
🦖 <b>Dino İhtimali:</b> %${telegramHtml(firsat.dino_yuzde)}
📊 <b>Piyasa İhtimali:</b> %${telegramHtml(firsat.piyasa_yuzde)}
🧠 <b>Model:</b> ${telegramHtml(modelEtiketi)}${prematchSatiri}${prematchMarketSatiri}${liveOnlySatiri}${statsDogrulamaSatiri}

📌 <b>Canlı İstatistikler</b>
🏠 ${telegramHtml(statGoster(mac.home_shot))} Şut | ${telegramHtml(statGoster(mac.home_sot))} İsabet | ${telegramHtml(statGoster(mac.home_corner))} Korner
✈️ ${telegramHtml(statGoster(mac.away_shot))} Şut | ${telegramHtml(statGoster(mac.away_sot))} İsabet | ${telegramHtml(statGoster(mac.away_corner))} Korner${ekCanliStats ? `\n${ekCanliStats}` : ''}

📝 <b>Dino Analiz:</b>
<i>${telegramHtml(yorum)}</i>

--------------------------------------`;


    try {

        const telegramMesaji = await bot.sendMessage(
            kanalID,
            mesaj,
            {
                parse_mode:
                    'HTML'
            }
        );


        // Yalnızca Telegram gönderimi gerçekten başarılı olduktan sonra kilitle.
        // Başarısız gönderimler sonraki taramada yeniden denenebilir.
        fixtureGonderildiKaydet(
            mac,
            firsat
        );

        // İstatistik dosyasına yalnızca Telegram API'si başarı döndürdükten
        // sonra yaz. Böylece taranan fakat paylaşılmayan maçlar asla girmez.
        paylasilanSinyaliKaydet(
            mac,
            firsat,
            yorum,
            telegramMesaji
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
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const scanCapturedAt = new Date().toISOString();
    const candidateAuditRows = [];

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

        // Python aynı süreçte pre-match'li kararı ve live_only A/B gölge
        // sonucunu birlikte döndürür; dizi hizası tek çağrıyla korunur.
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

        // V16 önce ikinci katmanın puan eşiğini geçebilecek maçları ucuz bir
        // ön kontrolden geçirir. Standing/takım/prediction çağrıları yalnız bu
        // kısa liste için yapılır; tam doğrulanmayan maç Telegram'a kapalıdır.
        let selectorShadowContexts = new Map();
        if (DINO_V2_SELECTOR_ENABLED) {
            const selectorOnAdaylari = macListesi.filter((mac, index) => {
                const dino = dinoSonuclari[index];
                if (!dino || dino.HATA) return false;
                const liveOnlyDino = dino?.LIVE_ONLY || (
                    dino?.MODEL_VARYANTI === 'live_only' ? dino : null
                );
                return selectorV2OnAdayMi(mac, dino, liveOnlyDino);
            });
            addSystemLog(
                `> 🧠 V16 ön seçim: ${macListesi.length} tam-stat maçtan ${selectorOnAdaylari.length} tanesi güç doğrulamasına aday.`
            );
            selectorShadowContexts = await golgeGucBaglamlariniTopla(selectorOnAdaylari);
            for (const mac of macListesi) {
                mac._selectorShadowContext =
                    selectorShadowContexts.get(Number(mac.fixture_id)) || null;
            }
        }

        let onaylanan = 0;
        for (let i = 0; i < macListesi.length; i++) {
            const mac = macListesi[i];
            const dino = dinoSonuclari[i];
            const liveOnlyDino = dino?.LIVE_ONLY || (
                dino?.MODEL_VARYANTI === 'live_only' ? dino : null
            );

            if (!dino || dino.HATA || Object.keys(dino).length === 0) {
                addSystemLog(
                    `> ⚠️ ${mac.mac_isim}: model sonucu geçersiz${dino?.HATA ? ` (${dino.HATA})` : ''}.`
                );
                candidateAuditRows.push({
                    recordId: `${scanId}-${Number(mac.fixture_id)}-MODEL`,
                    scanId,
                    capturedAt: scanCapturedAt,
                    fixtureId: Number(mac.fixture_id),
                    match: mac.mac_isim,
                    league: mac.lig,
                    minute: Number(mac.dakika),
                    score: mac.skor,
                    market: null,
                    signalClass: null,
                    statsSource: mac.stats_source || null,
                    statsComplete: temelStatsTam(mac),
                    liveStats: paylasilanCanliStatsAnlikGoruntusu(mac),
                    modelVariant: dino?.MODEL_VARYANTI || null,
                    liveOnlyProbability: null,
                    prematchAvailable: mac?.prematch_available === true,
                    prematchSource: mac?.prematch_source || null,
                    minimumEdgeAtEvaluation: Number(state.globalMinEdge),
                    minimumOddAtEvaluation: MIN_SIGNAL_ODD,
                    decision: 'model_error',
                    decisionDetail: dino?.HATA || 'Model sonucu boş veya geçersiz.'
                });
                continue;
            }

            addSystemLog(
                `> 🩺 ML (${mac.mac_isim}) | Varyant: ${dino.MODEL_VARYANTI || 'live_only'} | ${JSON.stringify(dino)}`
            );

            const degerlendirme = valueAnalizleriYap(
                mac,
                dino,
                {
                    scanId,
                    capturedAt: scanCapturedAt,
                    liveOnlyDino
                }
            );
            candidateAuditRows.push(...degerlendirme.auditRecords);
            const firsatlar = degerlendirme.selections;
            if (!Array.isArray(firsatlar) || firsatlar.length === 0) {
                addSystemLog(
                    `> ❌ ${mac.mac_isim} pas geçildi (olasılık sınıfı, EDGE veya güvenlik filtresini geçemedi).`
                );
                continue;
            }

            if (dino.MODEL_VARYANTI === 'score_only') {
                for (const firsat of firsatlar) {
                    firsat.auditRecord.decision = 'score_only_blocked';
                    firsat.auditRecord.decisionDetail = 'Canlı tarama hattı score_only modelini kabul etmez.';
                }
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: Python beklenmedik şekilde score_only döndürdü; sinyal engellendi.`
                );
                continue;
            }

            const ilkGonderilecekFirsatlar = [];

            for (const firsat of firsatlar) {
                const oncekiGonderim = fixtureGonderimKaydi(
                    mac,
                    firsat.sinyal_turu
                );

                if (oncekiGonderim) {
                    firsat.auditRecord.decision = 'already_sent';
                    firsat.auditRecord.decisionDetail = 'Bu fixture ve sinyal sınıfı daha önce Telegram\'a gönderildi.';
                    const sentAt = Number(oncekiGonderim.sentAt);
                    const oncekiSaat = Number.isFinite(sentAt)
                        ? new Date(sentAt).toLocaleString(
                            'tr-TR',
                            { timeZone: 'Europe/Istanbul' }
                        )
                        : 'geçmiş kayıt';
                    const turEtiketi = firsat.sinyal_turu === 'strong'
                        ? 'GÜÇLÜ'
                        : 'SÜRPRİZ';
                    addSystemLog(
                        `> 🔁 ${mac.mac_isim} [fixture:${mac.fixture_id}]: ${turEtiketi} hakkı daha önce kullanıldı (${oncekiSaat}); aynı tür tekrar engellendi.`
                    );
                    continue;
                }

                firsat.auditRecord.decision = 'fresh_recheck_pending';
                firsat.auditRecord.decisionDetail = 'Telegram öncesi taze skor, canlı stats ve oran doğrulaması bekleniyor.';
                ilkGonderilecekFirsatlar.push(firsat);
            }

            if (ilkGonderilecekFirsatlar.length === 0) continue;

            // İlk model seçimi yalnızca taze doğrulamayı tetikler. Telegram'a
            // gitmeden önce fixture, /fixtures/statistics ve /odds/live?fixture
            // yeniden çekilir. Python tek maç için bu taze veriyle tekrar koşar.
            const freshValidation = await sinyalOncesiVerileriYenileVeDogrula(mac);
            if (!freshValidation.ok) {
                for (const firsat of ilkGonderilecekFirsatlar) {
                    firsat.auditRecord.decision = 'fresh_stats_validation_failed';
                    firsat.auditRecord.decisionDetail = freshValidation.reason || 'Taze canlı veri doğrulanamadı.';
                    firsat.auditRecord.statsValidation = {
                        status: 'failed',
                        verifiedAt: freshValidation.verifiedAt || new Date().toISOString(),
                        reasons: freshValidation.reasons || [freshValidation.reason || 'bilinmeyen neden']
                    };
                }
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: sinyal öncesi taze veri reddedildi (${freshValidation.reason || 'bilinmeyen neden'}).`
                );
                continue;
            }

            for (const firsat of ilkGonderilecekFirsatlar) {
                firsat.auditRecord.decision = 'fresh_recheck_superseded';
                firsat.auditRecord.decisionDetail = 'İlk seçim taze veriyle yeniden modelleme yapılacağı için gönderilmedi.';
                firsat.auditRecord.statsValidation = freshValidation.validation;
            }

            const freshModelResults = await yapayZekaAnaliziYap([mac]);
            const freshDino = Array.isArray(freshModelResults)
                ? freshModelResults[0]
                : null;
            if (!freshDino || freshDino.HATA || Object.keys(freshDino).length === 0) {
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: taze veriyle Python sonucu alınamadı${freshDino?.HATA ? ` (${freshDino.HATA})` : ''}.`
                );
                continue;
            }

            if (freshDino.MODEL_VARYANTI === 'score_only') {
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: taze doğrulamada score_only döndü; sinyal engellendi.`
                );
                continue;
            }

            const freshLiveOnlyDino = freshDino?.LIVE_ONLY || (
                freshDino?.MODEL_VARYANTI === 'live_only' ? freshDino : null
            );
            const freshScanId = `${scanId}-verified-${Number(mac.fixture_id)}`;
            const freshEvaluation = valueAnalizleriYap(
                mac,
                freshDino,
                {
                    scanId: freshScanId,
                    capturedAt: freshValidation.verifiedAt || new Date().toISOString(),
                    liveOnlyDino: freshLiveOnlyDino
                }
            );
            for (const record of freshEvaluation.auditRecords) {
                record.statsValidation = freshValidation.validation;
            }
            candidateAuditRows.push(...freshEvaluation.auditRecords);

            const gonderilecekFirsatlar = [];
            for (const firsat of freshEvaluation.selections || []) {
                const oncekiGonderim = fixtureGonderimKaydi(
                    mac,
                    firsat.sinyal_turu
                );
                if (oncekiGonderim) {
                    firsat.auditRecord.decision = 'already_sent';
                    firsat.auditRecord.decisionDetail = 'Taze doğrulama sonrası bu fixture ve sinyal sınıfının hakkı daha önce kullanılmış.';
                    continue;
                }
                firsat.auditRecord.decision = 'telegram_candidate';
                firsat.auditRecord.decisionDetail = 'Taze skor, stats, oran ve ikinci Python değerlendirmesini geçti.';
                gonderilecekFirsatlar.push(firsat);
            }

            if (gonderilecekFirsatlar.length === 0) {
                addSystemLog(
                    `> 🛡️ ${mac.mac_isim}: taze doğrulama sonrası uygun market kalmadı; Telegram sinyali yok.`
                );
                continue;
            }

            for (const firsat of gonderilecekFirsatlar) {
                const turEtiketi = firsat.sinyal_turu === 'strong'
                    ? 'GÜÇLÜ'
                    : 'SÜRPRİZ';
                addSystemLog(
                    `> 🚨 TAZE ML VALUE: ${mac.mac_isim} | ${firsat.market} | +${DINO_V2_SELECTOR_ENABLED ? firsat.selector_yuzde : firsat.edge}% | ${DINO_V2_SELECTOR_ENABLED ? 'V16' : turEtiketi}`
                );
            }

            // Aynı maçta güçlü ve sürpriz market aynı taramada çıkabilir.
            // Gemini yalnızca taze doğrulamadan geçen son marketleri açıklar.
            const yorumlar = await Promise.all(
                gonderilecekFirsatlar.map(
                    firsat => geminiYorumuYaz(mac, firsat)
                )
            );

            // İki sinyal de aynı veri anına ait olduğundan canlılık/skor bir kez
            // doğrulanır ve ardından bekleme süresi olmadan arka arkaya gönderilir.
            if (!await sinyalOncesiCanlilikDogrula(mac)) {
                for (const firsat of gonderilecekFirsatlar) {
                    firsat.auditRecord.decision = 'live_revalidation_failed';
                    firsat.auditRecord.decisionDetail = 'Telegram öncesi dakika/skor/canlılık kontrolü başarısız.';
                }
                continue;
            }

            for (let firsatIndex = 0; firsatIndex < gonderilecekFirsatlar.length; firsatIndex++) {
                const firsat = gonderilecekFirsatlar[firsatIndex];
                const yorum = yorumlar[firsatIndex];
                const gonderildi = await telegramSinyaliGonder(mac, firsat, yorum);

                if (gonderildi) {
                    firsat.auditRecord.decision = 'sent';
                    firsat.auditRecord.decisionDetail = 'Telegram API gönderimi başarılı ve sinyal geçmişine kaydedildi.';
                    onaylanan++;
                    const turEtiketi = firsat.sinyal_turu === 'strong'
                        ? 'GÜÇLÜ'
                        : 'SÜRPRİZ';
                    addSystemLog(
                        `> ✅ ${turEtiketi} ML SİNYALİ GÖNDERİLDİ: ${mac.mac_isim} | ${firsat.market}`
                    );
                } else {
                    firsat.auditRecord.decision = 'telegram_failed';
                    firsat.auditRecord.decisionDetail = 'Telegram gönderimi başarısız.';
                }
            }
        }

        // V16'da güç bağlamı yukarıda yalnız ön adaylar için toplandı. Burada
        // aynı doğrulanmış bağlam aday ve gönderilmiş sinyal geçmişine eklenir.
        try {
            if (!DINO_V2_SELECTOR_ENABLED) {
                selectorShadowContexts = await golgeGucBaglamlariniTopla(macListesi);
            }
            golgeBaglaminiKayitlaraEkle(candidateAuditRows, selectorShadowContexts);

            for (const [fixtureId, context] of selectorShadowContexts) {
                const assessmentByMarket = {};
                for (const record of candidateAuditRows) {
                    if (
                        Number(record?.fixtureId) === Number(fixtureId) &&
                        record?.market &&
                        !assessmentByMarket[record.market]
                    ) {
                        assessmentByMarket[record.market] =
                            record.shadowAssessment ||
                            buildMarketShadowAssessment(context, record.market);
                    }
                }
                signalTracker.attachShadowContext(
                    fixtureId,
                    context,
                    assessmentByMarket
                );
            }
        } catch (error) {
            // Gölge katmanı çökerse ana sistem ve aday kayıtları çalışmaya
            // devam eder. Bu hata hiçbir seçimin kararını değiştirmez.
            addSystemLog(
                `> ⚠️ Gölge güç testi tamamlanamadı; ana karar etkilenmedi: ${error.message}`
            );
        }

        addSystemLog(`> 🏁 ML taraması bitti. ${onaylanan} maç gönderildi.`);
        if (quotaRemaining !== null) {
            addSystemLog(`> 📦 API kalan günlük istek: ${quotaRemaining}`);
        }

    } catch (error) {
        addSystemLog(`> ❌ ANA TARAMA HATASI: ${error.message}`);
    } finally {
        try {
            const added = candidateTracker.recordBatch(candidateAuditRows);
            if (added > 0) {
                addSystemLog(
                    `> 🧪 Tam-stat aday denetimi: bu taramadan ${added} market anı kalıcı kaydedildi.`
                );
            }
        } catch (error) {
            addSystemLog(`> ⚠️ Aday denetim geçmişi yazılamadı: ${error.message}`);
        }
        isScanning = false;
    }
}

// =========================================================
// ZAMANLAYICI
// =========================================================

function masterClock() {

    if (
        !state.isRunning ||
        !state.autoScanEnabled
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
        10 *
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
// PAYLAŞILAN SİNYAL SONUÇ TAKİBİ
// =========================================================

async function paylasilanSinyalSonuclariniGuncelle({ manuel = false } = {}) {
    if (isSignalResultRefreshing) {
        return {
            success: false,
            busy: true,
            message: 'Sonuç kontrolü zaten çalışıyor.'
        };
    }

    const signalFixtureIDs = signalTracker.unresolvedFixtureIds();
    const candidateFixtureIDs = candidateTracker.unresolvedFixtureIds();
    const fixtureIDs = [...new Set([
        ...signalFixtureIDs,
        ...candidateFixtureIDs
    ])];
    if (fixtureIDs.length === 0) {
        return {
            success: true,
            checkedFixtures: 0,
            resolvedSignals: 0,
            resolvedCandidates: 0,
            message: 'Bekleyen paylaşılan sinyal veya aday kaydı yok.'
        };
    }

    isSignalResultRefreshing = true;
    let checkedFixtures = 0;
    let resolvedSignals = 0;
    let resolvedCandidates = 0;

    try {
        for (
            let index = 0;
            index < fixtureIDs.length;
            index += SIGNAL_RESULT_BATCH_SIZE
        ) {
            const batch = fixtureIDs.slice(
                index,
                index + SIGNAL_RESULT_BATCH_SIZE
            );
            const response = await apiGet(
                `/fixtures?ids=${batch.join('-')}`
            );
            const fixtures = Array.isArray(response.data?.response)
                ? response.data.response
                : [];

            checkedFixtures += batch.length;
            for (const fixture of fixtures) {
                resolvedSignals += signalTracker.settleFixture(fixture);
                resolvedCandidates += candidateTracker.settleFixture(fixture);
            }
        }

        if (resolvedSignals > 0 || resolvedCandidates > 0 || manuel) {
            addSystemLog(
                `> 🧾 Sonuç kontrolü: ${checkedFixtures} maç | ${resolvedSignals} Telegram sinyali | ${resolvedCandidates} aday market sonuçlandı.`
            );
        }

        return {
            success: true,
            checkedFixtures,
            resolvedSignals,
            resolvedCandidates,
            message: resolvedSignals > 0 || resolvedCandidates > 0
                ? `${resolvedSignals} sinyal ve ${resolvedCandidates} aday market sonucu güncellendi.`
                : 'Henüz sonuçlanan yeni sinyal yok.'
        };
    } catch (error) {
        addSystemLog(
            `> ⚠️ Paylaşılan sinyal sonuçları güncellenemedi: ${error.message}`
        );
        return {
            success: false,
            checkedFixtures,
            resolvedSignals,
            resolvedCandidates,
            message: error.message
        };
    } finally {
        isSignalResultRefreshing = false;
    }
}


function csvHucre(value) {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}


const HISTORY_TIME_ZONE = 'Europe/Istanbul';
const HISTORY_DATE_FORMATTER = new Intl.DateTimeFormat(
    'en',
    {
        timeZone: HISTORY_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }
);


function turkiyeTarihAnahtari(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const parts = Object.fromEntries(
        HISTORY_DATE_FORMATTER
            .formatToParts(date)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value])
    );

    if (!parts.year || !parts.month || !parts.day) return null;
    return `${parts.year}-${parts.month}-${parts.day}`;
}


function gecmisTarihFiltresiniDogrula(value) {
    if (value === null || value === undefined || value === '' || value === 'all') {
        return null;
    }

    const text = String(value).trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return undefined;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return undefined;
    }

    return text;
}


function gecmisSeciminiHazirla(req, res, items, timestampField) {
    const date = gecmisTarihFiltresiniDogrula(req.query.date);
    if (date === undefined) {
        res.status(400).json({
            success: false,
            message: 'Tarih YYYY-MM-DD biçiminde olmalıdır.'
        });
        return null;
    }

    const allItems = Array.isArray(items) ? items : [];
    const availableDates = [...new Set(
        allItems
            .map(item => turkiyeTarihAnahtari(item?.[timestampField]))
            .filter(Boolean)
    )].sort((left, right) => right.localeCompare(left));
    const selectedItems = date
        ? allItems.filter(
            item => turkiyeTarihAnahtari(item?.[timestampField]) === date
        )
        : allItems;

    return {
        date,
        items: selectedItems,
        filter: {
            mode: date ? 'date' : 'all',
            date,
            timezone: HISTORY_TIME_ZONE,
            availableDates,
            totalAvailableRecords: allItems.length,
            selectedRecords: selectedItems.length
        }
    };
}


function gecmisDosyaEtiketi(selection) {
    const today = turkiyeTarihAnahtari(new Date()) || new Date().toISOString().slice(0, 10);
    return selection?.date || `tum-veriler-${today}`;
}


const SHADOW_CSV_HEADERS = [
    'shadow_decision_impact', 'shadow_available',
    'shadow_team_stats_complete', 'shadow_standings_complete',
    'shadow_prediction_available', 'shadow_identity_verified',
    'shadow_sample_adequate', 'shadow_fully_verified',
    'shadow_home_venue_played', 'shadow_away_venue_played',
    'shadow_assessment_validation_status',
    'shadow_source_agreements', 'shadow_source_disagreements',
    'shadow_strength_lean',
    'shadow_strength_delta', 'shadow_expected_goals_total',
    'shadow_prediction_market_lean', 'shadow_prediction_home',
    'shadow_prediction_draw', 'shadow_prediction_away',
    'shadow_prediction_under_over', 'shadow_prediction_agrees',
    'shadow_strength_agrees',
    'shadow_home_total_played', 'shadow_home_total_win_rate',
    'shadow_home_home_played', 'shadow_home_home_win_rate',
    'shadow_home_home_goals_for_avg', 'shadow_home_home_goals_against_avg',
    'shadow_away_total_played', 'shadow_away_total_win_rate',
    'shadow_away_away_played', 'shadow_away_away_win_rate',
    'shadow_away_away_goals_for_avg', 'shadow_away_away_goals_against_avg',
    'shadow_home_rank', 'shadow_home_points', 'shadow_home_form',
    'shadow_away_rank', 'shadow_away_points', 'shadow_away_form',
    'shadow_captured_at'
];


function golgeCsvDegerleri(item) {
    const context = item?.shadowContext || {};
    const assessment = item?.shadowAssessment || {};
    const homeStats = context?.teamStats?.home || {};
    const awayStats = context?.teamStats?.away || {};
    const homeStanding = context?.standings?.home || {};
    const awayStanding = context?.standings?.away || {};
    const prediction = context?.prediction || {};

    return [
        context?.decisionImpact ?? false,
        context?.available ?? false,
        context?.coverage?.teamStatsComplete ?? false,
        context?.coverage?.standingsComplete ?? false,
        context?.coverage?.predictionsAvailable ?? false,
        context?.validation?.identityVerified ?? false,
        context?.validation?.sampleAdequate ?? false,
        context?.validation?.fullyVerified ?? false,
        context?.validation?.homeVenuePlayed,
        context?.validation?.awayVenuePlayed,
        assessment?.validationStatus,
        assessment?.sourceAgreements,
        assessment?.sourceDisagreements,
        context?.strength?.lean,
        context?.strength?.delta,
        context?.strength?.expectedGoalsTotal,
        prediction?.marketLean,
        prediction?.percent?.home,
        prediction?.percent?.draw,
        prediction?.percent?.away,
        prediction?.underOver,
        assessment?.predictionAgrees,
        assessment?.strengthAgrees,
        homeStats?.total?.played,
        homeStats?.total?.winRate,
        homeStats?.home?.played,
        homeStats?.home?.winRate,
        homeStats?.home?.goalsForAverage,
        homeStats?.home?.goalsAgainstAverage,
        awayStats?.total?.played,
        awayStats?.total?.winRate,
        awayStats?.away?.played,
        awayStats?.away?.winRate,
        awayStats?.away?.goalsForAverage,
        awayStats?.away?.goalsAgainstAverage,
        homeStanding?.rank,
        homeStanding?.points,
        homeStanding?.form,
        awayStanding?.rank,
        awayStanding?.points,
        awayStanding?.form,
        context?.capturedAt
    ];
}


const STATS_VALIDATION_CSV_HEADERS = [
    'stats_validation_status', 'stats_verified_at',
    'stats_changed_before_recheck', 'score_changed_before_recheck',
    'live_odds_refreshed', 'stats_validation_reasons'
];


function statsDogrulamaCsvDegerleri(item) {
    const validation = item?.statsValidation || {};
    return [
        validation?.status,
        validation?.verifiedAt,
        validation?.statsChangedBeforeRecheck,
        validation?.scoreChangedBeforeRecheck,
        validation?.liveOddsRefreshed,
        Array.isArray(validation?.reasons)
            ? validation.reasons.join(' | ')
            : null
    ];
}


function paylasilanSinyallerCsvOlustur(signals) {
    const headers = [
        'signal_id', 'fixture_id', 'signal_type', 'sent_at', 'match', 'league',
        'minute', 'score', 'market', 'dino_probability', 'edge', 'odds',
        'bookmaker', 'market_probability', 'model_variant', 'live_only_probability',
        'selector_v2_probability', 'selector_v2_raw_probability', 'selector_v2_model_version',
        'prematch_source', 'prematch_home', 'prematch_draw', 'prematch_away',
        'prematch_market_support', 'prematch_market_source', 'stats_source',
        ...STATS_VALIDATION_CSV_HEADERS,
        'home_shots', 'home_shots_on_goal', 'home_corners', 'home_possession',
        'home_yellow', 'home_red', 'home_fouls', 'home_offsides', 'home_saves', 'home_xg',
        'away_shots', 'away_shots_on_goal', 'away_corners', 'away_possession',
        'away_yellow', 'away_red', 'away_fouls', 'away_offsides', 'away_saves', 'away_xg',
        ...SHADOW_CSV_HEADERS,
        'result', 'profit', 'final_score', 'fixture_status', 'resolved_at'
    ];

    const rows = signals.map(signal => {
        const home = signal?.liveStats?.home || {};
        const away = signal?.liveStats?.away || {};
        const settlement = signal?.settlement || {};
        return [
            signal.signalId, signal.fixtureId, signal.signalType, signal.sentAt,
            signal.match, signal.league, signal.minute, signal.score, signal.market,
            signal.dinoProbability, signal.edge, signal.odds, signal.bookmaker,
            signal.marketProbability, signal.modelVariant, signal.liveOnlyProbability,
            signal.selectorV2Probability, signal.selectorV2RawProbability,
            signal.selectorV2ModelVersion,
            signal.prematchSource, signal.prematchProbabilities?.home,
            signal.prematchProbabilities?.draw, signal.prematchProbabilities?.away,
            signal.prematchMarketSupport, signal.prematchMarketSource, signal.statsSource,
            ...statsDogrulamaCsvDegerleri(signal),
            home.shots, home.shotsOnGoal, home.corners, home.possession,
            home.yellowCards, home.redCards, home.fouls, home.offsides, home.saves, home.xg,
            away.shots, away.shotsOnGoal, away.corners, away.possession,
            away.yellowCards, away.redCards, away.fouls, away.offsides, away.saves, away.xg,
            ...golgeCsvDegerleri(signal),
            settlement.result, settlement.profit, settlement.finalScore,
            settlement.fixtureStatus, settlement.resolvedAt
        ].map(csvHucre).join(',');
    });

    return [headers.map(csvHucre).join(','), ...rows].join('\n');
}


app.get(
    '/api/signal-history',
    (req, res) => {
        const allSignals = signalTracker.list(100000);
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            allSignals,
            'sentAt'
        );
        if (!selection) return;

        res.json({
            filter: selection.filter,
            summary: signalTracker.summary(selection.items),
            signals: signalTracker.list(req.query.limit, selection.items)
        });
    }
);


app.post(
    '/api/signal-history/refresh',
    async (req, res) => {
        const result = await paylasilanSinyalSonuclariniGuncelle({ manuel: true });
        res.json({
            ...result,
            summary: signalTracker.summary()
        });
    }
);


app.get(
    '/api/signal-history/export',
    (req, res) => {
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            signalTracker.list(100000),
            'sentAt'
        );
        if (!selection) return;
        const dosyaEtiketi = gecmisDosyaEtiketi(selection);
        const payload = signalTracker.exportPayload({
            buildVersion: BUILD_VERSION,
            rules: SIGNAL_RULES,
            minimumSignalOdd: DINO_V2_SELECTOR_ENABLED ? DINO_V2_MIN_ODD : MIN_SIGNAL_ODD,
            currentMinimumEdge: state.globalMinEdge,
            selectorV2: {
                enabled: DINO_V2_SELECTOR_ENABLED,
                version: dinoSelectorV2.MODEL.version,
                policy: { ...dinoSelectorV2.MODEL.policy, activeMinimumOdd: DINO_V2_MIN_ODD },
                edgeDecisionImpact: false
            },
            precisionMode: PRECISION_MODE,
            freshSignalValidation: FRESH_SIGNAL_VALIDATION,
            shadowPowerTest: {
                enabled: SHADOW_POWER_ENABLED,
                decisionImpact: DINO_V2_SELECTOR_ENABLED,
                endpoints: ['teams/statistics', 'standings', 'predictions']
            },
            historyFilter: selection.filter,
            note: 'Bu dosya yalnızca Telegram API\'sine başarıyla gönderilen sinyalleri içerir.'
        }, selection.items);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="dino-paylasilan-sinyaller-${dosyaEtiketi}.json"`
        );
        res.send(JSON.stringify(payload, null, 2));
    }
);


app.get(
    '/api/signal-history/export.csv',
    (req, res) => {
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            signalTracker.list(100000),
            'sentAt'
        );
        if (!selection) return;
        const dosyaEtiketi = gecmisDosyaEtiketi(selection);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="dino-paylasilan-sinyaller-${dosyaEtiketi}.csv"`
        );
        res.send(`\uFEFF${paylasilanSinyallerCsvOlustur(selection.items)}`);
    }
);


function adayGecmisiCsvOlustur(records) {
    const headers = [
        'record_id', 'scan_id', 'captured_at', 'fixture_id', 'match', 'league',
        'minute', 'score', 'market', 'signal_class', 'dino_probability', 'edge',
        'odds', 'market_probability', 'bookmaker', 'decision', 'decision_detail',
        'selector_v2_probability', 'selector_v2_raw_probability',
        'selector_v2_threshold', 'selector_v2_minimum_odd',
        'selector_v2_eligible', 'selector_v2_reasons',
        'minimum_edge', 'minimum_odd', 'model_variant', 'live_only_probability',
        'prematch_probability_delta', 'prematch_available', 'prematch_source',
        'prematch_home', 'prematch_draw', 'prematch_away',
        'prematch_market_support', 'prematch_market_source', 'stats_source',
        ...STATS_VALIDATION_CSV_HEADERS,
        'home_shots', 'home_shots_on_goal', 'home_corners', 'home_possession',
        'home_yellow', 'home_red', 'home_fouls', 'home_offsides', 'home_saves', 'home_xg',
        'away_shots', 'away_shots_on_goal', 'away_corners', 'away_possession',
        'away_yellow', 'away_red', 'away_fouls', 'away_offsides', 'away_saves', 'away_xg',
        ...SHADOW_CSV_HEADERS,
        'result', 'profit', 'final_score', 'fixture_status', 'resolved_at'
    ];

    const rows = records.map(record => {
        const home = record?.liveStats?.home || {};
        const away = record?.liveStats?.away || {};
        const settlement = record?.settlement || {};
        return [
            record.recordId, record.scanId, record.capturedAt, record.fixtureId,
            record.match, record.league, record.minute, record.score, record.market,
            record.signalClass, record.dinoProbability, record.edge, record.odds,
            record.marketProbability, record.bookmaker, record.decision,
            record.decisionDetail, record.selectorV2Probability,
            record.selectorV2RawProbability, record.selectorV2Threshold,
            record.selectorV2MinimumOdd, record.selectorV2Eligible,
            Array.isArray(record.selectorV2Reasons) ? record.selectorV2Reasons.join(' | ') : null,
            record.minimumEdgeAtEvaluation,
            record.minimumOddAtEvaluation, record.modelVariant,
            record.liveOnlyProbability, record.prematchProbabilityDelta,
            record.prematchAvailable, record.prematchSource,
            record.prematchProbabilities?.home, record.prematchProbabilities?.draw,
            record.prematchProbabilities?.away, record.prematchMarketSupport,
            record.prematchMarketSource, record.statsSource,
            ...statsDogrulamaCsvDegerleri(record),
            home.shots, home.shotsOnGoal, home.corners, home.possession,
            home.yellowCards, home.redCards, home.fouls, home.offsides, home.saves, home.xg,
            away.shots, away.shotsOnGoal, away.corners, away.possession,
            away.yellowCards, away.redCards, away.fouls, away.offsides, away.saves, away.xg,
            ...golgeCsvDegerleri(record),
            settlement.result, settlement.profit, settlement.finalScore,
            settlement.fixtureStatus, settlement.resolvedAt
        ].map(csvHucre).join(',');
    });

    return [headers.map(csvHucre).join(','), ...rows].join('\n');
}


app.get(
    '/api/candidate-history',
    (req, res) => {
        const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 5000));
        const allRecords = candidateTracker.list(100000);
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            allRecords,
            'capturedAt'
        );
        if (!selection) return;

        res.json({
            filter: selection.filter,
            summary: candidateTracker.summary(selection.items),
            records: candidateTracker.list(limit, selection.items)
        });
    }
);


app.get(
    '/api/candidate-history/export',
    (req, res) => {
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            candidateTracker.list(100000),
            'capturedAt'
        );
        if (!selection) return;
        const dosyaEtiketi = gecmisDosyaEtiketi(selection);
        const payload = candidateTracker.exportPayload({
            buildVersion: BUILD_VERSION,
            rules: SIGNAL_RULES,
            currentMinimumEdge: state.globalMinEdge,
            minimumSignalOdd: DINO_V2_SELECTOR_ENABLED ? DINO_V2_MIN_ODD : MIN_SIGNAL_ODD,
            selectorV2: {
                enabled: DINO_V2_SELECTOR_ENABLED,
                version: dinoSelectorV2.MODEL.version,
                policy: { ...dinoSelectorV2.MODEL.policy, activeMinimumOdd: DINO_V2_MIN_ODD },
                edgeDecisionImpact: false
            },
            precisionMode: PRECISION_MODE,
            freshSignalValidation: FRESH_SIGNAL_VALIDATION,
            shadowPowerTest: {
                enabled: SHADOW_POWER_ENABLED,
                decisionImpact: DINO_V2_SELECTOR_ENABLED,
                endpoints: ['teams/statistics', 'standings', 'predictions']
            },
            historyFilter: selection.filter,
            note: 'Tam istatistikli maçlarda modelin gördüğü tüm canlı market anları; Telegram\'a gönderilmeyenler dahil.'
        }, selection.items);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="dino-tam-stat-adaylar-${dosyaEtiketi}.json"`
        );
        res.send(JSON.stringify(payload, null, 2));
    }
);


app.get(
    '/api/candidate-history/export.csv',
    (req, res) => {
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            candidateTracker.list(100000),
            'capturedAt'
        );
        if (!selection) return;
        const dosyaEtiketi = gecmisDosyaEtiketi(selection);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="dino-tam-stat-adaylar-${dosyaEtiketi}.csv"`
        );
        res.send(`\uFEFF${adayGecmisiCsvOlustur(selection.items)}`);
    }
);


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

        let autoScanYeniAcildi = false;

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
            req.body.autoScanEnabled !== undefined
        ) {
            const oncekiAutoScan =
                state.autoScanEnabled;

            state.autoScanEnabled =
                Boolean(
                    req.body.autoScanEnabled
                );

            autoScanYeniAcildi =
                !oncekiAutoScan &&
                state.autoScanEnabled;

            if (autoScanYeniAcildi) {
                // Açıldıktan sonra ilk tarama için 10 dakika bekletme.
                nextRunTime = 0;
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
            `> ⚙️ Ayarlar güncellendi. Minimum EDGE: %${state.globalMinEdge} | Otomatik 10 dk tarama: ${state.autoScanEnabled ? 'AÇIK' : 'KAPALI'}`
        );


        if (
            autoScanYeniAcildi &&
            state.isRunning
        ) {
            setImmediate(
                masterClock
            );
        }


        res.json({

            success:
                true,

            state:
                state

        });

    }
);


// =========================================================
// API: İSTATİSTİK KAPSAMI
// =========================================================

app.get(
    '/api/statistics-coverage',
    (req, res) => {
        res.json(statisticsCoverageSnapshot);
    }
);


function coverageHtmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


app.get(
    '/statistics-coverage',
    (req, res) => {
        const snapshot = statisticsCoverageSnapshot;
        const rows = snapshot.matches.map(match => {
            const coverageLabel = match.coverageStatus === 'supported'
                ? '✅ Destekli'
                : match.coverageStatus === 'unsupported'
                    ? '🚫 Desteklenmiyor'
                    : '❓ Bilinmiyor';
            const actualLabel = match.actualStatsComplete === true
                ? '✅ Tam'
                : match.actualStatsComplete === false
                    ? '❌ Eksik'
                    : '⏳ Kontrol edilmedi';
            const prematchLabel = match.prematchAvailable === true
                ? `🧭 ${coverageHtmlEscape(match.prematchSource || 'Hazır')}`
                : match.prematchAvailable === false
                    ? '❌ Yok'
                    : '⏳ Kontrol edilmedi';
            return `<tr>
                <td>${coverageHtmlEscape(match.match)}</td>
                <td>${coverageHtmlEscape(match.league)}</td>
                <td>${coverageHtmlEscape(match.season)}</td>
                <td>${coverageHtmlEscape(match.minute)}'</td>
                <td>${coverageLabel}</td>
                <td>${actualLabel}</td>
                <td>${prematchLabel}</td>
                <td>${coverageHtmlEscape(match.statsTeamCount ?? '-')}</td>
            </tr>`;
        }).join('');

        res.type('html').send(`<!doctype html>
<html lang="tr">
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="15">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Dino İstatistik Kapsamı</title>
    <style>
        body{font-family:Arial,sans-serif;background:#111;color:#eee;margin:24px}
        h1{font-size:24px} .cards{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}
        .card{background:#222;border:1px solid #444;border-radius:10px;padding:14px;min-width:145px}
        .card b{display:block;font-size:24px;color:#41d17d;margin-top:6px}
        table{width:100%;border-collapse:collapse;background:#1a1a1a}
        th,td{padding:10px;border-bottom:1px solid #333;text-align:left;font-size:14px}
        th{background:#292929;position:sticky;top:0} .muted{color:#aaa;font-size:13px}
    </style>
</head>
<body>
    <h1>📊 Dino Canlı İstatistik Kapsamı</h1>
    <div class="muted">Son güncelleme: ${coverageHtmlEscape(snapshot.updatedAt || 'Henüz tarama yapılmadı')} · Sayfa 15 saniyede yenilenir.</div>
    <div class="cards">
        <div class="card">Canlı aday<b>${snapshot.totalCandidates}</b></div>
        <div class="card">Coverage destekli<b>${snapshot.supportedCount}</b></div>
        <div class="card">Çıkarılan<b>${snapshot.unsupportedCount}</b></div>
        <div class="card">Gerçek stats tam<b>${snapshot.completeStatsCount}</b></div>
        <div class="card">Gerçek stats eksik<b>${snapshot.incompleteStatsCount}</b></div>
    </div>
    <table>
        <thead><tr><th>Maç</th><th>Lig</th><th>Sezon</th><th>Dakika</th><th>Lig kapsamı</th><th>Gerçek veri</th><th>Pre-Match</th><th>API takım</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8">Henüz tarama sonucu yok.</td></tr>'}</tbody>
    </table>
</body>
</html>`);
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

            autoScanEnabled:
                state.autoScanEnabled,

            scanIntervalMinutes:
                10,

            minEdge:
                state.globalMinEdge,

            minimumSignalOdd:
                DINO_V2_SELECTOR_ENABLED ? DINO_V2_MIN_ODD : MIN_SIGNAL_ODD,

            selectorV2: {
                enabled: DINO_V2_SELECTOR_ENABLED,
                version: dinoSelectorV2.MODEL.version,
                policy: {
                    ...dinoSelectorV2.MODEL.policy,
                    activeMinimumOdd: DINO_V2_MIN_ODD
                },
                edgeDecisionImpact: false,
                training: dinoSelectorV2.MODEL.training
            },

            precisionMode:
                PRECISION_MODE,

            freshSignalValidation:
                FRESH_SIGNAL_VALIDATION,

            prematchTracking: {
                preferredBookmakerName: PREFERRED_PREMATCH_BOOKMAKER_NAME,
                preferredBookmakerId: preferredPrematchBookmakerId,
                cache: prematchOddsCache.summary()
            },

            shadowPowerTracking: {
                ...shadowPowerSnapshot,
                enabled: SHADOW_POWER_ENABLED,
                decisionImpact: DINO_V2_SELECTOR_ENABLED,
                minimumQuotaReserve: SHADOW_MIN_QUOTA_REMAINING,
                cache: shadowPowerCache.summary()
            },

            statisticsCoverage: {
                updatedAt: statisticsCoverageSnapshot.updatedAt,
                totalCandidates: statisticsCoverageSnapshot.totalCandidates,
                supportedCount: statisticsCoverageSnapshot.supportedCount,
                unsupportedCount: statisticsCoverageSnapshot.unsupportedCount,
                unknownCount: statisticsCoverageSnapshot.unknownCount,
                completeStatsCount: statisticsCoverageSnapshot.completeStatsCount,
                incompleteStatsCount: statisticsCoverageSnapshot.incompleteStatsCount
            },

            strictLiveStats: {
                required: true,
                requiredFields: MODEL_STAT_FIELDS,
                scoreOnlySignals: false
            },

            signalRules:
                SIGNAL_RULES,

            signalTracking: {
                isRefreshing: isSignalResultRefreshing,
                summary: signalTracker.summary()
            },

            candidateTracking: {
                summary: candidateTracker.summary()
            },

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

signalTracker.load();

candidateTracker.load();

prematchOddsCache.load();

shadowPowerCache.load();


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
            DINO_V2_SELECTOR_ENABLED
                ? `> 🧬 V16 ikinci katman AKTİF: eşik %${dinoSelectorV2.MODEL.policy.threshold * 100} | dakika ${dinoSelectorV2.MODEL.policy.minimumMinute}-${dinoSelectorV2.MODEL.policy.maximumMinute} | oran ${DINO_V2_MIN_ODD}+ | EDGE kararı etkilemez.`
                : `> 🎯 Legacy minimum EDGE: %${state.globalMinEdge}`
        );

        addSystemLog(
            `> 💵 Minimum canlı oran: ${MIN_SIGNAL_ODD.toFixed(2)}`
        );

        addSystemLog(
            `> 🧭 Precision pre-match modu: AÇIK | Tercih: ${PREFERRED_PREMATCH_BOOKMAKER_NAME} | Pre-match yoksa Telegram yok.`
        );


        addSystemLog(
            `> 🔄 Otomatik tarama: ${state.autoScanEnabled ? 'AÇIK' : 'KAPALI'} | Döngü: 10 dakika | Maç aralığı: 25-80. dakika.`
        );


        addSystemLog(
            "> 🗺️ Lig coverage filtresi aktif: statistics_fixtures=false olan ligler taramadan çıkarılır."
        );


        addSystemLog(
            "> 🛡️ Sıkı mod: altı temel canlı istatistik yoksa Python ve Telegram sinyali yok."
        );

        addSystemLog(
            DINO_V2_SELECTOR_ENABLED
                ? "> 🧠 Seçim kuralı: Dino tek başına sınıf belirlemez; V16 bütün marketleri yeniden puanlar ve maç başına yalnız en güçlü doğrulanmış adayı seçer."
                : "> ⚪ Gölge: Dino %60–69.9 (Telegram yok) | 🟡 Sürpriz: %70–74.9 ve 50–80. dakika | 🟢 Güçlü: %75+ ve 50–80. dakika."
        );

        addSystemLog(
            DINO_V2_SELECTOR_ENABLED
                ? "> 🗃️ Paylaşılan sinyal takibi aktif: V16 maç başına en fazla 1 doğrulanmış sinyal kaydeder."
                : "> 🗃️ Paylaşılan sinyal takibi aktif: maç başına 1 sürpriz + 1 güçlü; yalnızca Telegram başarısından sonra kaydedilir."
        );

        addSystemLog(
            "> 🧪 Tam-stat aday denetimi aktif: Telegram'a gitmeyen marketler ve eleme nedenleri de sonuçlarıyla kaydedilir."
        );

        addSystemLog(
            `> 🧬 API güç doğrulaması AÇIK: kimlik + lig/sezon + en az 5 ev/deplasman örneklemi + standings + predictions eksiksiz olmalı | V16 KARAR KAPISI | Kota koruması: ${SHADOW_MIN_QUOTA_REMAINING}.`
        );

        addSystemLog(
            `> 🛡️ Telegram öncesi taze doğrulama AÇIK: fixture + /fixtures/statistics + /odds/live?fixture + tek maç Python tekrar çalıştırma | dakika ${TELEGRAM_MIN_MINUTE}-${TELEGRAM_MAX_MINUTE}.`
        );


        addSystemLog(
            `> 🐍 Python: ${pythonBinary}`
        );


        addSystemLog(
            "> 🚀 API-FOOTBALL Pro tarama motoru hazır."
        );

        if (!signalResultInterval) {
            signalResultInterval = setInterval(
                () => {
                    paylasilanSinyalSonuclariniGuncelle()
                        .catch(error => addSystemLog(`> ⚠️ Sonuç takip zamanlayıcısı: ${error.message}`));
                },
                SIGNAL_RESULT_REFRESH_MS
            );
        }

        setTimeout(
            () => {
                paylasilanSinyalSonuclariniGuncelle()
                    .catch(error => addSystemLog(`> ⚠️ İlk sonuç kontrolü: ${error.message}`));
            },
            15000
        );


        // PM2 / Node yeniden başladığında kalıcı hafızada sistem açık görünüyorsa
        // dakika sayacını da yeniden kur. Aksi halde panel açık görünür fakat
        // masterClock yalnızca kullanıcı şalteri yeniden açarsa çalışır.
        if (
            state.isRunning
        ) {
            nextRunTime = 0;

            if (
                !masterInterval
            ) {
                masterInterval =
                    setInterval(
                        masterClock,
                        60000
                    );
            }

            setImmediate(
                masterClock
            );

            addSystemLog(
                `> ♻️ Sistem açık durumu geri yüklendi. Otomatik 10 dk tarama ${state.autoScanEnabled ? 'devam ediyor' : 'panelden açılmayı bekliyor'}.`
            );
        }

    }
);
