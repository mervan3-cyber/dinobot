'use strict';

const tariff = require('./v24_tariff');
const { normalize, MAX_AGE_MS } = require('./v23_events');

const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

function oddsValue(mac, market) {
    const value = mac?.canli_oranlar?.[market];
    const parsed = Number(value && typeof value === 'object' ? value.oran : value);
    return Number.isFinite(parsed) ? parsed : null;
}

function turkeyDate(value) {
    const date = new Date(value || Date.now());
    const safe = Number.isFinite(date.getTime()) ? date : new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(safe);
    const item = type => parts.find(part => part.type === type)?.value;
    return `${item('year')}-${item('month')}-${item('day')}`;
}

function isWeekend(value) {
    const date = new Date(value || Date.now());
    const day = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Istanbul', weekday: 'short'
    }).format(Number.isFinite(date.getTime()) ? date : new Date());
    return day === 'Sat' || day === 'Sun';
}

function normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isWomenCompetition(mac) {
    const league = normalizeText(mac?.lig);
    const teams = `${normalizeText(mac?.home_team_name)} ${normalizeText(mac?.away_team_name)} ${normalizeText(mac?.mac_isim)}`;
    return /\b(women|woman|kadin|femeni|feminine|femenina|feminino)\b/.test(`${league} ${teams}`) ||
        /\b(w|ladies)\b/.test(teams);
}

function excludedLeague(mac, policy) {
    const league = normalizeText(mac?.lig);
    if (!policy.excludedLeagues?.some(item => normalizeText(item) === league)) return false;
    const country = normalizeText(mac?.league_country || mac?.country);
    if (['league one', 'league two'].includes(league)) {
        return !country || country === 'england' || country === 'ingiltere';
    }
    return true;
}

function isNationalCompetition(mac) {
    const league = normalizeText(mac?.lig);
    if (/\b(?:club world cup|friendlies clubs?|club friendlies)\b/.test(league)) return false;
    return /(?:^|\b)(?:nations league|friendlies?|world cup|africa cup of nations|asian cup|euro championship|european championship|copa america|gold cup|asean cup|african nations championship|olympic games|u\d+ championship)(?:\b|$)/.test(league);
}

function eventScoreAudit(mac, capturedAt) {
    const at = time(capturedAt);
    const eventsAt = time(mac?._v23EventsAt);
    const score = /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(String(mac?.skor || ''));
    if (at === null || eventsAt === null || eventsAt > at || at - eventsAt > MAX_AGE_MS || !score) {
        return { status: 'insufficient', reason: 'EVENT_SCORE_UNAVAILABLE', eventsAt: mac?._v23EventsAt || null };
    }
    const parsed = normalize(mac?._v23Events, mac, mac?._v23EventsAt);
    if (parsed.status !== 'ok') {
        return { status: 'insufficient', reason: parsed.reason || 'EVENT_SCORE_UNAVAILABLE', eventsAt: mac?._v23EventsAt || null };
    }
    const goalCount = parsed.events.filter(event => event.type === 'goal' && !event.cancelled).length;
    const scoreTotal = Number(score[1]) + Number(score[2]);
    return {
        status: goalCount === scoreTotal ? 'approve' : 'reject',
        reason: goalCount === scoreTotal ? 'EVENT_SCORE_MATCH' : 'EVENT_SCORE_MISMATCH',
        goalCount,
        scoreTotal,
        eventsAt: mac._v23EventsAt
    };
}

