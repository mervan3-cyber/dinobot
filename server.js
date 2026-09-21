require('dotenv').config();

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const axios = require('axios');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { SignalTracker } = require('./signal_tracker');
const { createRouter, TelegramDelivery, VERSION: TELEGRAM_VERSION } = require('./mac_yakala_telegram');
const { createPanelAuth } = require('./panel_auth');
const { SharingSettings } = require('./sharing_settings');
const { SharingDelivery } = require('./sharing_delivery');
const { createXPublisher } = require('./x_publisher');
const crypto = require('crypto');
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
// Legacy exports remain readable, but their former Telegram rules no longer run.
const marketTariff = { ...require('./active_tariff'), VERSION: 'mac-yakala-independent-2026-09-16',
    PRIMARY_RULES: [], FOLLOW_RULES: [],
    canPreselect: () => false,
    check: () => ({eligible:false,reasons:['Telegram V21/V22 bağımsız yönlendiricisinde değerlendirilir'],slot:'primary',rule:null,priority:-Infinity,signalSources:[]}) };
const v19Tariff = require('./hybrid_tariff');
const v21Tariff = require('./v21_tariff');
const v21History = require('./v21_history');
const v22Tariff = require('./v22_tariff');
const { createV22Lab } = require('./v22_lab');
const { FilterLab, selectSource: selectV23Source, readRetired: readRetiredV23 } = require('./v23_filter_lab');
const { streamJson: streamV23Json } = require('./v23_export');
const { AdaptiveScan, providerTrouble } = require('./adaptive_scan');
const { createIndependentLab, importV19History } = require('./independent_lab');
const legacyV17Tariff = require('./market_tariff');
const dinoSelectorV18 = require('./dino_selector_v18');
const coreShadowTariff = require('./core_shadow_tariff');
const { V20Engine, eligible: v20PolicyEligible } = require('./v20_selector');
const { MARKETS: V20_MARKETS, fromMac: v20SnapshotFromMac } = require('./v20_features');

const { GoogleGenerativeAI } = require('@google/generative-ai');


// =========================================================
// EXPRESS
// =========================================================

const app = express();
const BUILD_VERSION = 'mac-yakala-v23-adaptive-scan-2026-09-21';

app.use(express.json({limit:'64kb'}));
app.use(createPanelAuth({password:process.env.PANEL_ADMIN_PASSWORD || ''}));

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

const V20_SNAPSHOT_ARCHIVE_DIR =
    process.env.DINO_V20_SNAPSHOT_ARCHIVE_DIR
        ? path.resolve(process.env.DINO_V20_SNAPSHOT_ARCHIVE_DIR)
        : path.join(__dirname, 'v20_snapshot_archive');

const CORE_SHADOW_HISTORY_FILE =
    process.env.DINO_CORE_SHADOW_HISTORY_FILE
        ? path.resolve(process.env.DINO_CORE_SHADOW_HISTORY_FILE)
        : path.join(
            __dirname,
            'dino_two_rule_core_shadow_history.json'
        );

const LEGACY_V17_SHADOW_HISTORY_FILE =
    process.env.DINO_LEGACY_V17_SHADOW_HISTORY_FILE
        ? path.resolve(process.env.DINO_LEGACY_V17_SHADOW_HISTORY_FILE)
        : path.join(
            __dirname,
            'dino_v17_legacy_shadow_history.json'
        );

const V20_SHADOW_HISTORY_FILE =
    process.env.DINO_V20_SHADOW_HISTORY_FILE
        ? path.resolve(process.env.DINO_V20_SHADOW_HISTORY_FILE)
        : path.join(
            __dirname,
            'dino_v20_shadow_history.json'
        );

const V19_SHADOW_HISTORY_FILE = process.env.DINO_V19_SHADOW_HISTORY_FILE
    ? path.resolve(process.env.DINO_V19_SHADOW_HISTORY_FILE)
    : path.join(__dirname, 'dino_v19_independent_shadow_history.json');
const V21_SHADOW_HISTORY_FILE = process.env.DINO_V21_SHADOW_HISTORY_FILE
    ? path.resolve(process.env.DINO_V21_SHADOW_HISTORY_FILE)
    : path.join(__dirname, 'dino_v21_consensus_shadow_history.json');
const DINO_V19_SHADOW_ENABLED = false; // Retired: not even an environment flag can start this lab again.
const MY_V21_TELEGRAM_ENABLED = String(process.env.MAC_YAKALA_V21_TELEGRAM_ENABLED || 'true').toLowerCase() !== 'false';
const MY_V22_TELEGRAM_ENABLED = String(process.env.MAC_YAKALA_V22_TELEGRAM_ENABLED || 'true').toLowerCase() !== 'false';
const DINO_V21_SHADOW_ENABLED = String(process.env.DINO_V21_SHADOW_ENABLED || 'true').toLowerCase() !== 'false';
const V22_SHADOW_HISTORY_FILE = process.env.DINO_V22_SHADOW_HISTORY_FILE
    ? path.resolve(process.env.DINO_V22_SHADOW_HISTORY_FILE)
    : path.join(__dirname, 'dino_v22_union_shadow_history.json');
const DINO_V22_SHADOW_ENABLED = String(process.env.DINO_V22_SHADOW_ENABLED || 'true').toLowerCase() !== 'false';
const DINO_V23_SHADOW_ENABLED = String(process.env.DINO_V23_SHADOW_ENABLED || 'true').toLowerCase() !== 'false';
const V23_GOAL_HISTORY_FILE = path.join(__dirname, 'dino_v23_filter_history.json');
const V23_RETIRED_HISTORY_FILE = path.join(__dirname, 'dino_v23_goal_history.json');
if ([SIGNAL_HISTORY_FILE, CANDIDATE_HISTORY_FILE, V19_SHADOW_HISTORY_FILE, V20_SHADOW_HISTORY_FILE,
    V21_SHADOW_HISTORY_FILE, V22_SHADOW_HISTORY_FILE, CORE_SHADOW_HISTORY_FILE, LEGACY_V17_SHADOW_HISTORY_FILE]
    .some(file => [V23_GOAL_HISTORY_FILE, V23_RETIRED_HISTORY_FILE].includes(path.resolve(file)))) {
    throw new Error('V23 dosya yolları diğer geçmişlerden ayrı olmalıdır.');
}
if ([SIGNAL_HISTORY_FILE, CANDIDATE_HISTORY_FILE, V21_SHADOW_HISTORY_FILE, V19_SHADOW_HISTORY_FILE, V20_SHADOW_HISTORY_FILE,
    CORE_SHADOW_HISTORY_FILE, LEGACY_V17_SHADOW_HISTORY_FILE].some(file => path.resolve(file) === V22_SHADOW_HISTORY_FILE)) {
    throw new Error('V22 geçmiş yolu diğer deneylerden ayrı olmalıdır.');
}

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

const DINO_V17_TARIFF_ENABLED =
    String(
        process.env.DINO_HYBRID_TARIFF_ENABLED ??
        process.env.DINO_V17_TARIFF_ENABLED ??
        'true'
    ).toLowerCase() !== 'false';
const TELEGRAM_MIN_MINUTE = DINO_V17_TARIFF_ENABLED ? 25 : 60;
const TELEGRAM_MAX_MINUTE = 80;
const MIN_SIGNAL_ODD = 1.40;

// V16 ikinci katman: eski Temel yüzdesini tek başına karar kabul etmez.
// Canlı tempo, skor, piyasa ve pre-match verisini birlikte yeniden puanlar.
// 1.40 kör testte doğruluk modu olarak üstün çıktı. İstenirse sunucuda
// DINO_V2_MIN_ODD=1.60 ile yükseltilebilir; 1.60 geçmiş kör testte daha
// düşük isabet verdiği için varsayılan yapılmamıştır.
const DINO_V2_SELECTOR_ENABLED =
    String(process.env.DINO_V2_SELECTOR_ENABLED || 'true').toLowerCase() !== 'false';
const DINO_V2_MIN_ODD = Number(process.env.DINO_V2_MIN_ODD) ||
    Number(dinoSelectorV2.MODEL.policy.defaultMinimumOdd);
const ACTIVE_MIN_SIGNAL_ODD = DINO_V17_TARIFF_ENABLED
    ? marketTariff.MINIMUM_ODD
    : DINO_V2_SELECTOR_ENABLED
        ? DINO_V2_MIN_ODD
        : MIN_SIGNAL_ODD;

const DINO_CORE_SHADOW_ENABLED = false; // Retired lab; no refresh, recording or result polling.
const DINO_LEGACY_V17_SHADOW_ENABLED =
    String(process.env.DINO_LEGACY_V17_SHADOW_ENABLED || 'true').toLowerCase() !== 'false';
const DINO_V20_SHADOW_ENABLED =
    String(process.env.DINO_V20_SHADOW_ENABLED || 'true').toLowerCase() !== 'false';
// V20-only local acquisition limits. Provider-side publication delay is unknown;
// the final fixture poll below also rejects intervening score/status changes.
const V20_FRESH_DATA_POLICY = Object.freeze({
    maximumAcquisitionMs: 30000,
    maximumSourceSkewMs: 20000,
    maximumFinalCheckDelayMs: 30000,
    maximumSnapshotAgeMs: 60000
});

// Legacy karar hattının pre-match kapılarıdır. V16 aktifken pre-match
// verisi model girdisi ve denetim kaydı olarak kalır; tek başına Telegram
// sinyalini veto etmez.
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

