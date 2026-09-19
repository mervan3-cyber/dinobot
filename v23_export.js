'use strict';
// Stream records individually; never stringify the full history for download.
async function streamJson(res, payload) {
    const write = async text => {
        if (res.destroyed) throw Error('client_closed');
        if (res.write(text)) return;
        await new Promise((resolve,reject) => {
            const cleanup = () => { res.off('drain',drained); res.off('close',closed); res.off('error',failed); };
            const drained = () => { cleanup(); resolve(); };
            const closed = () => { cleanup(); reject(Error('client_closed')); };
            const failed = error => { cleanup(); reject(error); };
            res.once('drain',drained); res.once('close',closed); res.once('error',failed);
        });
    };
    const { signals, profiles, profileEntries, ...meta } = payload;
    await write(JSON.stringify(meta).slice(0,-1) + ',"signals":[');
    let i=0;
    for (const signal of signals) await write((i++ ? ',' : '') + JSON.stringify(signal));
    await write('],"profiles":{');
    let first = true;
    for (const [id,profile] of profileEntries || Object.entries(profiles)) {
        await write((first ? '' : ',') + JSON.stringify(id) + ':' + JSON.stringify(profile)); first = false;
    }
    await write('}}'); res.end();
}
module.exports = { streamJson };
