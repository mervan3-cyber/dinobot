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
    process.env.PYTHON_BIN || 'python';


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
    'gemini-3.5-flash-lite';


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
// LIVE ODDS - GÜVENLİ MARKET AYRIŞTIRMA
// =========================================================
//
// AMAÇ:
//
// 1) "Home" gördüğümüz her marketi MS1 SANMA.
// 2) Önce bet.name kontrol et.
// 3) Sadece gerçek maç sonucu 1X2 marketini kabul et.
// 4) Sadece gerçek maç toplam gol Over/Under marketini kabul et.
// 5) Korner, yarı, takım golü, ekstra süre vs. kesinlikle karışmasın.
// 6) suspended / blocked / stopped / finished oranları kullanma.
// 7) API aynı selection'ı birden fazla gönderirse main=true olanı seç.
// 8) Aynı GERÇEK market için birden fazla kaynak varsa en iyi oranı tut.
//
// =========================================================


// ---------------------------------------------------------
// HEDEF GOL BAREMLERİ
// ---------------------------------------------------------

const LIVE_GOAL_LINES =
    new Set([
        0.5,
        1.5,
        2.5,
        3.5,
        4.5
    ]);


// ---------------------------------------------------------
// TEXT NORMALIZE
// ---------------------------------------------------------

function normalizeLiveText(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return '';
    }

    return String(value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

}


// ---------------------------------------------------------
// BOOLEAN NORMALIZE
// ---------------------------------------------------------
//
// API bazen true,
// bazen "true",
// bazen 1 gibi değer döndürebilir.
// ---------------------------------------------------------

function isTrueValue(value) {

    if (value === true) {
        return true;
    }

    if (value === 1) {
        return true;
    }

    const text =
        String(value ?? '')
            .trim()
            .toLowerCase();

    return (
        text === 'true' ||
        text === '1'
    );

}


// ---------------------------------------------------------
// ORAN PARSE
// ---------------------------------------------------------

function parseLiveOdd(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const text =
        String(value)
            .trim()
            .replace(',', '.');

    if (!text) {
        return null;
    }

    const odd =
        Number(text);

    if (
        !Number.isFinite(odd) ||
        odd <= 1
    ) {
        return null;
    }

    return odd;

}


// ---------------------------------------------------------
// HANDICAP / GOL ÇİZGİSİ PARSE
// ---------------------------------------------------------

function parseGoalLine(value) {

    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return null;
    }

    const text =
        String(value)
            .trim()
            .replace(',', '.');


    // Örn:
    // 2.5
    // 1.5
    //
    // "2.5,3" veya "2.25" gibi Asian çizgilerini
    // bizim modele sokma.

    if (
        !/^\d+(?:\.\d+)?$/.test(text)
    ) {
        return null;
    }


    const line =
        Number(text);


    if (
        !Number.isFinite(line)
    ) {
        return null;
    }


    if (
        !LIVE_GOAL_LINES.has(line)
    ) {
        return null;
    }


    return line;

}


// =========================================================
// BET + VALUE -> DİNO MARKET
// =========================================================