// Aynı sağlayıcının fixture ve oran akışı birkaç saniye birlikte gecikebilir.
// İkinci doğrulama bu yüzden beklemeli yapılır; olay akışında çok yeni gol varsa
// veya seçilen oran değişmiş/kapanmışsa sinyal bir sonraki taramaya bırakılır.
const STALE_GOAL_GUARD = Object.freeze({
    enabled: true,
    confirmationDelayMs: Math.max(
        5000,
        Number(process.env.STALE_GOAL_CONFIRMATION_DELAY_MS) || 12000
    ),
    recentGoalCooldownMinutes: Math.max(
        1,
        Number(process.env.STALE_GOAL_COOLDOWN_MINUTES) || 2
    ),
    maximumOddDrift: Math.max(
        0.01,
        Number(process.env.STALE_GOAL_MAX_ODD_DRIFT) || 0.03
    )
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
    adaptiveScanEnabled: false,

    scheduleEnabled: false,

    schedules: [],

    // Telegram'a başarıyla gönderilen türler fixture ID altında ayrı tutulur.
    // Her maç bir sürpriz ve bir güçlü sinyal hakkına sahiptir.
    sentFixtures: {}

};


let isScanning = false;

let nextRunTime = 0;
const adaptiveScan = new AdaptiveScan();

let masterInterval = null;

let systemLogs = [];

let isSignalResultRefreshing = false;

let signalResultInterval = null;

const signalTracker = new SignalTracker({
    filePath: SIGNAL_HISTORY_FILE,
    strict: true,
    logger: message => addSystemLog(message)
});

const candidateTracker = new CandidateTracker({
    filePath: CANDIDATE_HISTORY_FILE,
    logger: message => addSystemLog(message),
    maxRecords: 50000,
    snapshotArchiveDirectory: V20_SNAPSHOT_ARCHIVE_DIR
});

const coreShadowTracker = new SignalTracker({
    filePath: CORE_SHADOW_HISTORY_FILE,
    logger: message => addSystemLog(
        String(message).replace('Paylaşılan sinyal', 'İki kurallı çekirdek gölge sinyali')
    )
});

const legacyV17ShadowTracker = new SignalTracker({
    filePath: LEGACY_V17_SHADOW_HISTORY_FILE,
    logger: message => addSystemLog(
        String(message).replace('Paylaşılan sinyal', 'Legacy V17 gölge sinyali')
    )
});

const v20ShadowTracker = new SignalTracker({
    filePath: V20_SHADOW_HISTORY_FILE,
    logger: message => addSystemLog(
        String(message).replace('Paylaşılan sinyal', 'V20 bağımsız gölge sinyali')
    )
});

const v19ShadowTracker = new SignalTracker({ filePath: V19_SHADOW_HISTORY_FILE, logger: message => addSystemLog(message) });
const v21ShadowTracker = new SignalTracker({ filePath: V21_SHADOW_HISTORY_FILE, logger: message => addSystemLog(message) });
const v22ShadowTracker = new SignalTracker({ filePath: V22_SHADOW_HISTORY_FILE,
    logger: message => addSystemLog(String(message).replace('Paylaşılan sinyal', 'V22 lab sinyali')) });
const v22Lab = createV22Lab({ tracker: v22ShadowTracker, enabled: DINO_V22_SHADOW_ENABLED,
    v16Model: dinoSelectorV2, v18Model: dinoSelectorV18,
    prematchSupport: prematchMarketDestegi, prematchSource: prematchMarketKaynagi,
    liveSnapshot: paylasilanCanliStatsAnlikGoruntusu });
const independentLab = createIndependentLab({
    v19Tracker: v19ShadowTracker, v21Tracker: v21ShadowTracker,
    v16Model: dinoSelectorV2, v18Model: dinoSelectorV18,
    prematchSupport: prematchMarketDestegi, prematchSource: prematchMarketKaynagi,
    alreadyDecided: toplamGolMarketiSkoraGoreSonuclanmisMi,
    liveSnapshot: paylasilanCanliStatsAnlikGoruntusu,
    v19Enabled: DINO_V19_SHADOW_ENABLED, v21Enabled: DINO_V21_SHADOW_ENABLED
});

const telegramDelivery = new TelegramDelivery({
    filePath: path.join(__dirname, 'mac_yakala_telegram_delivery.json'), tracker: signalTracker,
    send: (channel, text, options) => { if (!bot) throw Error('Telegram ayarları eksik'); return bot.sendMessage(channel, text, options); },
    logger: message => addSystemLog(message)
});
const telegramRouter = createRouter({delivery: telegramDelivery, channel: kanalID,
    v16Model: dinoSelectorV2, v18Model: dinoSelectorV18,
    prematchSupport: prematchMarketDestegi, prematchSource: prematchMarketKaynagi,
    alreadyDecided: toplamGolMarketiSkoraGoreSonuclanmisMi, liveSnapshot: paylasilanCanliStatsAnlikGoruntusu,
    v21Enabled: MY_V21_TELEGRAM_ENABLED, v22Enabled: MY_V22_TELEGRAM_ENABLED
});

const extraChatId = String(process.env.TELEGRAM_EXTRA_CHAT_ID || '').trim();
const xCredentials = {apiKey:process.env.X_API_KEY || '',apiSecret:process.env.X_API_SECRET || '',
    accessToken:process.env.X_ACCESS_TOKEN || '',accessSecret:process.env.X_ACCESS_TOKEN_SECRET || ''};
const sameTelegramTarget = () => extraChatId===String(kanalID) || telegramDelivery.data.entries.some(e=>e.status==='sent'&&e.requestedChannel===String(kanalID)&&String(e.chatId)===extraChatId);
const sharingSettings = new SharingSettings({filePath:path.join(__dirname,'mac_yakala_sharing_settings.json'),
identities:()=>({extraTelegram:crypto.createHash('sha256').update(extraChatId).digest('hex'),x:crypto.createHash('sha256').update(xCredentials.accessToken).digest('hex')}),availability:()=>({
    extraTelegram:{configured:!!bot && /^-\d+$/.test(extraChatId) && !sameTelegramTarget(),
        reason:!bot?'Telegram bot ayarı eksik.':!extraChatId?'TELEGRAM_EXTRA_CHAT_ID .env içinde boş.':! /^-\d+$/.test(extraChatId)?'Ek grup için sayısal negatif chat ID gerekli.':sameTelegramTarget()?'Ek hedef ana kanalla aynı olamaz.':null},
    x:{configured:Object.values(xCredentials).every(v=>!!v.trim()),reason:Object.values(xCredentials).every(v=>!!v.trim())?null:'Dört X OAuth 1.0a kullanıcı anahtarını .env içine girin.'}
})});
const sharingDelivery = new SharingDelivery({filePath:path.join(__dirname,'mac_yakala_sharing_delivery.json'),settings:sharingSettings,tracker:signalTracker,
    extraChatId,xIdentity:crypto.createHash('sha256').update(xCredentials.accessToken).digest('hex'),
    telegramSend:(chat,text,options)=>{if(!bot)throw Error('Telegram ayarı eksik');return bot.sendMessage(chat,text,options);},
    xSend:createXPublisher({credentials:xCredentials}),logger:message=>addSystemLog(message)});
app.get('/api/sharing-settings', (req,res)=>res.json({success:true,...sharingSettings.status(),delivery:sharingDelivery.status()}));
app.post('/api/sharing-settings', (req,res)=>{
    try { const status=sharingSettings.update(req.body); addSystemLog(`> 📣 Ek paylaşım ayarları güncellendi: ek Telegram ${status.extraTelegram.active?'açık':'kapalı'}, X ${status.x.active?'açık':'kapalı'}. Ana kanal değişmedi.`); res.json({success:true,...status,delivery:sharingDelivery.status()}); }
    catch(error){res.status(400).json({success:false,error:error.message});}
});

// Retired profile collectors are not instantiated, loaded, queued or scheduled.
const v23GoalLab = new FilterLab({ filePath: V23_GOAL_HISTORY_FILE,
    enabled: DINO_V23_SHADOW_ENABLED && (DINO_V21_SHADOW_ENABLED || DINO_V22_SHADOW_ENABLED), logger: message => addSystemLog(message) });

function v23YerelArsivBakimi() {
    try {
        // Disk archive retry only. No history fetch and no rolling observations.
        v23GoalLab.maintain();
    } catch { /* Lab-only; timer failures never affect Telegram. */ }
}

const v20Engine = new V20Engine();

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
    hardGate: false,
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
                    if (providerTrouble(result)) adaptiveScan.providerFailure();

                    return result;
                } catch (error) {
                    lastError = error;
                    const status = Number(error.response?.status);
                    const timeoutOrNetwork =
                        error.code === 'ECONNABORTED' ||
                        error.code === 'ETIMEDOUT' ||
                        !error.response;
                    const retryable = status === 429 || status >= 500 || timeoutOrNetwork;
                    if (retryable) adaptiveScan.providerFailure();
                    const errorRemaining = error.response?.headers?.['x-ratelimit-requests-remaining'];
                    if (errorRemaining !== undefined) quotaRemaining = Number(errorRemaining);

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
            state.adaptiveScanEnabled = savedState.adaptiveScanEnabled === true;


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
    const gecmisSinyal = typeof signalTracker.findSignal === 'function'
        ? signalTracker.findSignal(fixtureID, tur)
        : null;
    if (gecmisSinyal || signalTracker.hasSignal(fixtureID, tur)) {
        return {
            sentAt: gecmisSinyal?.sentAt
                ? Date.parse(gecmisSinyal.sentAt)
                : null,
            market: gecmisSinyal?.market || null,
            minute: gecmisSinyal?.minute ?? null,
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
        return true;

    } catch (err) {

        addSystemLog(
            "> ⚠️ Hafıza kaydedilemedi."
        );
        return false;

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
    mac.prematch_source_count = mac.prematch_available
        ? Number(oneXTwo.sourceCount) || null
        : null;
    mac.prematch_bookmaker_count = Number.isFinite(Number(prematch?.bookmakerCount))
        ? Number(prematch.bookmakerCount)
        : null;
    mac.prematch_one_x_two_odds = mac.prematch_available &&
        oneXTwo?.odds && typeof oneXTwo.odds === 'object'
        ? oneXTwo.odds
        : null;
    mac.prematch_fetched_at = prematch?.fetchedAt || null;
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
            hardGate: false,
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
        hardGate: false,
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
    expected_goals: ['expected goals', 'expected goal', 'xg'],
    shots_insidebox: ['shots insidebox', 'shots inside box'],
    shots_outsidebox: ['shots outsidebox', 'shots outside box'],
    blocked_shots: ['blocked shots', 'shots blocked']
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
    '_v23LiveStats', // LAB-only optional channels; never a model-required field.
    'stats_team_count', 'stats_source',
    'stats_home_mapping_method', 'stats_away_mapping_method',
    'stats_identity_verified',
    'stats_request_started_at', 'stats_received_at'
];


const OPTIONAL_STAT_FIELDS = [
    'home_possession', 'away_possession',
    'home_yellow', 'away_yellow',
    'home_red', 'away_red',
    'home_fouls', 'away_fouls',
    'home_offsides', 'away_offsides',
    'home_saves', 'away_saves',
    'home_xg', 'away_xg'
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


function takimStatsEslesmesiBul(statistics, team) {
    if (!Array.isArray(statistics) || statistics.length === 0) {
        return { item: null, method: 'missing', verified: false };
    }

    const teamID = Number(team?.id);
    if (Number.isFinite(teamID) && teamID > 0) {
        const byID = statistics.filter(item => Number(item?.team?.id) === teamID);
        if (byID.length === 1) return { item: byID[0], method: 'team_id', verified: true };
        if (byID.length > 1) return { item: null, method: 'ambiguous_id', verified: false };
    }

    const teamName = normalizeStatType(team?.name);
    if (teamName) {
        const byName = statistics.filter(
            item => normalizeStatType(item?.team?.name) === teamName &&
                // An explicit, conflicting provider ID cannot be repaired by name.
                (!(teamID > 0) || !(Number(item?.team?.id) > 0))
        );
        if (byName.length === 1) return { item: byName[0], method: 'team_name', verified: true };
        if (byName.length > 1) return { item: null, method: 'ambiguous_name', verified: false };
    }

    // API dizi sırası bir kimlik kanıtı değildir. Özellikle MS1/MS2 ve takım
    // bazlı delta özelliklerinde sessiz ev/deplasman takası ağır etiket
    // gürültüsü üretir; bu nedenle sıra varsayımı V20'de yasaktır.
    return { item: null, method: 'unmatched', verified: false };
}


function takimStatsObjesiBul(statistics, team) {
    return takimStatsEslesmesiBul(statistics, team).item;
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


function isoZamani(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}


function ilkZaman(...values) {
    const timestamps = values
        .map(isoZamani)
        .filter(Boolean)
        .map(value => new Date(value).getTime());
    return timestamps.length > 0
        ? new Date(Math.min(...timestamps)).toISOString()
        : null;
}


function sonZaman(...values) {
    const timestamps = values
        .map(isoZamani)
        .filter(Boolean)
        .map(value => new Date(value).getTime());
    return timestamps.length > 0
        ? new Date(Math.max(...timestamps)).toISOString()
        : null;
}


function alanGozlendiMi(value) {
    if (value === null || value === undefined || value === '') return false;
    return Number.isFinite(Number(value));
}


function canliVeriKalitesi(mac) {
    const liveReceivedAt = [
        mac?.fixture_received_at,
        mac?.stats_received_at,
        mac?.live_odds_received_at
    ].map(isoZamani).filter(Boolean);
    const liveTimes = liveReceivedAt.map(value => new Date(value).getTime());
    const liveSourceSkewMs = liveTimes.length > 1
        ? Math.max(...liveTimes) - Math.min(...liveTimes)
        : null;
    const observationStartedAt = isoZamani(mac?.observation_started_at) ||
        ilkZaman(
            mac?.fixture_request_started_at,
            mac?.stats_request_started_at,
            mac?.live_odds_request_started_at
        );
    const observationCompletedAt = isoZamani(mac?.observation_completed_at) ||
        sonZaman(...liveReceivedAt);
    const observationDurationMs = observationStartedAt && observationCompletedAt
        ? Math.max(
            0,
            new Date(observationCompletedAt).getTime() -
                new Date(observationStartedAt).getTime()
        )
        : null;

    return {
        schemaVersion: 1,
        observationStartedAt,
        observationCompletedAt,
        observationDurationMs,
        liveSourceSkewMs,
        sources: {
            fixture: {
                requestStartedAt: isoZamani(mac?.fixture_request_started_at),
                receivedAt: isoZamani(mac?.fixture_received_at)
            },
            statistics: {
                requestStartedAt: isoZamani(mac?.stats_request_started_at),
                receivedAt: isoZamani(mac?.stats_received_at),
                source: mac?.stats_source || null,
                teamCount: Number.isFinite(Number(mac?.stats_team_count))
                    ? Number(mac.stats_team_count)
                    : null
            },
            liveOdds: {
                requestStartedAt: isoZamani(mac?.live_odds_request_started_at),
                receivedAt: isoZamani(mac?.live_odds_received_at)
            },
            prematch: {
                fetchedAt: isoZamani(mac?.prematch_fetched_at),
                observedAt: isoZamani(mac?.prematch_observed_at)
            }
        },
        teamMapping: {
            home: mac?.stats_home_mapping_method || null,
            away: mac?.stats_away_mapping_method || null,
            identityVerified: mac?.stats_identity_verified === true
        },
        coreSixComplete: temelStatsTam(mac),
        optionalObserved: Object.fromEntries(
            OPTIONAL_STAT_FIELDS.map(field => [field, alanGozlendiMi(mac?.[field])])
        )
    };
}


function egitimSnapshotBaglami(mac) {
    return {
        dataQuality: canliVeriKalitesi(mac),
        liveOdds: mac?.canli_oranlar && typeof mac.canli_oranlar === 'object'
            ? mac.canli_oranlar
            : {},
        prematch: {
            available: mac?.prematch_available === true,
            fetchedAt: isoZamani(mac?.prematch_fetched_at),
            observedAt: isoZamani(mac?.prematch_observed_at),
            source: mac?.prematch_source || null,
            bookmakerId: mac?.prematch_bookmaker_id ?? null,
            sourceCount: Number.isFinite(Number(mac?.prematch_source_count))
                ? Number(mac.prematch_source_count)
                : null,
            bookmakerCount: Number.isFinite(Number(mac?.prematch_bookmaker_count))
                ? Number(mac.prematch_bookmaker_count)
                : null,
            oneXTwo: mac?.prematch_available === true
                ? {
                    home: Number(mac.prematch_p_home),
                    draw: Number(mac.prematch_p_draw),
                    away: Number(mac.prematch_p_away),
                    odds: mac?.prematch_one_x_two_odds || null
                }
                : null,
            totals: mac?.prematch_totals && typeof mac.prematch_totals === 'object'
                ? mac.prematch_totals
                : {}
        }
    };
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
        // Opsiyonel bir alan taze cevapta yoksa önceki taramadan kalan değeri
        // taşımak farklı anları tek satırda karıştırır. Null da gerçek bir
        // gözlemdir ve açıkça üzerine yazılmalıdır.
        mac[field] = Object.prototype.hasOwnProperty.call(freshStats || {}, field)
            ? freshStats[field] ?? null
            : null;
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
        const homeMatch = takimStatsEslesmesiBul(
            statistics,
            fixture.teams?.home
        );
        const awayMatch = takimStatsEslesmesiBul(
            statistics,
            fixture.teams?.away
        );
        const distinctTeams = homeMatch.item !== awayMatch.item;
        const homeStatsObj = distinctTeams ? homeMatch.item : null;
        const awayStatsObj = distinctTeams ? awayMatch.item : null;
        const homeStats = homeStatsObj?.statistics;
        const awayStats = awayStatsObj?.statistics;

        // Maç bilgisini hiçbir zaman kaybetme. İstatistik yoksa null kalır;
        // yalnızca ML filtresi bu maçı Python'dan ayırır.
        return {
            fixture_id: Number(fixture.fixture?.id),
            _v23Events: Array.isArray(fixture.events) ? fixture.events : null,
            _v23EventsAt: fixture._dino_fixture_received_at || null,
            fixture_kickoff: fixture.fixture?.date || null,
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
            _v23LiveStats: {
                home: {shotsInsidebox:getStat(homeStats,'shots_insidebox'),shotsOutsidebox:getStat(homeStats,'shots_outsidebox'),blockedShots:getStat(homeStats,'blocked_shots')},
                away: {shotsInsidebox:getStat(awayStats,'shots_insidebox'),shotsOutsidebox:getStat(awayStats,'shots_outsidebox'),blockedShots:getStat(awayStats,'blocked_shots')}
            },
            stats_team_count: statistics.length,
            stats_home_mapping_method: homeMatch.method,
            stats_away_mapping_method: awayMatch.method,
            stats_identity_verified:
                distinctTeams && homeMatch.verified === true && awayMatch.verified === true,
            stats_source: statistics.length > 0
                ? 'API-Football Fixture Statistics'
                : null,
            fixture_request_started_at:
                fixture?._dino_fixture_request_started_at || null,
            fixture_received_at:
                fixture?._dino_fixture_received_at || null,
            stats_request_started_at: statistics.length > 0
                ? fixture?._dino_stats_request_started_at ||
                    fixture?._dino_fixture_request_started_at || null
                : null,
            stats_received_at: statistics.length > 0
                ? fixture?._dino_stats_received_at ||
                    fixture?._dino_fixture_received_at || null
                : null
        };
    });
}

async function direktFixtureStatsGetir(fixture) {
    const fixtureID = Number(fixture?.fixture?.id);
    if (!fixtureID) return null;

    try {
        const statsRequestStartedAt = new Date().toISOString();
        const response = await apiGet(
            `/fixtures/statistics?fixture=${fixtureID}`
        );
        const statsReceivedAt = new Date().toISOString();
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
            statistics,
            _dino_stats_request_started_at: statsRequestStartedAt,
            _dino_stats_received_at: statsReceivedAt
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

        enriched.stats_request_started_at = statsRequestStartedAt;
        enriched.stats_received_at = statsReceivedAt;
        return enriched;

    } catch (error) {
        addSystemLog(
            `> ⚠️ Fixture ${fixtureID} statistics hatası: ${error.message}`
        );
        return null;
    }
}


async function sinyalOncesiVerileriYenileVeDogrula(mac) {
    const verificationStartedAt = new Date().toISOString();
    const verificationEndedAt = () => new Date().toISOString();
    const originalScore = String(mac?.skor || '');
    const originalStatsSignature = temelStatImzasi(mac);
    const previousRecord = typeof candidateTracker.latestFixtureMoment === 'function'
        ? candidateTracker.latestFixtureMoment(mac?.fixture_id)
        : null;
    const previousMac = previousRecord
        ? kayitCanliStatsiniMacaCevir(previousRecord)
        : null;

    try {
        const fixtureRequestStartedAt = new Date().toISOString();
        const fixtureResponse = await apiGet(
            `/fixtures?id=${Number(mac.fixture_id)}`
        );
        const fixtureReceivedAt = new Date().toISOString();
        const latest = Array.isArray(fixtureResponse.data?.response)
            ? fixtureResponse.data.response[0]
            : null;

        if (
            !latest || Number(latest?.fixture?.id) !== Number(mac.fixture_id) ||
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
                verifiedAt: verificationEndedAt()
            };
        }

        latest._dino_fixture_request_started_at = fixtureRequestStartedAt;
        latest._dino_fixture_received_at = fixtureReceivedAt;
        if (Array.isArray(latest.statistics)) {
            latest._dino_stats_request_started_at = fixtureRequestStartedAt;
            latest._dino_stats_received_at = fixtureReceivedAt;
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
                verifiedAt: verificationEndedAt()
            };
        }

        const freshStats = await direktFixtureStatsGetir(latest);
        if (!freshStats || !temelStatsTam(freshStats) || !freshStats.stats_identity_verified) {
            return {
                ok: false,
                reason: 'taze /fixtures/statistics cevabında altı temel alan tamamlanamadı',
                verifiedAt: verificationEndedAt()
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
                verifiedAt: verificationEndedAt(),
                previousCapturedAt: previousRecord?.capturedAt || null
            };
        }

        const liveOddsRequestStartedAt = new Date().toISOString();
        const liveOddsResponse = await apiGet(
            '/odds/live',
            {
                params: {
                    fixture: Number(mac.fixture_id)
                }
            }
        );
        const liveOddsReceivedAt = new Date().toISOString();
        const refreshedOdds = parseLiveOdds(liveOddsResponse).get(
            Number(mac.fixture_id)
        );
        if (!refreshedOdds || Object.keys(refreshedOdds).length === 0) {
            return {
                ok: false,
                reason: 'sinyal öncesi taze canlı oran bulunamadı',
                verifiedAt: verificationEndedAt()
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
        mac.fixture_request_started_at = fixtureRequestStartedAt;
        mac.fixture_received_at = fixtureReceivedAt;
        mac.live_odds_request_started_at = liveOddsRequestStartedAt;
        mac.live_odds_received_at = liveOddsReceivedAt;
        mac.observation_started_at = verificationStartedAt;
        mac.observation_completed_at = verificationEndedAt();
        const verifiedAt = mac.observation_completed_at;

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
                teamIdentityVerified: true,
                shotsOnGoalNotAboveShots: true,
                scoreShotsConsistent: true,
                cumulativeStatsNonDecreasing: true,
                frozenStatsNotDetected: true
            }
        };
        mac.stats_validation = validation;
        // Reuse the already-fetched fixture events. Missing stays unknown;
        // a prior scan's timeline must not masquerade as a fresh response.
        mac._v23Events = Array.isArray(latest.events) ? latest.events : null;
        mac._v23EventsAt = fixtureReceivedAt;

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
            verifiedAt: verificationEndedAt()
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

        const liveFixtureRequestStartedAt = new Date().toISOString();
        const liveResponse =
            await apiGet(
                '/fixtures?live=all'
            );
        const liveFixtureReceivedAt = new Date().toISOString();


        const allLiveFixtures =
            liveResponse.data?.response ||
            [];

        for (const fixture of allLiveFixtures) {
            fixture._dino_fixture_request_started_at = liveFixtureRequestStartedAt;
            fixture._dino_fixture_received_at = liveFixtureReceivedAt;
        }


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


        const liveOddsRequestStartedAt = new Date().toISOString();
        const oddsResponse =
            await apiGet(
                '/odds/live'
            );
        const liveOddsReceivedAt = new Date().toISOString();


        const oddsMap =
            parseLiveOdds(
                oddsResponse
            );


        // /fixtures?live=all ile /odds/live kapsamları anlık olarak farklı
        // olabiliyor. Odds cevabındaki canlı fixture'ları da aday havuzuna ekle.
        const oddsLiveFixtures = Array.isArray(oddsResponse.data?.response)
            ? oddsResponse.data.response
            : [];
        for (const fixture of oddsLiveFixtures) {
            // Odds cevabında fixture durumu da bulunabilir. Canlı fixture
            // listesinin kapsamadığı maçlarda bu zaman, skor/dakika
            // gözleminin hangi API cevabından geldiğini açıkça belirtir.
            fixture._dino_fixture_request_started_at =
                fixture._dino_fixture_request_started_at || liveOddsRequestStartedAt;
            fixture._dino_fixture_received_at =
                fixture._dino_fixture_received_at || liveOddsReceivedAt;
        }
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

        // Only uses existing fixture/odds responses; never awaits history here.

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


            const fixtureBatchRequestStartedAt = new Date().toISOString();
            const statsResponse =
                await apiGet(
                    `/fixtures?ids=${ids}`
                );
            const fixtureBatchReceivedAt = new Date().toISOString();


            const returned =
                statsResponse.data?.response ||
                [];


            for (
                const fixture
                of returned
            ) {

                fixture._dino_fixture_request_started_at =
                    fixtureBatchRequestStartedAt;
                fixture._dino_fixture_received_at =
                    fixtureBatchReceivedAt;
                if (Array.isArray(fixture.statistics)) {
                    fixture._dino_stats_request_started_at =
                        fixtureBatchRequestStartedAt;
                    fixture._dino_stats_received_at =
                        fixtureBatchReceivedAt;
                }

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
                const detailRequestStartedAt = new Date().toISOString();
                const detailResponse = await apiGet(
                    `/fixtures?id=${fixtureID}`
                );
                const detailReceivedAt = new Date().toISOString();
                const detailedFixture = Array.isArray(detailResponse.data?.response)
                    ? detailResponse.data.response[0]
                    : null;

                if (!detailedFixture) {
                    addSystemLog(
                        `> ⚠️ Fixture ${fixtureID}: güncel skor detayı alınamadı, modelden çıkarıldı.`
                    );
                    continue;
                }

                detailedFixture._dino_fixture_request_started_at =
                    detailRequestStartedAt;
                detailedFixture._dino_fixture_received_at = detailReceivedAt;
                if (Array.isArray(detailedFixture.statistics)) {
                    detailedFixture._dino_stats_request_started_at =
                        detailRequestStartedAt;
                    detailedFixture._dino_stats_received_at = detailReceivedAt;
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
                        // Direkt endpoint aynı gözlemin son ve daha özel
                        // cevabıdır. Eksik opsiyonel alanlar dahil tamamını
                        // kopyalayarak batch cevabındaki eski değeri taşımayız.
                        enriched[field] = Object.prototype.hasOwnProperty.call(
                            fallbackStats,
                            field
                        )
                            ? fallbackStats[field] ?? null
                            : null;
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

            enriched.live_odds_request_started_at = liveOddsRequestStartedAt;
            enriched.live_odds_received_at = liveOddsReceivedAt;

            enriched.model_hazir = temelStatsTam(enriched);

            // Pre-match verisi yalnızca canlı istatistiği gerçekten tam olan
            // adaylar için çekilir. Sonuç fixture bazında diske önbelleklenir;
            // sonraki 10 dakikalık taramalar yeni API isteği üretmez.
            const prematch = enriched.model_hazir
                ? await prematchOddsGetir(fixtureID)
                : null;
            prematchVerisiniMacaEkle(enriched, prematch);
            enriched.prematch_observed_at = new Date().toISOString();
            enriched.observation_started_at = ilkZaman(
                enriched.fixture_request_started_at,
                enriched.stats_request_started_at,
                enriched.live_odds_request_started_at
            );
            enriched.observation_completed_at = new Date().toISOString();

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

    if (DINO_V17_TARIFF_ENABLED) {
        const yeniOncelik = Number(yeniAday?.tarife_onceligi);
        const mevcutOncelik = Number(mevcutAday?.tarife_onceligi);
        if (Number.isFinite(yeniOncelik) && Number.isFinite(mevcutOncelik)) {
            if (yeniOncelik !== mevcutOncelik) return yeniOncelik > mevcutOncelik;
        } else if (Number.isFinite(yeniOncelik)) {
            return true;
        }
    }

    const yeniSelector = Number(
        yeniAday?.karar_yuzde ?? yeniAday?.selector_yuzde
    );
    const mevcutSelector = Number(
        mevcutAday?.karar_yuzde ?? mevcutAday?.selector_yuzde
    );
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
    v18Score,
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
        minimumOddAtEvaluation: DINO_V17_TARIFF_ENABLED
            ? selectorPolicy?.minimumOdd ?? ACTIVE_MIN_SIGNAL_ODD
            : ACTIVE_MIN_SIGNAL_ODD,
        minimumSignalMinuteAtEvaluation: DINO_V17_TARIFF_ENABLED
            ? selectorPolicy?.rule?.minuteLow ?? TELEGRAM_MIN_MINUTE
            : TELEGRAM_MIN_MINUTE,
        selectorV2Enabled: DINO_V2_SELECTOR_ENABLED,
        selectorV2Probability: Number.isFinite(Number(selectorScore?.selectorProbability))
            ? Number(Number(selectorScore.selectorProbability).toFixed(1))
            : null,
        selectorV2RawProbability: Number.isFinite(Number(selectorScore?.selectorRawProbability))
            ? Number(Number(selectorScore.selectorRawProbability).toFixed(1))
            : null,
        v18Probability: Number.isFinite(Number(v18Score?.v18Probability))
            ? Number(Number(v18Score.v18Probability).toFixed(1))
            : null,
        v18Edge: Number.isFinite(Number(v18Score?.v18Edge))
            ? Number(Number(v18Score.v18Edge).toFixed(1))
            : null,
        decisionModel: DINO_V17_TARIFF_ENABLED
            ? selectorPolicy?.decisionModel || null
            : DINO_V2_SELECTOR_ENABLED ? 'v16' : 'dino',
        decisionProbability: Number.isFinite(Number(selectorPolicy?.decisionProbability))
            ? Number(Number(selectorPolicy.decisionProbability).toFixed(1))
            : null,
        decisionEdge: Number.isFinite(Number(selectorPolicy?.decisionEdge))
            ? Number(Number(selectorPolicy.decisionEdge).toFixed(1))
            : null,
        selectorV2Threshold: DINO_V17_TARIFF_ENABLED
            ? selectorPolicy?.rule?.probabilityMinimum ?? null
            : Number(dinoSelectorV2.MODEL.policy.threshold * 100),
        selectorV2MinimumOdd: ACTIVE_MIN_SIGNAL_ODD,
        selectorV2Eligible: selectorPolicy?.eligible === true,
        selectorV2Reasons: Array.isArray(selectorPolicy?.reasons)
            ? selectorPolicy.reasons
            : [],
        tariffEnabled: DINO_V17_TARIFF_ENABLED,
        tariffVersion: DINO_V17_TARIFF_ENABLED ? marketTariff.VERSION : null,
        tariffSlot: DINO_V17_TARIFF_ENABLED ? selectorPolicy?.slot || null : null,
        tariffRuleId: DINO_V17_TARIFF_ENABLED ? selectorPolicy?.rule?.id || null : null,
        tariffEdgeField: DINO_V17_TARIFF_ENABLED ? selectorPolicy?.rule?.edgeField || null : null,
        tariffV16Edge: DINO_V17_TARIFF_ENABLED && Number.isFinite(Number(selectorPolicy?.v16Edge))
            ? Number(Number(selectorPolicy.v16Edge).toFixed(1))
            : null,
        decision: 'evaluating',
        decisionDetail: null
    };
}


const MODEL_MARKET_PATTERN = /^(MS1|X|MS2|[0-4]\.5_(ALT|UST))$/;


function tarifeGonderimDurumu(mac) {
    const primary = fixtureGonderimKaydi(mac, 'strong');
    const follow = fixtureGonderimKaydi(mac, 'surprise');
    return {
        primary,
        follow,
        slot: marketTariff.currentSlot(primary, follow)
    };
}


function basitKuralOnSecimi(mac, rules) {
    const minute = Number(mac?.dakika);
    return (Array.isArray(rules) ? rules : []).some(rule => {
        const oddsData = mac?.canli_oranlar?.[rule.market];
        const odds = oddsData && typeof oddsData === 'object'
            ? Number(oddsData.oran)
            : Number(oddsData);
        return (
            Number.isFinite(minute) &&
            minute >= Number(rule.minuteLow) &&
            minute <= Number(rule.minuteHigh) &&
            Number.isFinite(odds) &&
            odds >= Number(rule.minimumOdd) &&
            odds <= Number(rule.maximumOdd)
        );
    });
}


function coreGolgeOnSecimi(mac) {
    if (!DINO_CORE_SHADOW_ENABLED) return false;
    if (coreShadowTracker.hasSignal(Number(mac?.fixture_id), 'strong')) return false;
    return coreShadowTariff.RULES.some(rule => {
        const oddsData = mac?.canli_oranlar?.[rule.market];
        const odds = oddsData && typeof oddsData === 'object'
            ? Number(oddsData.oran)
            : Number(oddsData);
        return coreShadowTariff.canPreselect({
            market: rule.market,
            minute: mac?.dakika,
            odds
        });
    });
}


function legacyV17GolgeOnSecimi(mac, dino) {
    if (!DINO_LEGACY_V17_SHADOW_ENABLED) return false;
    const state = legacyV17GolgeDurumu(mac);
    if (!state.slot) return false;
    const rules = state.slot === 'follow'
        ? legacyV17Tariff.FOLLOW_RULES
        : legacyV17Tariff.PRIMARY_RULES;
    return rules.some(rule => {
        const oddsData = mac?.canli_oranlar?.[rule.market];
        const odds = oddsData && typeof oddsData === 'object'
            ? Number(oddsData.oran)
            : Number(oddsData);
        return legacyV17Tariff.canPreselect({
            slot: state.slot,
            market: rule.market,
            minute: mac?.dakika,
            odds,
            dinoProbability: dino?.[rule.market],
            previousPrimary: state.primary
        });
    });
}


function selectorV2OnAdayMi(mac, dino, liveOnlyDino) {
    if (telegramRouter.preselect(mac, dino)) return true; // Independent of legacy active-selector flags.
    if (!DINO_V2_SELECTOR_ENABLED) return true;
    const marketNames = [...new Set([
        ...Object.keys(mac?.canli_oranlar || {}),
        ...Object.keys(dino || {}).filter(key => MODEL_MARKET_PATTERN.test(key))
    ])];

    if (DINO_V17_TARIFF_ENABLED) {
        return telegramRouter.preselect(mac, dino) || independentLab.preselect(mac, dino) ||
            v22Lab.preselect(mac, dino) || legacyV17GolgeOnSecimi(mac, dino);
    }

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
    // Bir tarama dakikalar sürebilir. Etiketlenecek an, taramanın başlangıcı
    // değil bu maça ait kaynakların tamamlandığı gerçek gözlem anıdır.
    const activeCapturedAt = isoZamani(mac?.observation_completed_at) ||
        isoZamani(capturedAt) ||
        new Date().toISOString();
    const selectorShadowContext = mac?._selectorShadowContext || null;
    const tarifeDurumu = DINO_V17_TARIFF_ENABLED
        ? tarifeGonderimDurumu(mac)
        : null;

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
        const legacySelectorPolicy = DINO_V2_SELECTOR_ENABLED
            ? dinoSelectorV2.policyCheck(
                mac,
                selectorScore,
                selectorShadowContext,
                DINO_V2_MIN_ODD
            )
            : null;
        const v18Score = DINO_V17_TARIFF_ENABLED
            ? dinoSelectorV18.scoreMarket(
                mac,
                market,
                dino,
                liveOnlyDino,
                selectorShadowContext
            )
            : null;
        const selectorPolicy = DINO_V17_TARIFF_ENABLED
            ? (
                tarifeDurumu?.slot
                    ? marketTariff.check({
                        slot: tarifeDurumu.slot,
                        market,
                        minute: mac?.dakika,
                        odds: piyasaOrani,
                        dinoProbability: dinoYuzde,
                        selectorProbability: selectorScore?.selectorProbability,
                        v18Probability: v18Score?.v18Probability,
                        v18Edge: v18Score?.v18Edge,
                        previousPrimary: tarifeDurumu.primary
                    })
                    : {
                        eligible: false,
                        reasons: ['bu maç iki sinyal hakkını da kullandı'],
                        slot: null,
                        rule: null,
                        priority: -Infinity
                    }
            )
            : legacySelectorPolicy;
        const sinyalTuru = DINO_V17_TARIFF_ENABLED
            ? (
                selectorPolicy?.eligible
                    ? selectorPolicy.slot === 'follow' ? 'surprise' : 'strong'
                    : null
            )
            : DINO_V2_SELECTOR_ENABLED
                ? (selectorPolicy?.eligible ? 'strong' : null)
            : legacySinyalTuru;
        const turEtiketi = DINO_V17_TARIFF_ENABLED
            ? (selectorPolicy?.eligible
                ? selectorPolicy.slot === 'follow' ? 'HİBRİT TAKİP UYGUN' : 'HİBRİT İLK UYGUN'
                : 'HİBRİT RED')
            : DINO_V2_SELECTOR_ENABLED
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
            v18Score,
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
            `> 🧪 ${mac.mac_isim} | ${market} | Temel:%${dinoYuzde} | V16:${Number.isFinite(Number(selectorScore?.selectorProbability)) ? `%${Number(selectorScore.selectorProbability).toFixed(1)}` : '-'} | V18:${Number.isFinite(Number(v18Score?.v18Probability)) ? `%${Number(v18Score.v18Probability).toFixed(1)}` : '-'} | Oran:${piyasaOrani} | Piyasa:%${piyasaYuzde.toFixed(1)} | EDGE:${edge.toFixed(1)} | ${turEtiketi}`
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
            auditRecord.decision = DINO_V17_TARIFF_ENABLED
                ? 'hybrid_tariff_rejected'
                : 'selector_v2_rejected';
            auditRecord.decisionDetail = DINO_V17_TARIFF_ENABLED
                ? `Hibrit market tarifesi reddetti: ${(selectorPolicy?.reasons || []).join(', ') || 'uygun kural yok'}.`
                : `V16 ikinci katman reddetti: ${(selectorPolicy?.reasons || []).join(', ') || 'puan üretilemedi'}.`;
            continue;
        }

        if (
            !DINO_V2_SELECTOR_ENABLED &&
            !sinyalTuru &&
            dinoYuzde >= SIGNAL_RULES.surprise.minProbability &&
            Number(mac?.dakika) < TELEGRAM_MIN_MINUTE
        ) {
            auditRecord.decision = 'signal_minute_waiting';
            auditRecord.decisionDetail = `Temel sınıfı uygun fakat Telegram kapısı ${TELEGRAM_MIN_MINUTE}. dakikada açılır.`;
            continue;
        }

        if (!DINO_V2_SELECTOR_ENABLED && !sinyalTuru) {
            auditRecord.decision = 'class_outside';
            auditRecord.decisionDetail = 'Temel ihtimali ve dakika, gölge/sürpriz/güçlü sınıfına uymadı.';
            continue;
        }

        const activeMinimumOdd = DINO_V17_TARIFF_ENABLED
            ? selectorPolicy?.minimumOdd ?? ACTIVE_MIN_SIGNAL_ODD
            : ACTIVE_MIN_SIGNAL_ODD;
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
            auditRecord.decisionDetail = 'Temel %60–69.9: Telegram dışı gölge sinyal olarak kaydedildi.';
            continue;
        }

        if (
            !DINO_V2_SELECTOR_ENABLED &&
            PRECISION_MODE.requirePrematchOneXTwo &&
            dino?.MODEL_VARYANTI !== 'live_plus_prematch'
        ) {
            auditRecord.decision = 'prematch_missing';
            auditRecord.decisionDetail = 'Precision modunda pre-match 1X2 zorunlu; maç live_only kaldı.';
            continue;
        }

        const totalMarket = /_(ALT|UST)$/.test(market);
        if (
            !DINO_V2_SELECTOR_ENABLED &&
            totalMarket &&
            PRECISION_MODE.requireExactPrematchTotal
        ) {
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
            v18_yuzde: Number.isFinite(Number(v18Score?.v18Probability))
                ? Number(v18Score.v18Probability.toFixed(1))
                : null,
            v18_edge: Number.isFinite(Number(v18Score?.v18Edge))
                ? Number(v18Score.v18Edge.toFixed(1))
                : null,
            karar_modeli: selectorPolicy?.decisionModel || (DINO_V2_SELECTOR_ENABLED ? 'v16' : 'dino'),
            karar_yuzde: Number.isFinite(Number(selectorPolicy?.decisionProbability))
                ? Number(selectorPolicy.decisionProbability.toFixed(1))
                : Number.isFinite(Number(selectorScore?.selectorProbability))
                    ? Number(selectorScore.selectorProbability.toFixed(1))
                    : dinoYuzde,
            karar_edge: Number.isFinite(Number(selectorPolicy?.decisionEdge))
                ? Number(selectorPolicy.decisionEdge.toFixed(1))
                : Number.isFinite(edge) ? Number(edge.toFixed(1)) : null,
            tarife_surumu: DINO_V17_TARIFF_ENABLED ? marketTariff.VERSION : null,
            tarife_yuvasi: DINO_V17_TARIFF_ENABLED ? selectorPolicy?.slot : null,
            tarife_kural_id: DINO_V17_TARIFF_ENABLED ? selectorPolicy?.rule?.id : null,
            sinyal_kaynaklari: selectorPolicy?.signalSources || [],
            tarife_onceligi: DINO_V17_TARIFF_ENABLED ? selectorPolicy?.priority : null,
            v16_edge: Number.isFinite(Number(selectorPolicy?.v16Edge))
                ? Number(selectorPolicy.v16Edge.toFixed(1))
                : null,
            minimum_oran: selectorPolicy?.minimumOdd ?? ACTIVE_MIN_SIGNAL_ODD,
            maximum_oran: selectorPolicy?.maximumOdd ?? null,
            auditRecord
        };

        if (firsatAdayiDahaIyiMi(aday, secilenler[sinyalTuru])) {
            secilenler[sinyalTuru] = aday;
        }
    }

    for (const selected of Object.values(secilenler).filter(Boolean)) {
        selected.auditRecord.decision = 'selected_for_class';
        selected.auditRecord.decisionDetail = DINO_V17_TARIFF_ENABLED
            ? `Hibrit ${selected.tarife_yuvasi === 'follow' ? 'takip' : 'ilk'} sinyal haritasında ${String(selected.karar_modeli).toUpperCase()} ile uygun market seçildi (${selected.tarife_kural_id}).`
            : DINO_V2_SELECTOR_ENABLED
            ? 'V16 ikinci katmanda gerçekleşme olasılığı en yüksek doğrulanmış market.'
            : 'Sınıfındaki en yüksek Temel ihtimalli uygun market.';
    }

    if (auditRecords.length > 0) {
        // Kaynak zamanları ve ham oran/pre-match bağlamı market satırlarında
        // tekrar edilmez. İlk satırdaki tek snapshotContext hem 50 binlik
        // denetim geçmişini küçük tutar hem günlük JSONL arşivine eksiksiz
        // bir nedensel gözlem aktarır.
        auditRecords[0].dataQuality = canliVeriKalitesi(mac);
        auditRecords[0].snapshotContext = egitimSnapshotBaglami(mac);
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

        return "Canlı istatistikler ve giriş skoru birlikte değerlendirilerek bu market seçildi.";

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

V21/V22 kuralları bu marketi seçti. Seçim pozitif EDGE veya kazanç garantisi anlamına gelmez.

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

Görevin:
Seçilen marketin canlı verilerle ilişkisini en fazla 2 kısa Türkçe cümleyle açıkla; toplam 240 karakteri geçme.
Model adı, kaynak, yüzdeler, EDGE, value ve karar motoru ifadeleri yazma. Güvenli, garanti, kesin veya yatırım dili kullanma.

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


        return "Canlı veriler ve giriş skoru üzerinden seçilen market değerlendirildi.";

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
            v18Probability: firsat?.v18_yuzde,
            v18Edge: firsat?.v18_edge,
            decisionModel: firsat?.karar_modeli,
            decisionProbability: firsat?.karar_yuzde,
            decisionEdge: firsat?.karar_edge,
            tariffVersion: firsat?.tarife_surumu,
            tariffSlot: firsat?.tarife_yuvasi,
            tariffRuleId: firsat?.tarife_kural_id,
            signalSources: firsat?.sinyal_kaynaklari,
            v16Edge: firsat?.v16_edge,
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
            `> 🗃️ Paylaşılan sinyal kaydedildi: ${kayit.match} | ${kayit.tariffSlot === 'follow' ? 'HİBRİT TAKİP' : kayit.tariffSlot === 'primary' ? 'HİBRİT İLK' : kayit.signalType === 'strong' ? 'GÜÇLÜ' : 'SÜRPRİZ'} | ${kayit.market}`
        );
    } catch (error) {
        // Telegram gönderilmiş olsa bile takip dosyası hatası aynı mesajın
        // yeniden atılmasına sebep olmamalı; gönderim kilidi ayrı tutulur.
        addSystemLog(
            `> ⚠️ Paylaşılan sinyal takip dosyasına yazılamadı: ${error.message}`
        );
    }
}


