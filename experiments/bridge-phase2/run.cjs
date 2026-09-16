'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const [mode, electron, binary, libmpv, media, outputArg] = process.argv.slice(2);
if (!['A','B'].includes(mode) || !outputArg) throw new Error('Usage: run.cjs A|B electron binary-dir libmpv generated-media new-output-dir');
const output=path.resolve(outputArg);
if(fs.existsSync(output))throw new Error('Choose a fresh output directory');
fs.mkdirSync(output,{recursive:true});
const env={...process.env,SPIKE_MODE:mode,SPIKE_BINARY:path.resolve(binary),SPIKE_LIBMPV:path.resolve(libmpv),SPIKE_MEDIA:path.resolve(media),SPIKE_OUTPUT:output};
delete env.ELECTRON_RUN_AS_NODE;
// The task explicitly requires a visible native video surface.
const child=spawn(path.resolve(electron),[path.join(__dirname,'main.cjs')],{env,windowsHide:false,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(fs.createWriteStream(path.join(output,'stdout.log')));
child.stderr.pipe(fs.createWriteStream(path.join(output,'stderr.log')));
let timedOut=false;
const timer=setTimeout(()=>{
  timedOut=true;
  // Only this still-owned child PID, never a process-name cleanup.
  if(child.exitCode===null)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});
},60000);
child.on('error',error=>{clearTimeout(timer);throw error;});
child.on('exit',(code,signal)=>{
  clearTimeout(timer);
  const result={mode,exitCode:code,signal,timedOut,naturalExit:!timedOut};
  fs.writeFileSync(path.join(output,'runner.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));process.exitCode=code===0&&!timedOut?0:1;
});
