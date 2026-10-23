from pathlib import Path
import tempfile,subprocess,shutil,json,hashlib,argparse,xml.etree.ElementTree as E
ap=argparse.ArgumentParser(description='Fixed-source preparation and negative identity tests; never compiles or executes Host.');ap.add_argument('--source',required=True,type=Path);ap.add_argument('--report',type=Path);args=ap.parse_args();base=args.source.resolve();tool=Path(__file__).resolve().parent;results=[]
if args.report and args.report.exists():raise SystemExit('Report must be absent')
def apply(source,destination,script=tool/'Apply-SourceChanges.ps1'):
 return subprocess.run(['pwsh','-NoLogo','-NoProfile','-File',str(script),'-SourceRoot',str(source),'-DestinationRoot',str(destination)],capture_output=True,text=True)
with tempfile.TemporaryDirectory(prefix='host-source-acceptance-') as d:
 d=Path(d);source=d/'source';shutil.copytree(base,source);output=d/'candidate';r=apply(source,output);assert r.returncode==0,(r.stdout,r.stderr)
 m=json.loads((tool/'change-manifest.json').read_text());changed=[]
 for f in source.rglob('*'):
  if f.is_file():
   rel=f.relative_to(source);b=(output/rel).read_bytes()
   if b!=f.read_bytes():changed.append(rel.as_posix())
 assert set(changed)=={c['path'] for c in m['changes']}
 for c in m['changes']+m['addedSources']:assert hashlib.sha256((output/c['path']).read_bytes()).hexdigest()==c['candidateSHA256']
 patchCopy=d/'patch-applied';shutil.copytree(source,patchCopy)
 for apply_args in [['--check'],[]]:
  r=subprocess.run(['git','apply',*apply_args,str(tool/'host-retirement.patch')],cwd=patchCopy,capture_output=True,text=True);assert r.returncode==0,r.stderr
 for rel in [f['path'] for f in json.loads((tool/'upstream-source-manifest.json').read_text())['files']]+[f['path'] for f in m['addedSources']]:assert (patchCopy/rel).read_bytes()==(output/rel).read_bytes()
 ns={'m':'http://schemas.microsoft.com/developer/msbuild/2003'};a=E.parse(output/'Emby.Theater/Emby.Theater.csproj').getroot();compile=[x.attrib['Include'].replace('\\','/') for x in a.findall('.//m:Compile',ns)]
 assert len(compile)==46 and not any(x.endswith(('ApplicationUpdater.cs','SystemUpdateTask.cs')) for x in compile)
 assert 'Updates/InstallationManager.cs' in compile
 content=[x.attrib['Include'] for x in a.findall('.//m:Content',ns)];assert not any('\\cec\\' in x.lower() or x.endswith(('MediaBrowser.InstallUtil.dll','MediaBrowser.Updater.exe')) for x in content)
 program=(output/'Emby.Theater/Program.cs').read_text();assert 'InstallCecDriver' not in program and 'PerformUpdateIfNeeded' not in program and 'InstallVcredist2013IfNeeded' in program and 'GetProgramDataPath' in program and 'RunApplication(appPaths' in program
 electron=(output/'Emby.Theater/App/ElectronApp.cs').read_text();assert 'cecPath' not in electron and 'electronAppPath, dataPath, mpvExePath' in electron and 'process.Exited += Process_Exited' in electron
 host=(output/'Emby.Theater/App/ApplicationHost.cs').read_text();assert 'new GithubUpdater' not in host and 'InstallationManager.InstallPackage(package' not in host and 'Task.FromException(new NotSupportedException(' in host and 'Task.FromResult(new CheckForUpdateResult { IsUpdateAvailable = false })' in host and 'AddTasks(GetExports<IScheduledTask>(false))' in host and 'RegisterSingleInstance(InstallationManager)' in host
 results.append({'case':'PowerShell preparation / git apply byte-equivalence','result':'pass','changedFiles':changed,'unchangedOriginalFiles':49,'compileInputs':46,'removedContent':9})
 # Repeated independent preparation must have identical candidate source bytes.
 r=apply(source,d/'repeat');assert r.returncode==0,r.stderr
 for p in output.rglob('*'):
  if p.is_file():assert p.read_bytes()==(d/'repeat'/p.relative_to(output)).read_bytes()
 results.append({'case':'repeated preparation identical including provenance','result':'pass'})
 for case in ['changed-original','changed-unmodified-original','missing-original','source-symlink','changed-payload','existing-output','patch-mismatch']:
  src=d/case;shutil.copytree(base,src);target=d/(case+'-out');localtool=tool
  p=src/'Emby.Theater/Program.cs'
  if case=='changed-original':p.write_bytes(p.read_bytes()+b'bad')
  if case=='changed-unmodified-original':(src/'Emby.Theater/App/DeviceId.cs').write_bytes(b'bad')
  if case=='missing-original':p.unlink()
  if case=='source-symlink':p.unlink();p.symlink_to(base/'Emby.Theater/Program.cs')
  if case in ['changed-payload','patch-mismatch']:
   localtool=d/(case+'-tool');shutil.copytree(tool,localtool)
   p=localtool/('changes/Emby.Theater/Program.cs' if case=='changed-payload' else 'host-retirement.patch');p.write_bytes(p.read_bytes()+b'bad')
  if case=='existing-output':target.mkdir();(target/'owned.txt').write_text('preserve')
  r=apply(src,target,localtool/'Apply-SourceChanges.ps1');assert r.returncode!=0,case
  if case=='existing-output':assert (target/'owned.txt').read_text()=='preserve'
  else:assert not target.exists(),case
  results.append({'case':case,'result':'rejected before output','exit':r.returncode})
print(json.dumps(results,indent=2))
if args.report:args.report.write_text(json.dumps({'cases':results,'candidateWindowsCompile':'pending','candidateHostExecution':'not performed'},indent=2)+'\n')
