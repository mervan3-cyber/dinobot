'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-test-lab-contract-'));
process.env.DINO_CORE_SHADOW_HISTORY_FILE = path.join(temporaryDirectory, 'core.json');
process.env.DINO_LEGACY_V17_SHADOW_HISTORY_FILE = path.join(temporaryDirectory, 'v17.json');
process.env.DINO_V19_SHADOW_HISTORY_FILE = path.join(temporaryDirectory, 'v19.json');
process.env.DINO_V21_SHADOW_HISTORY_FILE = path.join(temporaryDirectory, 'v21.json');
process.env.DINO_V20_SHADOW_HISTORY_FILE = path.join(temporaryDirectory, 'v20.json');
process.env.DINO_V20_SNAPSHOT_ARCHIVE_DIR = path.join(temporaryDirectory, 'snapshots');
process.env.DINO_V19_SHADOW_ENABLED = 'true';
process.env.DINO_CORE_SHADOW_ENABLED = 'true';
// Retired histories must not even be loaded/reset, regardless of obsolete env flags.
fs.writeFileSync(process.env.DINO_CORE_SHADOW_HISTORY_FILE, 'retired-core-preserve');
fs.writeFileSync(process.env.DINO_V19_SHADOW_HISTORY_FILE, 'retired-v19-preserve');

const originalLoad = Module._load;
const originalSetInterval = global.setInterval;
const originalSetTimeout = global.setTimeout;
const originalSetImmediate = global.setImmediate;
const routes = { get: new Map(), post: new Map() };

const register = (method, route, handler) => {
    for (const item of Array.isArray(route) ? route : [route]) {
        routes[method].set(item, handler);
    }
};
const app = {
    use() {},
    get(route, handler) { register('get', route, handler); },
    post(route, handler) { register('post', route, handler); },
    listen(port, callback) {
        if (typeof callback === 'function') callback();
        return { close() {} };
    }
};
function express() { return app; }
express.static = () => () => {};
express.json = () => () => {};

class GoogleGenerativeAI {
    getGenerativeModel() {
        return {
            generateContent: async () => ({ response: { text: () => 'test' } })
        };
    }
}

try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'dotenv') return { config() {} };
        if (request === 'express') return express;
        if (request === 'cors') return () => () => {};
        if (request === 'axios') {
            return {
                create: () => ({ get: async () => ({ data: { response: [] }, headers: {} }) })
            };
        }
        if (request === 'node-telegram-bot-api') {
            return class TelegramBot {
                async sendMessage() { return { message_id: 1 }; }
            };
        }
        if (request === '@google/generative-ai') return { GoogleGenerativeAI };
        return originalLoad(request, parent, isMain);
    };

    global.setInterval = () => ({ unref() {} });
    global.setTimeout = () => ({ unref() {} });
    global.setImmediate = () => ({ unref() {} });

    // Keep the real local dependencies, while placing every server-owned
    // history/config/cache path under this test's temporary directory.
    const serverPath = path.join(__dirname, 'server.js');
    const isolatedServer = new Module(serverPath, module);
    isolatedServer.filename = serverPath;
    isolatedServer.paths = module.paths;
    isolatedServer._compile(
        fs.readFileSync(serverPath, 'utf8'),
        path.join(temporaryDirectory, 'server.js')
    );

    const requiredGetRoutes = [
        '/api/test-lab-comparison',
        '/api/two-rule-core-shadow-history',
        '/api/two-rule-core-shadow-history/export',
        '/api/two-rule-core-shadow-history/export.csv',
        '/api/v17-legacy-shadow-history',
        '/api/v17-legacy-shadow-history/export',
        '/api/v17-legacy-shadow-history/export.csv',
        '/api/v19-independent-shadow-history',
        '/api/v19-independent-shadow-history/export',
        '/api/v19-independent-shadow-history/export.csv',
        '/api/v21-consensus-shadow-history',
        '/api/v21-consensus-shadow-history/export',
        '/api/v21-consensus-shadow-history/export.csv'
    ];
    for (const route of requiredGetRoutes) {
        assert.ok(routes.get.has(route), `GET route eksik: ${route}`);
    }
    assert.ok(routes.post.has('/api/test-lab-results/refresh'));
    assert.equal(routes.get.has('/api/v18-shadow-comparison'), false);
    assert.equal(routes.get.has('/api/v18-shadow-history'), false);
    assert.equal(routes.get.has('/api/v18-b-shadow-history/export'), false);

    let comparison = null;
    routes.get.get('/api/test-lab-comparison')(
        { query: { limit: 10 } },
        { json(value) { comparison = value; } }
    );
    assert.ok(comparison?.activeV19?.summary);
    assert.equal(comparison?.coreShadow?.validationMode, 'fresh-required');
    assert.equal(comparison?.legacyV17?.validationMode, 'fresh-required');
    assert.equal(comparison?.hybridObservation, undefined);
    assert.equal(routes.get.has('/api/hybrid-observation-history/export'), false);
    assert.equal(comparison?.activeV19?.telegram, false);
    assert.equal(comparison?.activeV19?.validationMode, 'fresh-required');
    assert.equal(comparison?.v21Shadow?.validationMode, 'fresh-required');
    assert.equal(comparison?.v21Shadow?.policy.edgeHigh, 0);
    assert.equal(comparison?.v21Shadow?.policy.edgeLow, -5);
    assert.equal(comparison?.v21Shadow?.policy.minimumVotes, 3);
    assert.deepEqual(comparison?.v21Shadow?.policy.markets, ['UST']);
    assert.deepEqual(
        comparison?.coreShadow?.rules?.map(rule => rule.market),
        ['MS2', '2.5_UST']
    );

    let status = null;
    routes.get.get('/api/status')({}, { json(value) { status = value; } });
    assert.ok(status?.testLabTracking?.coreShadow);
    assert.ok(status?.testLabTracking?.legacyV17);
    assert.ok(status?.testLabTracking?.v19Shadow);
    assert.ok(status?.testLabTracking?.v21Shadow);
    assert.equal(status?.v18ShadowTracking, undefined);
    assert.equal(status.testLabTracking.coreShadow.enabled, false);
    assert.equal(status.testLabTracking.v19Shadow.enabled, false);
    assert.equal(fs.readFileSync(process.env.DINO_CORE_SHADOW_HISTORY_FILE,'utf8'),'retired-core-preserve');
    assert.equal(fs.readFileSync(process.env.DINO_V19_SHADOW_HISTORY_FILE,'utf8'),'retired-v19-preserve');
    assert.deepEqual(status.marketTariff.telegramSources,['V22','V21']);
    assert.equal(status.marketTariff.maximumSignalsPerSourcePerFixture,1);

    console.log('Test Lab server contract tests passed.');
} finally {
    Module._load = originalLoad;
    global.setInterval = originalSetInterval;
    global.setTimeout = originalSetTimeout;
    global.setImmediate = originalSetImmediate;
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
