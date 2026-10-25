#!/usr/bin/env python3
"""Opt-in, source/hash-locked Linux headless experiment. Never installs system packages."""
import argparse, hashlib, json, os, pathlib, platform, shutil, stat, subprocess, sys, time, urllib.request, zipfile

def sha(file):
    h=hashlib.sha256()
    with open(file,'rb') as f:
        for block in iter(lambda:f.read(65536),b''):h.update(block)
    return h.hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true');parser.add_argument('--root',required=True);parser.add_argument('--cache');a=parser.parse_args()
    if not a.run:parser.error('--run required')
    repo=pathlib.Path(__file__).resolve().parents[2];inputs=repo/'native/experiments/buffer-retention';lock=json.loads((inputs/'linux-input-lock.json').read_text())
    assert lock['schema']==1 and platform.system()=='Linux' and platform.machine()=='x86_64','linux-host-required'
    for row in lock['hostLibraries']+[lock['hostCompiler']]+lock.get('hostTools',[]):assert sha(row['path'])==row['sha256'],'host-input-changed'
    patch=inputs/lock['mpv']['patch'];assert sha(patch)==lock['mpv']['patchSha256'],'patch-changed'
    root=pathlib.Path(a.root);assert root.is_absolute() and root.parent.resolve()==root.parent and not root.exists(),'fresh-physical-root-required';root.mkdir(mode=0o700)
    (root/'owner').write_text('ETE headless custom-core source build v1\n')
    logs=root/'logs';logs.mkdir();downloads=root/'downloads';downloads.mkdir();python=root/'python';python.mkdir();ninja=root/'bin';ninja.mkdir();sysroot=root/'sysroot';sysroot.mkdir()
    env=dict(os.environ);env.update({'PYTHONPATH':str(python),'PATH':str(ninja)+':/usr/bin:/bin','GIT_TERMINAL_PROMPT':'0'})
    deadline=time.monotonic()+900
    def run(label,args,cwd=root):
        assert time.monotonic()<deadline,'build-deadline'
        with open(logs/(label+'.log'),'wb') as f:r=subprocess.run(args,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=600)
        if r.returncode:raise RuntimeError('build-stage-failed:'+label)
        print('stage:'+label,flush=True)
    for row in lock['downloads']:
        assert row['url'].startswith(('https://files.pythonhosted.org/','https://deb.debian.org/')) and pathlib.Path(row['name']).name==row['name']
        file=downloads/row['name'];cached=pathlib.Path(a.cache)/row['name'] if a.cache else None
        if cached and cached.exists():
            assert cached.is_file() and sha(cached)==row['sha256'],'cached-input-changed';shutil.copyfile(cached,file)
        else:urllib.request.urlretrieve(row['url'],file)
        assert file.stat().st_size==row['bytes'] and sha(file)==row['sha256'],'download-input-changed'
        if row['kind']=='deb':run('extract-'+row['package'],['dpkg-deb','-x',str(file),str(sysroot)])
        else:
            with zipfile.ZipFile(file) as z:
                for entry in z.infolist():
                    parts=pathlib.PurePosixPath(entry.filename).parts
                    assert parts and not entry.filename.startswith('/') and '..' not in parts and not stat.S_ISLNK(entry.external_attr>>16),'wheel-entry-invalid'
                z.extractall(python)
                if row['name'].startswith('ninja-'):
                    entry=next(n for n in z.namelist() if n.endswith('.data/scripts/ninja'));target=ninja/'ninja';target.write_bytes(z.read(entry));target.chmod(0o700)
    for pc in sysroot.glob('usr/**/pkgconfig/*.pc'):
        text=pc.read_text().replace('=/usr/','='+str(sysroot/'usr')+'/').replace('prefix=/usr\n','prefix='+str(sysroot/'usr')+'\n');pc.write_text(text)
    for link in (sysroot/'usr/lib/x86_64-linux-gnu').glob('*.so'):
        if link.is_symlink() and not link.exists():
            target=pathlib.Path('/usr/lib/x86_64-linux-gnu')/link.readlink()
            if target.exists():link.unlink();link.symlink_to(target)
    # No accidental fallback to development-package static archives.
    for archive in sysroot.rglob('*.a'):archive.unlink()
    def checkout(name,row):
        directory=root/name;directory.mkdir();run(name+'-init',['git','init',str(directory)])
        run(name+'-origin',['git','remote','add','origin',row['url']],directory)
        run(name+'-fetch',['git','fetch','--depth=1','origin',row['commit']],directory)
        run(name+'-checkout',['git','checkout','--detach','FETCH_HEAD'],directory)
        actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=directory,text=True).strip();assert actual==row['commit'],'source-commit-changed';return directory
    mpv=checkout('mpv',lock['mpv']);placebo=checkout('libplacebo',lock['libplacebo'])
    for row in lock['libplacebo']['submodules']:
        target=placebo/row['path'];target.rmdir();child=checkout('module-'+target.name,row);child.rename(target)
    run('apply-patch',['git','apply','--check',str(patch)],mpv);run('apply-patch-write',['git','apply',str(patch)],mpv)
    meson=[sys.executable,'-m','mesonbuild.mesonmain'];prefix=root/'prefix'
    run('placebo-configure',meson+['setup',str(root/'build-placebo'),'--prefix='+str(prefix),'-Ddefault_library=static','-Dbuildtype=release','-Dauto_features=disabled','-Dopengl=disabled','-Dvulkan=disabled','-Dd3d11=disabled','-Dglslang=disabled','-Dshaderc=disabled','-Ddemos=false','-Dtests=false','-Ddovi=disabled'],placebo)
    run('placebo-build',meson+['compile','-C',str(root/'build-placebo'),'-j','4']);run('placebo-install',meson+['install','-C',str(root/'build-placebo')])
    env['PKG_CONFIG_PATH']=':'.join(str(p) for p in [prefix/'lib/x86_64-linux-gnu/pkgconfig',sysroot/'usr/lib/x86_64-linux-gnu/pkgconfig',sysroot/'usr/share/pkgconfig'])
    run('mpv-configure',meson+['setup',str(root/'build-mpv'),'--prefix='+str(root/'mpv-install'),'-Dauto_features=disabled','-Dgl=disabled','-Dlibmpv=true','-Dcplayer=false','-Dc_link_args=-Wl,--no-as-needed,-lstdc++,--as-needed,--exclude-libs,ALL','-Dbuildtype=debugoptimized','-Dbuild-date=false'],mpv)
    run('mpv-build',meson+['compile','-C',str(root/'build-mpv'),'-j','4'])
    library=root/'build-mpv/libmpv.so.2.5.0';assert library.is_file()
    # Record fresh output identity; this is never the fixed production DLL identity.
    receipt={'schema':1,'scope':lock['scope'],'mpvCommit':lock['mpv']['commit'],'patchSha256':sha(patch),'inputLockSha256':sha(inputs/'linux-input-lock.json'),'buildRecipeSha256':sha(pathlib.Path(__file__).resolve()),'librarySha256':sha(library),'bytes':library.stat().st_size,'elapsedSeconds':round(time.monotonic()-(deadline-900),3),'productionEquivalent':False}
    (root/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
if __name__=='__main__':
    try:main()
    except Exception as error:
        print('retention-core-build-failed:'+str(error)[:100],file=sys.stderr);sys.exit(1)