function v20ModelBilgisi() {
    return {
        enabled: DINO_V20_SHADOW_ENABLED,
        available: Boolean(v20Engine?.model && v20Engine?.policy && !v20Engine?.error),
        reason: v20Engine?.error || null,
        modelVersion: v20Engine?.model?.version || null,
        policy: v20Engine?.policy || null,
        freshDataPolicy: V20_FRESH_DATA_POLICY
    };
}


function v20GolgeDegerlendir(mac, capturedAt) {
    if (!DINO_V20_SHADOW_ENABLED) {
        return {
            available: false,
            reason: 'V20 shadow disabled',
            scores: [],
            selected: null,
            snapshot: null
        };
    }

    try {
        return v20Engine.evaluate(
            mac,
            mac?._selectorShadowContext || null,
            isoZamani(capturedAt) ||
                isoZamani(mac?.observation_completed_at) ||
                new Date().toISOString()
        );
    } catch (error) {
        addSystemLog(`> ⚠️ V20 gölge değerlendirmesi atlandı (${mac?.mac_isim || 'bilinmeyen maç'}): ${error.message}`);
        return {
            available: false,
            reason: error.message,
            scores: [],
            selected: null,
            snapshot: null
        };
    }
}


function v20AdayKayitlariniZenginlestir(records, evaluation) {
    if (!Array.isArray(records) || records.length === 0) return;
    const scores = new Map(
        (Array.isArray(evaluation?.scores) ? evaluation.scores : [])
            .map(score => [score.market, score])
    );

    for (const record of records) {
        const score = scores.get(record?.market);
        record.v20Available = evaluation?.available === true;
        record.v20ModelVersion = evaluation?.modelVersion ||
            v20Engine?.model?.version || null;
        record.v20Probability = Number.isFinite(Number(score?.probability))
            ? Number(Number(score.probability).toFixed(3))
            : null;
        record.v20Edge = Number.isFinite(Number(score?.edgeRaw))
            ? Number(Number(score.edgeRaw).toFixed(3))
            : null;
        record.v20ExpectedValue = Number.isFinite(Number(score?.ev))
            ? Number(Number(score.ev).toFixed(5))
            : null;
        record.v20Eligible = score?.eligible === true;
    }

    records[0].v20Evaluation = {
        available: evaluation?.available === true,
        reason: evaluation?.reason || null,
        modelVersion: evaluation?.modelVersion || v20Engine?.model?.version || null,
        selectedMarket: evaluation?.selected?.market || null
    };
}