function getTargetLiveMarket(
    bet,
    value
) {

    const betName =
        normalizeLiveText(
            bet?.name
        );


    const selection =
        normalizeLiveText(
            value?.value
        );


    if (
        !betName ||
        !selection
    ) {
        return null;
    }


    // =====================================================
    // 1) MAÇ SONUCU 1X2
    // =====================================================
    //
    // Burada yalnızca FULL TIME maç sonucu kabul ediyoruz.
    //
    // Kabul örnekleri:
    //
    // Match Winner
    // 1x2
    // 1X2 Full Time
    // Full Time Result
    //
    // RED örnekleri:
    //
    // 1x2 Extra Time
    // 1x2 1st Half
    // First Half Winner
    // Corners Winner
    //
    // =====================================================


    const winnerForbiddenWords = [

        '1st half',
        'first half',

        '2nd half',
        'second half',

        'half time',
        'halftime',

        'extra time',

        'penalty',

        'corner',

        'booking',

        'card',

        'offside',

        'throw',

        'period',

        'quarter',

        'double chance',

        'home team',

        'away team'

    ];


    const winnerForbidden =
        winnerForbiddenWords.some(
            word =>
                betName.includes(word)
        );


    const FULL_TIME_WINNER_MARKETS =
    new Set([

        'match winner',
        '1x2',
        '1 x 2',
        'full time result',
        'fulltime result',
        'full time winner',
        'fulltime winner'

    ]);


const looksLikeWinner =
    FULL_TIME_WINNER_MARKETS.has(
        betName
    );


    if (
        looksLikeWinner &&
        !winnerForbidden
    ) {

        if (
            selection === 'home' ||
            selection === '1'
        ) {

            return 'MS1';

        }


        if (
            selection === 'draw' ||
            selection === 'x'
        ) {

            return 'X';

        }


        if (
            selection === 'away' ||
            selection === '2'
        ) {

            return 'MS2';

        }


        return null;

    }


    // =====================================================
    // 2) MAÇ TOPLAM GOL OVER / UNDER
    // =====================================================
    //
    // Kabul etmek istediğimiz şey:
    //
    // Over/Under Line
    // Goals Over/Under
    // Total Goals
    //
    // İstemediğimiz şey:
    //
    // Team Total
    // Home Team Goals
    // Away Team Goals
    // Corners O/U
    // Cards O/U
    // First Half O/U
    // Extra Time O/U
    // Asian Total
    //
    // =====================================================


    const totalForbiddenWords = [

        'corner',

        'booking',

        'card',

        'yellow',

        'red card',

        'offside',

        'throw',

        'shot',

        'foul',

        'asian',

        'extra time',

        'penalty',

        '1st half',
        'first half',

        '2nd half',
        'second half',

        'half time',
        'halftime',

        'home team',

        'away team',

        'team total',

        'home total',

        'away total',

        'period',

        'quarter'

    ];


    const totalForbidden =
        totalForbiddenWords.some(
            word =>
                betName.includes(word)
        );


    const looksLikeTotalGoals =
        (
            betName === 'over/under line' ||

            betName === 'over under line' ||

            betName === 'over/under' ||

            betName === 'goals over/under' ||

            betName === 'goal over/under' ||

            betName === 'over/under goals' ||

            betName === 'total goals' ||

            betName === 'total goals over/under' ||

            betName === 'goal line' ||

            betName.includes(
                'over/under line'
            ) ||

            betName.includes(
                'goals over/under'
            ) ||

            betName.includes(
                'total goals'
            )
        );


    if (
        !looksLikeTotalGoals ||
        totalForbidden
    ) {

        return null;

    }


    // -----------------------------------------------------
    // OVER / UNDER TARAFINI BUL
    // -----------------------------------------------------


    let taraf =
        null;


    let embeddedLine =
        null;


    // API formatı:
    //
    // value: "Over"
    // handicap: "2.5"
    //
    // veya bazı yapılarda:
    //
    // value: "Over 2.5"


    const selectionMatch =
        selection.match(
            /^(over|under)(?:\s+(\d+(?:[.,]\d+)?))?$/
        );


    if (!selectionMatch) {

        return null;

    }


    if (
        selectionMatch[1] ===
        'over'
    ) {

        taraf =
            'UST';

    } else if (
        selectionMatch[1] ===
        'under'
    ) {

        taraf =
            'ALT';

    } else {

        return null;

    }


    // Selection içinde çizgi varsa al.
    if (
        selectionMatch[2]
    ) {

        embeddedLine =
            parseGoalLine(
                selectionMatch[2]
            );

    }


    // Yoksa handicap alanından al.
    const handicapLine =
        parseGoalLine(
            value?.handicap
        );


    const line =
        embeddedLine !== null
            ? embeddedLine
            : handicapLine;


    if (
        line === null
    ) {

        return null;

    }


    return (
        `${line.toFixed(1)}_${taraf}`
    );

}


// =========================================================
// LIVE ODDS PARSE
// =========================================================

