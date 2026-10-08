'use strict';

// Isolated component/layout evidence using the released Emby controls and CSS.
// This does not start the product, use a real profile, or prove full-route acceptance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {app, BrowserWindow, session} = require('electron');
const [runtimeArg, baselineArg, outputArg] = process.argv.slice(2);
const sourceRoot = path.resolve(__dirname, '..');
const runtime = path.resolve(runtimeArg || '');
const baseline = path.resolve(baselineArg || '');
const output = path.resolve(outputArg || '');
const work = path.join(sourceRoot, '.work') + path.sep;
if (!runtimeArg || !baselineArg || !outputArg || !output.startsWith(work) || fs.existsSync(output)) {
    throw new Error('Require runtime, baseline repository, and fresh output under this worktree .work');
}
const www = path.join(runtime, 'electronapp/www');
const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'build-manifest.json'), 'utf8'));
if (manifest.sourceCommit !== 'f7505cda40c7f64e31714fbbe40eaa532926c46c') throw new Error('Unexpected reference runtime');
fs.mkdirSync(output, {recursive:true});
app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration(); // Test-only offscreen rasterization; never a product GPU setting.
const report = {kind:'offscreen-native-component-layout',productAcceptance:false,referenceSource:manifest.sourceCommit,
    samples:[],errors:[],hashes:{},limitations:['isolated shell gutters','no full application navigation','no real profile or server']};
function read(file) {
    const bytes = fs.readFileSync(file);
    report.hashes[path.relative(sourceRoot, file).replaceAll('\\', '/')] = crypto.createHash('sha256').update(bytes).digest('hex');
    return bytes.toString('utf8');
}
function asset(relative) { return path.join(www, relative); }
const styleFiles = ['modules/fonts/fonts.css','modules/fonts/material-icons/style.css','modules/flexstyles.css','modules/layout.css','modules/themes/dark/theme.css',
    ...['button','input','select','checkbox'].map(name => 'modules/emby-elements/emby-' + name + '/emby-' + name + '.css')];
const components = ['button','input','select','checkbox'].map(name => read(asset('modules/emby-elements/emby-' + name + '/emby-' + name + '.js')));
const babel = read(asset('modules/babelhelpers.js'));
const wrapper = path.join(output, 'fixture.html');
const cssLinks = styleFiles.map(file => '<link rel="stylesheet" href="' + pathToFileURL(asset(file)).href + '">').join('\n');
fs.writeFileSync(wrapper, '<!doctype html><html><head><meta charset="utf-8">' + cssLinks +
    '<style>html,body{margin:0;font:16px Roboto,"Segoe UI",sans-serif;background:#181818;color:white;}#shell{margin-left:224px;}.padded-left{padding-left:32px}.padded-right{padding-right:32px}.view{position:relative;}button,input,select{font-family:inherit;}@media(max-width:900px){#shell{margin-left:0}.padded-left{padding-left:20px}.padded-right{padding-right:20px}}</style>' +
    '</head><body class="skinBody-withFullDrawer"><main id="shell"></main></body></html>');