function v20BagimsizDenetimKayitlari({ mac, evaluation, scanId, decision, decisionDetail }) {
    const markets = V20_MARKETS.filter(market => mac?.canli_oranlar?.[market] != null);
    const snapshotContext = egitimSnapshotBaglami(mac);
    const records = (markets.length ? markets : [null]).map(market => {
        const oddsData = market ? mac.canli_oranlar[market] : null;
        const oddsValue = oddsData && typeof oddsData === 'object' ? oddsData.oran : oddsData;
        const odds = alanGozlendiMi(oddsValue) ? Number(oddsValue) : null;
        return {
            recordId: `${scanId}-${Number(mac.fixture_id)}-${market || 'MODEL'}`,
            scanId,
            capturedAt: isoZamani(mac?.observation_completed_at) || new Date().toISOString(),
            fixtureId: Number(mac.fixture_id),
            match: mac.mac_isim,
            league: mac.lig,
            minute: Number(mac.dakika),
            score: mac.skor,
            statusShort: mac.status_short || null,
            market,
            odds,
            bookmaker: oddsData?.bookmaker || null,
            marketProbability: odds > 1 ? 100 / odds : null,
            statsSource: mac.stats_source || null,
            statsComplete: temelStatsTam(mac),
            statsValidation: mac.stats_validation || null,
            liveStats: paylasilanCanliStatsAnlikGoruntusu(mac),
            dataQuality: snapshotContext.dataQuality,
            modelVariant: 'v20_live_independent',
            decision,
            decisionDetail
        };
    });
    records[0].snapshotContext = snapshotContext;
    v20AdayKayitlariniZenginlestir(records, evaluation);
    return records;
}


function v20TazeKayitUygunMu(mac, evaluation, capturedAt, requireFinalCheck = true) {
    const selected = evaluation?.selected;
    const recordedAt = isoZamani(capturedAt);
    const quality = canliVeriKalitesi(mac);
    const verifiedAt = isoZamani(mac?.stats_validation?.verifiedAt);
    if (!selected || evaluation?.available !== true || !V20_MARKETS.includes(selected.market) ||
        !recordedAt || recordedAt !== verifiedAt || recordedAt !== quality.observationCompletedAt ||
        mac?.stats_validation?.status !== 'passed' || mac?.stats_validation?.liveOddsRefreshed !== true ||
        !quality.teamMapping.identityVerified || !quality.coreSixComplete ||
        !hazirMacHalaUygunMu(mac) || !tazeCanliStatsTutarlilikKontrolu(mac).ok) return false;

    const started = new Date(quality.observationStartedAt).getTime();
    const ended = new Date(recordedAt).getTime();
    if (!quality.observationStartedAt || ended < started ||
        ended - started > V20_FRESH_DATA_POLICY.maximumAcquisitionMs ||
        quality.liveSourceSkewMs > V20_FRESH_DATA_POLICY.maximumSourceSkewMs ||
        Date.now() - ended > V20_FRESH_DATA_POLICY.maximumSnapshotAgeMs || ended > Date.now()) return false;
    for (const source of ['fixture', 'statistics', 'liveOdds']) {
        const timing = quality.sources[source];
        const requested = new Date(timing.requestStartedAt).getTime();
        const received = new Date(timing.receivedAt).getTime();
        if (!timing.requestStartedAt || !timing.receivedAt || requested < started ||
            received < requested || received > ended) return false;
    }
    if (requireFinalCheck) {
        const finalCheck = mac?.stats_validation?.v20FinalFixture;
        const requested = new Date(finalCheck?.requestedAt).getTime();
        const received = new Date(finalCheck?.receivedAt).getTime();
        if (finalCheck?.status !== 'passed' || !Number.isFinite(requested) || !Number.isFinite(received) ||
            requested < ended || received < requested ||
            received - ended > V20_FRESH_DATA_POLICY.maximumFinalCheckDelayMs ||
            finalCheck?.score !== mac.skor || finalCheck?.statusShort !== mac.status_short) return false;
    }
    if (![selected.odds, selected.probability, selected.edgeRaw, selected.ev]
        .every(value => alanGozlendiMi(value)) || !v20Engine.policy ||
        !v20PolicyEligible(selected, Number(mac.dakika), v20Engine.policy)) return false;
    const currentSnapshot = v20SnapshotFromMac(mac, recordedAt, mac?._selectorShadowContext || null);
    return JSON.stringify(evaluation.snapshot) === JSON.stringify(currentSnapshot) &&
        Number(currentSnapshot.markets?.[selected.market]?.odds) === Number(selected.odds) &&
        Math.abs(Number(selected.edgeRaw) - (Number(selected.probability) - 100 / Number(selected.odds))) < 1e-7 &&
        Math.abs(Number(selected.ev) - (Number(selected.probability) / 100 * Number(selected.odds) - 1)) < 1e-7;
}


async function v20TazeSonSkorDogrulaVeKaydet({ mac, evaluation, capturedAt }) {
    if (!DINO_V20_SHADOW_ENABLED || !v20TazeKayitUygunMu(mac, evaluation, capturedAt, false)) return null;
    if (v20ShadowTracker.hasSignal(Number(mac.fixture_id), 'strong')) return null;
    try {
        const requestedAt = new Date().toISOString();
        const response = await apiGet(`/fixtures?id=${Number(mac.fixture_id)}`);
        const receivedAt = new Date().toISOString();
        const fixture = response?.data?.response?.[0];
        const score = `${fixture?.goals?.home}-${fixture?.goals?.away}`;
        const sameTeams = ['home', 'away'].every(side =>
            !(Number(mac[`${side}_team_id`]) > 0) ||
            Number(fixture?.teams?.[side]?.id) === Number(mac[`${side}_team_id`])
        );
        const passed = Number(fixture?.fixture?.id) === Number(mac.fixture_id) && sameTeams &&
            canliFixtureUygunMu(fixture, 25, 80) && score === mac.skor &&
            fixture?.fixture?.status?.short === mac.status_short;
        mac.stats_validation.v20FinalFixture = {
            status: passed ? 'passed' : 'failed', requestedAt, receivedAt,
            score, statusShort: fixture?.fixture?.status?.short || null,
            minute: fixture?.fixture?.status?.elapsed ?? null
        };
        if (!passed) {
            addSystemLog(`> ⛔ ${mac.mac_isim}: V20 son fixture kontrolünde skor/canlılık/kimlik değişti; gölge kaydı engellendi.`);
            return null;
        }
        return v20GolgeSinyaliniKaydet({ mac, evaluation, capturedAt });
    } catch (error) {
        addSystemLog(`> ⚠️ V20 son fixture kontrolü başarısız: ${error.message}`);
        return null;
    }
}


function v20GolgeSinyaliniKaydet({ mac, evaluation, capturedAt }) {
    try {
        if (!DINO_V20_SHADOW_ENABLED || !v20TazeKayitUygunMu(mac, evaluation, capturedAt)) return null;
        return v20GolgeKaydiniYaz({ mac, evaluation, capturedAt });
    } catch (error) {
        // A shadow persistence failure must not interrupt the active Telegram branch.
        addSystemLog(`> ⚠️ V20 gölge kaydı yazılamadı: ${error.message}`);
        return null;
    }
}


function v20GolgeKaydiniYaz({ mac, evaluation, capturedAt }) {
    if (!DINO_V20_SHADOW_ENABLED || evaluation?.available !== true) return null;
    const selected = evaluation?.selected;
    const fixtureId = Number(mac?.fixture_id);
    if (!selected || !Number.isFinite(fixtureId) || fixtureId <= 0) return null;
    if (v20ShadowTracker.hasSignal(fixtureId, 'strong')) {
        return v20ShadowTracker.findSignal(fixtureId, 'strong');
    }

    const odds = Number(selected.odds);
    const probability = Number(selected.probability);
    const edge = Number(selected.edgeRaw);
    const expectedValue = Number(selected.ev);
    if (![odds, probability, edge, expectedValue].every(Number.isFinite)) return null;

    const oddsData = mac?.canli_oranlar?.[selected.market];
    const modelVersion = evaluation?.modelVersion || v20Engine?.model?.version || null;
    const recordedAt = isoZamani(capturedAt) ||
        isoZamani(mac?.observation_completed_at) ||
        new Date().toISOString();
    const record = v20ShadowTracker.recordSent({
        fixtureId,
        signalType: 'strong',
        sentAt: recordedAt,
        telegramMessageId: null,
        match: mac?.mac_isim,
        league: mac?.lig,
        minute: mac?.dakika,
        score: mac?.skor,
        market: selected.market,
        dinoProbability: null,
        edge,
        odds,
        bookmaker: oddsData && typeof oddsData === 'object'
            ? oddsData.bookmaker || null
            : null,
        marketProbability: 100 / odds,
        modelVariant: 'v20_live_independent',
        selectorV2ModelVersion: modelVersion,
        decisionModel: 'v20',
        decisionProbability: probability,
        decisionEdge: edge,
        tariffVersion: 'v20-frozen-policy',
        tariffSlot: 'primary',
        tariffRuleId: 'v20-frozen-policy',
        prematchSource: mac?.prematch_source || null,
        prematchProbabilities: mac?.prematch_available === true
            ? {
                home: mac.prematch_p_home,
                draw: mac.prematch_p_draw,
                away: mac.prematch_p_away
            }
            : null,
        prematchMarketSupport: prematchMarketDestegi(mac, selected.market),
        prematchMarketSource: prematchMarketKaynagi(mac, selected.market),
        statsSource: mac?.stats_source || null,
        statsValidation: mac?.stats_validation || null,
        liveStats: paylasilanCanliStatsAnlikGoruntusu(mac),
        shadowContext: {
            kind: 'v20-independent-shadow',
            decisionImpact: false,
            telegram: false,
            modelVersion,
            v20ExpectedValue: expectedValue,
            v20Snapshot: evaluation.snapshot || null,
            dataQuality: canliVeriKalitesi(mac),
            sourceContext: mac?._selectorShadowContext || null
        },
        analysis: 'V20 bağımsız model; taze fixture, istatistik ve canlı oran doğrulamasından geçti. Telegram kararına etkisi yok.'
    });

    addSystemLog(
        `> 🧠 V20 GÖLGE: ${record.match} | ${record.market} | %${probability.toFixed(1)} | EDGE ${edge >= 0 ? '+' : ''}${edge.toFixed(1)} | EV ${(expectedValue * 100).toFixed(1)}% | oran ${odds.toFixed(3)} | Telegram yok.`
    );
    return record;
}


function v20SinyalSunumu(signal) {
    const context = signal?.shadowContext || {};
    return {
        ...signal,
        v20Probability: Number.isFinite(Number(signal?.decisionProbability))
            ? Number(signal.decisionProbability)
            : null,
        v20Edge: Number.isFinite(Number(signal?.decisionEdge))
            ? Number(signal.decisionEdge)
            : null,
        v20ExpectedValue: Number.isFinite(Number(context?.v20ExpectedValue))
            ? Number(context.v20ExpectedValue)
            : null,
        v20ModelVersion: signal?.selectorV2ModelVersion ||
            context?.modelVersion || null,
        dataQuality: context?.dataQuality || null,
        v20Snapshot: context?.v20Snapshot || null
    };
}


async function v20BagimsizTazeDogrulaVeKaydet(mac, initialEvaluation, candidateAuditRows = [], scanId = `v20-${Date.now()}`) {
    const fixtureId = Number(mac?.fixture_id);
    if (
        initialEvaluation?.selected == null ||
        !Number.isFinite(fixtureId) ||
        v20ShadowTracker.hasSignal(fixtureId, 'strong')
    ) {
        return { attempted: false, recorded: false };
    }

    const freshValidation = await sinyalOncesiVerileriYenileVeDogrula(mac);
    if (!freshValidation.ok) {
        addSystemLog(
            `> ⛔ ${mac.mac_isim}: V20 gölge adayı taze veri doğrulamasından geçemedi (${freshValidation.reason || 'bilinmeyen neden'}).`
        );
        return {
            attempted: true,
            recorded: false,
            freshValidation
        };
    }

    const freshEvaluation = v20GolgeDegerlendir(
        mac,
        freshValidation.verifiedAt
    );
    candidateAuditRows.push(...v20BagimsizDenetimKayitlari({
        mac,
        evaluation: freshEvaluation,
        scanId: `${scanId}-verified-${fixtureId}`,
        decision: 'v20_fresh_shadow',
        decisionDetail: 'Bağımsız V20 taze gözlemi; Telegram kararına etkisi yok.'
    }));
    const record = await v20TazeSonSkorDogrulaVeKaydet({
        mac,
        evaluation: freshEvaluation,
        capturedAt: freshValidation.verifiedAt
    });
    return {
        attempted: true,
        recorded: Boolean(record),
        freshValidation,
        freshEvaluation,
        record
    };
}