function parseLiveOdds(response) {

    const oddsMap =
        new Map();


    const fixtures =
        response?.data &&
        Array.isArray(
            response.data.response
        )
            ? response.data.response
            : [];


    // -----------------------------------------------------
    // HER FIXTURE
    // -----------------------------------------------------

    for (
        const fixtureOdds
        of fixtures
    ) {

        const fixtureID =
            Number(
                fixtureOdds?.fixture?.id
            );


        if (
            !Number.isFinite(
                fixtureID
            ) ||
            fixtureID <= 0
        ) {

            continue;

        }


        // =================================================
        // FIXTURE LIVE ODDS STATUS
        // =================================================

        const liveStatus =
            fixtureOdds?.status ||
            {};


        // Maç durdurulmuşsa,
        // bahisler block olmuşsa
        // veya feed finished ise kullanma.

        if (
            isTrueValue(
                liveStatus.stopped
            ) ||

            isTrueValue(
                liveStatus.blocked
            ) ||

            isTrueValue(
                liveStatus.finished
            )
        ) {

            continue;

        }


        // =================================================
        // FIXTURE MARKET MAP
        // =================================================

        if (
            !oddsMap.has(
                fixtureID
            )
        ) {

            oddsMap.set(
                fixtureID,
                {}
            );

        }


        const marketMap =
            oddsMap.get(
                fixtureID
            );


        // =================================================
        // KAYNAKLARI HAZIRLA
        // =================================================
        //
        // API-Football /odds/live normal yapısı:
        //
        // fixtureOdds.odds
        //
        // Fakat olası alternatif/legacy yapı için
        // bookmakers desteğini de bırakıyoruz.
        // =================================================


        const sources =
            [];


        // -------------------------------------------------
        // NORMAL LIVE ODDS FORMAT
        // -------------------------------------------------

        if (
            Array.isArray(
                fixtureOdds.odds
            )
        ) {

            sources.push({

                name:
                    'API',

                bets:
                    fixtureOdds.odds

            });

        }


        // -------------------------------------------------
        // BOOKMAKER FORMAT GELİRSE
        // -------------------------------------------------

        if (
            Array.isArray(
                fixtureOdds.bookmakers
            )
        ) {

            for (
                const bookmaker
                of fixtureOdds.bookmakers
            ) {

                const bets =
                    Array.isArray(
                        bookmaker?.bets
                    )
                        ? bookmaker.bets
                        : (
                            Array.isArray(
                                bookmaker?.odds
                            )
                                ? bookmaker.odds
                                : []
                        );


                if (
                    bets.length === 0
                ) {

                    continue;

                }


                sources.push({

                    name:
                        bookmaker?.name ||
                        `Bookmaker ${bookmaker?.id || ''}`,

                    bets:
                        bets

                });

            }

        }


        // =================================================
        // HER KAYNAK
        // =================================================

        for (
            const source
            of sources
        ) {

            const bets =
                Array.isArray(
                    source.bets
                )
                    ? source.bets
                    : [];


            // =============================================
            // HER BET
            // =============================================

            for (
                const bet
                of bets
            ) {

                // Bet seviyesinde block/suspend varsa geç.

                if (
                    isTrueValue(
                        bet?.stopped
                    ) ||

                    isTrueValue(
                        bet?.blocked
                    ) ||

                    isTrueValue(
                        bet?.suspended
                    )
                ) {

                    continue;

                }


                const values =
                    Array.isArray(
                        bet?.values
                    )
                        ? bet.values
                        : [];


                if (
                    values.length === 0
                ) {

                    continue;

                }


                // =========================================
                // AYNI BET İÇİN ADAYLARI MARKET BAZINDA
                // GRUPLA
                // =========================================
                //
                // Örn:
                //
                // Over / 2.5 / 1.95 / main=true
                // Over / 2.5 / 3.40 / main=false
                //
                // ikisi de 2.5_UST olur.
                //
                // Böyle durumda main=true olan alınmalı.
                // =========================================


                const grouped =
                    new Map();


                for (
                    const value
                    of values
                ) {

                    // -------------------------------------
                    // SUSPENDED SELECTION
                    // -------------------------------------

                    if (
                        isTrueValue(
                            value?.suspended
                        ) ||

                        isTrueValue(
                            value?.stopped
                        ) ||

                        isTrueValue(
                            value?.blocked
                        )
                    ) {

                        continue;

                    }


                    // -------------------------------------
                    // GERÇEK MARKETİ BUL
                    // -------------------------------------

                    const market =
                        getTargetLiveMarket(
                            bet,
                            value
                        );


                    if (
                        !market
                    ) {

                        continue;

                    }


                    // -------------------------------------
                    // ORANI OKU
                    // -------------------------------------

                    const odd =
                        parseLiveOdd(
                            value?.odd
                        );


                    if (
                        odd === null
                    ) {

                        continue;

                    }


                    if (
                        !grouped.has(
                            market
                        )
                    ) {

                        grouped.set(
                            market,
                            []
                        );

                    }


                    grouped
                        .get(
                            market
                        )
                        .push({

                            market:
                                market,

                            odd:
                                odd,

                            value:
                                value

                        });

                }


                // =========================================
                // MARKET GRUPLARINI İŞLE
                // =========================================

                for (
                    const [
                        market,
                        candidates
                    ]
                    of grouped
                ) {

                    if (
                        candidates.length === 0
                    ) {

                        continue;

                    }


                    // -------------------------------------
                    // MAIN=TRUE VAR MI?
                    // -------------------------------------

                    const mainCandidates =
                        candidates.filter(
                            candidate =>
                                isTrueValue(
                                    candidate
                                        .value
                                        ?.main
                                )
                        );


                    let usableCandidates;


                    if (
                        mainCandidates.length >
                        0
                    ) {

                        // API açıkça primary seçim vermiş.
                        usableCandidates =
                            mainCandidates;

                    } else {

                        // main=true yok.
                        //
                        // Unique selectionlarda main false/null
                        // olabileceği için direkt çöpe atmıyoruz.

                        usableCandidates =
                            candidates;

                    }


                    // -------------------------------------
                    // AYNI BET İÇİN SEÇİLECEK ADAY
                    // -------------------------------------


                    let selected;


                    if (
                        mainCandidates.length >
                        0
                    ) {

                        // Birden fazla main varsa
                        // en yüksek gerçek oran.

                        selected =
                            usableCandidates.reduce(
                                (best, current) =>

                                    !best ||
                                    current.odd >
                                    best.odd

                                        ? current
                                        : best,

                                null
                            );

                    } else if (
                        usableCandidates.length ===
                        1
                    ) {

                        // Unique selection.
                        selected =
                            usableCandidates[0];

                    } else {

                        // Aynı bet+market için birden fazla
                        // oran geldi ama API main belirtmedi.
                        //
                        // Eski kod burada en büyük oranı alıp
                        // sahte VALUE yaratabiliyordu.
                        //
                        // Güvenli tarafta kal:
                        // en düşük oranı kullan.

                        selected =
                            usableCandidates.reduce(
                                (best, current) =>

                                    !best ||
                                    current.odd <
                                    best.odd

                                        ? current
                                        : best,

                                null
                            );


                        addSystemLog(
                            `> ⚠️ LIVE ODDS AMBIGUOUS | Fixture:${fixtureID} | ${market} | Bet:${bet?.name || '-'} | main bulunamadı | Güvenli oran:${selected?.odd}`
                        );

                    }


                    if (
                        !selected
                    ) {

                        continue;

                    }


                    const odd =
                        selected.odd;


                    // =====================================
                    // AYNI GERÇEK MARKET İÇİN EN İYİ ORAN
                    // =====================================
                    //
                    // Buraya geldiysek market artık:
                    //
                    // gerçek MS1 / X / MS2
                    //
                    // veya
                    //
                    // gerçek maç toplam gol marketidir.
                    //
                    // Farklı doğru kaynaklar varsa
                    // yüksek oranı seçebiliriz.
                    // =====================================


                    if (
                        !marketMap[market] ||
                        odd >
                        marketMap[market].oran
                    ) {

                        marketMap[market] = {

                            oran:
                                odd,

                            bookmaker:
                                source.name,

                            bet_id:
                                bet?.id ??
                                null,

                            bet_name:
                                bet?.name ??
                                null,

                            selection:
                                selected
                                    .value
                                    ?.value ??
                                null,

                            handicap:
                                selected
                                    .value
                                    ?.handicap ??
                                null,

                            main:
                                selected
                                    .value
                                    ?.main ??
                                null

                        };

                    }


                    // -------------------------------------
                    // ÇOK YÜKSEK ORAN DEBUG
                    // -------------------------------------
                    //
                    // Yanlış market kalmışsa logdan anında
                    // hangi bet.name geldiğini görürüz.
                    // -------------------------------------

                    if (
                        odd >= 10
                    ) {

                        addSystemLog(
                            `> ⚠️ YÜKSEK LIVE ORAN | Fixture:${fixtureID} | DinoMarket:${market} | API Market:${bet?.name || '-'} | Selection:${selected.value?.value || '-'} | Handicap:${selected.value?.handicap ?? '-'} | Oran:${odd}`
                        );

                    }

                }

            }

        }


        // =================================================
        // HİÇ GEÇERLİ MARKET KALMADIYSA MAP'TEN ÇIKAR
        // =================================================

        if (
            Object.keys(
                marketMap
            ).length === 0
        ) {

            oddsMap.delete(
                fixtureID
            );

        }

    }


    return oddsMap;

}


