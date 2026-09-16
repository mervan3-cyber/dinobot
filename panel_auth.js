'use strict';
const crypto = require('crypto');
const COOKIE = 'my_panel_session';
const digest = value => crypto.createHash('sha256').update(String(value)).digest();
function createPanelAuth({password = '', now = Date.now, ttl = 8 * 3600000} = {}) {
    const sessions = new Map(), attempts = new Map();
    const configured = typeof password === 'string' && password.length >= 12;
    const deny = (res, status, error) => res.status(status).json({success:false,error});
    const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(s => s.trim().split('=')));
    function session(req) {
        const token = cookies(req)[COOKIE];
        return token && (sessions.get(token) || 0) > now() ? token : null;
    }
    return function panelAuth(req, res, next) {
        const pathname = String(req.path || String(req.url).split('?')[0]).toLowerCase().replace(/\/+$/,'');
        if (!pathname.startsWith('/api') && pathname !== '/statistics-coverage') return next();
        res.setHeader('Cache-Control', 'no-store');
        for (const [key, expires] of sessions) if (expires <= now()) sessions.delete(key);
        for (const [key, entry] of attempts) if (entry.until <= now()) attempts.delete(key);
        if (!['GET','HEAD'].includes(req.method)) {
            let originOK = false;
            try { originOK = new URL(req.headers.origin).host === req.headers.host; } catch (_) {}
            if (!originOK || req.headers['x-mac-yakala-request'] !== '1' || !String(req.headers['content-type']).startsWith('application/json')) {
                return deny(res,403,'Aynı panel adresinden JSON isteği gerekli.');
            }
        }
        if (pathname === '/api/auth/login' && req.method === 'POST') {
            if (!configured) return deny(res,503,'PANEL_ADMIN_PASSWORD .env içinde en az 12 karakter olmalı.');
            const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
            const entry = attempts.get(ip) || {count:0,until:now()+900000};
            if (entry.count >= 10 || (!attempts.has(ip) && attempts.size >= 10000)) return deny(res,429,'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.');
            entry.count++; attempts.set(ip,entry);
            const supplied = req.body?.password;
            if (typeof supplied !== 'string' || supplied.length > 1024 || !crypto.timingSafeEqual(digest(supplied),digest(password))) return deny(res,401,'Şifre yanlış.');
            attempts.delete(ip);
            if (sessions.size >= 1024) sessions.delete(sessions.keys().next().value);
            const token = crypto.randomBytes(32).toString('hex'); sessions.set(token,now()+ttl);
            const old = session(req); if (old) sessions.delete(old);
            const secure = req.secure || req.headers.origin?.startsWith('https://');
            res.setHeader('Set-Cookie',`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(ttl/1000)}${secure?'; Secure':''}`);
            return res.json({success:true});
        }
        const token = session(req);
        if (!token) return deny(res,401,'Panel oturumu gerekli.');
        if (pathname === '/api/auth/logout' && req.method === 'POST') {
            sessions.delete(token); res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
            return res.json({success:true});
        }
        return next();
    };
}
module.exports = {createPanelAuth};