function coreGolgeSeciminiBul({ mac, dino, liveOnlyDino }) {
    if (!DINO_CORE_SHADOW_ENABLED) return null;
    const fixtureId = Number(mac?.fixture_id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return null;
    if (coreShadowTracker.hasSignal(fixtureId, 'strong')) return null;

    const candidates = [];
    for (const rule of coreShadowTariff.RULES) {
        if (toplamGolMarketiSkoraGoreSonuclanmisMi(rule.market, mac?.skor)) {
            continue;
        }
        const score = dinoSelectorV18.scoreMarket(
            mac,
            rule.market,
            dino,
            liveOnlyDino,
            mac?._selectorShadowContext || null
        );
        if (!score) continue;
        const policy = coreShadowTariff.check({
            market: rule.market,
            minute: mac?.dakika,
            odds: score.odds,
            v18Probability: score.v18Probability,
            v18Edge: score.v18Edge
        });
        if (policy.eligible) {
            candidates.push({ market: rule.market, rule, score, policy });
        }
    }

    candidates.sort((left, right) =>
        Number(right.policy.priority) - Number(left.policy.priority) ||
        Number(right.score.v18Probability) - Number(left.score.v18Probability) ||
        Number(right.score.odds) - Number(left.score.odds)
    );
    return candidates[0] || null;
}


function coreGolgeAdayiniKaydet({ mac, dino, liveOnlyDino, capturedAt }) {
    const selected = coreGolgeSeciminiBul({ mac, dino, liveOnlyDino });
    if (!selected) return null;
    // Bu yeni deney yalnız aynı taze kontrolü gerçekten geçmiş anları ölçer.
    if (mac?.stats_validation?.status !== 'passed') return null;

    const fixtureId = Number(mac.fixture_id);
    const oddsData = mac?.canli_oranlar?.[selected.market];
    const score = selected.score;
    const record = coreShadowTracker.recordSent({
        fixtureId,
        signalType: 'strong',
        sentAt: capturedAt || new Date().toISOString(),
        telegramMessageId: null,
        match: mac?.mac_isim,
        league: mac?.lig,
        minute: mac?.dakika,
        score: mac?.skor,
        market: selected.market,
        dinoProbability: Number(score.dinoProbability.toFixed(3)),
        edge: Number(score.v18Edge.toFixed(3)),
        odds: Number(score.odds.toFixed(3)),
        bookmaker: oddsData && typeof oddsData === 'object'
            ? oddsData.bookmaker || null
            : null,
        marketProbability: Number(score.liveProbability.toFixed(3)),
        modelVariant: 'v20_two_rule_core_shadow_fresh_only',
        liveOnlyProbability: Number(liveOnlyDino?.[selected.market]),
        selectorV2Probability: Number(score.v18Probability.toFixed(3)),
        selectorV2RawProbability: Number(score.v18Probability.toFixed(3)),
        selectorV2ModelVersion: dinoSelectorV18.MODEL.version,
        v18Probability: Number(score.v18Probability.toFixed(3)),
        v18Edge: Number(score.v18Edge.toFixed(3)),
        decisionModel: 'v18',
        decisionProbability: Number(score.v18Probability.toFixed(3)),
        decisionEdge: Number(score.v18Edge.toFixed(3)),
        tariffVersion: coreShadowTariff.VERSION,
        tariffSlot: 'primary',
        tariffRuleId: selected.rule.id,
        v16Edge: null,
        prematchSource: mac?.prematch_source || null,
        prematchProbabilities: mac?.prematch_available
            ? {
                home: mac.prematch_p_home,
                draw: mac.prematch_p_draw,
                away: mac.prematch_p_away
            }
            : null,
        prematchMarketSupport: score.prematchSupport,
        prematchMarketSource: prematchMarketKaynagi(mac, selected.market),
        statsSource: mac?.stats_source || null,
        statsValidation: mac?.stats_validation || null,
        liveStats: paylasilanCanliStatsAnlikGoruntusu(mac),
        shadowContext: mac?._selectorShadowContext || null,
        shadowAssessment: mac?._selectorShadowContext
            ? buildMarketShadowAssessment(mac._selectorShadowContext, selected.market)
            : null,
        analysis: null
    });

    addSystemLog(
        `> 🧪 İKİ KURALLI ÇEKİRDEK: ${record.match} | ${record.market} | V18 %${record.v18Probability} | EDGE ${record.v18Edge >= 0 ? '+' : ''}${record.v18Edge} | oran ${record.odds} | taze kontrol geçti | Telegram yok.`
    );
    return record;
}


function legacyV17GolgeDurumu(mac) {
    const fixtureId = Number(mac?.fixture_id);
    const primary = Number.isFinite(fixtureId)
        ? legacyV17ShadowTracker.findSignal(fixtureId, 'strong')
        : null;
    const follow = Number.isFinite(fixtureId)
        ? legacyV17ShadowTracker.findSignal(fixtureId, 'surprise')
        : null;
    return {
        primary,
        follow,
        slot: legacyV17Tariff.currentSlot(primary, follow)
    };
}


function legacyV17GolgeSeciminiBul({ mac, dino, liveOnlyDino }) {
    if (!DINO_LEGACY_V17_SHADOW_ENABLED) return null;
    const fixtureId = Number(mac?.fixture_id);
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) return null;

    const state = legacyV17GolgeDurumu(mac);
    if (!state.slot) return null;
    const rules = state.slot === 'follow'
        ? legacyV17Tariff.FOLLOW_RULES
        : legacyV17Tariff.PRIMARY_RULES;
    const candidates = [];

    for (const rule of rules) {
        if (toplamGolMarketiSkoraGoreSonuclanmisMi(rule.market, mac?.skor)) {
            continue;
        }
        const selectorScore = dinoSelectorV2.scoreMarket(
            mac,
            rule.market,
            dino,
            liveOnlyDino,
            mac?._selectorShadowContext || null
        );
        const oddsData = mac?.canli_oranlar?.[rule.market];
        const odds = oddsData && typeof oddsData === 'object'
            ? Number(oddsData.oran)
            : Number(oddsData);
        const policy = legacyV17Tariff.check({
            slot: state.slot,
            market: rule.market,
            minute: mac?.dakika,
            odds,
            dinoProbability: dino?.[rule.market],
            selectorProbability: selectorScore?.selectorProbability,
            previousPrimary: state.primary
        });
        if (policy.eligible) {
            candidates.push({
                market: rule.market,
                rule,
                selectorScore,
                odds,
                oddsData,
                policy,
                state
            });
        }
    }

    candidates.sort((left, right) =>
        Number(right.policy.priority) - Number(left.policy.priority) ||
        Number(right.selectorScore?.selectorProbability) - Number(left.selectorScore?.selectorProbability) ||
        Number(dino?.[right.market]) - Number(dino?.[left.market]) ||
        Number(right.policy.recordedEdge) - Number(left.policy.recordedEdge)
    );
    return candidates[0] || null;
}


function legacyV17GolgeAdayiniKaydet({ mac, dino, liveOnlyDino, capturedAt }) {
    const selected = legacyV17GolgeSeciminiBul({ mac, dino, liveOnlyDino });
    if (!selected) return null;
    if (mac?.stats_validation?.status !== 'passed') return null;

    const dinoProbability = Number(dino?.[selected.market]);
    const marketProbability = Number.isFinite(selected.odds) && selected.odds > 1
        ? 100 / selected.odds
        : null;
    const decisionEdge = selected.policy[selected.rule.edgeField];
    const signalType = selected.state.slot === 'follow' ? 'surprise' : 'strong';
    const record = legacyV17ShadowTracker.recordSent({
        fixtureId: Number(mac.fixture_id),
        signalType,
        sentAt: capturedAt || new Date().toISOString(),
        telegramMessageId: null,
        match: mac?.mac_isim,
        league: mac?.lig,
        minute: mac?.dakika,
        score: mac?.skor,
        market: selected.market,
        dinoProbability,
        edge: selected.policy.recordedEdge,
        odds: selected.odds,
        bookmaker: selected.oddsData && typeof selected.oddsData === 'object'
            ? selected.oddsData.bookmaker || null
            : null,
        marketProbability,
        modelVariant: 'v17_legacy_shadow_fresh_only',
        liveOnlyProbability: Number(liveOnlyDino?.[selected.market]),
        selectorV2Probability: selected.selectorScore?.selectorProbability,
        selectorV2RawProbability: selected.selectorScore?.selectorRawProbability,
        selectorV2ModelVersion: dinoSelectorV2.MODEL.version,
        v18Probability: null,
        v18Edge: null,
        decisionModel: 'v16',
        decisionProbability: selected.selectorScore?.selectorProbability,
        decisionEdge,
        tariffVersion: legacyV17Tariff.VERSION,
        tariffSlot: selected.state.slot,
        tariffRuleId: selected.rule.id,
        v16Edge: selected.policy.v16Edge,
        prematchSource: mac?.prematch_source || null,
        prematchProbabilities: mac?.prematch_available
            ? {
                home: mac.prematch_p_home,
                draw: mac.prematch_p_draw,
                away: mac.prematch_p_away
            }
            : null,
        prematchMarketSupport: prematchMarketDestegi(mac, selected.market),
        prematchMarketSource: prematchMarketKaynagi(mac, selected.market),
        statsSource: mac?.stats_source || null,
        statsValidation: mac?.stats_validation || null,
        liveStats: paylasilanCanliStatsAnlikGoruntusu(mac),
        shadowContext: mac?._selectorShadowContext || null,
        shadowAssessment: mac?._selectorShadowContext
            ? buildMarketShadowAssessment(mac._selectorShadowContext, selected.market)
            : null,
        analysis: null
    });

    addSystemLog(
        `> 🧭 LEGACY V17 GÖLGE ${selected.state.slot === 'follow' ? 'TAKİP' : 'İLK'}: ${record.match} | ${record.market} | V16 %${Number(record.selectorV2Probability).toFixed(1)} | ${selected.rule.edgeField} ${Number(decisionEdge).toFixed(1)} | oran ${record.odds} | taze kontrol geçti | Telegram yok.`
    );
    return record;
}


function labGolgeOnAdayiMi({ mac, dino, liveOnlyDino }) {
    return Boolean(
        independentLab.select('v21', { mac, dino, liveOnlyDino }) ||
        telegramRouter.select({ mac, dino, liveOnlyDino }).length > 0 ||
        v22Lab.select({ mac, dino, liveOnlyDino }) ||
        legacyV17GolgeSeciminiBul({ mac, dino, liveOnlyDino })
    );
}


function tazeLabGolgeKayitlariniOlustur({ mac, dino, liveOnlyDino, capturedAt }) {
    const results = { core: null, legacyV17: null, v19: null, v21: null, v22: null };
    for (const kind of ['v21']) {
        try {
            results[kind] = independentLab.record(kind, { mac, dino, liveOnlyDino, capturedAt });
            if (results[kind]) addSystemLog(`> 🧪 ${kind.toUpperCase()} LAB: ${mac.mac_isim} | ${results[kind].market} | taze kontrol geçti | Telegram ayrı izlenir.`);
        } catch (error) {
            addSystemLog(`> ⚠️ ${kind.toUpperCase()} lab kaydı atlandı: ${error.message}`);
        }
    }
    try {
        results.v22 = v22Lab.record({ mac, dino, liveOnlyDino, capturedAt });
        if (results.v22) addSystemLog(`> 🧪 V22 LAB [${results.v22.matchedFilters.join('+')}]: ${mac.mac_isim} | ${results.v22.market} | taze kontrol geçti | Telegram yok.`);
    } catch (error) {
        addSystemLog(`> ⚠️ V22 lab kaydı atlandı: ${error.message}`);
    }
    for (const source of ['v21','v22']) {
        try {
            const observed = v23GoalLab.observe(results[source],mac);
            if (observed) addSystemLog(`> 🧪 YENİ LAB [${source.toUpperCase()}]: ${mac.mac_isim} | ${observed.market} | giriş filtreleri ayrı simülasyon; gerçek sinyal elenmedi.`);
        } catch {
            addSystemLog(`> ⚠️ V23 ${source.toUpperCase()} gözlemi atlandı; kaynak sinyali ve diğer modeller değişmedi.`);
        }
    }
    try {
        results.legacyV17 = legacyV17GolgeAdayiniKaydet({ mac, dino, liveOnlyDino, capturedAt });
    } catch (error) {
        addSystemLog(`> ⚠️ Legacy V17 gölge değerlendirmesi atlandı (${mac?.mac_isim}): ${error.message}`);
    }
    return results;
}


function gecerliGolOlaylariniAyikla(events) {
    return (Array.isArray(events) ? events : []).filter(event => {
        if (normalizeText(event?.type) !== 'goal') return false;
        const detail = normalizeText(event?.detail);
        const comments = normalizeText(event?.comments);
        const aciklama = `${detail} ${comments}`;
        return !(
            aciklama.includes('missed') ||
            aciklama.includes('cancel') ||
            aciklama.includes('disallow') ||
            aciklama.includes('annul')
        );
    });
}