// =========================================================
// FIXTURE STATISTICS
// =========================================================

function getStat(
    teamStats,
    statName
) {

    if (
        !Array.isArray(teamStats)
    ) {
        return null;
    }


    const item =
        teamStats.find(
            x =>
                x.type === statName
        );


    if (
        !item ||
        item.value === null ||
        item.value === undefined
    ) {
        return null;
    }


    const value =
        String(item.value)
            .replace('%', '')
            .trim();


    if (!value) {
        return null;
    }


    const parsed =
        parseFloat(value);


    return Number.isFinite(parsed)
        ? parsed
        : null;
}


// =========================================================
// STATISTICS EKLE
// =========================================================

function enrichFixturesWithStats(
    fixtures
) {

    return fixtures
        .map(
            fixture => {

                const statistics =
                    Array.isArray(
                        fixture.statistics
                    )
                        ? fixture.statistics
                        : [];


                if (
                    statistics.length <
                    2
                ) {

                    return null;

                }


                const homeID =
                    fixture.teams.home.id;

                const awayID =
                    fixture.teams.away.id;


                const homeStatsObj =
                    statistics.find(
                        x =>
                            x.team?.id ===
                            homeID
                    );


                const awayStatsObj =
                    statistics.find(
                        x =>
                            x.team?.id ===
                            awayID
                    );


                if (
                    !homeStatsObj ||
                    !awayStatsObj
                ) {

                    return null;

                }


                return {

                    fixture_id:
                        fixture.fixture.id,

                    mac_isim:
                        `${fixture.teams.home.name} - ${fixture.teams.away.name}`,

                    lig:
                        fixture.league.name,

                    dakika:
                        fixture.fixture.status.elapsed,

                    skor:
                        `${fixture.goals.home ?? 0}-${fixture.goals.away ?? 0}`,

                    home_shot:
                        getStat(
                            homeStatsObj.statistics,
                            'Total Shots'
                        ),

                    away_shot:
                        getStat(
                            awayStatsObj.statistics,
                            'Total Shots'
                        ),

                    home_sot:
                        getStat(
                            homeStatsObj.statistics,
                            'Shots on Goal'
                        ),

                    away_sot:
                        getStat(
                            awayStatsObj.statistics,
                            'Shots on Goal'
                        ),

                    home_corner:
                        getStat(
                            homeStatsObj.statistics,
                            'Corner Kicks'
                        ),

                    away_corner:
                        getStat(
                            awayStatsObj.statistics,
                            'Corner Kicks'
                        )

                };

            }
        )
        .filter(Boolean);

}

