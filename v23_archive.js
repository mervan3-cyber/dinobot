'use strict';
// Only settled V23 evidence lives here. No provider requests, no source-model writes.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FORMAT = 'v23-settled-evidence-v1';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const profileIds = signal => [...new Set(Object.values(signal.assessment?.profileIds || {}).filter(Boolean))];
function syncDirectory(directory) {
    if (process.platform === 'win32') return;
    const fd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function durableJson(file, data) {
    const directory = path.dirname(file);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    const fd = fs.openSync(temporary, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(data), 'utf8'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    syncDirectory(directory);
}
// Enough for totals, date/source selection and duplicate locks; no live stats,
// event timelines, historical matches or detailed control measurements in RAM.
function indexRecord(signal, ref) {
    const index = {};
    for (const key of ['signalId','fixtureId','sentAt','sourceModel','matchedFilters','market',
        'minute','score','odds','signalType','tariffSlot','settlement']) {
        if (signal[key] !== undefined) index[key] = signal[key];
    }
    index.assessment = {};
    for (const key of ['status','reasons','profileIds','collectorVersion']) {
        if (signal.assessment[key] !== undefined) index.assessment[key] = signal.assessment[key];
    }
    if (signal.audit) index.audit = { version:signal.audit.version, controls:signal.audit.controls.map(c => ({
        id:c.id, status:c.status, reasons:c.reasons, reasonLabels:c.reasonLabels,
        values:c.values?.tag ? {tag:c.values.tag} : {}
    })) };
    // Conditional addition preserves byte-for-byte indices/checksums of old files.
    if (signal.audit?.live) index.audit.live = {version:signal.audit.live.version,controls:signal.audit.live.controls.map(c=>({
        id:c.id,status:c.status,reasons:c.reasons,reasonLabels:c.reasonLabels,values:c.values?.tag?{tag:c.values.tag}:{}
    }))};
    if (signal.filterAudit) {
        index.baselineSignalId = signal.baselineSignalId;
        index.filterAudit = {version:signal.filterAudit.version,controls:signal.filterAudit.controls.map(c=>({
            id:c.id,status:c.status,reasons:c.reasons,reasonLabels:c.reasonLabels,values:{}
        }))};
    }
    index.archiveRef = ref;
    return JSON.parse(JSON.stringify(index));
}
class SettledArchive {
    constructor(historyFile) { this.directory = `${historyFile}.archive`; }
    file(ref) {
        if (!ref || ref.format !== FORMAT || !/^\d{4}-\d{2}-\d{2}$/.test(ref.day) || !/^[a-f0-9]{64}$/.test(ref.sha256))
            throw Error('archive_reference_invalid');
        return path.join(this.directory, ref.day, `${ref.sha256}.json`);
    }
    write(signal, profiles) {
        if (signal.archiveRef || !['W','L','PUSH','VOID'].includes(signal.settlement?.result)) throw Error('archive_requires_settled_record');
        const used = Object.fromEntries(profileIds(signal).map(id => {
            if (!profiles[id]) throw Error('archive_profile_missing');
            return [id, profiles[id]];
        }));
        const payload = {format:FORMAT, signal, profiles:used};
        const bytes = JSON.stringify(payload);
        const ref = {format:FORMAT, day:new Date(Date.parse(signal.sentAt)+3*3600000).toISOString().slice(0,10), sha256:digest(bytes)};
        const file = this.file(ref);
        if (!fs.existsSync(file)) {
            const dayDirectory = path.dirname(file);
            fs.mkdirSync(dayDirectory, {recursive:true});
            // Persist the directory entries too before committing the history index.
            syncDirectory(path.dirname(this.directory)); syncDirectory(this.directory);
            durableJson(file,payload);
        }
        const index = indexRecord(signal,ref);
        this.read(index); // Read back + checksum + index comparison before eviction.
        return index;
    }
    read(index) {
        const bytes = fs.readFileSync(this.file(index.archiveRef));
        if (digest(bytes) !== index.archiveRef.sha256) throw Error('archive_checksum_mismatch');
        const data = JSON.parse(bytes.toString('utf8'));
        if (data.format !== FORMAT || !data.profiles || data.signal?.archiveRef ||
            !['W','L','PUSH','VOID'].includes(data.signal?.settlement?.result) ||
            JSON.stringify(indexRecord(data.signal,index.archiveRef)) !== JSON.stringify(index) ||
            profileIds(data.signal).some(id=>!data.profiles[id])) throw Error('archive_record_mismatch');
        return data;
    }
}
module.exports = {SettledArchive, durableJson, profileIds, indexRecord};