async function sinyalOncesiCanlilikDogrula(mac, firsatlar = []) {
    try {
        if (STALE_GOAL_GUARD.enabled) {
            addSystemLog(
                `> ⏳ ${mac.mac_isim}: gecikmiş gol/oran koruması için ${Math.round(STALE_GOAL_GUARD.confirmationDelayMs / 1000)} saniye bekleniyor.`
            );
            await sleep(STALE_GOAL_GUARD.confirmationDelayMs);
        }

        const fixtureId = Number(mac.fixture_id);
        const [fixtureResult, oddsResult, eventsResult] = await Promise.allSettled([
            apiGet(`/fixtures?id=${fixtureId}`),
            apiGet('/odds/live', { params: { fixture: fixtureId } }),
            apiGet(`/fixtures/events?fixture=${fixtureId}`, { dinoMaxAttempts: 1 })
        ]);

        if (fixtureResult.status !== 'fulfilled') {
            throw fixtureResult.reason || new Error('fixture doğrulaması alınamadı');
        }
        if (oddsResult.status !== 'fulfilled') {
            throw oddsResult.reason || new Error('canlı oran doğrulaması alınamadı');
        }

        const latest = Array.isArray(fixtureResult.value.data?.response)
            ? fixtureResult.value.data.response[0]
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

        if (Number(latest.fixture.id) !== fixtureId) return false;
        const currentMinute = Number(latest.fixture.status.elapsed);
        const currentOdds = parseLiveOdds(oddsResult.value).get(fixtureId);
        if (!currentOdds || Object.keys(currentOdds).length === 0) {
            addSystemLog(
                `> ⛔ ${mac.mac_isim}: ikinci kontrolde canlı oranlar kapandı veya alınamadı.`
            );
            return false;
        }

        for (const firsat of Array.isArray(firsatlar) ? firsatlar : []) {
            const oddsData = currentOdds[firsat.market];
            const currentOdd = oddsData && typeof oddsData === 'object'
                ? Number(oddsData.oran)
                : Number(oddsData);
            const selectedOdd = Number(firsat.oran);
            const ruleMinimumOdd = Number.isFinite(Number(firsat.minimum_oran))
                ? Number(firsat.minimum_oran)
                : ACTIVE_MIN_SIGNAL_ODD;
            const ruleMaximumOdd = Number.isFinite(Number(firsat.maximum_oran))
                ? Number(firsat.maximum_oran)
                : null;

            if (
                !Number.isFinite(currentOdd) ||
                currentOdd < ruleMinimumOdd ||
                (ruleMaximumOdd !== null && currentOdd > ruleMaximumOdd)
            ) {
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: ${firsat.market} ikinci kontrolde kapandı veya oran ${currentOdd || '-'} ile kuralın ${ruleMinimumOdd.toFixed(2)}-${ruleMaximumOdd?.toFixed(2) || '∞'} aralığı dışında kaldı.`
                );
                return false;
            }
            if (
                Number.isFinite(selectedOdd) &&
                Math.abs(currentOdd - selectedOdd) > STALE_GOAL_GUARD.maximumOddDrift
            ) {
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: ${firsat.market} oranı ${selectedOdd} → ${currentOdd} değişti; eski V16 kararı gönderilmedi.`
                );
                return false;
            }
            firsat.oran = currentOdd; // Recheck the frozen model against the actual final odds.
        }

        if (eventsResult.status === 'fulfilled') {
            const events = Array.isArray(eventsResult.value.data?.response)
                ? eventsResult.value.data.response
                : [];
            const goalEvents = gecerliGolOlaylariniAyikla(events);
            const officialGoalCount = Number(latestHome) + Number(latestAway);

            if (goalEvents.length > officialGoalCount) {
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: olay akışında ${goalEvents.length} gol, fixture skorunda ${officialGoalCount} gol var; sağlayıcı akışı tutarsız.`
                );
                return false;
            }

            const lastGoalMinute = goalEvents.reduce((latestMinute, event) => {
                const elapsed = Number(event?.time?.elapsed);
                return Number.isFinite(elapsed)
                    ? Math.max(latestMinute, elapsed)
                    : latestMinute;
            }, -Infinity);

            if (
                Number.isFinite(lastGoalMinute) &&
                currentMinute - lastGoalMinute <= STALE_GOAL_GUARD.recentGoalCooldownMinutes
            ) {
                addSystemLog(
                    `> ⛔ ${mac.mac_isim}: son gol ${lastGoalMinute}', güncel dakika ${currentMinute}'; ${STALE_GOAL_GUARD.recentGoalCooldownMinutes} dakikalık gol soğuma süresi dolmadı.`
                );
                return false;
            }
        } else {
            addSystemLog(
                `> ⚠️ ${mac.mac_isim}: olay akışı alınamadı; skor ve oran çift doğrulamasıyla devam ediliyor.`
            );
        }

        mac.dakika = latest.fixture.status.elapsed;
        mac.status_short = latest.fixture.status.short ?? null;
        mac.status_long = latest.fixture.status.long ?? null;

        addSystemLog(
            `> ✅ ${mac.mac_isim}: ikinci skor + oran + olay doğrulaması geçti (${mac.dakika}' / ${latestScore}).`
        );

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

async function telegramSinyaliGonder() {
    // The old V19/Legacy V17 sender is retired. All new Telegram writes go through
    // the source-specific, persisted V21/V22 delivery path below.
    return false;
}

async function botuCalistir() {
    if (isScanning) return;
    isScanning = true;
    adaptiveScan.begin();
    let cadenceScanFailed = false;
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
        adaptiveScan.observe(macListesi);
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
        let dinoSonuclari;
        try {
            dinoSonuclari = await yapayZekaAnaliziYap(macListesi);
        } catch (error) {
            addSystemLog(`> ⚠️ Python model çağrısı başarısız; bağımsız V20 değerlendirmesi devam ediyor: ${error.message}`);
        }
        if (
            !Array.isArray(dinoSonuclari) ||
            dinoSonuclari.length !== macListesi.length
        ) {
            addSystemLog(
                `> ❌ Model sonuç hizası geçersiz: ${macListesi.length} maç / ${Array.isArray(dinoSonuclari) ? dinoSonuclari.length : 0} sonuç. Eski model sinyalleri engellendi; bağımsız V20 devam ediyor.`
            );
            dinoSonuclari = macListesi.map(() => ({ HATA: 'Python batch alignment unavailable' }));
        }

        // V16 önce ikinci katmanın puan eşiğini geçebilecek maçları ucuz bir
        // ön kontrolden geçirir. Standing/takım/prediction çağrıları yalnız bu
        // kısa liste için yapılır. Bu bağlam V16 puanına katkı verir; herhangi
        // bir alanın eksikliği artık tek başına Telegram vetosu değildir.
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
            // V20 eski Temel/Python kararından bağımsızdır. Her tam-stat canlı
            // anda çağrılır; böylece yalnız geçmiş gözlemleri kullanan delta
            // özellikleri gelecekteki taramalar için nedensel kalır.
            const v20InitialEvaluation = v20GolgeDegerlendir(
                mac,
                mac.observation_completed_at || scanCapturedAt
            );
            const v20GolgeOnAdayi = Boolean(
                v20InitialEvaluation?.selected &&
                !v20ShadowTracker.hasSignal(Number(mac.fixture_id), 'strong')
            );

            if (!dino || dino.HATA || Object.keys(dino).length === 0) {
                addSystemLog(
                    `> ⚠️ ${mac.mac_isim}: model sonucu geçersiz${dino?.HATA ? ` (${dino.HATA})` : ''}.`
                );
                candidateAuditRows.push(...v20BagimsizDenetimKayitlari({
                    mac,
                    evaluation: v20InitialEvaluation,
                    scanId,
                    decision: 'model_error',
                    decisionDetail: dino?.HATA || 'Model sonucu boş veya geçersiz.'
                }));
                if (v20GolgeOnAdayi) {
                    await v20BagimsizTazeDogrulaVeKaydet(
                        mac,
                        v20InitialEvaluation,
                        candidateAuditRows,
                        scanId
                    );
                }
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
                    capturedAt: mac.observation_completed_at || scanCapturedAt,
                    liveOnlyDino
                }
            );
            v20AdayKayitlariniZenginlestir(
                degerlendirme.auditRecords,
                v20InitialEvaluation
            );
            candidateAuditRows.push(...degerlendirme.auditRecords);

            const firsatlar = []; // No V19/Legacy V17 Telegram selection.
            const initialTelegram = telegramRouter.select({mac,dino,liveOnlyDino});
            const initialTelegramSources = new Set(initialTelegram.flatMap(group=>group.choices.map(s=>s.source)));
            // Remaining lab branches and independent Telegram models share the fresh data check.
            const labGolgeOnAdayi = labGolgeOnAdayiMi({
                mac,
                dino,
                liveOnlyDino
            });
            const aktifFirsatVar = Array.isArray(firsatlar) && firsatlar.length > 0;
            if (!aktifFirsatVar && !labGolgeOnAdayi && !v20GolgeOnAdayi) {
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
                if (v20GolgeOnAdayi) {
                    await v20BagimsizTazeDogrulaVeKaydet(
                        mac,
                        v20InitialEvaluation,
                        candidateAuditRows,
                        scanId
                    );
                }
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

            // Lab-only qualification must not add a new Telegram source after recheck.
            if (
                ilkGonderilecekFirsatlar.length === 0 &&
                !labGolgeOnAdayi &&
                !v20GolgeOnAdayi
            ) continue;

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

            // V20 ilk gözlemde kendi dondurulmuş politikasını geçtiyse aynı
            // ortak taze veride yeniden puanlanır. Taze puan da geçmeden kayıt
            // oluşmaz; V21/V22 Telegram kararı bu kayıttan etkilenmez.
            const freshV20Evaluation = v20GolgeDegerlendir(
                mac,
                freshValidation.verifiedAt
            );
            if (v20GolgeOnAdayi) {
                await v20TazeSonSkorDogrulaVeKaydet({
                    mac,
                    evaluation: freshV20Evaluation,
                    capturedAt: freshValidation.verifiedAt
                });
            }

            let freshModelResults;
            try {
                freshModelResults = await yapayZekaAnaliziYap([mac]);
            } catch (error) {
                addSystemLog(`> ⚠️ Taze Python çağrısı başarısız (${mac.mac_isim}): ${error.message}`);
            }
            const freshDino = Array.isArray(freshModelResults)
                ? freshModelResults[0]
                : null;
            if (!freshDino || freshDino.HATA || Object.keys(freshDino).length === 0) {
                candidateAuditRows.push(...v20BagimsizDenetimKayitlari({
                    mac,
                    evaluation: freshV20Evaluation,
                    scanId: `${scanId}-verified-${Number(mac.fixture_id)}`,
                    decision: 'fresh_model_error',
                    decisionDetail: freshDino?.HATA || 'Taze Python sonucu alınamadı.'
                }));
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
            v20AdayKayitlariniZenginlestir(
                freshEvaluation.auditRecords,
                freshV20Evaluation
            );
            for (const record of freshEvaluation.auditRecords) {
                record.statsValidation = freshValidation.validation;
            }
            candidateAuditRows.push(...freshEvaluation.auditRecords);

            // Telegram'dan bağımsız iki Test Lab kolu aynı taze fixture,
            // altı temel istatistik, canlı oran ve ikinci Python sonucunu kullanır.
            // Son Telegram canlılık beklemesi bu gölge kayıtlarını etkilemez.
            tazeLabGolgeKayitlariniOlustur({
                mac,
                dino: freshDino,
                liveOnlyDino: freshLiveOnlyDino,
                capturedAt: freshValidation.verifiedAt || new Date().toISOString()
            });

            // Independent source locks, unrelated to lab locks or old fixture-wide locks.
            const groups = telegramRouter.select({mac,dino:freshDino,liveOnlyDino:freshLiveOnlyDino});
            for (const group of groups) {
                group.choices = group.choices.filter(s=>initialTelegramSources.has(s.source));
                if (!group.choices.length) continue;
                const choice = group.choices[0];
                const analysisInput = {...group, sinyal_kaynaklari:group.choices.map(s=>s.source),
                    dino_yuzde:choice.policy.probabilities.dino, prematch_destek_yuzde:choice.args.prematchSupport};
                const yorum = await geminiYorumuYaz(mac, analysisInput);
                // Each market is checked separately: a closed V21 market must not veto V22.
                if (!await sinyalOncesiCanlilikDogrula(mac,[group])) continue;
                if (!telegramMacHalaUygunMu(mac)) continue;
                const payload = telegramRouter.record(mac,group,yorum,new Date().toISOString());
                if (!payload) continue;
                const sent = await telegramDelivery.publish(kanalID,payload);
                if (sent) void sharingDelivery.publish(telegramDelivery.findSent(kanalID,payload)).catch(()=>addSystemLog('> ⚠️ Ek paylaşım hatası; ana sinyal korundu.'));
                for (const record of freshEvaluation.auditRecords.filter(r=>r.market===group.market)) {
                    record.decision = sent ? 'sent' : 'telegram_failed';
                    record.decisionDetail = sent ? 'V21/V22 bağımsız Telegram gönderimi başarılı.' : 'Telegram gönderilmedi; lab kaydı korundu.';
                }
                if (sent) { onaylanan++; addSystemLog(`> ✅ MAÇ YAKALA: ${payload.signalSources.join(' + ')} | ${payload.match} | ${payload.market} | ${payload.minute}'`); }
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
        cadenceScanFailed = true;
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
        adaptiveScan.finish({failed:cadenceScanFailed});
        const cadence = refreshScanCadence();
        if (state.adaptiveScanEnabled) addSystemLog(`> ⏱️ Tarama ritmi: ${cadence.reasonLabel} | ${cadence.candidateCount} uygun maç.`);
    }
}

// =========================================================
// ZAMANLAYICI
// =========================================================

function currentScanSchedule(resetSingles = false) {
    if (!state.scheduleEnabled) return {mode:'loop'};
    const clock = getCurrentTimeTR(); let active = null, changed = false;
    for (const entry of state.schedules || []) {
        const inside = entry.start <= entry.end ? clock >= entry.start && clock <= entry.end : clock >= entry.start || clock <= entry.end;
        if (inside) active = entry;
        else if (resetSingles && entry.hasRanSingle) { entry.hasRanSingle = false; changed = true; }
    }
    if (changed) saveData();
    return active;
}

function refreshScanCadence() {
    const cadence = adaptiveScan.status({enabled:state.adaptiveScanEnabled,running:state.isRunning,
        auto:state.autoScanEnabled,schedule:currentScanSchedule(),quota:quotaRemaining,reserve:SHADOW_MIN_QUOTA_REMAINING});
    nextRunTime = cadence.nextRunTime;
    return cadence;
}

function masterClock() {
    const schedule = currentScanSchedule(true);
    const cadence = refreshScanCadence();
    if (!state.isRunning || !state.autoScanEnabled || !schedule || isScanning || isSignalResultRefreshing) return;
    if (schedule.mode === 'single') {
        if (!schedule.hasRanSingle) {
            botuCalistir();
            schedule.hasRanSingle = true;
            saveData();
        }
        return;
    }
    if (!cadence.nextRunTime || Date.now() >= cadence.nextRunTime) botuCalistir();
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
    const coreShadowFixtureIDs = [];
    const legacyV17ShadowFixtureIDs = legacyV17ShadowTracker.unresolvedFixtureIds();
    const independentFixtureIDs = [...v21ShadowTracker.unresolvedFixtureIds(), ...v22ShadowTracker.unresolvedFixtureIds(), ...v23GoalLab.unresolvedFixtureIds()];
    const v20ShadowFixtureIDs = v20ShadowTracker.unresolvedFixtureIds();
    const fixtureIDs = [...new Set([
        ...signalFixtureIDs,
        ...candidateFixtureIDs,
        ...coreShadowFixtureIDs,
        ...legacyV17ShadowFixtureIDs,
        ...independentFixtureIDs,
        ...v20ShadowFixtureIDs
    ])];
    if (fixtureIDs.length === 0) {
        await telegramDelivery.flushWins();
        await sharingDelivery.flushWins();
        return {
            success: true,
            checkedFixtures: 0,
            resolvedSignals: 0,
            resolvedCandidates: 0,
            resolvedCoreShadow: 0,
            resolvedLegacyV17Shadow: 0,
            resolvedIndependentLab: 0,
            resolvedV20Shadow: 0,
            message: 'Bekleyen paylaşılan sinyal, aday veya gölge/gözlem sinyali yok.'
        };
    }

    isSignalResultRefreshing = true;
    let checkedFixtures = 0;
    let resolvedSignals = 0;
    let resolvedCandidates = 0;
    let resolvedCoreShadow = 0;
    let resolvedLegacyV17Shadow = 0;
    let resolvedIndependentLab = 0;
    let resolvedV20Shadow = 0;

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
                // Retired core/V19 history is left untouched.
                resolvedLegacyV17Shadow += legacyV17ShadowTracker.settleFixture(fixture);
                resolvedIndependentLab += v21ShadowTracker.settleFixture(fixture) + v22ShadowTracker.settleFixture(fixture);
                try { resolvedIndependentLab += v23GoalLab.settleFixture(fixture); }
                catch { addSystemLog('> ⚠️ V23 sonuç kaydı yazılamadı; diğer sonuç takipleri devam ediyor.'); }
                resolvedV20Shadow += v20ShadowTracker.settleFixture(fixture);
            }
        }

        if (
            resolvedSignals > 0 || resolvedCandidates > 0 ||
            resolvedCoreShadow > 0 || resolvedLegacyV17Shadow > 0 ||
            resolvedIndependentLab > 0 || resolvedV20Shadow > 0 || manuel
        ) {
            addSystemLog(
                `> 🧾 Sonuç kontrolü: ${checkedFixtures} maç | ${resolvedSignals} Telegram | ${resolvedCandidates} aday | ${resolvedCoreShadow} çekirdek | ${resolvedLegacyV17Shadow} legacy V17 | ${resolvedIndependentLab} V21/V22 lab | ${resolvedV20Shadow} V20 gölge sonuçlandı.`
            );
        }

        return {
            success: true,
            checkedFixtures,
            resolvedSignals,
            resolvedCandidates,
            resolvedCoreShadow,
            resolvedLegacyV17Shadow,
            resolvedIndependentLab,
            resolvedV20Shadow,
            message: resolvedSignals > 0 || resolvedCandidates > 0 ||
                resolvedCoreShadow > 0 || resolvedLegacyV17Shadow > 0 ||
                resolvedIndependentLab > 0 || resolvedV20Shadow > 0
                ? `${resolvedSignals} Telegram, ${resolvedCandidates} aday, ${resolvedCoreShadow} çekirdek, ${resolvedLegacyV17Shadow} legacy V17, ${resolvedIndependentLab} V21/V22 lab ve ${resolvedV20Shadow} V20 gölge sonucu güncellendi.`
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
            resolvedCoreShadow,
            resolvedLegacyV17Shadow,
            resolvedIndependentLab,
            resolvedV20Shadow,
            message: error.message
        };
    } finally {
        await telegramDelivery.flushWins();
        await sharingDelivery.flushWins();
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
        'v18_probability', 'v18_edge', 'decision_model', 'decision_probability', 'decision_edge',
        'tariff_version', 'tariff_slot', 'tariff_rule_id', 'v16_edge', 'signal_sources',
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
            signal.v18Probability, signal.v18Edge, signal.decisionModel,
            signal.decisionProbability, signal.decisionEdge,
            signal.tariffVersion, signal.tariffSlot, signal.tariffRuleId, signal.v16Edge,
            (signal.signalSources || []).join(' + '),
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
        const exportSignals = signalTracker.list(100000);
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            exportSignals,
            'sentAt'
        );
        if (!selection) return;
        const dosyaEtiketi = gecmisDosyaEtiketi(selection);
        const payload = signalTracker.exportPayload({
            buildVersion: BUILD_VERSION,
            rules: SIGNAL_RULES,
            minimumSignalOdd: ACTIVE_MIN_SIGNAL_ODD,
            currentMinimumEdge: state.globalMinEdge,
            selectorV2: {
                enabled: DINO_V2_SELECTOR_ENABLED,
                version: dinoSelectorV2.MODEL.version,
                policy: { ...dinoSelectorV2.MODEL.policy, activeMinimumOdd: DINO_V2_MIN_ODD },
                edgeDecisionImpact: false
            },
            marketTariff: {
                enabled: DINO_V17_TARIFF_ENABLED,
                version: marketTariff.VERSION,
                telegramSources: [MY_V22_TELEGRAM_ENABLED && 'V22', MY_V21_TELEGRAM_ENABLED && 'V21'].filter(Boolean),
                deliveryDisabled: telegramDelivery.disabled,
                primaryRules: marketTariff.PRIMARY_RULES,
                followRules: marketTariff.FOLLOW_RULES,
                maximumOdd: marketTariff.MAXIMUM_ODD
            },
            precisionMode: {
                ...PRECISION_MODE,
                decisionImpact: !DINO_V2_SELECTOR_ENABLED
            },
            freshSignalValidation: FRESH_SIGNAL_VALIDATION,
            shadowPowerTest: {
                enabled: SHADOW_POWER_ENABLED,
                decisionImpact: DINO_V2_SELECTOR_ENABLED,
                hardGate: false,
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
        const exportSignals = signalTracker.list(100000);
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            exportSignals,
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


function v18GolgeCsvOlustur(signals, includeV22 = false) {
    const headers = [
        'shadow_signal_id', 'fixture_id', 'signal_type', 'tariff_slot',
        'captured_at', 'match', 'league', 'minute', 'score', 'market',
        'dino_probability', 'dino_edge', 'market_probability',
        'selector_v2_probability', 'v16_edge', 'v18_probability', 'v18_edge',
        'odds', 'bookmaker', 'model_version', 'decision_model',
        'decision_probability', 'decision_edge', 'tariff_version', 'rule_id',
        'prematch_market_support', 'prematch_market_source', 'vote_count', 'dino_vote', 'v16_vote', 'v18_vote', 'signal_sources',
        'stats_validation_status', 'stats_verified_at',
        'result', 'profit', 'final_score', 'fixture_status', 'resolved_at',
        ...(includeV22 ? ['matched_filters', 'goals_needed'] : [])
    ];
    const rows = signals.map(signal => {
        const settlement = signal?.settlement || {};
        return [
            signal.signalId, signal.fixtureId, signal.signalType, signal.tariffSlot,
            signal.sentAt, signal.match, signal.league, signal.minute, signal.score,
            signal.market, signal.dinoProbability, signal.edge,
            signal.marketProbability, signal.selectorV2Probability, signal.v16Edge,
            signal.v18Probability, signal.v18Edge, signal.odds, signal.bookmaker,
            signal.selectorV2ModelVersion, signal.decisionModel,
            signal.decisionProbability, signal.decisionEdge, signal.tariffVersion,
            signal.tariffRuleId, signal.prematchMarketSupport, signal.prematchMarketSource,
            signal.voteCount, signal.modelVotes?.dino, signal.modelVotes?.v16, signal.modelVotes?.v18,
            (signal.signalSources || []).join(' + '), signal?.statsValidation?.status,
            signal?.statsValidation?.verifiedAt, settlement.result, settlement.profit,
            settlement.finalScore, settlement.fixtureStatus,
            settlement.resolvedAt,
            ...(includeV22 ? [(signal.matchedFilters || []).join('+'), signal.goalsNeeded] : [])
        ].map(csvHucre).join(',');
    });
    return [headers.map(csvHucre).join(','), ...rows].join('\n');
}


function testLabOrtakKarsilastirmaBaslangici() {
    // Her deney kolunun aynı ileri-test dönemini görmesi için en geç başlayan
    // kol baz alınır. V20'nin kurulmasından önceki V19/V17 sonuçları onunla
    // aynı tabloda karşılaştırılmaz.
    const starts = [legacyV17ShadowTracker, v20ShadowTracker]
        .map(tracker => tracker.data?.startedAt || tracker.data?.signals?.[0]?.sentAt)
        .filter(value => value && Number.isFinite(new Date(value).getTime()))
        .map(value => new Date(value));
    if (starts.length === 0) return null;
    return new Date(Math.max(...starts.map(value => value.getTime()))).toISOString();
}


function testLabDonemineGoreSec(tracker, date, cohort = 'current') {
    if (tracker === coreShadowTracker || tracker === v19ShadowTracker) return [];
    const comparisonStart = testLabOrtakKarsilastirmaBaslangici();
    const signals = tracker === v23GoalLab ? v23GoalLab.indexList(100000) : tracker === v21ShadowTracker
        ? v21History.select(tracker.list(100000), cohort) : tracker.list(100000);
    return signals.filter(signal => {
        if (comparisonStart && new Date(signal.sentAt) < new Date(comparisonStart)) return false;
        return !date || turkiyeTarihAnahtari(signal.sentAt) === date;
    });
}


function aktifV19SinyalleriniSec(date) {
    return testLabDonemineGoreSec(v19ShadowTracker, date);
}


function testLabKarsilastirmaSecimi(req, res) {
    return gecmisSeciminiHazirla(
        req,
        res,
        [
            ...testLabDonemineGoreSec(coreShadowTracker, null),
            ...testLabDonemineGoreSec(legacyV17ShadowTracker, null),
            ...testLabDonemineGoreSec(v21ShadowTracker, null),
            ...testLabDonemineGoreSec(v22ShadowTracker, null),
            ...testLabDonemineGoreSec(v23GoalLab, null),
            ...testLabDonemineGoreSec(v20ShadowTracker, null),
            ...aktifV19SinyalleriniSec(null)
        ],
        'sentAt'
    );
}


app.get(
    '/api/test-lab-comparison',
    (req, res) => {
        const selection = testLabKarsilastirmaSecimi(req, res);
        if (!selection) return;
        const activeSignals = aktifV19SinyalleriniSec(selection.date);
        const coreSignals = testLabDonemineGoreSec(coreShadowTracker, selection.date);
        const legacySignals = testLabDonemineGoreSec(legacyV17ShadowTracker, selection.date);
        const v20Signals = testLabDonemineGoreSec(
            v20ShadowTracker,
            selection.date
        );
        const v20Info = v20ModelBilgisi();
        const activeV19 = {
            enabled: DINO_V19_SHADOW_ENABLED,
            label: 'V19 · tüm mevcut marketler',
            decisionImpact: false,
            telegram: false,
            validationMode: 'fresh-required',
            tariffVersion: v19Tariff.VERSION,
            primaryRules: v19Tariff.PRIMARY_RULES,
            followRules: v19Tariff.FOLLOW_RULES,
            summary: v19ShadowTracker.summary(activeSignals),
            signals: v19ShadowTracker.list(req.query.limit, activeSignals)
        };
        res.json({
            decisionImpact: false,
            comparisonStartedAt: testLabOrtakKarsilastirmaBaslangici(),
            filter: selection.filter,
            modelVersions: {
                v16: dinoSelectorV2.MODEL.version,
                v18: dinoSelectorV18.MODEL.version,
                v20: v20Info.modelVersion
            },
            activeV19,
            v21Shadow: {
                enabled: DINO_V21_SHADOW_ENABLED, label: 'V21 · ÜST · 3/3 · EDGE −5…0',
                decisionImpact: false, telegram: false, validationMode: 'fresh-required',
                tariffVersion: v21Tariff.VERSION, policy: v21Tariff.POLICY,
                ...v21History.metadata(v21ShadowTracker.data.signals),
                maximumSignalsPerFixture: 1,
                summary: v21History.summary(v21ShadowTracker, testLabDonemineGoreSec(v21ShadowTracker, selection.date)),
                signals: v21ShadowTracker.list(req.query.limit, testLabDonemineGoreSec(v21ShadowTracker, selection.date))
            },
            v22Shadow: {
                ...v22Lab.metadata(testLabDonemineGoreSec(v22ShadowTracker, selection.date)),
                signals: v22ShadowTracker.list(req.query.limit, testLabDonemineGoreSec(v22ShadowTracker, selection.date))
            },
            v23Goal: {
                ...v23GoalLab.metadata(testLabDonemineGoreSec(v23GoalLab, selection.date)),
                signals: v23GoalLab.list(req.query.limit, testLabDonemineGoreSec(v23GoalLab, selection.date))
            },
            // Geçici istemci uyumluluğu: yeni panel activeV19 anahtarını kullanır.
            currentSystemSummary: activeV19.summary,
            coreShadow: {
                enabled: DINO_CORE_SHADOW_ENABLED,
                label: 'İki kurallı çekirdek',
                decisionImpact: false,
                telegram: false,
                validationMode: 'fresh-required',
                tariffVersion: coreShadowTariff.VERSION,
                rules: coreShadowTariff.RULES,
                maximumSignalsPerFixture: 1,
                summary: coreShadowTracker.summary(coreSignals),
                signals: coreShadowTracker.list(req.query.limit, coreSignals)
            },
            legacyV17: {
                enabled: DINO_LEGACY_V17_SHADOW_ENABLED,
                label: 'Legacy V17',
                decisionImpact: false,
                telegram: false,
                validationMode: 'fresh-required',
                tariffVersion: legacyV17Tariff.VERSION,
                primaryRules: legacyV17Tariff.PRIMARY_RULES,
                followRules: legacyV17Tariff.FOLLOW_RULES,
                maximumSignalsPerFixture: 2,
                summary: legacyV17ShadowTracker.summary(legacySignals),
                signals: legacyV17ShadowTracker.list(req.query.limit, legacySignals)
            },
            v20Shadow: {
                ...v20Info,
                label: 'V20 Yeni Model',
                decisionImpact: false,
                telegram: false,
                validationMode: 'fresh-required',
                maximumSignalsPerFixture: 1,
                summary: v20ShadowTracker.summary(v20Signals),
                signals: v20ShadowTracker
                    .list(req.query.limit, v20Signals)
                    .map(v20SinyalSunumu)
            }
        });
    }
);


app.post(
    '/api/test-lab-results/refresh',
    async (req, res) => {
        const result = await paylasilanSinyalSonuclariniGuncelle({ manuel: true });
        res.status(result.success ? 200 : result.busy ? 409 : 500).json(result);
    }
);


function labHistorySignals(req, tracker) {
    if (req.query.scope === 'test-lab') return testLabDonemineGoreSec(tracker, null, req.query.cohort);
    const signals = tracker.list(100000);
    return tracker === v21ShadowTracker ? v21History.select(signals, req.query.cohort) : signals;
}

function labHistoryResponse(req, res, tracker, metadata) {
    const selection = gecmisSeciminiHazirla(
        req,
        res,
        tracker === v21ShadowTracker || tracker === v22ShadowTracker ? labHistorySignals(req, tracker) : tracker.list(100000),
        'sentAt'
    );
    if (!selection) return;
    res.json({
        ...metadata,
        ...(tracker === v21ShadowTracker ? v21History.metadata(tracker.data.signals, req.query.cohort) : {}),
        decisionImpact: false,
        telegram: false,
        filter: selection.filter,
        summary: tracker === v21ShadowTracker
            ? v21History.summary(tracker, selection.items, req.query.cohort) : tracker.summary(selection.items),
        signals: tracker.list(req.query.limit, selection.items),
        ...(tracker === v22ShadowTracker ? v22Lab.metadata(selection.items) : {})
    });
}


function v20GolgeCsvOlustur(signals) {
    const headers = [
        'shadow_signal_id', 'fixture_id', 'captured_at', 'match', 'league',
        'minute', 'score', 'market', 'v20_probability', 'v20_edge',
        'v20_expected_value', 'odds', 'bookmaker', 'model_version', 'prematch_market_support', 'prematch_market_source',
        'stats_validation_status', 'stats_verified_at', 'source_skew_ms',
        'mapping_verified', 'result', 'profit', 'final_score',
        'fixture_status', 'resolved_at'
    ];
    const rows = signals.map(rawSignal => {
        const signal = v20SinyalSunumu(rawSignal);
        const settlement = signal?.settlement || {};
        return [
            signal.signalId, signal.fixtureId, signal.sentAt, signal.match,
            signal.league, signal.minute, signal.score, signal.market,
            signal.v20Probability, signal.v20Edge, signal.v20ExpectedValue,
            signal.odds, signal.bookmaker, signal.v20ModelVersion,
            signal.prematchMarketSupport, signal.prematchMarketSource,
            signal?.statsValidation?.status,
            signal?.statsValidation?.verifiedAt,
            signal?.dataQuality?.liveSourceSkewMs,
            signal?.dataQuality?.teamMapping?.identityVerified,
            settlement.result, settlement.profit, settlement.finalScore,
            settlement.fixtureStatus, settlement.resolvedAt
        ].map(csvHucre).join(',');
    });
    return [headers.map(csvHucre).join(','), ...rows].join('\n');
}


app.get(
    '/api/v20-shadow-history',
    (req, res) => {
        const selection = gecmisSeciminiHazirla(
            req,
            res,
            v20ShadowTracker.list(100000),
            'sentAt'
        );
        if (!selection) return;
        const info = v20ModelBilgisi();
        res.json({
            ...info,
            label: 'V20 Yeni Model',
            decisionImpact: false,
            telegram: false,
            validationMode: 'fresh-required',
            maximumSignalsPerFixture: 1,
            filter: selection.filter,
            summary: v20ShadowTracker.summary(selection.items),
            signals: v20ShadowTracker
                .list(req.query.limit, selection.items)
                .map(v20SinyalSunumu)
        });
    }
);


app.get(
    '/api/v20-shadow-history/export',
    (req, res) => {
        const sourceSignals = req.query.scope === 'test-lab'
            ? testLabDonemineGoreSec(v20ShadowTracker, null)
            : v20ShadowTracker.list(100000);
        const selection = gecmisSeciminiHazirla(req, res, sourceSignals, 'sentAt');
        if (!selection) return;
        const dosyaEtiketi = gecmisDosyaEtiketi(selection);
        const info = v20ModelBilgisi();
        const presented = selection.items.map(v20SinyalSunumu);
        const payload = v20ShadowTracker.exportPayload({
            format: 'dino-v20-independent-shadow-signals',
            version: 1,
            buildVersion: BUILD_VERSION,
            decisionImpact: false,
            telegram: false,
            validationMode: 'fresh-required',
            modelVersion: info.modelVersion,
            policy: info.policy,
            maximumSignalsPerFixture: 1,
            historyFilter: selection.filter,
            note: 'V20 yalnız taze fixture, canlı istatistik ve canlı oran doğrulamasından geçen bağımsız gölge kaydıdır; Telegram kararını etkilemez.'
        }, presented);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="dino-v20-golge-sinyaller-${dosyaEtiketi}.json"`
        );
        res.send(JSON.stringify(payload, null, 2));
    }
);


app.get(
    '/api/v20-shadow-history/export.csv',
    (req, res) => {
        const sourceSignals = req.query.scope === 'test-lab'
            ? testLabDonemineGoreSec(v20ShadowTracker, null)
            : v20ShadowTracker.list(100000);
        const selection = gecmisSeciminiHazirla(req, res, sourceSignals, 'sentAt');
        if (!selection) return;
        const dosyaEtiketi = gecmisDosyaEtiketi(selection);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="dino-v20-golge-sinyaller-${dosyaEtiketi}.csv"`
        );
        res.send(`\uFEFF${v20GolgeCsvOlustur(selection.items)}`);
    }
);


app.get(
    ['/api/two-rule-core-shadow-history', '/api/core-shadow-history'],
    (req, res) => labHistoryResponse(req, res, coreShadowTracker, {
        enabled: DINO_CORE_SHADOW_ENABLED,
        label: 'İki kurallı çekirdek',
        validationMode: 'fresh-required',
        modelVersion: dinoSelectorV18.MODEL.version,
        tariffVersion: coreShadowTariff.VERSION,
        rules: coreShadowTariff.RULES,
        maximumSignalsPerFixture: 1
    })
);


app.get(
    '/api/v17-legacy-shadow-history',
    (req, res) => labHistoryResponse(req, res, legacyV17ShadowTracker, {
        enabled: DINO_LEGACY_V17_SHADOW_ENABLED,
        label: 'Legacy V17',
        validationMode: 'fresh-required',
        modelVersion: dinoSelectorV2.MODEL.version,
        tariffVersion: legacyV17Tariff.VERSION,
        primaryRules: legacyV17Tariff.PRIMARY_RULES,
        followRules: legacyV17Tariff.FOLLOW_RULES,
        maximumSignalsPerFixture: 2
    })
);


function labJsonExport(req, res, tracker, options) {
    const exportSignals = labHistorySignals(req, tracker);
    const selection = gecmisSeciminiHazirla(req, res, exportSignals, 'sentAt');
    if (!selection) return;
    const dosyaEtiketi = gecmisDosyaEtiketi(selection);
    const payload = tracker.exportPayload({
        format: options.format,
        version: 1,
        buildVersion: BUILD_VERSION,
        decisionImpact: false,
        telegram: false,
        validationMode: 'fresh-required',
        modelVersion: options.modelVersion,
        tariffVersion: options.tariffVersion,
        rules: options.rules,
        historyFilter: selection.filter,
        note: options.note,
        ...(tracker === v21ShadowTracker ? v21History.metadata(tracker.data.signals, req.query.cohort) : {})
    }, selection.items);
    if (tracker === v21ShadowTracker) payload.summary = v21History.summary(tracker, selection.items, req.query.cohort);
    if (tracker === v22ShadowTracker) Object.assign(payload, v22Lab.metadata(selection.items));
    const cohortSuffix = tracker === v21ShadowTracker && req.query.cohort === 'previous' ? '-previous' : '';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${options.filePrefix}${cohortSuffix}-${dosyaEtiketi}.json"`
    );
    res.send(JSON.stringify(payload, null, 2));
}


function labCsvExport(req, res, tracker, filePrefix) {
    const exportSignals = labHistorySignals(req, tracker);
    const selection = gecmisSeciminiHazirla(req, res, exportSignals, 'sentAt');
    if (!selection) return;
    const dosyaEtiketi = gecmisDosyaEtiketi(selection);
    const cohortSuffix = tracker === v21ShadowTracker && req.query.cohort === 'previous' ? '-previous' : '';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filePrefix}${cohortSuffix}-${dosyaEtiketi}.csv"`
    );
    res.send(`\uFEFF${v18GolgeCsvOlustur(selection.items, tracker === v22ShadowTracker)}`);
}

for (const suffix of ['', '/export', '/export.csv']) {
    app.get(`/api/v23-goal-history${suffix}`, async (req, res) => {
        const source = req.query.source || 'all';
        const selected = selectV23Source(testLabDonemineGoreSec(v23GoalLab,null),source);
        if (!selected) return res.status(400).json({ success:false, message:'Geçersiz V23 kaynak filtresi.' });
        const selection = gecmisSeciminiHazirla(req, res, selected, 'sentAt');
        if (!selection) return;
        selection.filter = { ...selection.filter, source };
        if (!suffix) return res.json({ ...v23GoalLab.metadata(selection.items), filter: selection.filter,
            signals: v23GoalLab.list(req.query.limit,selection.items) });
        const csv = suffix.endsWith('.csv');
        res.setHeader('Content-Type', csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="mac-yakala-yeni-filtre-${source.replace(':','-')}-${gecmisDosyaEtiketi(selection)}.${csv ? 'csv' : 'json'}"`);
        if (csv) return res.send(v23GoalLab.csv(selection.items));
        try { await streamV23Json(res, { ...v23GoalLab.exportStream(selection.items), filter: selection.filter, exportedAt: new Date().toISOString() }); }
        catch { if (!res.destroyed) res.destroy(); }
    });
}

// Retired evidence is opened only for an explicit export, never during scans.
for (const suffix of ['/export', '/export.csv']) {
    app.get(`/api/v23-retired-history${suffix}`, async (req, res) => {
        try {
            const retired = readRetiredV23(V23_RETIRED_HISTORY_FILE);
            const selection = gecmisSeciminiHazirla(req, res, retired.indexList(100000), 'sentAt');
            if (!selection) return;
            const csv = suffix.endsWith('.csv');
            res.setHeader('Content-Type', csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="mac-yakala-eski-lab-${gecmisDosyaEtiketi(selection)}.${csv ? 'csv' : 'json'}"`);
            if (csv) return res.send(retired.csv(selection.items));
            await streamV23Json(res, {...retired.exportStream(selection.items), retired:true, filter:selection.filter,
                note:'Eski deneyler durduruldu; kayıtlar son saklandıkları haliyle korunur. Yeni filtre dönemine katılmaz.'});
        } catch {
            if (!res.headersSent) res.status(503).json({success:false,message:'Eski LAB arşivi okunamadı; dosyalar değiştirilmedi.'});
            else if (!res.destroyed) res.destroy();
        }
    });
}

