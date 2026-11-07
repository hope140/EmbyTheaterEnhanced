# FN 独立产品验证准备

目标仍为后续 0.4.19；当前工作分支保留 `feature/fn-connect-v0417` 名称。普通合入 main `f17204be8f0bbe086daef97956dd136081a493a1`，其源码树与 v0.4.18 `391f4c2014f3ff783f7eacb0c9b9a20ace20e78b` 相同；继承已有 0.4.18 版本元数据，不自行 bump。音轨索引零、PlaybackInfo 30 秒／停止上报 10 秒和关于页修正，与 FN 路由／账号退休屏障同时保留。更新／下载修复沿原共同基线保留；不恢复预载或媒体暂存。

先固定最终准确提交并完成组合回归，再生成 Host 锁和 runtime；Host runner 锁绑定 HEAD 和本次实际验证，之后不能切换提交继续沿用。历史 Windows 回环 b557b8f 的联合回执通过只属于该源码与合成场景，不代表新整合包的 GUI、FN 或 Native 播放通过。

## 已有材料与缺项

仓库 Web、模板、Model、小组件、兼容资源约束及原始 libmpv 归档可按各自工具核验。完整产品另需：官方 Host 19 文件、inherited npm 29 文件、固定 Electron 73 文件、展开 libmpv、完整 UCRT64 编译树、mpv 头文件、固定 Windows 原生依赖、Host 的 Newtonsoft／net462 编译输入和本次验证产物／锁。不能从现用安装目录或旧产品包补件。

GCC EXE 哈希匹配不代替 6990 文件完整树门禁。固定前缀放入新 checkout 的 `.work/toolchain/msys2/ucrt64` 后，用 `node tools/build-toolchains.cjs native . .work/toolchain/msys2/ucrt64/bin/g++.exe` 检查；工具先核树与 EXE，再执行版本探针。匹配的原始包或完整树可复用，不能拼补未知成员。

Host 使用固定官方源码 `708fadc068cbf66ced6aece4a32f3e12bb2c4e13`。没有有效的已提交审定锁／对应产物时，现有 runner 路线需要既有 MSBuild17、Windows PowerShell5.1 和 PowerShell7，在隔离目录编译并实际验证，再生成 `.work/source-built-host/verified-runtime.json`。Framework 门禁未知／失败时停止，不安装或改系统／GAC，不借用其他提交或其他 runner 的回执。

## 现有准备命令

以下供受支持的 Windows x64 构建入口协调执行；本地检查清单不表示这些命令已经运行。使用新目录检出最终准确 SHA，所有后续步骤保持同一 HEAD；旧输出和旧 Work 证据不改。Node 固定 24.18.1，Git／Python3／PowerShell 和 MSBuild 均须已具备。

可先复用已核验的原始 Electron ZIP，不获取第二份：

```powershell
# $verifiedArchiveRoot 为已验原始 ZIP 所在的本地物理绝对目录。
$archiveDir = Join-Path (Get-Location) '.work/actions-inputs/archives'
New-Item -ItemType Directory -Path $archiveDir
. ./prototypes/fn-connect/client/runner-preparation.ps1
Copy-FnLockedArchive -ArchiveRoot $verifiedArchiveRoot -Destination (Join-Path $archiveDir 'electron-v44.5.0-win32-x64.zip') -ExpectedSize 157966405 -ExpectedSha256 'b3405d8847bc5054cd16272f538d22ba5b73032945e85cef26241f7135035278'
node tools/ci-build-input-plan.cjs verify-file . (Join-Path $archiveDir 'electron-v44.5.0-win32-x64.zip') electron
```