function createV24Lab({
    tracker,
    v16Model,
    v18Model,
    prematchSupport,
    prematchSource,
    liveSnapshot,
    v25Scorer = null,
    enabled = true,
    policy = tariff.POLICY,
    source = 'V24'
}) {
    function modelInput(mac, dino, market) {
        return {
            market,
            score: mac?.skor,
            minute: mac?.dakika,
            odds: oddsValue(mac, market),
            dinoProbability: dino?.[market],
            prematchSupport: prematchSupport(mac, market)
        };
    }

    function hasFixtureSignal(mac) {
        const fixtureId = Number(mac?.fixture_id);
        return !Number.isFinite(fixtureId) || fixtureId <= 0 || tracker.data.signals.some(
            signal => Number(signal.fixtureId) === fixtureId
        );
    }

    function leagueQuotaReached(mac, capturedAt) {
        if (!policy.quietLeagueDailyLimit) return false;
        const leagueId = Number(mac?.league_id);
        if (!Number.isFinite(leagueId) || leagueId <= 0) return true;
        const date = turkeyDate(capturedAt);
        const count = tracker.data.signals.filter(signal =>
            Number(signal?.analysis?.leagueId) === leagueId && turkeyDate(signal.sentAt) === date
        ).length;
        return count >= policy.quietLeagueDailyLimit;
    }

    function baseAvailable(mac, dino, capturedAt = null) {
        if (!enabled || !mac || !dino || dino.HATA || dino.MODEL_VARYANTI === 'score_only') return false;
        if (policy.weekendOnly && !isWeekend(capturedAt)) return false;
        if (policy.womenExcluded && isWomenCompetition(mac)) return false;
        if (excludedLeague(mac, policy)) return false;
        if (policy.excludedNationalCompetitions && isNationalCompetition(mac)) return false;
        if (hasFixtureSignal(mac) || leagueQuotaReached(mac, capturedAt)) return false;
        return true;
    }

    function v25Assessment(mac, check, market, capturedAt) {
        const rule = policy.v25Joint?.branches?.[check?.branch] || null;
        if (!rule) return { required: false, eligible: true, reasons: [], score: null, rule: null };
        if (!v25Scorer || typeof v25Scorer.checkJoint !== 'function') {
            return { required: true, eligible: false, reasons: ['V25_SCORER_UNAVAILABLE'], score: null, rule };
        }
        const assessed = v25Scorer.checkJoint({
            branch: check.branch,
            market,
            score: mac?.skor,
            minute: mac?.dakika,
            odds: oddsValue(mac, market),
            prematchSupport: prematchSupport(mac, market),
            isWeekend: isWeekend(capturedAt)
        }, rule);
        return { required: true, ...assessed };
    }

    function preselect(mac, dino, capturedAt = null) {
        if (!baseAvailable(mac, dino, capturedAt)) return false;
        for (const market of Object.keys(mac?.canli_oranlar || {})) {
            const check = tariff.overCheck({
                ...modelInput(mac, dino, market),
                v16Probability: 100,
                v18Probability: 100,
                eventScoreStatus: 'approve'
            }, { policy, requireEventScore: false, skipModelThresholds: true });
            if (check.eligible && v25Assessment(mac, check, market, capturedAt).eligible) return true;
        }
        if (policy.leadingWinner.enabled === false) return false;
        const market = tariff.leadingWinnerMarket(mac?.skor);
        if (!market) return false;
        return tariff.winnerCheck({
            market,
            score: mac?.skor,
            minute: mac?.dakika,
            odds: oddsValue(mac, market),
            v16Probability: 100,
            eventScoreStatus: 'approve'
        }, { policy, requireEventScore: false, skipModelThresholds: true }).eligible;
    }

    function select({ mac, dino, liveOnlyDino, capturedAt = null, requireEventScore = false }) {
        if (!baseAvailable(mac, dino, capturedAt)) return { selected: null, over: null, winner: null, eventScore: null };
        const context = mac?._selectorShadowContext || null;
        const eventScore = requireEventScore
            ? eventScoreAudit(mac, capturedAt)
            : { status: 'approve', reason: 'PRESELECTION_ONLY' };
        const candidates = [];

        for (const market of Object.keys(mac?.canli_oranlar || {})) {
            if (!/^(\d+\.5)_UST$/.test(market)) continue;
            const args = modelInput(mac, dino, market);
            const score16 = v16Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
            const score18 = v18Model.scoreMarket(mac, market, dino, liveOnlyDino, context);
            const check = tariff.overCheck({
                ...args,
                v16Probability: score16?.selectorProbability,
                v18Probability: score18?.v18Probability,
                eventScoreStatus: eventScore.status
            }, { policy, requireEventScore });
            const v25 = check.eligible ? v25Assessment(mac, check, market, capturedAt) : null;
            if (check.eligible && (!v25 || v25.eligible)) {
                candidates.push({ kind: 'over', market, args, score16, score18, policy: check, v25 });
            }
        }

        const winnerMarket = tariff.leadingWinnerMarket(mac?.skor);
        if (winnerMarket) {
            const score16 = v16Model.scoreMarket(mac, winnerMarket, dino, liveOnlyDino, context);
            const check = tariff.winnerCheck({
                market: winnerMarket,
                score: mac?.skor,
                minute: mac?.dakika,
                odds: oddsValue(mac, winnerMarket),
                v16Probability: score16?.selectorProbability,
                eventScoreStatus: eventScore.status
            }, { policy, requireEventScore });
            if (check.eligible) candidates.push({ kind: 'winner', market: winnerMarket, score16, policy: check });
        }

        const priority = branch => policy.priority.indexOf(branch);
        candidates.sort((left, right) =>
            priority(left.policy.branch) - priority(right.policy.branch) ||
            Number(right.policy.v16Probability ?? right.policy.probabilities?.v16 ?? -1) -
                Number(left.policy.v16Probability ?? left.policy.probabilities?.v16 ?? -1) ||
            Number(left.policy.odds) - Number(right.policy.odds) ||
            left.market.localeCompare(right.market, 'en')
        );
        const selected = candidates[0] || null;
        return {
            selected,
            over: selected?.kind === 'over' ? selected : null,
            winner: selected?.kind === 'winner' ? selected : null,
            eventScore
        };
    }

    function contextOrNull(mac) {
        return mac?._selectorShadowContext || null;
    }

    function commonPayload(mac, dino, liveOnlyDino, capturedAt, market, odds) {
        return {
            fixtureId: Number(mac.fixture_id),
            sentAt: capturedAt,
            telegramMessageId: null,
            match: mac.mac_isim,
            league: mac.lig,
            minute: Number(mac.dakika),
            score: mac.skor,
            market,
            odds,
            bookmaker: mac.canli_oranlar?.[market]?.bookmaker || null,
            dinoProbability: Number.isFinite(Number(dino?.[market])) ? Number(dino[market]) : null,
            modelVariant: `v24_${policy.key}_shadow_fresh_only`,
            liveOnlyProbability: Number.isFinite(Number(liveOnlyDino?.[market])) ? Number(liveOnlyDino[market]) : null,
            selectorV2ModelVersion: v16Model.MODEL.version,
            tariffVersion: policy.version,
            signalSources: [source],
            prematchSource: mac.prematch_source || null,
            prematchProbabilities: mac.prematch_available ? {
                home: mac.prematch_p_home,
                draw: mac.prematch_p_draw,
                away: mac.prematch_p_away
            } : null,
            prematchMarketSupport: prematchSupport(mac, market),
            prematchMarketSource: prematchSource(mac, market),
            statsSource: mac.stats_source || null,
            statsValidation: { ...mac.stats_validation },
            liveStats: liveSnapshot(mac),
            shadowContext: contextOrNull(mac)
        };
    }

    function record({ mac, dino, liveOnlyDino, capturedAt }) {
        const verifiedAt = mac?.stats_validation?.verifiedAt;
        if (mac?.stats_validation?.status !== 'passed' || !verifiedAt || !capturedAt ||
            !Number.isFinite(Date.parse(verifiedAt)) || Date.parse(verifiedAt) !== Date.parse(capturedAt)) {
            return { record: null, over: null, winner: null, eventScore: null };
        }

        const choice = select({ mac, dino, liveOnlyDino, capturedAt, requireEventScore: true });
        if (!choice.selected) return { record: null, over: null, winner: null, eventScore: choice.eventScore };
        const selected = choice.selected;
        const branch = selected.policy.branch;
        const isOver = selected.kind === 'over';
        const score16 = selected.score16;
        const score18 = selected.score18;
        const record = tracker.recordSent({
            ...commonPayload(mac, dino, liveOnlyDino, capturedAt, selected.market, selected.policy.odds),
            signalType: isOver ? 'strong' : 'surprise',
            tariffSlot: 'primary',
            tariffRuleId: isOver ? `V24-${policy.key}-${branch}` : `V24-${policy.key}-LEADING-WINNER`,
            matchedFilters: [branch],
            goalsNeeded: isOver ? selected.policy.goalsNeeded : null,
            edge: isOver ? selected.policy.recordedEdge : selected.policy.v16Edge,
            marketProbability: selected.policy.marketProbability,
            selectorV2Probability: score16?.selectorProbability,
            selectorV2RawProbability: score16?.selectorRawProbability,
            v16Edge: selected.policy.v16Edge,
            v18Probability: isOver ? score18?.v18Probability : null,
            v18Edge: isOver ? score18?.v18Edge : null,
            decisionModel: isOver ? 'v24-consensus' : 'v16',
            decisionProbability: score16?.selectorProbability,
            decisionEdge: selected.policy.v16Edge,
            modelVotes: isOver ? { dino: true, v16: true, v18: true } : { v16: true },
            voteCount: isOver ? 3 : 1,
            modelProbabilities: isOver ? selected.policy.probabilities : { v16: score16?.selectorProbability },
            analysis: {
                variantKey: policy.key,
                variantLabel: policy.label,
                leagueId: Number(mac?.league_id) || null,
                turkeyDate: turkeyDate(capturedAt),
                eventScore: choice.eventScore,
                eventScoreRequired: true,
                thresholds: selected.policy.thresholds,
                v25Joint: selected.v25 || null
            },
            v25ModelVersion: selected.v25?.score?.modelVersion || null,
            v25TrainedThrough: selected.v25?.score?.trainedThrough || null,
            v25Probability: selected.v25?.score?.probability ?? null,
            v25RawProbability: selected.v25?.score?.rawProbability ?? null,
            v25Edge: selected.v25?.score?.edge ?? null,
            v25JointEligible: selected.v25?.eligible ?? null,
            v25JointRule: selected.v25?.rule || null
        });
        return {
            record,
            over: isOver ? record : null,
            winner: isOver ? null : record,
            eventScore: choice.eventScore
        };
    }

    function metadata(signals = tracker.data.signals) {
        const branchSummary = branch => tracker.summary(signals.filter(signal => signal.matchedFilters?.includes(branch))).overall;
        const overSignals = signals.filter(signal => signal.signalType === 'strong');
        const winnerSignals = signals.filter(signal => signal.signalType === 'surprise');
        return {
            enabled,
            key: policy.key,
            label: policy.label,
            decisionImpact: false,
            telegram: false,
            validationMode: 'fresh-required',
            weekendOnly: policy.weekendOnly,
            tariffVersion: policy.version,
            v25ModelVersion: policy.v25Joint?.modelVersion || null,
            v25TrainedThrough: policy.v25Joint?.trainedThrough || null,
            policy,
            maximumSignalsPerFixture: 1,
            startedAt: tracker.data.startedAt,
            summary: tracker.summary(signals),
            overSummary: tracker.summary(overSignals),
            winnerSummary: tracker.summary(winnerSignals),
            filterSummaries: Object.fromEntries(['SNIPER', 'B', 'A', 'MS'].map(branch => [branch, branchSummary(branch)]))
        };
    }

    return { preselect, select, record, metadata, eventScoreAudit, policy };
}

module.exports = {
    createV24Lab,
    eventScoreAudit,
    isWeekend,
    turkeyDate,
    isWomenCompetition,
    excludedLeague,
    isNationalCompetition
};
