'use strict';

function createOwner(powerSaveBlocker) {
    const reasons = {
        video: 'prevent-display-sleep',
        audio: 'prevent-app-suspension'
    };
    const ids = {video: null, audio: null};
    let accepting = true;

    function release(kind) {
        const id = ids[kind];
        if (id === null) return;

        if (powerSaveBlocker.isStarted(id)) {
            powerSaveBlocker.stop(id);
        }

        ids[kind] = null;
    }

    return {
        setActive(kind, active) {
            if (!Object.prototype.hasOwnProperty.call(reasons, kind)) {
                throw new TypeError('Unknown playback power owner kind');
            }

            if (active) {
                if (!accepting) return;
                if (ids[kind] !== null) {
                    if (powerSaveBlocker.isStarted(ids[kind])) return;
                    ids[kind] = null;
                }
                ids[kind] = powerSaveBlocker.start(reasons[kind]);
                return;
            }

            release(kind);
        },

        shutdown() {
            accepting = false;
            const errors = [];
            for (const kind of ['video', 'audio']) {
                try {
                    release(kind);
                } catch (error) {
                    errors.push(error);
                }
            }

            if (errors.length === 1) throw errors[0];
            if (errors.length > 1) {
                throw new AggregateError(errors, 'Failed to release playback power blockers');
            }
        }
    };
}

module.exports = {createOwner};
