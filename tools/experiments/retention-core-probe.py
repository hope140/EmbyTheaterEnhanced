#!/usr/bin/env python3
"""Explicit headless custom-core probe. No application/profile/auth integration."""
import argparse, ctypes as C, hashlib, http.server, json, os, pathlib, subprocess, sys, threading, time

class Node(C.Structure): pass
class NodeList(C.Structure): pass
class Value(C.Union):
    _fields_ = [('string', C.c_char_p), ('flag', C.c_int), ('integer', C.c_int64), ('number', C.c_double), ('list', C.POINTER(NodeList))]
Node._fields_ = [('u', Value), ('format', C.c_int)]
NodeList._fields_ = [('num', C.c_int), ('values', C.POINTER(Node)), ('keys', C.POINTER(C.c_char_p))]
def value(node, depth=0):
    if depth > 12: raise RuntimeError('node-depth')
    f=node.format
    if f==0:return None
    if f==1:return node.u.string.decode()
    if f==3:return bool(node.u.flag)
    if f==4:return node.u.integer
    if f==5:return node.u.number
    if f in (7,8):
        row=node.u.list.contents
        if not 0<=row.num<=128:raise RuntimeError('node-size')
        if f==7:return [value(row.values[i],depth+1) for i in range(row.num)]
        return {row.keys[i].decode():value(row.values[i],depth+1) for i in range(row.num)}
    raise RuntimeError('node-type')
class Event(C.Structure):
    _fields_=[('event_id',C.c_int),('error',C.c_int),('reply_userdata',C.c_uint64),('data',C.c_void_p)]
class Core:
    def __init__(self, library, audio_id='auto'):
        self.lib=C.CDLL(str(library)); self.lib.mpv_create.restype=C.c_void_p
        for name,args,result in [('mpv_set_option_string',[C.c_void_p,C.c_char_p,C.c_char_p],C.c_int),('mpv_initialize',[C.c_void_p],C.c_int),('mpv_command',[C.c_void_p,C.POINTER(C.c_char_p)],C.c_int),('mpv_get_property',[C.c_void_p,C.c_char_p,C.c_int,C.c_void_p],C.c_int),('mpv_free_node_contents',[C.POINTER(Node)],None),('mpv_terminate_destroy',[C.c_void_p],None)]:
            fn=getattr(self.lib,name);fn.argtypes=args;fn.restype=result
        self.lib.mpv_command_async.argtypes=[C.c_void_p,C.c_uint64,C.POINTER(C.c_char_p)];self.lib.mpv_command_async.restype=C.c_int
        self.lib.mpv_abort_async_command.argtypes=[C.c_void_p,C.c_uint64];self.lib.mpv_abort_async_command.restype=None
        self.lib.mpv_wait_event.argtypes=[C.c_void_p,C.c_double];self.lib.mpv_wait_event.restype=C.POINTER(Event)
        self.replies={};self.h=self.lib.mpv_create();assert self.h
        for k,v in {'config':'no','terminal':'no','aid':audio_id,'vo':'null','ao':'null','hwdec':'no','pause':'yes','keep-open':'yes','cache':'yes','cache-pause':'no','demuxer-max-bytes':64*1048576,'demuxer-max-back-bytes':4*1048576,'demuxer-donate-buffer':'no','demuxer-readahead-secs':10}.items():
            assert self.lib.mpv_set_option_string(self.h,k.encode(),str(v).encode())>=0,k
        assert self.lib.mpv_initialize(self.h)>=0
    def command(self,*args):
        encoded=[str(x).encode() for x in args]; return self.lib.mpv_command(self.h,(C.c_char_p*(len(encoded)+1))(*encoded,None))
    def async_command(self, token, *args):
        encoded=[str(x).encode() for x in args]
        assert self.lib.mpv_command_async(self.h,token,(C.c_char_p*(len(encoded)+1))(*encoded,None))>=0
    def reply(self, token):
        if token in self.replies:return self.replies.pop(token)
        end=time.monotonic()+5
        while time.monotonic()<end:
            event=self.lib.mpv_wait_event(self.h,.05).contents
            if event.event_id==5:
                if event.reply_userdata==token:return event.error
                assert len(self.replies)<16
                self.replies[event.reply_userdata]=event.error
        raise RuntimeError('async-reply-deadline')
    def get(self,name):
        n=Node();r=self.lib.mpv_get_property(self.h,name.encode(),6,C.byref(n))
        if r<0:raise RuntimeError('property-unavailable:'+name+':'+str(r))
        try:return value(n)
        finally:self.lib.mpv_free_node_contents(C.byref(n))
    def close(self):
        if self.h:self.lib.mpv_terminate_destroy(self.h);self.h=None

