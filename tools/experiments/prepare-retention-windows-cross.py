#!/usr/bin/env python3
"""Owned Linux cross-compiler gate only; never runs the produced Windows probes."""
import argparse, hashlib, json, pathlib, platform, re, shutil, signal, subprocess, sys, time, urllib.request


def sha(file):
    h = hashlib.sha256()
    with open(file, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def tree_identity(root):
    rows = []
    for file in sorted(root.rglob('*')):
        relative = file.relative_to(root).as_posix()
        if file.is_symlink():
            target = file.resolve()
            require(target.is_relative_to(root) and target.exists(), 'toolchain-link-outside')
            rows.append({'path': relative, 'link': str(file.readlink())})
        elif file.is_file():
            rows.append({'path': relative, 'sha256': sha(file), 'bytes': file.stat().st_size})
    return {'algorithm': 'sha256(JSON utf8 sorted paths rows sort_keys compact; file path/sha256/bytes or path/link)',
            'files': sum('bytes' in row for row in rows), 'bytes': sum(row.get('bytes', 0) for row in rows),
            'symlinks': sum('link' in row for row in rows),
            'sha256': hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}


def validate_lock(lock):
    require(lock.get('schema') == 1 and lock['target']['triple'] == 'x86_64-w64-mingw32' and
            lock['target']['runtime'] == 'msvcrt-posix', 'cross-lock-schema')
    names = set()
    require(len(lock['downloads']) == 8 and len(lock['hostInputs']) > 0, 'cross-lock-count')
    for row in lock['downloads']:
        require(re.fullmatch(r'[A-Za-z0-9+._-]+\.deb', row['name']) and row['name'] not in names and
                row['url'].startswith('https://deb.debian.org/debian/pool/main/') and
                row['url'].endswith('/' + row['name']) and type(row['bytes']) is int and 0 < row['bytes'] < 100_000_000 and
                re.fullmatch('[a-f0-9]{64}', row['sha256']), 'cross-lock-download')
        names.add(row['name'])
    for row in lock['hostInputs']:
        require(row['path'].startswith(('/usr/', '/lib/', '/lib64/')) and re.fullmatch('[a-f0-9]{64}', row['sha256']), 'cross-lock-host')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true'); parser.add_argument('--root', required=True); parser.add_argument('--cache')
    args = parser.parse_args()
    require(args.run and platform.system() == 'Linux' and platform.machine() == 'x86_64', 'explicit-linux-x64-required')
    repo = pathlib.Path(__file__).resolve().parents[2]
    lock_path = repo / 'native/experiments/buffer-retention/windows-cross-toolchain-lock.json'
    lock = json.loads(lock_path.read_text()); validate_lock(lock)
    for row in lock['hostInputs']:
        require(sha(row['path']) == row['sha256'], 'host-input-changed')
    root = pathlib.Path(args.root)
    require(root.is_absolute() and root.parent.resolve() == root.parent and not root.exists(), 'fresh-physical-root-required')
    require(not root.is_relative_to(repo) and re.fullmatch(r'/[A-Za-z0-9_./-]+', str(root)), 'private-root-outside-repository-required')
    root.mkdir(mode=0o700); (root / 'owner').write_text('ETE isolated Windows cross gate v1\n')
    downloads = root / 'downloads'; downloads.mkdir(); sysroot = root / 'sysroot'; sysroot.mkdir()
    logs = root / 'logs'; logs.mkdir(); temporary = root / 'tmp'; temporary.mkdir()
    env = {'PATH': str(sysroot / 'usr/bin') + ':/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TMPDIR': str(temporary)}
    deadline = time.monotonic() + 600
    def expired(_signum, _frame):
        raise TimeoutError('cross-gate-deadline')
    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, 600)

    def run(label, command):
        remaining = deadline - time.monotonic(); require(remaining > 0, 'cross-gate-deadline')
        with (logs / (label + '.log')).open('wb') as out:
            result = subprocess.run(command, cwd=root, env=env, stdout=out, stderr=subprocess.STDOUT, timeout=min(60, remaining))
        require(result.returncode == 0, 'cross-gate-stage:' + label)
        return (logs / (label + '.log')).read_text(errors='replace')

    for row in lock['downloads']:
        file = downloads / row['name']; cached = pathlib.Path(args.cache) / row['name'] if args.cache else None
        if cached is not None and cached.exists():
            require(cached.is_file() and not cached.is_symlink() and cached.stat().st_size == row['bytes'] and
                    sha(cached) == row['sha256'], 'cached-input-changed')
            shutil.copyfile(cached, file)
        else:
            require(time.monotonic() < deadline, 'cross-gate-deadline')
            with urllib.request.urlopen(row['url'], timeout=30) as response, file.open('xb') as out:
                require(response.url.startswith('https://deb.debian.org/'), 'cross-download-redirect')
                remaining = row['bytes']
                while remaining:
                    require(time.monotonic() < deadline, 'cross-gate-deadline')
                    block = response.read(min(65536, remaining)); require(block, 'cross-download-short')
                    out.write(block); remaining -= len(block)
                    require(time.monotonic() < deadline, 'cross-gate-deadline')
                require(not response.read(1), 'cross-download-long')
        require(file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], 'download-input-changed')
        run('extract-' + row['package'], ['/usr/bin/dpkg-deb', '-x', str(file), str(sysroot)])
    require(tree_identity(sysroot) == lock['extractedTree'], 'cross-toolchain-tree-changed')
    target = sysroot / 'usr/x86_64-w64-mingw32'
    cc = sysroot / 'usr/bin/x86_64-w64-mingw32-gcc-posix'
    cxx = sysroot / 'usr/bin/x86_64-w64-mingw32-g++-posix'
    prefix = str(sysroot / 'usr/bin/x86_64-w64-mingw32-')
    sysroot_arg = '--sysroot=' + str(target)
    run('compiler-version', [str(cc), '--version']); run('cxx-version', [str(cxx), '--version'])
    libraries = ['avrt', 'dwmapi', 'gdi32', 'imm32', 'ntdll', 'ole32', 'pathcch', 'shcore', 'user32', 'uuid', 'uxtheme', 'version', 'd3d11', 'dxgi']
    for library in libraries:
        name = 'lib' + library + '.a'
        resolved = run('import-' + library, [str(cc), sysroot_arg, '-print-file-name=' + name]).strip()
        file = pathlib.Path(resolved)
        require(file.is_file() and file.resolve().is_relative_to(sysroot), 'cross-import-library-missing')
    source = root / 'cross-probe.c'
    source.write_text('#define _WIN32_WINNT 0x0A00\n#define WINVER 0x0A00\n#include <windows.h>\n#include <d3d11.h>\n#include <dxgi1_6.h>\n#include <pathcch.h>\n__declspec(dllexport) HRESULT ete_cross_gate_probe(void) { ID3D11Device *device = 0; return D3D11CreateDevice(0, D3D_DRIVER_TYPE_NULL, 0, 0, 0, 0, D3D11_SDK_VERSION, &device, 0, 0); }\n')
    resource = root / 'cross-probe.rc'; resource.write_text('1 RCDATA { 0x4554, 0x4520 }\n')
    run('windres', [prefix + 'windres', str(resource), str(root / 'cross-probe.o')])
    output = root / 'cross-probe.dll'
    run('windows10-link', [str(cc), sysroot_arg, '-shared', str(source), str(root / 'cross-probe.o'),
                          '-Wl,--no-insert-timestamp', *['-l' + name for name in libraries], '-o', str(output)])
    pe = run('pe-import-export', [prefix + 'objdump', '-p', str(output)])
    require('file format pei-x86-64' in pe and 'ete_cross_gate_probe' in pe and re.search(r'DLL Name: D3D11\.dll', pe, re.I), 'cross-probe-pe-invalid')
    source_cpp = root / 'cross-probe.cpp'
    source_cpp.write_text('#include <mutex>\n#include <thread>\n#include <string>\nstd::mutex gate; extern "C" __declspec(dllexport) int ete_cxx_gate(void) { std::lock_guard<std::mutex> hold(gate); return int(std::string("test").size()); }\n')
    run('cxx20-link', [str(cxx), sysroot_arg, '-std=c++20', '-shared', str(source_cpp), '-Wl,--no-insert-timestamp', '-o', str(root / 'cross-cxx-probe.dll')])
    # A cross file for later dependency work; no host library search/fallback and no exe wrapper.
    cross = "[binaries]\nc = " + repr([str(cc), sysroot_arg]) + "\ncpp = " + repr([str(cxx), sysroot_arg]) + "\nar = '" + prefix + "ar'\nstrip = '" + prefix + "strip'\nwindres = '" + prefix + "windres'\npkg-config = '/usr/bin/pkg-config'\n[host_machine]\nsystem = 'windows'\ncpu_family = 'x86_64'\ncpu = 'x86_64'\nendian = 'little'\n[properties]\nneeds_exe_wrapper = true\nsys_root = '" + str(root / 'target-prefix') + "'\npkg_config_libdir = ['" + str(root / 'target-prefix/usr/lib/pkgconfig') + "', '" + str(root / 'target-prefix/lib/pkgconfig') + "']\n[built-in options]\npkg_config_path = []\n"
    (root / 'windows-cross.ini').write_text(cross)
    receipt = {'schema': 1, 'scope': lock['scope'], 'inputLockSha256': sha(lock_path), 'recipeSha256': sha(__file__),
               'extractedTree': lock['extractedTree'], 'windows10HeadersAndImportsLinked': True,
               'windresCompiled': True, 'cxx20Linked': True, 'peMachine': 'AMD64',
               'probeSha256': sha(output), 'bytes': output.stat().st_size,
               'nativeExecution': 'NOT_RUN', 'mpvConfigure': 'NOT_RUN', 'mpvBuild': 'NOT_RUN',
               'd3d11Device': 'NOT_RUN', 'productionEquivalent': False}
    (root / 'result.json').write_text(json.dumps(receipt, indent=2) + '\n'); print(json.dumps(receipt))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('retention-cross-gate-failed:' + str(error)[:120], file=sys.stderr); sys.exit(1)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
