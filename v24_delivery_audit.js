'use strict';

// Read-only delivery diagnostics. LAB qualification is not a Telegram receipt.
// No new store, timer, queue, API call, retry, or modification of old observations.
const VERSION = 'v24-delivery-audit-2026-10-07';
const LABELS = Object.freeze({
    CHANNEL_MISSING: 'Ana Telegram kanalı ayarlı değil.',
    DELIVERY_DISABLED: 'Teslim defteri güvenliği nedeniyle gönderim kapalı.',
    ACTIVATION_MISSING: 'V24 canlı başlangıç zamanı geçersiz.',
    BEFORE_ACTIVATION: 'Kayıt V24 canlı başlangıcından önce.',
    FIXTURE_LOCKED: 'Bu maç daha önce gönderildi veya belirsiz teslim kilidi var.',
    V24_CHOICE_MISSING: 'Taze V24 seçimi yok.',
    STATS_NOT_PASSED: 'Taze istatistik doğrulaması geçmedi.',
    STATS_STALE_OR_FUTURE: 'Doğrulama zamanı eski, gelecekte veya geçersiz.',
    CAPTURE_TIME_INVALID: 'Gönderim kontrol zamanı geçersiz.',
    MINUTE_OUTSIDE: 'Son dakika V24 kolunun aralığı dışında.',
    ODDS_OUTSIDE: 'Son oran V24 aralığı dışında.',
    DINO_EDGE_OUTSIDE: 'Son oranla Dino EDGE şartı sağlanmadı.',
    V16_EDGE_OUTSIDE_0_5: 'Son oranla MS V16 EDGE şartı sağlanmadı.',
    EVENT_SCORE_MISMATCH: 'Olay listesindeki goller güncel skorla uyuşmuyor.',
    EVENT_SCORE_UNAVAILABLE: 'Taze ve tutarlı gol olayları doğrulanamadı.',
    BRANCH_CHANGED: 'Son kontrolde seçilen A/B/Sniper/MS kolu değişti.',
    PREMATCH_BELOW_MS_MINIMUM: 'MS prematch desteği %36 altında.',
    FINAL_NOT_LIVE: 'Son kontrolde maç canlı/dakika koşulunu sağlamıyor.',
    FINAL_SCORE_UNAVAILABLE: 'Son kontrolde skor alınamadı.',
    FINAL_SCORE_CHANGED: 'Son kontrolde skor değişti; eski tahmin gönderilmedi.',
    FINAL_FIXTURE_MISMATCH: 'Son kontrolde maç kimliği uyuşmadı.',
    FINAL_ODDS_UNAVAILABLE: 'Son kontrolde canlı oranlar alınamadı.',
    FINAL_ODDS_OUTSIDE: 'Seçilen market kapandı veya oran sınır dışında.',
    FINAL_ODDS_DRIFT: 'Oran değişimi güvenlik sınırını aştı.',
    FINAL_EVENTS_AHEAD: 'Olay akışı fixture skorundan fazla gol gösteriyor.',
    FINAL_RECENT_GOAL: 'Son golün güvenlik soğuma süresi dolmadı.',
    FINAL_VERIFICATION_UNAVAILABLE: 'Son canlılık kontrolü tamamlanamadı.',
    FINAL_REJECTED: 'Son canlılık kontrolü reddetti; ayrıntı kaydı yok.',
    TELEGRAM_DECLINED: 'Telegram isteği açıkça reddetti; yeni taze girişte denenebilir.',
    TELEGRAM_UNCERTAIN: 'Telegram teslimi belirsiz; mükerrer gönderim için tekrar denenmez.',
    TELEGRAM_NOT_ATTEMPTED: 'Telegram teslim aşamasında gönderim başlatılmadı.',
    TELEGRAM_SENT: 'Telegram mesaj kimliği ile teslim doğrulandı.',
    TELEGRAM_RECEIPT_TRACKER_FAILED: 'Teslim doğrulandı fakat paylaşım kaydı yazımı tamamlanamadı; tekrar gönderilmez.'
});
function reasonText(codes, fallback) {
    return [...new Set((codes || []).map(code => LABELS[code] || String(code)))].join(' ') || fallback || 'Neden kaydı yok.';
}
function deliveryCheck({status, stage, codes = [], reason, checkedAt, minute, score, odds}) {
    const normalized = [...new Set(codes.map(String))];
    return { version: VERSION, source: 'V24', status, stage, codes: normalized,
        reason: reason || reasonText(normalized), checkedAt,
        minute: minute ?? null, score: score ?? null, odds: odds ?? null };
}
const positiveId = value => Number.isInteger(Number(value)) && Number(value) > 0;
const key = (id, market) => `${Number(id)}:${market}`;
const stamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
function withDeliveryView(signals, {sharedSignals = [], entries = [], candidates = [], channel} = {}) {
    const sent = new Map(), fixtureSent = new Map(), intents = new Map(), audits = new Map();
    for (const s of sharedSignals) if (positiveId(s.telegramMessageId)) {
        sent.set(key(s.fixtureId, s.market), s); fixtureSent.set(Number(s.fixtureId), s);
    }
    for (const e of entries) {
        if (String(e.requestedChannel) !== String(channel) || !e.payload) continue;
        const s = {...e.payload, telegramMessageId: e.messageId};
        if (e.status === 'sent' && positiveId(e.messageId)) {
            sent.set(key(s.fixtureId, s.market), s); fixtureSent.set(Number(s.fixtureId), s);
        }
        const previous = intents.get(Number(s.fixtureId));
        if (!previous || stamp(e.createdAt) >= stamp(previous.createdAt)) intents.set(Number(s.fixtureId), e);
    }
    for (const c of candidates) {
        const audit = c.liveDeliveryCheck;
        if (!audit || audit.source !== 'V24') continue;
        const k = key(c.fixtureId, c.market), previous = audits.get(k);
        if (!previous || stamp(audit.checkedAt) >= stamp(previous.checkedAt)) audits.set(k, audit);
    }
    return signals.map(s => {
        const receipt = sent.get(key(s.fixtureId, s.market));
        let view;
        if (receipt) view = {status: 'sent', label: 'Gönderildi', reason: LABELS.TELEGRAM_SENT,
            checkedAt: receipt.sentAt, telegramMessageId: receipt.telegramMessageId};
        else if (fixtureSent.has(Number(s.fixtureId))) view = {status: 'other_market', label: 'Başka market gönderildi',
            reason: 'Maç başına tek sinyal kilidi: başka market için teslim doğrulandı.'};
        else {
            const intent = intents.get(Number(s.fixtureId)), audit = audits.get(key(s.fixtureId, s.market));
            const currentAudit = audit && stamp(audit.checkedAt) >= stamp(s.sentAt) ? audit : null;
            if (intent && ['sending', 'uncertain'].includes(intent.status)) view = {status: 'uncertain', label: 'Teslim belirsiz',
                reason: LABELS.TELEGRAM_UNCERTAIN, checkedAt: intent.createdAt};
            else if (currentAudit) view = {status: currentAudit.status,
                label: currentAudit.status === 'declined' ? 'Telegram reddetti' : currentAudit.status === 'uncertain'
                    ? 'Teslim belirsiz' : 'Son kontrol reddi', reason: currentAudit.reason, checkedAt: currentAudit.checkedAt};
            else if (intent?.status === 'declined') view = {status: 'declined', label: 'Telegram reddetti',
                reason: LABELS.TELEGRAM_DECLINED, checkedAt: intent.createdAt};
            else view = {status: 'unknown', label: 'Neden kaydı yok',
                reason: 'LAB kaydı teslim onayı değildir. Eski kayıtta son kontrol nedeni saklanmamış.'};
        }
        return {...s, deliveryView: view};
    });
}
module.exports = {VERSION, LABELS, reasonText, deliveryCheck, withDeliveryView};