def run(command, timeout=20, payload=None):
    r=subprocess.run(command,input=payload,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if r.returncode:raise RuntimeError('fixture-tool-failed:'+str(r.returncode)+':'+r.stderr.decode(errors='replace')[-600:])
    return r.stdout

def main():
    p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--library',required=True);p.add_argument('--out',required=True);p.add_argument('--faults',action='store_true');p.add_argument('--read-clip');p.add_argument('--clip-sha256');p.add_argument('--source-minus-clip',type=float);a=p.parse_args()
    if not a.run:p.error('--run required')
    library=pathlib.Path(a.library).resolve(strict=True)
    repo=pathlib.Path(__file__).resolve().parents[2];lockfile=repo/'native/experiments/buffer-retention/linux-input-lock.json';lock=json.loads(lockfile.read_text());buildroot=library.parent.parent
    receipt=json.loads((buildroot/'build-receipt.json').read_text())
    assert receipt['schema']==1 and receipt['mpvCommit']==lock['mpv']['commit'] and receipt['patchSha256']==lock['mpv']['patchSha256'] and receipt['inputLockSha256']==hashlib.sha256(lockfile.read_bytes()).hexdigest(),'build-receipt-mismatch'
    assert receipt['buildRecipeSha256']==hashlib.sha256((repo/'tools/experiments/build-retention-core.py').read_bytes()).hexdigest(),'build-recipe-mismatch'
    assert receipt['productionEquivalent'] is False and library.stat().st_size==receipt['bytes'] and hashlib.sha256(library.read_bytes()).hexdigest()==receipt['librarySha256'],'library-identity-mismatch'
    out=pathlib.Path(a.out).absolute();out.mkdir(mode=0o700)
    (out/'owner').write_text('ETE custom-core synthetic mapping probe v1\n')
    for folder in ['profile','local','mpv','tmp','xdg-config','xdg-cache','xdg-data']:(out/folder).mkdir(mode=0o700)
    for key,folder in {'APPDATA':'profile','LOCALAPPDATA':'local','MPV_HOME':'mpv','TEMP':'tmp','TMP':'tmp','TMPDIR':'tmp','XDG_CONFIG_HOME':'xdg-config','XDG_CACHE_HOME':'xdg-cache','XDG_DATA_HOME':'xdg-data'}.items():os.environ[key]=str(out/folder)
    if a.read_clip:
        clip=pathlib.Path(a.read_clip).resolve(strict=True)
        assert clip.parent==out.parent and (clip.parent/'owner').read_text()=='ETE custom-core synthetic mapping probe v1\n' and clip.is_file() and not clip.is_symlink() and clip.stat().st_nlink==1,'owned-clip-required'
        assert hashlib.sha256(clip.read_bytes()).hexdigest()==a.clip_sha256 and a.source_minus_clip is not None,'clip-identity-mismatch'
        reader=Core(library)
        try:
            assert reader.command('loadfile',str(clip))>=0;wait=time.monotonic()+5
            while time.monotonic()<wait:
                try:
                    if reader.get('video-params').get('w')==160 and reader.get('audio-params').get('samplerate')==48000:break
                except RuntimeError:pass
                time.sleep(.005)
            else:raise RuntimeError('new-core-clip-not-decoded')
            target_source=3.25;target_clip=target_source-a.source_minus_clip
            assert reader.command('seek',str(target_clip),'absolute+exact')>=0;wait=time.monotonic()+5
            while time.monotonic()<wait:
                try:
                    landed=reader.get('time-pos')
                    if reader.get('seeking') is False and reader.get('video-frame-info') and abs(landed-target_clip)<=1/24+.001:break
                except (RuntimeError,TypeError):pass
                time.sleep(.005)
            else:raise RuntimeError('new-core-mapped-seek')
            assert hashlib.sha256(clip.read_bytes()).hexdigest()==a.clip_sha256
        finally:reader.close()
        print(json.dumps({'scope':'separate-process-headless-CAPI-NOT-production-helper','pid':os.getpid(),'targetSourceSeconds':target_source,'landedClipSeconds':landed,'mappedSourceSeconds':landed+a.source_minus_clip,'withinOneFixtureFrame':True,'contextTerminated':True}));return
    fd_baseline=len(os.listdir('/proc/self/fd'))
    fault = None
    fault_identity=None
    if a.faults:
        compiler=lock['hostCompiler'];assert hashlib.sha256(pathlib.Path(compiler['path']).read_bytes()).hexdigest()==compiler['sha256'],'compiler-changed'
        shim_source=repo/'native/experiments/buffer-retention/io-fault-shim.c';shim=out/'io-fault-shim.so'
        run([compiler['path'],'-shared','-fPIC','-std=c11','-I'+str(buildroot/'sysroot/usr/include/x86_64-linux-gnu'),str(shim_source),'-Wl,--no-as-needed','-L'+str(buildroot/'sysroot/usr/lib/x86_64-linux-gnu'),'-lavformat','-lavutil','-ldl','-o',str(shim)])
        fault_identity={'sourceSha256':hashlib.sha256(shim_source.read_bytes()).hexdigest(),'librarySha256':hashlib.sha256(shim.read_bytes()).hexdigest(),'scope':'process-local-test-faults-NOT-product'}
        fault=C.CDLL(str(shim),mode=C.RTLD_GLOBAL)
        fault.ete_set_fault.argtypes=[C.c_int];fault.ete_set_fault.restype=None
        fault.ete_fault_entered.restype=C.c_int;fault.ete_release_fault.restype=None
    deadline=time.monotonic()+100
    # Source codec/container identities are fixture-specific, never product defaults.
    fixtures=[('raw','nut','nut',['-c:v','rawvideo','-pix_fmt','bgr24'],'pcm_s16le'),('bframe','mp4','mp4',['-c:v','libx264','-pix_fmt','yuv420p','-preset','fast','-bf','2','-g','24'],'aac')]
    results=[]; requests=[]; content={};core=None;clip_core=None
    class Origin(http.server.BaseHTTPRequestHandler):
        def log_message(self,*_):pass
        def do_GET(self):
            body=content.get(self.path)
            if body is None:self.send_error(404);return
            raw=self.headers.get('Range',''); start=0;end=len(body)-1
            if raw:
                import re
                m=re.fullmatch(r'bytes=(\d+)-(\d*)',raw)
                if not m:self.send_error(416);return
                start=int(m[1]);end=min(int(m[2]) if m[2] else end,end)
            if start>end:self.send_error(416);return
            row={'start':start,'end':end,'knownWriteBytes':0,'unknownWriteUpperBound':0,'finished':False};requests.append(row)
            try:
                self.send_response(206 if raw else 200);self.send_header('Content-Length',str(end-start+1));self.send_header('Content-Range',f'bytes {start}-{end}/{len(body)}');self.send_header('Accept-Ranges','bytes');self.send_header('ETag','"owned-fixture"');self.end_headers()
                for offset in range(start,end+1,65536):
                    chunk=body[offset:min(offset+65536,end+1)]
                    try:returned=self.wfile.write(chunk);assert returned==len(chunk);row['knownWriteBytes']+=returned
                    except (BrokenPipeError,ConnectionResetError):row['unknownWriteUpperBound']=len(chunk);break
            except (BrokenPipeError,ConnectionResetError):pass
            finally:row['finished']=True
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Origin);worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
    try:
        for kind,extension,clip_extension,video_args,audio_codec in fixtures:
            if time.monotonic()>deadline:raise RuntimeError('probe-deadline')
            source=out/(kind+'.'+extension); clip=out/(kind+'-clip.'+clip_extension)
            command=['ffmpeg','-v','error','-nostdin','-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=8','-f','lavfi','-i','aevalsrc=0.2*sin(2*PI*(431*t+20*t*t)):s=48000:d=8']
            if kind=='bframe':command+=['-f','lavfi','-i','aevalsrc=0.2*sin(2*PI*(709*t+13*t*t)):s=48000:d=8']
            command+=['-map','0:v','-map','1:a']
            if kind=='bframe':command+=['-map','2:a']
            run(command+video_args+['-threads','1','-c:a',audio_codec,str(source)])
            assert source.stat().st_size<34*1048576
            content['/'+kind]=source.read_bytes(); core=Core(library, '2' if kind=='bframe' else 'auto');url=f'http://127.0.0.1:{server.server_port}/{kind}'
            assert core.command('loadfile',url)>=0
            end=time.monotonic()+10
            while time.monotonic()<end:
                try:
                    cache=core.get('demuxer-cache-state')
                    if cache.get('eof-cached') and cache.get('seekable-ranges') and core.get('video-params').get('w')==160 and core.get('audio-params').get('samplerate')==48000:break
                except RuntimeError:pass
                time.sleep(.01)
            else:raise RuntimeError('buffer-not-ready')
            wait=time.monotonic()+1
            while any(not row['finished'] for row in requests) and time.monotonic()<wait:time.sleep(.001)
            assert all(row['finished'] for row in requests),'source-writes-not-quiescent'
            before=len(requests);known_before=sum(row['knownWriteBytes'] for row in requests);unknown_before=sum(row['unknownWriteUpperBound'] for row in requests);export_id=1
            result=core.command('dump-cache-report','2.3','4.8',str(clip),str(export_id));report=core.get('cache-export-report')
            assert result>=0,(kind,result,report)
            assert len(requests)==before,'export-added-origin-request'
            assert report['export-id']==export_id and report['io-ok'],report
            packets=json.loads(run(['ffprobe','-v','error','-show_packets','-show_streams','-show_data_hash','sha256','-of','json',str(clip)]))
            run(['ffmpeg','-v','error','-nostdin','-i',str(clip),'-f','null','-'])
            (out/(kind+'-export-observed.json')).write_text(json.dumps({'report':report,'clip':packets},indent=2)+'\n')
            verification=json.loads(run(['node','-e',"const fs=require('node:fs'),m=require(process.argv[1]),v=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(m.verify(v.report,v.clip,v.id)));",str(pathlib.Path(__file__).resolve().parents[1]/'playback-retention-map.cjs')],payload=json.dumps({'report':report,'clip':packets,'id':export_id}).encode()))
            clip_sha=hashlib.sha256(clip.read_bytes()).hexdigest()
            source_target=3.25;clip_target=source_target-verification['sourceMinusClipSeconds']
            source_frame=run(['ffmpeg','-v','error','-xerror','-nostdin','-ss',str(source_target),'-i',str(source),'-map','0:v:0','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'])
            clip_frame=run(['ffmpeg','-v','error','-xerror','-nostdin','-ss',str(clip_target),'-i',str(clip),'-map','0:v:0','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'])
            assert len(source_frame)==160*90*3 and source_frame==clip_frame,'decoded-frame-oracle-mismatch'
            source_pcm=run(['ffmpeg','-v','error','-xerror','-nostdin','-ss',str(source_target),'-i',str(source),'-map','0:a:1' if kind=='bframe' else '0:a:0','-t','0.25','-ac','1','-ar','48000','-f','s16le','-'])
            clip_pcm=run(['ffmpeg','-v','error','-xerror','-nostdin','-ss',str(clip_target),'-i',str(clip),'-map','0:a:0','-t','0.25','-ac','1','-ar','48000','-f','s16le','-'])
            assert len(source_pcm)==24000 and source_pcm==clip_pcm,'decoded-pcm-oracle-mismatch'
            decode_oracle={'scope':'owned-fixture-check-NOT-a-product-source-lookup','sourceSeconds':source_target,'clipSeconds':clip_target,'rgb24FrameBytes':len(source_frame),'exactFrame':True,'pcmSamples':len(source_pcm)//2,'exactPcm':True}

            negative_format='avi' if kind=='raw' else 'nut'
            negative_file=out/(kind+'-rejected-container.'+negative_format)
            assert core.command('dump-cache-report','2.3','4.8',str(negative_file),'2')>=0
            negative_report=core.get('cache-export-report')
            negative_packets=json.loads(run(['ffprobe','-v','error','-show_packets','-show_streams','-show_data_hash','sha256','-of','json',str(negative_file)]))
            negative_check=json.loads(run(['node','-e',"const fs=require('node:fs'),m=require(process.argv[1]),v=JSON.parse(fs.readFileSync(0,'utf8'));try{m.verify(v.report,v.clip,2);console.log(JSON.stringify({rejected:false}));}catch(e){console.log(JSON.stringify({rejected:e.message==='retention-export-map-unavailable'}));}",str(repo/'tools/playback-retention-map.cjs')],payload=json.dumps({'report':negative_report,'clip':negative_packets}).encode()))
            assert negative_check['rejected'],'unsupported-container-map-was-accepted'
            rejected_container={'format':negative_format,'report':negative_report,'clip':negative_packets,'rejected':True}
            faults=[]
            if fault:
                for mode,field in [(1,'packet-error'),(2,'trailer-error'),(3,'close-error')]:
                    fault.ete_set_fault(mode)
                    rc=core.command('dump-cache-report','2.3','4.8',str(out/(kind+'-fault-'+str(mode)+'.'+clip_extension)),str(mode+2))
                    bad=core.get('cache-export-report')
                    assert rc<0 and bad['export-id']==mode+2 and bad['complete'] and bad[field]<0 and not bad['io-ok'] and not bad['internal-affine-map-known'],bad
                    faults.append({'mode':mode,'observedError':bad[field],'unavailable':True})
                fault.ete_set_fault(0)
            # A rejected new attempt must never expose the previous successful ID.
            failed=core.command('dump-cache-report','2.3','4.8',str(out/'missing'/'failure.mkv'),'6')
            failure=core.get('cache-export-report');assert failed<0 and failure['export-id']==6 and not failure['io-ok'],failure
            duplicate=core.command('dump-cache-report','2.3','4.8',str(out/'unused.mkv'),'6');retired=core.get('cache-export-report');assert duplicate<0 and retired['export-id']==0
            lifecycle={}
            if fault:
                # Hold an actual packet submission, abort its async command, then
                # observe reply and physical closure. This is not a timing guess.
                fault.ete_set_fault(5);core.async_command(1001,'dump-cache-report','2.3','4.8',str(out/(kind+'-cancel.'+clip_extension)),'7')
                wait=time.monotonic()+2
                while not fault.ete_fault_entered() and time.monotonic()<wait:time.sleep(.001)
                assert fault.ete_fault_entered(),'fault-barrier-not-entered'
                core.lib.mpv_abort_async_command(core.h,1001);fault.ete_release_fault()
                cancelled=core.reply(1001);fault.ete_set_fault(0)
                cancel_report=core.get('cache-export-report');assert cancelled<0 and cancel_report['export-id']==0,(cancelled,cancel_report)
                lifecycle['cancelledReply']=cancelled;lifecycle['cancelledReportCleared']=True
                fault.ete_set_fault(5);core.async_command(2001,'dump-cache-report','2.3','4.8',str(out/(kind+'-superseded.'+clip_extension)),'8')
                wait=time.monotonic()+2
                while not fault.ete_fault_entered() and time.monotonic()<wait:time.sleep(.001)
                assert fault.ete_fault_entered(),'fault-barrier-not-entered'
                core.async_command(2002,'loadfile',str(clip));fault.ete_release_fault()
                assert core.reply(2001)>=0;assert core.reply(2002)>=0;fault.ete_set_fault(0)
                wait=time.monotonic()+5
                while time.monotonic()<wait:
                    try:
                        if core.get('path')==str(clip) and core.get('video-params').get('w')==160:break
                    except RuntimeError:pass
                    time.sleep(.005)
                else:raise RuntimeError('superseding-file-not-loaded')
                assert core.get('cache-export-report')['export-id']==0
                lifecycle['replacementLoaded']=True;lifecycle['oldReportUnavailable']=True
            assert len(requests)==before and sum(row['knownWriteBytes'] for row in requests)==known_before and all(row['finished'] for row in requests)
            assert core.command('stop')>=0;wait=time.monotonic()+2
            while time.monotonic()<wait:
                try:core.get('cache-export-report')
                except RuntimeError:break
                time.sleep(.005)
            else:raise RuntimeError('stop-did-not-retire-report')
            assert hashlib.sha256(clip.read_bytes()).hexdigest()==clip_sha
            core.close();core=None;content.clear()
            assert hashlib.sha256(clip.read_bytes()).hexdigest()==clip_sha
            native_seek=json.loads(run([sys.executable,str(pathlib.Path(__file__).resolve()),'--run','--library',str(library),'--out',str(out/(kind+'-reader')),'--read-clip',str(clip),'--clip-sha256',clip_sha,'--source-minus-clip',str(verification['sourceMinusClipSeconds'])]))
            native_seek.update({'workerExitCode':0,'streamsClosed':True})
            row={'kind':kind,'export':report,'packets':packets,'decodeOracle':decode_oracle,'mapping':verification,'lifecycle':lifecycle,'rejectedContainer':rejected_container,'newSourceRequests':len(requests)-before,'newSourceKnownWriteBytes':sum(row['knownWriteBytes'] for row in requests)-known_before,'historicalUnknownWriteUpperBound':unknown_before,'sourceWritesQuiescent':all(row['finished'] for row in requests),'clipBytes':clip.stat().st_size,'clipSha256':hashlib.sha256(clip.read_bytes()).hexdigest(),'failure':failure,'faults':faults,'duplicateRejected':True,'decoded':True}
            row['nativeSeek']=native_seek;row['unchangedAfterStopAndContextExit']=True;results.append(row)
            (out/'checkpoint.json').write_text(json.dumps({'results':results},indent=2)+'\n')
    finally:
        if fault:fault.ete_release_fault()
        if clip_core:clip_core.close()
        if core:core.close()
        server.shutdown();server.server_close();worker.join(timeout=2)
    fd_after=len(os.listdir('/proc/self/fd'));assert fd_after==fd_baseline,('owned-resource-count',fd_baseline,fd_after)
    receipt_data={'scope':'custom-linux-headless-core-NOT-app-Windows','buildReceipt':receipt,'faultShim':fault_identity,'ownedFdBaseline':fd_baseline,'ownedFdAfter':fd_after,'results':results}
    (out/'result.json').write_text(json.dumps(receipt_data,indent=2)+'\n')
    print(json.dumps({'status':'observed','fdBaseline':fd_baseline,'fdAfter':fd_after,'fixtures':[{'kind':r['kind'],'internalMap':r['export']['internal-affine-map-known'],'serializedMap':r['mapping']['serializedClipMapVerified'],'streams':len(r['export']['streams']),'clipBytes':r['clipBytes'],'newSourceRequests':r['newSourceRequests'],'newSourceKnownWriteBytes':r['newSourceKnownWriteBytes'],'decoded':r['decoded'],'newProcessSeek':r['nativeSeek']['contextTerminated'],'lifecycle':r['lifecycle']} for r in results]}))
if __name__=='__main__':main()