function temelStatsTam(mac) {

    const values = [

        mac?.home_shot,
        mac?.away_shot,

        mac?.home_sot,
        mac?.away_sot,

        mac?.home_corner,
        mac?.away_corner

    ];


    return values.every(
        value =>
            Number.isFinite(
                Number(value)
            )
    );
}


// =========================================================
// DEDICATED FIXTURE STATISTICS
// =========================================================

async function direktFixtureStatsGetir(
    fixture
) {

    try {

        const fixtureID =
            Number(
                fixture?.fixture?.id
            );


        if (!fixtureID) {
            return null;
        }


        const response =
            await apiGet(
                `/fixtures/statistics?fixture=${fixtureID}`
            );


        const statistics =
            Array.isArray(
                response.data?.response
            )
                ? response.data.response
                : [];


        if (
            statistics.length < 2
        ) {

            addSystemLog(
                `> ⚠️ Fixture ${fixtureID}: dedicated statistics bulunamadı.`
            );

            return null;
        }


        const homeID =
            fixture.teams.home.id;

        const awayID =
            fixture.teams.away.id;


        const homeStatsObj =
            statistics.find(
                x =>
                    Number(x.team?.id) ===
                    Number(homeID)
            );


        const awayStatsObj =
            statistics.find(
                x =>
                    Number(x.team?.id) ===
                    Number(awayID)
            );


        if (
            !homeStatsObj ||
            !awayStatsObj
        ) {

            return null;
        }


        const mac = {

            fixture_id:
                fixtureID,

            mac_isim:
                `${fixture.teams.home.name} - ${fixture.teams.away.name}`,

            lig:
                fixture.league.name,

            dakika:
                fixture.fixture.status.elapsed,

            skor:
                `${fixture.goals.home ?? 0}-${fixture.goals.away ?? 0}`,

            home_shot:
                getStat(
                    homeStatsObj.statistics,
                    'Total Shots'
                ),

            away_shot:
                getStat(
                    awayStatsObj.statistics,
                    'Total Shots'
                ),

            home_sot:
                getStat(
                    homeStatsObj.statistics,
                    'Shots on Goal'
                ),

            away_sot:
                getStat(
                    awayStatsObj.statistics,
                    'Shots on Goal'
                ),

            home_corner:
                getStat(
                    homeStatsObj.statistics,
                    'Corner Kicks'
                ),

            away_corner:
                getStat(
                    awayStatsObj.statistics,
                    'Corner Kicks'
                )

        };


        if (
            !temelStatsTam(mac)
        ) {

            addSystemLog(
                `> ⚠️ ${mac.mac_isim}: temel canlı istatistiklerden biri API'de yok.`
            );

            return null;
        }


        return mac;


    } catch (error) {

        addSystemLog(
            `> ⚠️ Fixture statistics hatası: ${error.message}`
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
                match => {

                    const dakika =
                        Number(
                            match.fixture?.status?.elapsed
                        );


                    return (
                        dakika >= 25 &&
                        dakika <= 80
                    );

                }
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


        if (
            uygunMaclar.length === 0
        ) {

            return [];

        }


        addSystemLog(
            `> ⏱️ 25-80 dakika aralığında ${uygunMaclar.length} maç bulundu.`
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


            const fixture =
                fixtureMap.get(
                    fixtureID
                );


            if (!fixture) {

                continue;

            }


            let enriched =
    enrichFixturesWithStats(
        [fixture]
    )[0];


// =====================================================
// EMBEDDED STATS EKSİKSE DEDICATED ENDPOINT'E GİT
// =====================================================

if (
    !enriched ||
    !temelStatsTam(enriched)
) {

    addSystemLog(
        `> 🔄 ${match.teams.home.name} - ${match.teams.away.name}: embedded stats eksik, dedicated statistics deneniyor...`
    );


    enriched =
        await direktFixtureStatsGetir(
            fixture
        );

}


// =====================================================
// HALA STATS YOKSA MODELE GÖNDERME
// =====================================================

if (
    !enriched ||
    !temelStatsTam(enriched)
) {

    addSystemLog(
        `> ⛔ ${match.teams.home.name} - ${match.teams.away.name}: güvenilir canlı istatistik yok, modelden çıkarıldı.`
    );

    continue;

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


        addSystemLog(
            `> 🧪 ${mac.mac_isim} | ${market} | Dino:%${dinoYuzde} | Oran:${piyasaOrani} | Piyasa:%${piyasaYuzde.toFixed(1)} | EDGE:${edge.toFixed(1)}`
        );


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

Ev sahibi:
${mac.home_shot} toplam şut,
${mac.home_sot} isabetli şut,
${mac.home_corner} korner.

Deplasman:
${mac.away_shot} toplam şut,
${mac.away_sot} isabetli şut,
${mac.away_corner} korner.

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

Şut, isabetli şut ve korner verilerini kullan.

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

async function telegramSinyaliGonder(
    mac,
    firsat,
    yorum
) {

    if (
        !bot ||
        !kanalID
    ) {

        addSystemLog(
            "> ⚠️ Telegram ayarları eksik."
        );

        return false;

    }


    const mesaj =

`🔥 *DİNO VALUE ALARM* 🔥
--------------------------------------
⚽️ *Maç:* ${mac.mac_isim}
🏆 *Lig:* ${mac.lig}
⏱ *Dakika:* ${mac.dakika} | *Skor:* ${mac.skor}

🎯 *Value Market:* ${firsat.market}
📈 *EDGE:* +${firsat.edge}%
💵 *Canlı Oran:* ${firsat.oran}
🏦 *Kaynak:* ${firsat.bookmaker}
🦖 *Dino İhtimali:* %${firsat.dino_yuzde}
📊 *Piyasa İhtimali:* %${firsat.piyasa_yuzde}

📌 *Canlı İstatistikler*
🏠 ${mac.home_shot} Şut | ${mac.home_sot} İsabet | ${mac.home_corner} Korner
✈️ ${mac.away_shot} Şut | ${mac.away_sot} İsabet | ${mac.away_corner} Korner

📝 *Dino Analiz:*
_${yorum}_

--------------------------------------`;


    try {

        await bot.sendMessage(
            kanalID,
            mesaj,
            {
                parse_mode:
                    'Markdown'
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

    if (
        isScanning
    ) {

        return;

    }


    isScanning =
        true;


    try {

        addSystemLog(
            "> 🔍 Otomatik tarama başlatıldı..."
        );


        // -------------------------------------------------
        // API
        // -------------------------------------------------

        const macListesi =
            await canliMaclariHazirla();


        if (
            macListesi.length === 0
        ) {

            addSystemLog(
                "> ℹ️ Uygun canlı maç bulunamadı."
            );

            return;

        }


        addSystemLog(
            `> 📊 Python'a ${macListesi.length} maç gönderiliyor...`
        );


        // -------------------------------------------------
        // PYTHON
        // -------------------------------------------------

        const dinoSonuclari =
            await yapayZekaAnaliziYap(
                macListesi
            );


        if (
            !Array.isArray(
                dinoSonuclari
            )
        ) {

            addSystemLog(
                "> ❌ Python sonuç üretmedi."
            );

            return;

        }


        addSystemLog(
            `> 🧠 Python ${dinoSonuclari.length} maç için tahmin üretti.`
        );


        let onaylanan =
            0;


        // -------------------------------------------------
        // VALUE
        // -------------------------------------------------

        for (
            let i = 0;
            i < macListesi.length;
            i++
        ) {

            const mac =
                macListesi[i];


            const dino =
                dinoSonuclari[i];


            if (
                !dino ||
                Object.keys(dino).length === 0
            ) {

                addSystemLog(
                    `> ❌ ${mac.mac_isim}: Model sonucu yok.`
                );

                continue;

            }


            addSystemLog(
                `> 🩺 RÖNTGEN (${mac.mac_isim}) -> Oranlar (${Object.keys(mac.canli_oranlar).length}) | Dino: ${JSON.stringify(dino)}`
            );


            const firsat =
                valueAnaliziYap(
                    mac,
                    dino
                );


            if (
                !firsat
            ) {

                addSystemLog(
                    `> ❌ ${mac.mac_isim} pas geçildi (EDGE ${state.globalMinEdge}% altında)`
                );

                continue;

            }


            addSystemLog(
                `> 🚨 VALUE BULUNDU: ${mac.mac_isim} | ${firsat.market} | +${firsat.edge}%`
            );


            // -------------------------------------------------
            // GEMINI
            // -------------------------------------------------

            const yorum =
                await geminiYorumuYaz(
                    mac,
                    firsat
                );


            // -------------------------------------------------
            // TELEGRAM
            // -------------------------------------------------

            const gonderildi =
                await telegramSinyaliGonder(
                    mac,
                    firsat,
                    yorum
                );


            if (
                gonderildi
            ) {

                onaylanan++;

                addSystemLog(
                    `> ✅ SİNYAL GÖNDERİLDİ: ${mac.mac_isim} | ${firsat.market} | +${firsat.edge}%`
                );

            }

        }


        addSystemLog(
            `> 🏁 Tarama bitti. ${onaylanan} efsane maç yakalandı.`
        );


        if (
            quotaRemaining !== null
        ) {

            addSystemLog(
                `> 📦 API kalan günlük istek: ${quotaRemaining}`
            );

        }


    } catch (error) {

        addSystemLog(
            `> ❌ ANA TARAMA HATASI: ${error.message}`
        );

    } finally {

        isScanning =
            false;

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

            isRunning:
                state.isRunning,

            isScanning:
                isScanning,

            minEdge:
                state.globalMinEdge,

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
            `> 🎯 Minimum EDGE: %${state.globalMinEdge}`
        );


        addSystemLog(
            `> 🐍 Python: ${pythonBinary}`
        );


        addSystemLog(
            "> 🚀 API-FOOTBALL Pro tarama motoru hazır."
        );

    }
);
