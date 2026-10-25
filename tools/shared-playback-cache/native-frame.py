#!/usr/bin/env python3
"""Owned loopback software-frame timing; standard C API, no core build/export API."""
import argparse, ctypes as C, hashlib, json, os, pathlib, platform, resource, select, sys, time, urllib.parse

EXPECTED_LIBRARY = 'f6fb466bbee5995f94b56505d331a34e26897c1f73b2c8982484c8bf071c45bc'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true'); parser.add_argument('--library', required=True)
    parser.add_argument('--url', required=True); parser.add_argument('--root', required=True)
    parser.add_argument('--managed-seek', action='store_true')
    args = parser.parse_args()
    assert args.run and platform.system() == 'Linux', 'explicit-linux-experiment-required'
    address = urllib.parse.urlsplit(args.url)
    assert address.scheme == 'http' and address.hostname == '127.0.0.1' and address.port and not address.username and not address.password, 'owned-loopback-required'
    library = pathlib.Path(args.library)
    assert hashlib.sha256(library.read_bytes()).hexdigest() == EXPECTED_LIBRARY, 'library-identity'
    root = pathlib.Path(args.root)
    assert root.is_absolute() and root.parent.resolve() == root.parent and not root.exists(), 'fresh-profile-required'
    root.mkdir(mode=0o700)
    for variable in ['APPDATA', 'LOCALAPPDATA', 'MPV_HOME', 'TMP', 'TEMP', 'TMPDIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME']:
        folder = root / variable.lower(); folder.mkdir(); os.environ[variable] = str(folder)
    lib = C.CDLL(str(library)); pointer = C.c_void_p
    lib.mpv_create.restype = pointer
    lib.mpv_initialize.argtypes = [pointer]; lib.mpv_initialize.restype = C.c_int
    lib.mpv_set_option_string.argtypes = [pointer, C.c_char_p, C.c_char_p]; lib.mpv_set_option_string.restype = C.c_int
    lib.mpv_command_async.argtypes = [pointer, C.c_uint64, C.POINTER(C.c_char_p)]; lib.mpv_command_async.restype = C.c_int
    lib.mpv_observe_property.argtypes = [pointer, C.c_uint64, C.c_char_p, C.c_int]; lib.mpv_observe_property.restype = C.c_int
    class Event(C.Structure):
        _fields_ = [('event_id', C.c_int), ('error', C.c_int), ('reply_userdata', C.c_uint64), ('data', pointer)]
    class Property(C.Structure):
        _fields_ = [('name', C.c_char_p), ('format', C.c_int), ('data', pointer)]
    lib.mpv_wait_event.argtypes = [pointer, C.c_double]; lib.mpv_wait_event.restype = C.POINTER(Event)
    lib.mpv_terminate_destroy.argtypes = [pointer]

    class Param(C.Structure):
        _fields_ = [('type', C.c_int), ('data', pointer)]

    lib.mpv_render_context_create.argtypes = [C.POINTER(pointer), pointer, C.POINTER(Param)]; lib.mpv_render_context_create.restype = C.c_int
    lib.mpv_render_context_update.argtypes = [pointer]; lib.mpv_render_context_update.restype = C.c_uint64
    lib.mpv_render_context_render.argtypes = [pointer, C.POINTER(Param)]; lib.mpv_render_context_render.restype = C.c_int
    lib.mpv_render_context_free.argtypes = [pointer]
    ctx = lib.mpv_create(); render = pointer(); phase = 'init'
    result = {'scope': 'Linux offscreen software-rendered decoded frame; NOT Windows/GPU/presented UI',
              'librarySha256': EXPECTED_LIBRARY, 'customExportApiUsed': False, 'profileIsolated': True,
              'renderThreadClientApi': 'async-command/observe-property/nonblocking-wait-event', 'synchronousRuntimeQueries': 0}

    def check(code):
        if code < 0:
            raise RuntimeError('native-code:' + str(code))

    serial = 0; seek_hint_pending = False
    observed = {'position': None, 'seeking': None}
    def command(*values):
        nonlocal serial
        serial += 1
        array = (C.c_char_p * (len(values) + 1))(*[value.encode() for value in values], None)
        check(lib.mpv_command_async(ctx, serial, array))

    def pump():
        nonlocal seek_hint_pending
        # render.h prohibits synchronous client waits on the rendering thread.
        # Property notifications and wait_event(timeout=0) satisfy that contract.
        for _ in range(128):
            event = lib.mpv_wait_event(ctx, 0).contents
            if event.event_id == 0:
                return
            if event.event_id == 5:
                check(event.error)
            if event.event_id == 20 and seek_hint_pending:
                seek_hint_pending = False
                print(json.dumps({'event': 'seek-started'}), flush=True)
            if event.event_id == 22 and event.data:
                prop = C.cast(event.data, C.POINTER(Property)).contents
                if prop.name == b'time-pos' and prop.format == 5 and prop.data:
                    observed['position'] = C.cast(prop.data, C.POINTER(C.c_double)).contents.value
                if prop.name == b'seeking' and prop.format == 3 and prop.data:
                    observed['seeking'] = bool(C.cast(prop.data, C.POINTER(C.c_int)).contents.value)

    dimensions = (C.c_int * 2)(160, 90); stride = C.c_size_t(640)
    pixels = C.create_string_buffer(640 * 90); fmt = C.create_string_buffer(b'rgb0')
    params = (Param * 5)(Param(17, C.cast(dimensions, pointer)), Param(18, C.cast(fmt, pointer)),
                           Param(19, C.cast(C.byref(stride), pointer)), Param(20, C.cast(pixels, pointer)), Param(0, None))

    def frame(target, began, previous_hash=None):
        deadline = time.monotonic() + 10
        rgb = None; digest = None
        while time.monotonic() < deadline:
            pump()
            flags = lib.mpv_render_context_update(render)
            if flags & 1:
                check(lib.mpv_render_context_render(render, params))
                raw = pixels.raw
                rgb = b''.join(raw[n:n + 3] for n in range(0, len(raw), 4))
                digest = hashlib.sha256(rgb).hexdigest()
            # FRAME can be reported before seeking=false. Keep the rendered
            # candidate and recheck state; requiring both in the same update
            # loses a valid paused frame when no later FRAME flag arrives.
            pos = observed['position']; seeking = observed['seeking']
            if (rgb is not None and pos is not None and abs(pos - target) <= 1 / 24 + 0.002 and len(set(rgb)) > 8 and
                    seeking is False and digest != previous_hash):
                return {'elapsedMs': (time.perf_counter() - began) * 1000, 'position': pos,
                        'rgbSha256': digest, 'rgbBytes': len(rgb)}
            time.sleep(0.001)
        result['lastFrameState'] = {**observed, 'rgbSha256': digest, 'target': target}
        raise TimeoutError('decoded-frame-timeout')

    try:
        for key, value in {'config': 'no', 'terminal': 'no', 'vo': 'libmpv', 'ao': 'null', 'audio': 'no',
                           'pause': 'yes', 'cache': 'yes', 'demuxer-max-bytes': '1048576',
                           'demuxer-max-back-bytes': '262144', 'osd-level': '0', 'keep-open': 'yes'}.items():
            check(lib.mpv_set_option_string(ctx, key.encode(), value.encode()))
        check(lib.mpv_initialize(ctx));
        check(lib.mpv_observe_property(ctx, 1001, b'time-pos', 5))
        check(lib.mpv_observe_property(ctx, 1002, b'seeking', 3))
        phase = 'render-create'
        api = C.create_string_buffer(b'sw'); init = (Param * 2)(Param(1, C.cast(api, pointer)), Param(0, None))
        check(lib.mpv_render_context_create(C.byref(render), ctx, init))
        phase = 'load'; began = time.perf_counter(); command('loadfile', args.url)
        phase = 'first-frame'; result['firstFrame'] = frame(0, began)
        phase = 'seek'; began = time.perf_counter()
        if args.managed_seek:
            print(json.dumps({'event': 'prepare-seek'}), flush=True)
            deadline = time.monotonic() + 2
            while not select.select([sys.stdin], [], [], 0)[0]:
                # Do not block the rendering thread on the coordinator either.
                pump()
                if lib.mpv_render_context_update(render) & 1:
                    check(lib.mpv_render_context_render(render, params))
                if time.monotonic() >= deadline:
                    raise TimeoutError('seek-coordinator-timeout')
                time.sleep(0.001)
            if sys.stdin.readline() != 'ready\n':
                raise RuntimeError('seek-coordinator-invalid')
        seek_hint_pending = args.managed_seek
        command('seek', '3', 'absolute+exact')
        result['seekFrame'] = frame(3, began, result['firstFrame']['rgbSha256'])
        result['differentFrames'] = result['firstFrame']['rgbSha256'] != result['seekFrame']['rgbSha256']
        assert result['differentFrames'], 'seek-frame-did-not-change'
        result['status'] = 'PASS'
    except Exception as error:
        result.update({'status': 'FAIL', 'stage': phase, 'errorType': type(error).__name__,
                       'safeReason': str(error) if str(error).startswith(('native-code:', 'decoded-frame-timeout', 'seek-frame-did-not-change', 'seek-coordinator-')) else 'native-probe-error'})
    finally:
        if render:
            lib.mpv_render_context_free(render)
        lib.mpv_terminate_destroy(ctx); result['contextTerminated'] = True
    result['peakRssBytes'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
    print(json.dumps(result), flush=True)
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
