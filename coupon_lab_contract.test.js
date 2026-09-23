const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const server=fs.readFileSync('server.js','utf8');
const moduleSource=fs.readFileSync('coupon_lab.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const rootHtml=fs.readFileSync('index.html','utf8');
const panel=fs.readFileSync('public/coupon_lab_panel.js','utf8');

assert.ok(server.includes("app.get('/api/coupon-lab'"));
assert.ok(server.includes("app.post('/api/coupon-lab/scan'"));
assert.ok(moduleSource.includes("/fixtures?date=${day}&timezone=Europe%2FIstanbul"));
assert.ok(server.includes("telegram: false"));
assert.ok(server.includes('setInterval(couponLabClock, 60000)'));
assert.ok(html.includes('id="section-coupon-lab"'));
assert.ok(html.includes('BUGÜNÜ ŞİMDİ TARA'));
assert.ok(html.includes('/coupon_lab_panel.js?v=20260923'));
assert.strictEqual(html,rootHtml);
assert.doesNotThrow(()=>new vm.Script(panel));
assert.ok(!panel.includes('innerHTML'));
assert.ok(panel.includes("apiFetch('/api/coupon-lab/scan'"));
console.log('Coupon LAB server/panel contract: separate section, manual today scan, safe renderer and no Telegram passed.');