for (const [slug, tracker, tariff, enabled] of [
    ['v19-independent-shadow', v19ShadowTracker, v19Tariff, DINO_V19_SHADOW_ENABLED],
    ['v21-consensus-shadow', v21ShadowTracker, v21Tariff, DINO_V21_SHADOW_ENABLED],
    ['v22-union-shadow', v22ShadowTracker, v22Tariff, DINO_V22_SHADOW_ENABLED]
]) {
    const metadata = { enabled, tariffVersion: tariff.VERSION,
        validationMode: 'fresh-required', rules: tariff.POLICY || [...tariff.PRIMARY_RULES, ...tariff.FOLLOW_RULES] };
    app.get(`/api/${slug}-history`, (req, res) => labHistoryResponse(req, res, tracker, metadata));
    app.get(`/api/${slug}-history/export`, (req, res) => labJsonExport(req, res, tracker, {
        ...metadata, format: `dino-${slug}`, filePrefix: `dino-${slug}`,
        note: 'Bağımsız ileri test; Telegram gönderimi yok. Geçmişi yeniden oynatmaz.'
    }));
    app.get(`/api/${slug}-history/export.csv`, (req, res) => labCsvExport(req, res, tracker, `dino-${slug}`));
}


app.get(
    ['/api/two-rule-core-shadow-history/export', '/api/core-shadow-history/export'],
    (req, res) => labJsonExport(req, res, coreShadowTracker, {
        format: 'dino-two-rule-core-shadow-signals',
        filePrefix: 'dino-iki-kuralli-cekirdek-golge-sinyaller',
        modelVersion: dinoSelectorV18.MODEL.version,
        tariffVersion: coreShadowTariff.VERSION,
        rules: coreShadowTariff.RULES,
        note: 'Yalnız ortak taze doğrulamadan geçen iki kurallı V18 gölge sinyalleridir; Telegram kararını etkilemez.'
    })
);


