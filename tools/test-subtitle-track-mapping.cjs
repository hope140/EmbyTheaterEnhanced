'use strict';
// Opt-in isolated mpv integration. No product profile, service or foreground UI.
// node tools/test-subtitle-track-mapping.cjs --mpv <existing-mpv> --ffmpeg <existing-ffmpeg>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const vm = require('node:vm');
const {spawn, spawnSync} = require('node:child_process');
const {setTimeout: delay} = require('node:timers/promises');
const args = process.argv.slice(2), arg = key => args[args.indexOf(key) + 1];
if (!args.includes('--mpv') || !args.includes('--ffmpeg')) throw Error('Explicit existing --mpv and --ffmpeg paths required');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-subtitle-map-'));
const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\ete-subtitle-${process.pid}` : path.join(temp,'ipc.sock');
const reportedLayout=args.includes('--reported-layout');
const names=reportedLayout?['bilingual-simplified','bilingual-traditional','simplified','traditional','simplified-2','traditional-2','english']:['simplified','traditional'];
for (const name of [...names,'external']) fs.writeFileSync(path.join(temp,name+'.srt'), `1\n00:00:00,000 --> 00:00:20,000\n${name.toUpperCase()}\n`);
const media=path.join(temp,'synthetic.mkv');
const ffargs=['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=16x16:d=20'];
if(reportedLayout)ffargs.push('-f','lavfi','-i','anullsrc=r=8000:cl=mono:d=20');
for(const name of names)ffargs.push('-i',path.join(temp,name+'.srt'));
ffargs.push('-map','0:v');
if(reportedLayout)for(let i=0;i<4;i++)ffargs.push('-map','1:a');
names.forEach((name,i)=>ffargs.push('-map',`${i+(reportedLayout?2:1)}:s`));
ffargs.push('-c:v','ffv1','-c:a','pcm_s16le','-c:s','srt');
names.forEach((name,i)=>ffargs.push(`-metadata:s:s:${i}`,`title=${name.toUpperCase()}`));
ffargs.push('-y',media);
const ff=spawnSync(arg('--ffmpeg'),ffargs,{windowsHide:true,encoding:'utf8',timeout:20000});
assert.equal(ff.status,0,ff.stderr);
const child=spawn(arg('--mpv'),['--no-config','--load-scripts=no','--vo=null','--ao=null','--idle=yes','--pause=yes','--sub-auto=no',`--input-ipc-server=${pipe}`],{windowsHide:true,stdio:'ignore'});
let socket,sequence=0,buffer='';const pending=new Map(),evidence=[];
function command(command){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('IPC timeout'));},3000);pending.set(id,{resolve,reject,timer});socket.write(JSON.stringify({command,request_id:id})+'\n');});}
(async()=>{
 try {
  for(let i=0;i<60;i++) {try {socket=await new Promise((resolve,reject)=>{const s=net.connect(pipe,()=>resolve(s));s.once('error',reject);});break;}catch{await delay(50);}}
  assert.ok(socket,'mpv IPC ready');
  socket.on('data',data=>{buffer+=data;let nl;while((nl=buffer.indexOf('\n'))>=0){const row=JSON.parse(buffer.slice(0,nl));buffer=buffer.slice(nl+1);const p=pending.get(row.request_id);if(p){pending.delete(row.request_id);clearTimeout(p.timer);if(row.error==='success')p.resolve(row.data);else p.reject(Error(row.error));}}});
  const version=await command(['get_property','mpv-version']);
  const source=fs.readFileSync(path.join(__dirname,'../src/electronapp/plugins/libmpv.js'),'utf8');
  const code=source.slice(source.indexOf('        function enableInternalSubtitleStream('),source.indexOf('        function setAudioStream('));
  for(const order of ['first','middle','last']) {
   await command(['loadfile',media]);
   let initial;
   for(let i=0;i<40;i++){initial=await command(['get_property','track-list']);if(initial.filter(t=>t.type==='sub').length===names.length)break;await delay(25);}
   const internal=initial.filter(t=>t.type==='sub');assert.equal(internal.length,names.length);
   const embedded=internal.map(t=>({Type:'Subtitle',Index:t['ff-index'],DeliveryMethod:'Embed'}));
   const simple=embedded[reportedLayout?2:0],traditional=embedded[reportedLayout?3:1];
   if(reportedLayout)assert.deepEqual(embedded.map(t=>t.Index),[5,6,7,8,9,10,11]);
   const external={Type:'Subtitle',Index:reportedLayout?12:77,DeliveryMethod:'External',DeliveryUrl:path.join(temp,'external.srt'),DisplayTitle:'EXTERNAL'};
   const rows=order==='first'?[external,...embedded]:order==='middle'?[embedded[0],external,...embedded.slice(1)]:[...embedded,external];
   const request={routeAttempt:1,nativeGenerationId:1,subtitlePlayMethod:'DirectPlay'};
   const ops=[];
   const ctx={Promise,setTimeout,clearTimeout,activePlayRequest:request,subtitleSelectionSequence:0,mediaSource:{MediaStreams:rows},
    isCurrentPlayRequest:r=>r===request,requestDiagnosticDetails:()=>({}),emitClientDiagnostic:()=>{},
    setProperty:async values=>{for(const [key,value]of Object.entries(values)){ops.push([key,value]);await command(['set_property',key,value]);}},
    getProperty:name=>command(['get_property',name]),sendCommand:cmd=>command(cmd)};
   vm.createContext(ctx);vm.runInContext(code,ctx);
   for(let repeat=0;repeat<2;repeat++){
    const before=ops.length;await ctx.setSubtitleStream(external.Index);await delay(850);
    assert.equal(ops.slice(before).some(op=>op[0]==='sid'),false,'no guessed sid before external add');
    let tracks=await command(['get_property','track-list']);assert.equal(tracks.filter(t=>t.type==='sub'&&t.external).length,1,'cached external not duplicated');
    assert.equal(tracks.find(t=>t.type==='sub'&&t.selected).external,true);
    await ctx.setSubtitleStream(embedded[0].Index);
    tracks=await command(['get_property','track-list']);assert.equal(tracks.find(t=>t.type==='sub'&&t.selected)['ff-index'],embedded[0].Index);
    await ctx.setSubtitleStream(simple.Index);
    tracks=await command(['get_property','track-list']);assert.equal(tracks.find(t=>t.type==='sub'&&t.selected).title,'SIMPLIFIED');
    await ctx.setSubtitleStream(traditional.Index);
    tracks=await command(['get_property','track-list']);assert.equal(tracks.find(t=>t.type==='sub'&&t.selected).title,'TRADITIONAL');
   }
   await ctx.setSubtitleStream(external.Index);
   await delay(100);
   await ctx.setSubtitleStream(simple.Index);
   await delay(800);
   assert.equal((await command(['get_property','track-list'])).find(t=>t.type==='sub'&&t.selected).title,'SIMPLIFIED',
       'retired external timer cannot override embedded selection');
   const nativeRead=ctx.getProperty;
   let release;
   ctx.getProperty=name=>new Promise(resolve=>{release=async()=>resolve(await nativeRead(name));});
   const pendingSelection=ctx.setSubtitleStream(traditional.Index);
   for(let i=0;i<100&&!release;i++)await delay(10);
   assert.equal(typeof release,'function');
   await ctx.setSubtitleStream(-1);
   await release(); await pendingSelection;
   assert.equal(await command(['get_property','sid']),false,'late real track table cannot undo Off');
   ctx.getProperty=nativeRead;
   evidence.push({order,tracks:(await command(['get_property','track-list'])).filter(t=>t.type==='sub').map(t=>({id:t.id,ffIndex:t['ff-index'],external:t.external,title:t.title,selected:t.selected})),operations:ops});
  }
  fs.writeFileSync(path.join(temp,'evidence.json'),JSON.stringify({version,evidence},null,2));
  console.log(JSON.stringify({status:'passed',version,reportedLayout,orders:3,cachedCycles:6,evidence:path.join(temp,'evidence.json')}));
 } finally {
  if(socket){try{await command(['quit']);}catch{} socket.destroy();}
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('probe closed'));}
  if(child.exitCode===null)child.kill();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