随后沿现有工具准备、验证并生成独立目录。每步成功才继续；失败保留原始结果，不绕门禁：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
pwsh -NoProfile -File tools/prepare-ci-build-inputs.ps1
pwsh -NoProfile -File tools/ci-source-built-host.ps1
node tools/source-built-host-input.cjs preflight .
node tools/validate-build-materials.cjs .
New-Item -ItemType Directory -Path test-output -Force
node tools/ci-full-tests.cjs serial test-output/fn-product-regression.tap
node --test --test-concurrency=1 tests/*-material-selftest.cjs
$sha = (git rev-parse HEAD).Trim()
$name = 'ETE-fn-product-' + $sha.Substring(0,12)
pwsh -NoProfile -File tools/build.ps1 -OutputName $name
pwsh -NoProfile -File tools/package.ps1 -RuntimeName $name -VerifyOnly
```

`prepare-ci-build-inputs.ps1` 校验并复用已预置的计划文件；缺项按固定 URL／大小／SHA 获取，包含 Host／Electron 原始 ZIP、17 份 MSYS2 包、mpv 头文件和准备器使用的 Inno／解包器材料，另取固定 Emby Electron Git 对象与两份 Koffi 3.3.3 registry 包。它准备便携工具，不安装系统软件。完整精确范围由 `node tools/ci-build-input-plan.cjs plan .` 与 `native/windows-media/registry-input.json` 给出。

Host 准备器还会在新工作目录取固定 Host Git 对象、`newtonsoft.json.13.0.4.nupkg`、`microsoft.netframework.referenceassemblies.net462.1.0.3.nupkg`；现有该入口没有原始 NuGet 缓存参数，不能声称整套准备零下载。精确 URL／SHA 见 `node tools/ci-source-built-host-plan.cjs plan .`。两类计划都不需要 NAS／Emby 账号，不允许替换版本或来源。

`build.ps1` 从 Git blob 物化产品源码并生成 preload／覆盖层及 provenance；`package.ps1 -VerifyOnly` 检查完整文件集合、大小／SHA、依赖、版本和来源绑定，在安装器编译前返回，不安装、不发布。不要执行普通 package 或安装 EXE。

## 产品入口与证据分层

仅在材料、完整回归和 runtime 校验通过后，才可协调使用该新目录中的入口：

```powershell
$runtime = (Resolve-Path ('dist/' + $name)).Path
& "$runtime/x64/electron/electron.exe" "$runtime/electronapp" --fn-connect-experiment
```

入口核对源码、覆盖层、preload 与固定 EXE 身份，在 bootstrap 前新建隔离应用／播放器目录，不读取或迁移现用 ETE profile。目录退出后保留，当前产品实验不复用历史 prototype 登录态。以上是未来入口说明，不表示本轮启动或授权真实登录／第三方正文。

纯合成回归能覆盖原 CM／ApiClient、期限／取消、API／图片／WS、Native source 租约及账号退休；已实测的 Electron 回环补足真实 CookieJar／Session I/O 层。现有产品入口是 live HTTPS 合同，没有完整产品 GUI 的回环 fixture，不能把 HTTP fixture 直接填入表单，也不能把启动界面或来源校验当作播放通过。

真实 FN 官方认证、Emby 登录、既定代理链、第三方逐跳来源、Native 解码／seek／字幕／转码仍需后续分别验收。用户在正规窗口自输认证，不导出 Cookie/token；真实正文及外部 origin／请求预算须由协调方明确，不沿用旧单次响应头批准，不把 FN／Emby 认证交给第三方。

## 长回归前的历史 Git 输入预检

本次新增 FN 测试不引用历史修订。已核 `tests/*.test.cjs`、显式 `*-material-selftest.cjs` 及其调用的 helper：现有完整普通／材料测试仍需以下三个历史提交的五个准确 blob，不能以当前文件或其他基线替换。在新 checkout、长回归前执行只读检查；失败先正常补原指定对象，不移动 HEAD／改测试／继续长跑：

```powershell
@'
const cp = require('node:child_process'), crypto = require('node:crypto');
const rows = [{"commit":"abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d","path":"native/windows-host/changes/Emby.Theater/Program.cs","gitBlob":"46b3172f84f92e8acc5a21a40b6c9c923dcf1e23","bytes":15471,"sha256":"bbff261ac026ba55e39ebb91b767e7cc9ab237dc85538c1c8306ef06b30a2b36"},{"commit":"abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d","path":"native/windows-host/host-retirement.patch","gitBlob":"3c431792f81ba0375a8f2cd1d3829a86d552729d","bytes":48897,"sha256":"0e3813bceb0c41602c6336c9bd147ade501c38978bac205e48c3a627e3fc9111"},{"commit":"aa86ddc6b0d5a911440ee6dff41ac20147e8f8e6","path":"tools/report-playback-issue.ps1","gitBlob":"f10bd578bbc606b8cf87bf86c4aa35a441ff0240","bytes":33882,"sha256":"8b29deaa080d23d806235ce60f84b7bb75dbd2007b33899ac826f1fdbceda5e1"},{"commit":"ff92bead401a458f3cc83f3e450f48be97af31b2","path":"src/config/system-defaults.json","gitBlob":"ebce5fb3ab1942346954f83afe1faedf392b6f93","bytes":266,"sha256":"a2550d45c44be80348dd972436d24941fb83252bd0577719997d6f1a83585222"},{"commit":"ff92bead401a458f3cc83f3e450f48be97af31b2","path":".github/workflows/public-ci.yml","gitBlob":"2f286cac9faaf93d1972e57cfcba1d96d5fdd7cc","bytes":8700,"sha256":"025238dafd2dc0f036374bef090368180732f1e838e37fc70c5471191bcada31"}];
for (const r of rows) {
    const b = cp.execFileSync('git', ['cat-file', 'blob', r.commit + ':' + r.path]);
    if (b.length !== r.bytes || crypto.createHash('sha256').update(b).digest('hex') !== r.sha256 ||
        cp.execFileSync('git', ['rev-parse', r.commit + ':' + r.path], {encoding: 'utf8'}).trim() !== r.gitBlob) throw Error('Historical test input mismatch: ' + r.path);
}
console.log('Historical test inputs verified: ' + rows.length + ' exact blobs; HEAD unchanged.');
'@ | node
if ($LASTEXITCODE -ne 0) { throw 'Historical test input preflight failed.' }
```

此清单不包括未调用的独立可视化／A-B benchmark 工具：例如 detail-entry-renderer 的旧 alias 对照另读 `1ca9aecaabbd66520dbecf8db8c41c721c1b7744:tools/patch-server-home.cjs`，benchmark 的非 fixture 模式另需其固定算法基线。这些均不属于当前 `ci-full-tests` 普通集合或显式材料自测，不能为省前置将它们误计作已经运行。

## 本次整合后的 Work 验证合同

旧 checkout、失败／成功回执与 Host 锁全部保留；新目录固定最终整合 SHA。先核历史输入、原始材料和完整 GCC 树，再生成 preload，单独执行 provenance 夹具与相关材料预检，然后在同一 HEAD 编译／实体验证／绑定新 Host，跑完整 Windows serial 普通回归和全部显式材料自测。没有固定成功时间预算；保留实际数量、失败、skip 和完整退出，不以旧 686 秒失败轮估算成功轮或省略用例。

本次共享 Native bridge 的每租约 HTTP 收尾与产品 renderer 的身份退休发生变化，因此须在新 SHA 重跑现成 Electron 44.5.0 回环 runner，复用准确官方 ZIP，零额外下载；仍按同轮双回执／源码绑定及进程／合成 profile 清理判定。旧 b557b8f 的 15阶段／19 checks 不外推。

现成回环覆盖真实 Electron Session／CookieJar、API／WS／媒体桥 I/O、Range／重定向凭据隔离及取消／关闭。它未驱动完整产品 renderer+Native adapter 的账号切换／路线推进，也没有专门制造新 drain Promise 延迟或失败；这些由本次 Node 的真实桥接+可控收尾和真实 renderer+adapter 合成回归补足，不能替代 Windows 完整产品 GUI 或真实 FN／CDN 解码／seek。全部基础门禁成功后才生成、VerifyOnly 独立 runtime；真实认证／正文请求仍另行明确范围，不在此准备步骤内。
