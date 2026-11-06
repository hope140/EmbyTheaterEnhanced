# FN 独立产品验证准备

目标仍为后续 0.4.18；当前工作分支保留 `feature/fn-connect-v0417` 名称。正常合入 main `ddaa6835dda5ec7fb587620c7448708e1d8dda02`，继承 main 已有 0.4.17 版本元数据，不自行 bump。音轨索引零、PlaybackInfo 30 秒／停止上报 10 秒和关于页修正，与 FN 路由／账号退休屏障同时保留。更新／下载修复沿原共同基线保留；不恢复预载或媒体暂存。

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