let win;
let timeout;
async function rendererBoot() {
    const boot = `(() => {
        window.__previewModules = [];
        const dom = {allowBackdropFilter:()=>false,addEventListener:(n,...a)=>n.addEventListener(...a),
            removeEventListener:(n,...a)=>n.removeEventListener(...a)};
        const fallback = new Proxy({}, {get:()=>()=>{}});
        window.require = () => Promise.resolve([]);
        window.define = (deps, factory) => {
            const exports = {};
            const args = deps.map(name => name === 'exports' ? exports :
                name.includes('dom.js') ? {default:dom} :
                name.includes('layoutmanager') ? {default:{tv:false}} :
                name.includes('globalize') ? {default:{translate:value=>value}} :
                name.includes('servicelocator') ? {appHost:{supports:()=>false}} : {default:fallback});
            factory(...args);
            window.__previewModules.push(exports);
        };
    })();`;
    await win.webContents.executeJavaScript(boot + '\n' + babel + '\n' + components.join('\n') + '\nvoid 0;');
}
async function render(root, page, width, label) {
    win.setSize(width, 1000);
    const plugin = path.join(root, 'src/electronapp/plugins/mpvplayer');
    const html = read(path.join(plugin, page + '.html'));
    const styles = page === 'audio' ? '' : read(path.join(plugin, 'enhanced-settings.css')) + '\n' + read(path.join(plugin, page + '.css'));
    const controller = page === 'strm' ? read(path.join(plugin, 'strm.js')).replace('return SettingsView;',
        'SettingsView.__renderConfig = renderConfig; SettingsView.__createAssistantSample = createAssistantSample; return SettingsView;') : null;
    const payload = JSON.stringify({html,styles,controller,page});
    const result = await win.webContents.executeJavaScript(`(async () => {
        const data = ${payload};
        const shell = document.querySelector('#shell');
        shell.replaceChildren();
        let style = document.querySelector('#preview-style');
        if (!style) { style = document.createElement('style'); style.id='preview-style'; document.head.append(style); }
        style.textContent = data.styles;
        const template = document.createElement('template'); template.innerHTML = data.html;
        shell.append(template.content);
        const view = shell.querySelector('.view');
        if (data.controller) {
            window.define = (_deps, factory) => {
                function BaseView() {}
                window.__Settings = factory({show(){},hide(){}}, BaseView, null,null,null,null,null,{});
            };
            (0,eval)(data.controller);
            window.__Settings.__renderConfig(view,{version:1,enabled:true,cd2:{enabled:true,origin:'http://127.0.0.1:19798',
                tokenConfigured:false,directUrlEnabled:true},rules:[{id:'preview-rule',sourcePrefix:'X:\\\\Media',
                cloudPrefix:'/Media',mountPrefix:'',storageType:'cloud-mount',strategy:'cloud-first',
                originState:'USER',enabled:true,order:['direct-url','cd2-http','mount','native']}]},{},'unknown');
            shell.querySelector('.smartSamples').append(window.__Settings.__createAssistantSample(2));
        }
        await document.fonts.ready;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const rect = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
        const buttons = Array.from(shell.querySelectorAll('.ete-strm-rule-actions button,.btnRemoveSample')).map(node=>{
            const s=getComputedStyle(node);return {text:node.textContent,classes:Array.from(node.classList),
                custom:node instanceof customElements.get('emby-button'),border:s.borderTopWidth,padding:s.padding,
                rect:rect(node),disabled:node.disabled};
        });
        const root = shell.querySelector('.settingsContainer');
        const content = shell.querySelector('h1,form');
        const actions = shell.querySelector('.ete-strm-rule-actions');
        return {root:rect(root),content:rect(content),paddingLeft:getComputedStyle(root).paddingLeft,
            contentX:content.getBoundingClientRect().x,overflow:document.documentElement.scrollWidth>innerWidth,
            buttons,actions:actions?{rect:rect(actions),align:getComputedStyle(actions).justifyContent}:null};
    })()`);
    const viewport = await win.webContents.capturePage();
    fs.writeFileSync(path.join(output, label + '-' + page + '-' + width + '.png'), viewport.toPNG());
    if (page === 'strm') {
        const clip = await win.webContents.executeJavaScript(`(() => {
            const n=document.querySelector('.ete-strm-rule-card');n.scrollIntoView({block:'start'});
            const r=n.getBoundingClientRect();return {x:Math.floor(r.x),y:Math.max(0,Math.floor(r.y)),
                width:Math.min(innerWidth-Math.floor(r.x),Math.ceil(r.width)),height:Math.min(innerHeight-Math.max(0,Math.floor(r.y)),Math.ceil(r.height))};
        })()`);
        await new Promise(resolve=>setTimeout(resolve,80));
        fs.writeFileSync(path.join(output,label+'-rule-'+width+'.png'),(await win.webContents.capturePage(clip)).toPNG());
        const actionsClip = await win.webContents.executeJavaScript(`(() => {
            const order=document.querySelector('.ete-strm-order').getBoundingClientRect();
            const card=document.querySelector('.ete-strm-rule-card').getBoundingClientRect();
            return {x:Math.floor(card.x),y:Math.max(0,Math.floor(order.y)),
                width:Math.min(innerWidth-Math.floor(card.x),Math.ceil(card.width)),
                height:Math.min(innerHeight-Math.max(0,Math.floor(order.y)),Math.ceil(card.bottom-order.y))};
        })()`);
        fs.writeFileSync(path.join(output,label+'-actions-'+width+'.png'),(await win.webContents.capturePage(actionsClip)).toPNG());
        await win.webContents.executeJavaScript('window.scrollTo(0,0)');
    }
    report.samples.push({label,page,width,...result});
}
app.whenReady().then(async () => {
    timeout = setTimeout(()=>{report.errors.push('deadline');app.exit(1);},45000);
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},
        (_details, done)=>done({cancel:true}));
    win = new BrowserWindow({width:1920,height:1000,show:false,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true}});
    win.webContents.on('console-message', details => { if(details.level==='error')report.errors.push(String(details.message).slice(0,300)); });
    await win.loadFile(wrapper);
    await rendererBoot();
    await render(baseline,'audio',1920,'native');
    await render(baseline,'strm',1920,'before');
    for (const width of [1920,1280,680]) for (const page of ['strm','diagnostics','about']) await render(sourceRoot,page,width,'after');
    const reference = report.samples.find(s=>s.label==='native');
    const before = report.samples.find(s=>s.label==='before');
    const after = report.samples.find(s=>s.label==='after'&&s.page==='strm'&&s.width===1920);
    report.checks = {
        reproducesCenteredPage:before.contentX>reference.contentX+10,
        reproducesLostButtonClass:before.buttons.some(b=>!b.classes.includes('emby-button')),
        desktopAlignment:report.samples.filter(s=>s.label==='after'&&s.width===1920).every(s=>Math.abs(s.contentX-reference.contentX)<1),
        nativeButtonClasses:report.samples.filter(s=>s.label==='after'&&s.page==='strm').every(s=>s.buttons.every(b=>b.custom&&b.classes.includes('emby-button'))),
        actionsAlignedStart:after.actions.align==='flex-start',
        noHorizontalOverflow:report.samples.filter(s=>s.label==='after').every(s=>!s.overflow)
    };
    report.ok=Object.values(report.checks).every(Boolean)&&report.errors.length===0;
}).catch(error=>{report.ok=false;report.errors.push(String(error.message).replace(/[A-Z]:[\\/][^\n]*/gi,'[PATH]').slice(0,400));}).finally(()=>{
    clearTimeout(timeout);
    if(win&&!win.isDestroyed())win.destroy();
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    app.exit(report.ok?0:1);
});