app.get(
    ['/api/two-rule-core-shadow-history/export.csv', '/api/core-shadow-history/export.csv'],
    (req, res) => labCsvExport(
        req,
        res,
        coreShadowTracker,
        'dino-iki-kuralli-cekirdek-golge-sinyaller'
    )
);


app.get(
    '/api/v17-legacy-shadow-history/export',
    (req, res) => labJsonExport(req, res, legacyV17ShadowTracker, {
        format: 'dino-v17-legacy-shadow-signals',
        filePrefix: 'dino-v17-legacy-golge-sinyaller',
        modelVersion: dinoSelectorV2.MODEL.version,
        tariffVersion: legacyV17Tariff.VERSION,
        rules: {
            primary: legacyV17Tariff.PRIMARY_RULES,
            follow: legacyV17Tariff.FOLLOW_RULES
        },
        note: 'V19 öncesi dondurulmuş V17 ilk/takip tarifesinin ortak taze doğrulamalı gölge sonuçlarıdır; Telegram kararını etkilemez.'
    })
);


app.get(
    '/api/v17-legacy-shadow-history/export.csv',
    (req, res) => labCsvExport(
        req,
        res,
        legacyV17ShadowTracker,
        'dino-v17-legacy-golge-sinyaller'
    )
);


function adayGecmisiCsvOlustur(records) {
    const headers = [
        'record_id', 'scan_id', 'captured_at', 'fixture_id', 'match', 'league',
        'minute', 'score', 'market', 'signal_class', 'dino_probability', 'edge',
        'odds', 'market_probability', 'bookmaker', 'decision', 'decision_detail',
        'selector_v2_probability', 'selector_v2_raw_probability',
        'selector_v2_threshold', 'selector_v2_minimum_odd',
        'selector_v2_eligible', 'selector_v2_reasons',
        'v18_probability', 'v18_edge', 'decision_model',
        'decision_probability', 'decision_edge',
        'tariff_enabled', 'tariff_version', 'tariff_slot', 'tariff_rule_id',
        'tariff_edge_field', 'tariff_v16_edge',
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
            record.v18Probability, record.v18Edge, record.decisionModel,
            record.decisionProbability, record.decisionEdge,
            record.tariffEnabled, record.tariffVersion, record.tariffSlot,
            record.tariffRuleId, record.tariffEdgeField, record.tariffV16Edge,
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
            minimumSignalOdd: ACTIVE_MIN_SIGNAL_ODD,
            selectorV2: {
                enabled: DINO_V2_SELECTOR_ENABLED,
                version: dinoSelectorV2.MODEL.version,
                policy: { ...dinoSelectorV2.MODEL.policy, activeMinimumOdd: DINO_V2_MIN_ODD },
                edgeDecisionImpact: false
            },
            marketTariff: {
                enabled: DINO_V17_TARIFF_ENABLED,
                version: marketTariff.VERSION,
                telegramSources: [MY_V22_TELEGRAM_ENABLED && 'V22', MY_V21_TELEGRAM_ENABLED && 'V21'].filter(Boolean),
                deliveryDisabled: telegramDelivery.disabled,
                primaryRules: marketTariff.PRIMARY_RULES,
                followRules: marketTariff.FOLLOW_RULES,
                maximumOdd: marketTariff.MAXIMUM_ODD
            },
            precisionMode: {
                ...PRECISION_MODE,
                decisionImpact: !DINO_V2_SELECTOR_ENABLED
            },
            freshSignalValidation: FRESH_SIGNAL_VALIDATION,
            shadowPowerTest: {
                enabled: SHADOW_POWER_ENABLED,
                decisionImpact: DINO_V2_SELECTOR_ENABLED,
                hardGate: false,
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
        adaptiveScan.resetClock();


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
        const previousSettings = {...state};
        if (req.body.adaptiveScanEnabled !== undefined) {
            if (typeof req.body.adaptiveScanEnabled !== 'boolean') {
                return res.status(400).json({success:false,message:'Hızlı tarama ayarı true/false olmalıdır.'});
            }
            state.adaptiveScanEnabled = req.body.adaptiveScanEnabled;
        }

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


        if (!saveData()) {
            state = previousSettings;
            return res.status(500).json({success:false,message:'Ayar diske kaydedilemedi; önceki ayar korundu.'});
        }
        if (autoScanYeniAcildi) adaptiveScan.resetClock();
        const cadence = refreshScanCadence();

        addSystemLog(
            `> ⚙️ Ayarlar güncellendi. Minimum EDGE: %${state.globalMinEdge} | Otomatik tarama: ${state.autoScanEnabled ? 'AÇIK' : 'KAPALI'} | Tam-stat hızlandırma: ${state.adaptiveScanEnabled ? 'AÇIK' : 'KAPALI'} | ${cadence.reasonLabel}`
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
    <title>Maç Yakala İstatistik Kapsamı</title>
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
    <h1>📊 Maç Yakala Canlı İstatistik Kapsamı</h1>
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
        const cadence = refreshScanCadence();

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
                cadence.intervalMinutes,
            adaptiveScan: cadence,

            minEdge:
                state.globalMinEdge,

            minimumSignalOdd:
                ACTIVE_MIN_SIGNAL_ODD,

            marketTariff: {
                enabled: DINO_V17_TARIFF_ENABLED,
                version: marketTariff.VERSION,
                telegramSources: [MY_V22_TELEGRAM_ENABLED && 'V22', MY_V21_TELEGRAM_ENABLED && 'V21'].filter(Boolean),
                deliveryDisabled: telegramDelivery.disabled,
                minimumOdd: marketTariff.MINIMUM_ODD,
                maximumOdd: marketTariff.MAXIMUM_ODD,
                primaryRules: marketTariff.PRIMARY_RULES,
                followRules: marketTariff.FOLLOW_RULES,
                maximumSignalsPerFixture: 2,
                maximumSignalsPerSourcePerFixture: 1,
                underMarketsDisabled: true
            },

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
                {
                    ...PRECISION_MODE,
                    decisionImpact: !DINO_V2_SELECTOR_ENABLED
                },

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
                hardGate: false,
                minimumQuotaReserve: SHADOW_MIN_QUOTA_REMAINING,
                cache: shadowPowerCache.summary()
            },

            staleGoalGuard:
                STALE_GOAL_GUARD,

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

            testLabTracking: {
                decisionImpact: false,
                comparisonStartedAt: testLabOrtakKarsilastirmaBaslangici(),
                v19Shadow: {
                    enabled: DINO_V19_SHADOW_ENABLED, telegram: false,
                    validationMode: 'fresh-required', tariffVersion: v19Tariff.VERSION,
                    summary: v19ShadowTracker.summary()
                },
                v21Shadow: {
                    enabled: DINO_V21_SHADOW_ENABLED, telegram: false,
                    validationMode: 'fresh-required', tariffVersion: v21Tariff.VERSION,
                    policy: v21Tariff.POLICY, ...v21History.metadata(v21ShadowTracker.data.signals),
                    summary: v21History.summary(v21ShadowTracker)
                },
                v22Shadow: v22Lab.metadata(),
                v23Goal: v23GoalLab.metadata(),
                coreShadow: {
                    enabled: DINO_CORE_SHADOW_ENABLED,
                    validationMode: 'fresh-required',
                    modelVersion: dinoSelectorV18.MODEL.version,
                    tariffVersion: coreShadowTariff.VERSION,
                    minimumOdd: coreShadowTariff.MINIMUM_ODD,
                    maximumOdd: coreShadowTariff.MAXIMUM_ODD,
                    rules: coreShadowTariff.RULES,
                    maximumSignalsPerFixture: 1,
                    summary: coreShadowTracker.summary()
                },
                legacyV17: {
                    enabled: DINO_LEGACY_V17_SHADOW_ENABLED,
                    validationMode: 'fresh-required',
                    modelVersion: dinoSelectorV2.MODEL.version,
                    tariffVersion: legacyV17Tariff.VERSION,
                    minimumOdd: legacyV17Tariff.MINIMUM_ODD,
                    primaryRules: legacyV17Tariff.PRIMARY_RULES,
                    followRules: legacyV17Tariff.FOLLOW_RULES,
                    maximumSignalsPerFixture: 2,
                    summary: legacyV17ShadowTracker.summary()
                },
                v20Shadow: {
                    ...v20ModelBilgisi(),
                    decisionImpact: false,
                    telegram: false,
                    validationMode: 'fresh-required',
                    maximumSignalsPerFixture: 1,
                    summary: v20ShadowTracker.summary()
                }
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

// Retired core history is not opened or rewritten.

legacyV17ShadowTracker.load();

v20ShadowTracker.load();

// Retired V19 history is not opened or rewritten.
v21ShadowTracker.load();
v22ShadowTracker.load();
v23GoalLab.load();
addSystemLog(`> 🧪 YENİ FİLTRE LABI: ${v23GoalLab.metadata().enabled ? 'AÇIK' : 'KAPALI'} | V21: 2 / V22: 3 deney + skor tutarlılığı | eski geçmiş toplama KAPALI | ek API: 0 | Telegram değişmez.`);
addSystemLog(`> 🟢 V22 LAB: ${DINO_V22_SHADOW_ENABLED ? 'AÇIK' : 'KAPALI'} | A/B/C OR | Temel/V16/V18 >%50 | 25–80 dk | 1.50–4.00 | taze doğrulama | maç başına 1 | V21 korunur | Telegram ayrı izlenir.`);
telegramDelivery.load();
sharingSettings.load();
sharingDelivery.load();

prematchOddsCache.load();

shadowPowerCache.load();


const PORT =
    process.env.PORT ||
    3000;


app.listen(
    PORT,
    () => {

        addSystemLog(
            `> 📡 MAÇ YAKALA SERVER çalışıyor. Port: ${PORT}`
        );


        addSystemLog(
            `> 🧩 Sürüm: ${BUILD_VERSION}`
        );

        addSystemLog(
            `> 🧠 V20 BAĞIMSIZ GÖLGE: ${DINO_V20_SHADOW_ENABLED ? 'AÇIK' : 'KAPALI'} | ${v20Engine.model?.version || v20Engine.error || 'model yok'} | taze veri + son fixture kontrolü | maç başına 1 | Telegram YOK.`
        );


        addSystemLog(
            `> 🧭 LEGACY V17 GÖLGE: ${DINO_LEGACY_V17_SHADOW_ENABLED ? 'AÇIK' : 'KAPALI'} | ${legacyV17Tariff.VERSION} | ilk + daha ileri dakika takip | ortak taze doğrulama | Telegram YOK.`
        );



        addSystemLog(
            `> 🧭 TELEGRAM: V22 ${MY_V22_TELEGRAM_ENABLED ? 'AÇIK' : 'KAPALI'} + V21 ${MY_V21_TELEGRAM_ENABLED ? 'AÇIK' : 'KAPALI'} bağımsız ÜST | V20/V17 yalnız lab | V19/Çekirdek emekli | gönderim günlüğü ${telegramDelivery.disabled ? 'HATALI / GÖNDERİM KAPALI' : 'hazır'}.`
        );

        addSystemLog(
            `> 💵 Minimum canlı oran: ${ACTIVE_MIN_SIGNAL_ODD.toFixed(2)}`
        );

        addSystemLog(
            DINO_V2_SELECTOR_ENABLED
                ? `> 🧭 Pre-match: V16 model girdisi + denetim kaydı | Harici veto YOK | Tercih: ${PREFERRED_PREMATCH_BOOKMAKER_NAME}.`
                : `> 🧭 Legacy precision pre-match modu: AÇIK | Tercih: ${PREFERRED_PREMATCH_BOOKMAKER_NAME} | Pre-match yoksa Telegram yok.`
        );


        addSystemLog(
            `> 🔄 Otomatik tarama: ${state.autoScanEnabled ? 'AÇIK' : 'KAPALI'} | Normal 10 dk; tam-stat hızlandırma ${state.adaptiveScanEnabled ? 'AÇIK' : 'KAPALI'} | Maç aralığı: 25-80. dakika.`
        );


        addSystemLog(
            "> 🗺️ Lig coverage filtresi aktif: statistics_fixtures=false olan ligler taramadan çıkarılır."
        );


        addSystemLog(
            "> 🛡️ Sıkı mod: altı temel canlı istatistik yoksa Python ve Telegram sinyali yok."
        );

        addSystemLog("> 🧠 Telegram: V22 A/B/C ve V21 mevcut kuralları bağımsızdır; V23 kontrolü veto uygulamaz.");

        addSystemLog("> 🗃️ Telegram kilidi model başına ayrıdır: V21 35' ve V22 60' aynı marketi ayrı paylaşabilir. Aynı girişte modeller tek mesajda listelenir.");

        addSystemLog(
            "> 🧪 Tam-stat aday denetimi aktif: Telegram'a gitmeyen marketler ve eleme nedenleri de sonuçlarıyla kaydedilir."
        );

        addSystemLog(
            `> 🧬 API güç bağlamı AÇIK: takım gücü + standings + predictions V16 girdisi ve denetim verisidir | EKSİK BAĞLAM TEK BAŞINA VETO DEĞİL | Kota koruması: ${SHADOW_MIN_QUOTA_REMAINING}.`
        );

        addSystemLog(
            `> 🛡️ Telegram öncesi taze doğrulama AÇIK: fixture + stats + canlı oran + tek maç Python + ${Math.round(STALE_GOAL_GUARD.confirmationDelayMs / 1000)} sn gecikmiş gol/olay kontrolü | dakika ${TELEGRAM_MIN_MINUTE}-${TELEGRAM_MAX_MINUTE}.`
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

        // Local settled-record archive only; retired API collectors never run.
        setInterval(v23YerelArsivBakimi, 60000);

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
