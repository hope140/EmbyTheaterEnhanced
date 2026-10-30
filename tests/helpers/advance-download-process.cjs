'use strict';
const {createManager} = require('../../src/electronapp/enhanced/advance-download/manager');
const {createStore} = require('../../src/electronapp/enhanced/advance-download/task-store');
let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {body += chunk; if (body.length > 32768) process.exit(2);});
process.stdin.on('end', async () => {
    let manager;
    try {
        const input = JSON.parse(body), store = createStore(input.profile);
        let stopping = false;
        manager = createManager({store, profileRoot: input.profile,
            selectDirectory: async () => ({status: 'selected', directory: input.directory}),
            onChange(value) {
                if (input.mode === 'resume' || stopping) return;
                const task = store.get(value.id);
                if (input.mode === 'crash' && task.partial?.offset >= 8388608) {
                    stopping = true;
                    process.stdout.write(JSON.stringify({phase: 'durable', id: value.id, offset: task.partial.offset}) + '\n');
                } else if (input.mode === 'pause' && value.bytes >= 1024) {
                    stopping = true;
                    manager.close().then(() => process.stdout.write(JSON.stringify({phase: 'paused', id: value.id}) + '\n', () => process.exit(0)));
                }
            }});
        if (input.mode === 'resume') {
            manager.attach(input.context); await manager.idle();
            const task = store.list()[0];
            if (task?.state !== 'complete') throw Error('not-complete');
            await manager.close();
            process.stdout.write(JSON.stringify({phase: 'complete', id: task.id, fileName: task.file.name}) + '\n', () => process.exit(0));
        } else {
            const queued = await manager.enqueue(input.context);
            if (queued.status !== 'queued') throw Error('not-queued');
        }
    } catch (_) {if (manager) await manager.close(); process.stderr.write('download-process-selftest-failed\n'); process.exit(1);}
});
