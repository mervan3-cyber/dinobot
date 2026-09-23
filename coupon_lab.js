const fs = require('fs');
const path = require('path');

const VERSION = 'coupon-lab-v2-market-profile-2026-09-23';
const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const MIN_PROFILE_MATCHES = 5;
const MIN_PHASE_EVENTS = 3;
const RESULT_CHECK_AFTER_MINUTES = 105;

function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function percent(value) {
    if (value === null || value === undefined) return null;
    const parsed = Number.parseFloat(String(value).replace('%', '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value) {
    return String(value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const item = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${item.year}-${item.month}-${item.day}`;
}

function istanbulHour(date = new Date()) {
    return Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23'
    }).format(date));
}

function istanbulClockMinutes(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone:'Europe/Istanbul', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    }).formatToParts(date);
    const item = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Number(item.hour) * 60 + Number(item.minute);
}

function atomicWrite(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), {recursive:true});
    const temporary = `${filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temporary, filePath);
}

function htftCode(value) {
    const raw = normalize(value);
    const tokens = raw.split(' ').filter(Boolean);
    const mapToken = token => {
        if (['home', '1'].includes(token)) return '1';
        if (['draw', 'x', '0'].includes(token)) return '0';
        if (['away', '2'].includes(token)) return '2';
        return null;
    };
    if (tokens.length >= 2) {
        const first = mapToken(tokens[0]);
        const second = mapToken(tokens[1]);
        if (first && second) return `${first}/${second}`;
    }
    const direct = String(value ?? '').toUpperCase().replace(/X/g, '0').replace(/\s/g, '');
    return /^[012]\/[012]$/.test(direct) ? direct : null;
}

function doubleChanceCode(value) {
    const raw = normalize(value);
    if (['home draw', 'home or draw', '1x', '1 x'].includes(raw)) return '1X';
    if (['draw away', 'draw or away', 'x2', 'x 2'].includes(raw)) return 'X2';
    if (['home away', 'home or away', '12', '1 2'].includes(raw)) return '12';
    return null;
}

function winnerCode(value) {
    const raw = normalize(value);
    if (['home', '1'].includes(raw)) return '1';
    if (['draw', 'x', '0'].includes(raw)) return 'X';
    if (['away', '2'].includes(raw)) return '2';
    return null;
}

function betFamily(name) {
    const raw = normalize(name);
    if ((raw.includes('half time') && raw.includes('full time')) || raw.includes('ht ft')) return 'htft';
    if (raw.includes('double chance')) return 'doubleChance';
    if (['match winner', '1x2', 'full time result', 'fulltime result'].includes(raw)) return 'winner';
    return null;
}

function parseOddsRows(items, preferredBookmakerId = null) {
    const result = new Map();
    for (const row of Array.isArray(items) ? items : []) {
        const fixtureId = finite(row?.fixture?.id);
        if (!fixtureId) continue;
        const bookmakers = (Array.isArray(row?.bookmakers) ? row.bookmakers : [])
            .filter(bookmaker => !preferredBookmakerId || Number(bookmaker?.id) === Number(preferredBookmakerId));
        if (!bookmakers.length) continue;
        const parsed = {fixtureId, bookmaker:null, bookmakerId:null, winner:{}, doubleChance:{}, htft:{}, updatedAt:row?.update || null};
        for (const bookmaker of bookmakers) {
            parsed.bookmaker ||= bookmaker?.name || null;
            parsed.bookmakerId ||= finite(bookmaker?.id);
            for (const bet of Array.isArray(bookmaker?.bets) ? bookmaker.bets : []) {
                const family = betFamily(bet?.name);
                if (!family) continue;
                for (const value of Array.isArray(bet?.values) ? bet.values : []) {
                    const odd = finite(value?.odd);
                    if (!odd || odd <= 1) continue;
                    const code = family === 'htft'
                        ? htftCode(value?.value)
                        : family === 'doubleChance'
                            ? doubleChanceCode(value?.value)
                            : winnerCode(value?.value);
                    if (!code) continue;
                    if (!parsed[family][code] || odd > parsed[family][code]) parsed[family][code] = odd;
                }
            }
        }
        if (Object.keys(parsed.winner).length || Object.keys(parsed.doubleChance).length || Object.keys(parsed.htft).length) {
            result.set(fixtureId, parsed);
        }
    }
    return result;
}

function normalizedWinnerProbabilities(winnerOdds) {
    const raw = {};
    for (const key of ['1','X','2']) {
        const odd = finite(winnerOdds?.[key]);
        if (!odd || odd <= 1) return null;
        raw[key] = 1 / odd;
    }
    const overround = raw['1'] + raw.X + raw['2'];
    if (!Number.isFinite(overround) || overround <= 0) return null;
    return {
        '1':Number((raw['1'] * 100 / overround).toFixed(1)),
        X:Number((raw.X * 100 / overround).toFixed(1)),
        '2':Number((raw['2'] * 100 / overround).toFixed(1)),
        overround:Number((overround * 100).toFixed(1))
    };
}

function predictionSummary(item) {
    const prediction = item?.predictions || {};
    return {
        advice: prediction?.advice || null,
        winnerId: finite(prediction?.winner?.id),
        winnerName: prediction?.winner?.name || null,
        winnerComment: prediction?.winner?.comment || null,
        winOrDraw: prediction?.win_or_draw === true,
        underOver: prediction?.under_over || null,
        goals: {home:prediction?.goals?.home ?? null, away:prediction?.goals?.away ?? null},
        percent: {
            home:percent(prediction?.percent?.home),
            draw:percent(prediction?.percent?.draw),
            away:percent(prediction?.percent?.away)
        }
    };
}

function minuteSplit(minutes) {
    let first = 0, second = 0, total = 0;
    for (const [bucket, detail] of Object.entries(minutes || {})) {
        const count = finite(detail?.total) || 0;
        const start = Number.parseInt(String(bucket).split('-')[0], 10);
        if (!Number.isFinite(start)) continue;
        total += count;
        if (start <= 45) first += count;
        else second += count;
    }
    return {
        total,
        first,
        second,
        firstShare: total > 0 ? Number((first * 100 / total).toFixed(1)) : null,
        secondShare: total > 0 ? Number((second * 100 / total).toFixed(1)) : null
    };
}

function teamSummary(item, venue) {
    const played = finite(item?.fixtures?.played?.[venue]);
    const scored = finite(item?.goals?.for?.total?.[venue]);
    const conceded = finite(item?.goals?.against?.total?.[venue]);
    return {
        venue,
        played,
        scoredPerGame: played > 0 && scored !== null ? Number((scored / played).toFixed(2)) : finite(item?.goals?.for?.average?.[venue]),
        concededPerGame: played > 0 && conceded !== null ? Number((conceded / played).toFixed(2)) : finite(item?.goals?.against?.average?.[venue]),
        scoringMinutes: minuteSplit(item?.goals?.for?.minute),
        concedingMinutes: minuteSplit(item?.goals?.against?.minute),
        cleanSheets: finite(item?.clean_sheet?.[venue]),
        failedToScore: finite(item?.failed_to_score?.[venue])
    };
}

function profileReady(profile) {
    return Number(profile?.played) >= MIN_PROFILE_MATCHES &&
        finite(profile?.scoredPerGame) !== null && finite(profile?.concededPerGame) !== null;
}

function phaseReady(split) {
    return Number(split?.total) >= MIN_PHASE_EVENTS &&
        finite(split?.firstShare) !== null && finite(split?.secondShare) !== null;
}

function boundedScore(value) {
    return Number(Math.max(0, Math.min(100, Number(value) || 0)).toFixed(1));
}

function predictedSide(fixture, prediction) {
    if (prediction?.winnerId && prediction.winnerId === finite(fixture?.teams?.home?.id)) return 'home';
    if (prediction?.winnerId && prediction.winnerId === finite(fixture?.teams?.away?.id)) return 'away';
    const p = prediction?.percent || {};
    if (p.home !== null && p.home >= (p.draw ?? -1) && p.home >= (p.away ?? -1)) return 'home';
    if (p.away !== null && p.away >= (p.draw ?? -1) && p.away >= (p.home ?? -1)) return 'away';
    return 'draw';
}

function buildPicks(fixture, odds, prediction, homeProfile, awayProfile) {
    const picks = [];
    const side = predictedSide(fixture, prediction);
    const p = prediction?.percent || {};
    const marketProbability = normalizedWinnerProbabilities(odds?.winner);
    const profilesComplete = profileReady(homeProfile) && profileReady(awayProfile);
    const profileBonus = profilesComplete ? 8 : 0;
    const add = (market, selection, odd, reasons, qualityScore, support = {}) => {
        if (!finite(odd)) return;
        picks.push({market, selection, odd:Number(odd), reasons, qualityScore:boundedScore(qualityScore), support, labOnly:true});
    };
    const api1X = (finite(p.home) ?? 0) + (finite(p.draw) ?? 0);
    const apiX2 = (finite(p.away) ?? 0) + (finite(p.draw) ?? 0);
    const market1X = marketProbability ? marketProbability['1'] + marketProbability.X : null;
    const marketX2 = marketProbability ? marketProbability['2'] + marketProbability.X : null;
    if (prediction?.winOrDraw && side === 'home' && api1X >= 60 && market1X !== null && market1X >= 60) {
        add('Çifte Şans', '1X', odds?.doubleChance?.['1X'],
            [`API 1X desteği %${api1X.toFixed(1)}`, `Marjsız piyasa 1X %${market1X.toFixed(1)}`],
            api1X * .55 + market1X * .37 + profileBonus,
            {apiProbability:Number(api1X.toFixed(1)),marketProbability:Number(market1X.toFixed(1)),profilesComplete});
    }
    if (prediction?.winOrDraw && side === 'away' && apiX2 >= 60 && marketX2 !== null && marketX2 >= 60) {
        add('Çifte Şans', 'X2', odds?.doubleChance?.['X2'],
            [`API X2 desteği %${apiX2.toFixed(1)}`, `Marjsız piyasa X2 %${marketX2.toFixed(1)}`],
            apiX2 * .55 + marketX2 * .37 + profileBonus,
            {apiProbability:Number(apiX2.toFixed(1)),marketProbability:Number(marketX2.toFixed(1)),profilesComplete});
    }

    if (profilesComplete && marketProbability && side === 'home' && (p.home ?? 0) >= 50 && marketProbability['1'] >= 40 && phaseReady(homeProfile?.scoringMinutes) && phaseReady(awayProfile?.concedingMinutes)) {
        const early = homeProfile?.scoringMinutes?.firstShare;
        const late = homeProfile?.scoringMinutes?.secondShare;
        const oppEarlyConcede = awayProfile?.concedingMinutes?.firstShare;
        const oppLateConcede = awayProfile?.concedingMinutes?.secondShare;
        if (early >= 45 && oppEarlyConcede >= 40) add('İY/MS', '1/1', odds?.htft?.['1/1'],
            [`API MS1 %${p.home}`, `Marjsız piyasa MS1 %${marketProbability['1']}`, `Ev İY gol %${early} · rakip İY yeme %${oppEarlyConcede}`],
            p.home * .35 + marketProbability['1'] * .30 + early * .18 + oppEarlyConcede * .17,
            {apiProbability:p.home,marketProbability:marketProbability['1'],profilesComplete:true});
        if (late >= 55 && oppLateConcede >= 50) add('İY/MS', '0/1', odds?.htft?.['0/1'],
            [`API MS1 %${p.home}`, `Marjsız piyasa MS1 %${marketProbability['1']}`, `Ev 2Y gol %${late} · rakip 2Y yeme %${oppLateConcede}`],
            p.home * .35 + marketProbability['1'] * .30 + late * .18 + oppLateConcede * .17,
            {apiProbability:p.home,marketProbability:marketProbability['1'],profilesComplete:true});
    }
    if (profilesComplete && marketProbability && side === 'away' && (p.away ?? 0) >= 50 && marketProbability['2'] >= 35 && phaseReady(awayProfile?.scoringMinutes) && phaseReady(homeProfile?.concedingMinutes)) {
        const early = awayProfile?.scoringMinutes?.firstShare;
        const late = awayProfile?.scoringMinutes?.secondShare;
        const oppEarlyConcede = homeProfile?.concedingMinutes?.firstShare;
        const oppLateConcede = homeProfile?.concedingMinutes?.secondShare;
        if (early >= 45 && oppEarlyConcede >= 40) add('İY/MS', '2/2', odds?.htft?.['2/2'],
            [`API MS2 %${p.away}`, `Marjsız piyasa MS2 %${marketProbability['2']}`, `Dep. İY gol %${early} · rakip İY yeme %${oppEarlyConcede}`],
            p.away * .35 + marketProbability['2'] * .30 + early * .18 + oppEarlyConcede * .17,
            {apiProbability:p.away,marketProbability:marketProbability['2'],profilesComplete:true});
        if (late >= 55 && oppLateConcede >= 50) add('İY/MS', '0/2', odds?.htft?.['0/2'],
            [`API MS2 %${p.away}`, `Marjsız piyasa MS2 %${marketProbability['2']}`, `Dep. 2Y gol %${late} · rakip 2Y yeme %${oppLateConcede}`],
            p.away * .35 + marketProbability['2'] * .30 + late * .18 + oppLateConcede * .17,
            {apiProbability:p.away,marketProbability:marketProbability['2'],profilesComplete:true});
    }
    const underHint = normalize(prediction?.underOver).includes('under') || String(prediction?.underOver || '').trim().startsWith('-');
    const scoringAverage = profilesComplete ? Number(homeProfile.scoredPerGame) + Number(awayProfile.scoredPerGame) : null;
    const concedingAverage = profilesComplete ? Number(homeProfile.concededPerGame) + Number(awayProfile.concededPerGame) : null;
    if (profilesComplete && marketProbability && (p.draw ?? 0) >= 30 && marketProbability.X >= 25 && scoringAverage <= 2.4 && concedingAverage <= 2.8 && (underHint || scoringAverage <= 2.0)) {
        const lowGoalScore = Math.max(0, 100 - scoringAverage * 25);
        add('İY/MS', '0/0', odds?.htft?.['0/0'],
            [`API beraberlik %${p.draw}`, `Marjsız piyasa X %${marketProbability.X}`, `Gol ort. ${scoringAverage.toFixed(2)} · yenen ${concedingAverage.toFixed(2)}`],
            p.draw * .35 + marketProbability.X * .30 + lowGoalScore * .25 + 10,
            {apiProbability:p.draw,marketProbability:marketProbability.X,profilesComplete:true,scoringAverage:Number(scoringAverage.toFixed(2)),concedingAverage:Number(concedingAverage.toFixed(2))});
    }
    return picks.sort((a,b)=>b.qualityScore-a.qualityScore).slice(0,3);
}

function settlePick(pick, fixture) {
    const home = finite(fixture?.goals?.home);
    const away = finite(fixture?.goals?.away);
    const halfHome = finite(fixture?.score?.halftime?.home);
    const halfAway = finite(fixture?.score?.halftime?.away);
    if (home === null || away === null) return null;
    const full = home > away ? '1' : home < away ? '2' : '0';
    if (pick.market === 'Çifte Şans') {
        const won = pick.selection === '1X' ? full !== '2' : pick.selection === 'X2' ? full !== '1' : full !== '0';
        return {won, score:`${home}-${away}`};
    }
    if (pick.market === 'İY/MS' && halfHome !== null && halfAway !== null) {
        const half = halfHome > halfAway ? '1' : halfHome < halfAway ? '2' : '0';
        return {won:`${half}/${full}` === pick.selection, score:`${halfHome}-${halfAway} / ${home}-${away}`};
    }
    return null;
}

class CouponLab {
    constructor(options = {}) {
        this.filePath = options.filePath;
        this.apiGet = options.apiGet;
        this.logger = options.logger || (() => {});
        this.getQuotaRemaining = options.getQuotaRemaining || (() => null);
        this.canRun = options.canRun || (() => true);
        this.bookmakerName = options.bookmakerName || 'Bet365';
        this.dailyLimit = Math.max(20, Number(options.dailyLimit) || 200);
        this.reserve = Math.max(0, Number(options.reserve) || 1000);
        this.maxCandidates = Math.max(1, Number(options.maxCandidates) || 30);
        this.maxSelected = Math.max(1, Number(options.maxSelected) || 10);
        this.scanHour = Math.min(23, Math.max(0, Number(options.scanHour) || 9));
        this.scanMinute = Math.min(59, Math.max(0, Number(options.scanMinute) || 0));
        this.finalCheckMinutes = Math.max(15, Number(options.finalCheckMinutes) || 75);
        this.includeTomorrow = options.includeTomorrow === true;
        this.priorityLeagues = new Set((options.priorityLeagues || []).map(normalize));
        this.enabled = options.enabled !== false;
        this.autoEnabled = options.autoEnabled !== false;
        this.running = false;
        this.settling = false;
        this.data = {version:VERSION, bookmaker:{id:null,name:this.bookmakerName}, settings:null, usage:{}, scans:[], candidates:[], teamCache:{}};
    }

    settingsSnapshot() {
        return {
            enabled:this.enabled,
            includeTomorrow:this.includeTomorrow,
            scanTime:`${String(this.scanHour).padStart(2,'0')}:${String(this.scanMinute).padStart(2,'0')}`,
            finalCheckMinutes:this.finalCheckMinutes,
            dailyLimit:this.dailyLimit,
            maxCandidates:this.maxCandidates,
            maxSelected:this.maxSelected
        };
    }

    applySettings(input = {}, persist = true) {
        const next = {...this.settingsSnapshot()};
        if (input.enabled !== undefined) {
            if (typeof input.enabled !== 'boolean') throw new Error('Kupon modu ayarı true/false olmalıdır.');
            next.enabled = input.enabled;
        }
        if (input.includeTomorrow !== undefined) {
            if (typeof input.includeTomorrow !== 'boolean') throw new Error('Yarın ayarı true/false olmalıdır.');
            next.includeTomorrow = input.includeTomorrow;
        }
        if (input.scanTime !== undefined) {
            const match = String(input.scanTime).match(/^([01]\d|2[0-3]):([0-5]\d)$/);
            if (!match) throw new Error('Ana tarama saati SS:DD biçiminde olmalıdır.');
            next.scanTime = `${match[1]}:${match[2]}`;
        }
        const integer = (key, minimum, maximum, label) => {
            if (input[key] === undefined) return;
            const value = Number(input[key]);
            if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} ${minimum}-${maximum} arasında tam sayı olmalıdır.`);
            next[key] = value;
        };
        integer('finalCheckMinutes',15,240,'Maç önü kontrol');
        integer('dailyLimit',20,2000,'Günlük API bütçesi');
        integer('maxCandidates',1,100,'Maksimum aday');
        integer('maxSelected',1,30,'Maksimum kupon maçı');
        if (next.maxSelected > next.maxCandidates) throw new Error('Maksimum kupon maçı, maksimum aday sayısından büyük olamaz.');
        this.enabled = next.enabled;
        this.includeTomorrow = next.includeTomorrow;
        [this.scanHour,this.scanMinute] = next.scanTime.split(':').map(Number);
        this.finalCheckMinutes = next.finalCheckMinutes;
        this.dailyLimit = next.dailyLimit;
        this.maxCandidates = next.maxCandidates;
        this.maxSelected = next.maxSelected;
        this.data.settings = this.settingsSnapshot();
        if (persist) this.save();
        return this.status();
    }

    load() {
        try {
            if (this.filePath && fs.existsSync(this.filePath)) {
                const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
                if (parsed && typeof parsed === 'object') this.data = {...this.data, ...parsed, version:VERSION};
            }
            if (this.data.settings && typeof this.data.settings === 'object') this.applySettings(this.data.settings, false);
            else this.data.settings = this.settingsSnapshot();
        } catch (error) {
            this.logger(`> ⚠️ Kupon LAB geçmişi okunamadı: ${error.message}`);
        }
        this.trim();
        return this.status();
    }

    save() {
        this.trim();
        this.data.settings = this.settingsSnapshot();
        if (this.filePath) atomicWrite(this.filePath, this.data);
    }

    trim() {
        const cutoff = Date.now() - 35 * 24 * 60 * 60 * 1000;
        this.data.scans = (Array.isArray(this.data.scans) ? this.data.scans : []).filter(scan => Date.parse(scan.startedAt) >= cutoff).slice(-80);
        this.data.candidates = (Array.isArray(this.data.candidates) ? this.data.candidates : []).filter(item => Date.parse(item.capturedAt) >= cutoff).slice(-3000);
        const usage = {};
        for (const [key, value] of Object.entries(this.data.usage || {})) if (Date.parse(`${key}T00:00:00Z`) >= cutoff) usage[key] = value;
        this.data.usage = usage;
        this.data.teamCache = Object.fromEntries(Object.entries(this.data.teamCache || {}).filter(([,entry]) => Date.parse(`${entry?.date || ''}T00:00:00Z`) >= cutoff));
    }

    usageToday(now = new Date()) {
        return Number(this.data.usage?.[dateKey(now)] || 0);
    }

    consume(now = new Date()) {
        if (!this.enabled) throw new Error('Kupon LAB panelden kapatıldı.');
        const key = dateKey(now);
        const used = this.usageToday(now);
        if (used >= this.dailyLimit) throw new Error(`Kupon LAB günlük API bütçesi doldu (${used}/${this.dailyLimit}).`);
        const remaining = finite(this.getQuotaRemaining());
        if (remaining !== null && remaining <= this.reserve) throw new Error(`Genel API rezervi korundu (${remaining} ≤ ${this.reserve}).`);
        if (!this.canRun()) throw new Error('Canlı tarama başladı; kupon LAB canlı sisteme yol verdi.');
        this.data.usage[key] = used + 1;
        this.save();
    }

    async call(url, now = new Date()) {
        this.consume(now);
        return this.apiGet(url, {dinoMaxAttempts:1});
    }

    async bookmakerId(now) {
        if (finite(this.data.bookmaker?.id)) return Number(this.data.bookmaker.id);
        const response = await this.call(`/odds/bookmakers?search=${encodeURIComponent(this.bookmakerName)}`, now);
        const wanted = normalize(this.bookmakerName);
        const rows = Array.isArray(response?.data?.response) ? response.data.response : [];
        const chosen = rows.find(item => normalize(item?.name) === wanted) || rows.find(item => normalize(item?.name).includes(wanted));
        if (!chosen?.id) throw new Error(`${this.bookmakerName} bookmaker kimliği bulunamadı.`);
        this.data.bookmaker = {id:Number(chosen.id), name:chosen.name || this.bookmakerName};
        this.save();
        return Number(chosen.id);
    }

    async oddsForDate(day, bookmakerId, now) {
        let page = 1, total = 1;
        const rows = [];
        do {
            const response = await this.call(`/odds?date=${day}&bookmaker=${bookmakerId}&page=${page}`, now);
            rows.push(...(Array.isArray(response?.data?.response) ? response.data.response : []));
            total = Math.max(1, Number(response?.data?.paging?.total) || 1);
            page++;
        } while (page <= total && page <= 50);
        return rows;
    }

    async teamProfile(fixture, side, now) {
        const teamId = finite(fixture?.teams?.[side]?.id);
        const leagueId = finite(fixture?.league?.id);
        const season = finite(fixture?.league?.season);
        if (!teamId || !leagueId || !season) return null;
        const key = `${leagueId}:${season}:${teamId}:${side}`;
        const cached = this.data.teamCache?.[key];
        if (cached && cached.date === dateKey(now)) return cached.value;
        const response = await this.call(`/teams/statistics?league=${leagueId}&season=${season}&team=${teamId}&date=${dateKey(now)}`, now);
        const value = teamSummary(response?.data?.response || {}, side);
        this.data.teamCache[key] = {date:dateKey(now), value};
        this.save();
        return value;
    }

    async scanToday({mode='manual', now=new Date()} = {}) {
        if (!this.enabled) throw new Error('Kupon LAB kapalı.');
        if (this.running || this.settling) throw new Error('Kupon LAB işlemi zaten çalışıyor.');
        this.running = true;
        const startedAt = now.toISOString();
        const day = dateKey(now);
        const scanDays = [day];
        if (this.includeTomorrow) scanDays.push(dateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000)));
        const scan = {id:`coupon-${Date.now()}`, day, days:scanDays, mode, startedAt, completedAt:null, status:'running', apiStart:this.usageToday(now), fixtures:0, marketFixtures:0, candidates:0, selected:0, error:null};
        this.data.scans.push(scan);
        this.save();
        try {
            this.logger(`> 🎟️ Kupon LAB ${mode === 'manual' ? 'manuel' : 'günlük'} taraması başladı: ${scanDays.join(' + ')}.`);
            await this.settlePending(now);
            const bookmakerId = await this.bookmakerId(now);
            const fixtures = [];
            const oddsRows = [];
            for (const targetDay of scanDays) {
                const [fixturesResponse, targetOdds] = await Promise.all([
                    this.call(`/fixtures?date=${targetDay}&timezone=Europe%2FIstanbul`, now),
                    this.oddsForDate(targetDay, bookmakerId, now)
                ]);
                fixtures.push(...(Array.isArray(fixturesResponse?.data?.response) ? fixturesResponse.data.response : []));
                oddsRows.push(...targetOdds);
            }
            const oddsMap = parseOddsRows(oddsRows, bookmakerId);
            scan.fixtures = fixtures.length;
            scan.marketFixtures = oddsMap.size;
            const minimumKickoff = now.getTime() + 30 * 60 * 1000;
            const eligible = fixtures.filter(fixture => {
                const kickoff = Date.parse(fixture?.fixture?.date);
                return oddsMap.has(Number(fixture?.fixture?.id)) && Number.isFinite(kickoff) && kickoff >= minimumKickoff && ['NS','TBD'].includes(String(fixture?.fixture?.status?.short || 'NS').toUpperCase());
            }).sort((a,b) => {
                const aPriority = this.priorityLeagues.has(normalize(a?.league?.name)) ? 1 : 0;
                const bPriority = this.priorityLeagues.has(normalize(b?.league?.name)) ? 1 : 0;
                return bPriority - aPriority || Date.parse(a?.fixture?.date) - Date.parse(b?.fixture?.date);
            }).slice(0, this.maxCandidates);
            const newRows = [];
            for (const fixture of eligible) {
                const fixtureId = Number(fixture.fixture.id);
                const predictionResponse = await this.call(`/predictions?fixture=${fixtureId}`, now);
                const predictionItem = Array.isArray(predictionResponse?.data?.response) ? predictionResponse.data.response[0] : null;
                const prediction = predictionSummary(predictionItem);
                const [homeProfile, awayProfile] = await Promise.all([
                    this.teamProfile(fixture, 'home', now),
                    this.teamProfile(fixture, 'away', now)
                ]);
                const odds = oddsMap.get(fixtureId);
                const picks = buildPicks(fixture, odds, prediction, homeProfile, awayProfile);
                const candidateScore = picks.length ? Math.max(...picks.map(pick => Number(pick.qualityScore) || 0)) : 0;
                newRows.push({
                    id:`${scan.id}:${fixtureId}`, scanId:scan.id, capturedAt:new Date().toISOString(), day, fixtureDay:dateKey(new Date(fixture.fixture.date)),
                    fixtureId, kickoff:fixture.fixture.date, leagueId:finite(fixture?.league?.id), league:fixture?.league?.name || '-', country:fixture?.league?.country || null,
                    home:{id:finite(fixture?.teams?.home?.id), name:fixture?.teams?.home?.name || '-'},
                    away:{id:finite(fixture?.teams?.away?.id), name:fixture?.teams?.away?.name || '-'},
                    bookmaker:odds.bookmaker, bookmakerId:odds.bookmakerId, odds,
                    prediction, profiles:{home:homeProfile,away:awayProfile}, picks, candidateScore, selected:false, active:true,
                    finalCheck:{status:'waiting',checkedAt:null,reasons:[]}, result:{status:'pending',score:null,picks:[]}
                });
            }
            const ranked = newRows.filter(row => row.picks.length).sort((a,b) => {
                return (b.candidateScore || 0) - (a.candidateScore || 0) || Date.parse(a.kickoff) - Date.parse(b.kickoff);
            }).slice(0, this.maxSelected);
            const selected = new Set(ranked.map(row => row.id));
            for (const row of newRows) row.selected = selected.has(row.id);
            const refreshedFixtures = new Set(newRows.map(row => Number(row.fixtureId)));
            for (const previous of this.data.candidates.filter(row => row.active !== false && (row.day === day || refreshedFixtures.has(Number(row.fixtureId))))) {
                previous.active = false;
                previous.selected = false;
                if (previous.finalCheck?.status === 'waiting') previous.finalCheck = {status:'superseded',checkedAt:new Date().toISOString(),reasons:['Daha yeni ana taramayla değiştirildi']};
            }
            this.data.candidates.push(...newRows);
            scan.candidates = newRows.length;
            scan.selected = ranked.length;
            scan.status = 'complete';
            scan.completedAt = new Date().toISOString();
            scan.apiUsed = this.usageToday(now) - scan.apiStart;
            this.save();
            this.logger(`> ✅ Kupon LAB: ${fixtures.length} fikstür · ${oddsMap.size} markette · ${newRows.length} incelendi · ${ranked.length} LAB seçimi · ${scan.apiUsed} API.`);
            return this.status(now);
        } catch (error) {
            scan.status = 'error'; scan.error = error.message; scan.completedAt = new Date().toISOString(); scan.apiUsed = this.usageToday(now) - scan.apiStart;
            this.save();
            this.logger(`> ⚠️ Kupon LAB taraması durdu: ${error.message}`);
            throw error;
        } finally {
            this.running = false;
        }
    }

    async finalCheck(row, now = new Date()) {
        const bookmakerId = await this.bookmakerId(now);
        const [fixtureResponse, oddsResponse, predictionResponse] = await Promise.all([
            this.call(`/fixtures?id=${row.fixtureId}`, now),
            this.call(`/odds?fixture=${row.fixtureId}&bookmaker=${bookmakerId}`, now),
            this.call(`/predictions?fixture=${row.fixtureId}`, now)
        ]);
        const fixture = Array.isArray(fixtureResponse?.data?.response) ? fixtureResponse.data.response[0] : null;
        const odds = parseOddsRows(oddsResponse?.data?.response || [], bookmakerId).get(Number(row.fixtureId));
        const predictionItem = Array.isArray(predictionResponse?.data?.response) ? predictionResponse.data.response[0] : null;
        const freshPrediction = predictionSummary(predictionItem);
        const freshPicks = fixture && odds ? buildPicks(fixture, odds, freshPrediction, row.profiles?.home, row.profiles?.away) : [];
        const reasons = [];
        if (!fixture || !['NS','TBD'].includes(String(fixture?.fixture?.status?.short || '').toUpperCase())) reasons.push('Maç artık başlamamış durumda değil');
        if (!odds) reasons.push('Bookmaker marketi kapalı veya yok');
        for (const pick of row.picks) {
            const refreshed = freshPicks.find(item => item.market === pick.market && item.selection === pick.selection);
            if (!refreshed) reasons.push(`${pick.selection} güncel tahmin/piyasa/profil kuralını artık geçmiyor`);
            else {
                pick.finalOdd = Number(refreshed.odd);
                pick.finalQualityScore = refreshed.qualityScore;
                pick.finalSupport = refreshed.support;
            }
        }
        if (row.prediction?.winnerId && freshPrediction?.winnerId && Number(row.prediction.winnerId) !== Number(freshPrediction.winnerId)) reasons.push('API tahmin kazananı değişti');
        row.finalCheck = {status:reasons.length ? 'rejected' : 'passed', checkedAt:now.toISOString(), reasons, prediction:freshPrediction};
        this.save();
        return row.finalCheck;
    }

    async runDueFinalChecks(now = new Date()) {
        if (!this.enabled || this.running || this.settling || !this.canRun()) return 0;
        const due = this.data.candidates.filter(row => row.active !== false && row.selected && row.result?.status === 'pending' && row.finalCheck?.status === 'waiting' && Date.parse(row.kickoff) - now.getTime() <= this.finalCheckMinutes * 60000 && Date.parse(row.kickoff) > now.getTime());
        let checked = 0;
        for (const row of due) {
            try { await this.finalCheck(row, now); checked++; }
            catch (error) { row.finalCheck = {status:'error',checkedAt:now.toISOString(),reasons:[error.message]}; this.save(); }
        }
        return checked;
    }

    async settlePending(now = new Date()) {
        const pending = this.data.candidates.filter(row => row.result?.status === 'pending' && Date.parse(row.kickoff) < now.getTime() - RESULT_CHECK_AFTER_MINUTES * 60 * 1000);
        let settled = 0;
        for (let index = 0; index < pending.length; index += 20) {
            const batch = pending.slice(index, index + 20);
            const ids = batch.map(row => row.fixtureId).join('-');
            const response = await this.call(`/fixtures?ids=${ids}`, now);
            const fixtures = new Map((response?.data?.response || []).map(fixture => [Number(fixture?.fixture?.id), fixture]));
            for (const row of batch) {
                const fixture = fixtures.get(Number(row.fixtureId));
                if (!fixture || !FINAL_STATUSES.has(String(fixture?.fixture?.status?.short || '').toUpperCase())) continue;
                const results = row.picks.map(pick => ({...pick, ...settlePick(pick, fixture)})).filter(item => item.won !== null && item.won !== undefined);
                row.result = {status:'settled', score:results[0]?.score || `${fixture?.goals?.home ?? '-'}-${fixture?.goals?.away ?? '-'}`, picks:results, settledAt:now.toISOString()};
                settled++;
            }
        }
        if (settled) this.save();
        return settled;
    }

    async refreshResults(now = new Date()) {
        if (this.running || this.settling) throw new Error('Kupon LAB işlemi zaten çalışıyor.');
        if (!this.canRun()) throw new Error('Canlı sistem meşgul; sonuç güncelleme canlı taramaya öncelik verdi.');
        this.settling = true;
        const apiStart = this.usageToday(now);
        let settled = 0;
        try {
            settled = await this.settlePending(now);
        } finally {
            this.settling = false;
        }
        return {settled,apiUsed:this.usageToday(now)-apiStart,status:this.status(now)};
    }

    shouldAutoScan(now = new Date()) {
        if (!this.enabled || !this.autoEnabled || this.running || this.settling || istanbulClockMinutes(now) < this.scanHour * 60 + this.scanMinute) return false;
        return !this.data.scans.some(scan => scan.day === dateKey(now) && scan.status === 'complete');
    }

    setAutoEnabled(value) {
        this.autoEnabled = value === true;
        return this.status();
    }

    status(now = new Date()) {
        const day = dateKey(now);
        const todayRows = this.data.candidates.filter(row => row.day === day && row.active !== false);
        const latestScan = [...this.data.scans].reverse().find(scan => scan.day === day) || this.data.scans.at(-1) || null;
        return {
            success:true, version:VERSION, enabled:this.enabled, autoEnabled:this.autoEnabled, running:this.running, settling:this.settling,
            day, scanHour:this.scanHour, scanMinute:this.scanMinute, scanTime:this.settingsSnapshot().scanTime, includeTomorrow:this.includeTomorrow, finalCheckMinutes:this.finalCheckMinutes,
            bookmaker:this.data.bookmaker, api:{used:this.usageToday(now),limit:this.dailyLimit,reserve:this.reserve,remaining:finite(this.getQuotaRemaining())},
            limits:{maxCandidates:this.maxCandidates,maxSelected:this.maxSelected}, latestScan,
            settings:this.settingsSnapshot(),
            summary:{candidates:todayRows.length,selected:todayRows.filter(row=>row.selected).length,passed:todayRows.filter(row=>row.finalCheck?.status==='passed').length,rejected:todayRows.filter(row=>row.finalCheck?.status==='rejected').length},
            candidates:todayRows.sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff)),
            disclaimer:'Yalnız LAB verisidir; Telegram ve canlı V21/V22 sinyallerini etkilemez.'
        };
    }
}

module.exports = {CouponLab, VERSION, dateKey, parseOddsRows, normalizedWinnerProbabilities, predictionSummary, teamSummary, buildPicks, settlePick};
