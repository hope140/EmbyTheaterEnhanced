'use strict';
// Fixed counters and aggregates only: no pixels, media identity or sample list.
const {performance} = require('perf_hooks');
const BOUNDS = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
function create(names, now = () => performance.now()) {
    const started = now(), entries = new Map(names.map(name => [name, {count:0, totalMs:0, maxMs:0, buckets:Array(BOUNDS.length + 1).fill(0)}]));
    function record(name, ms) {
        const entry = entries.get(name);
        if (!entry || !Number.isFinite(ms) || ms < 0 || ms > 60000) return;
        entry.count++; entry.totalMs += ms; entry.maxMs = Math.max(entry.maxMs, ms);
        const bucket = BOUNDS.findIndex(bound => ms <= bound); entry.buckets[bucket < 0 ? BOUNDS.length : bucket]++;
    }
    function measure(name, work) {const begin = now();try{return work();}finally{record(name, Math.max(0, now()-begin));}}
    function percentile(entry, fraction) {
        if (!entry.count) return null;
        let count = 0; for(let i=0;i<entry.buckets.length;i++){count+=entry.buckets[i];if(count>=Math.ceil(entry.count*fraction))return BOUNDS[i] || entry.maxMs;}
        return null;
    }
    return {record, measure, snapshot() {
        const stages = {};
        for(const [name,entry]of entries)stages[name]={count:entry.count,totalMs:entry.totalMs,maxMs:entry.maxMs,
            averageMs:entry.count?entry.totalMs/entry.count:null,p95UpperMs:percentile(entry,0.95)};
        return {elapsedMs:Math.max(0,now()-started),stages};
    }};
}
module.exports={create};
