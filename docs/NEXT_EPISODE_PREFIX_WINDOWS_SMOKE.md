# 下一集真实自动链短验准备

`tools/playback-prefix-windows-auto.cjs` 是显式派生runtime实验，不是普通应用或安装验收。固定 Windows helper 自动链已在精确 `cfb597b741a3741ed266fc08ea0d29cf1218e5d8` 的 [受控运行](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40100795549)通过入口、native 与退出门禁。该运行使用真实 Alameda/renderer、原 PlaybackManager/队列与固定 helper；匿名合成媒体、隐藏展示层和 ApiClient facade 仍是明确边界。普通设置页、真实服务与活跃取消矩阵没有因此通过。磁盘选项实验优先使用[独立探针](MPV_DISK_CACHE_PROBE.md)，不依赖此自动链。

## 身份与派生

输入仍是不可变原162候选ZIP及其原始runtime，由独立 `c9cd9bacf81445c9c10befd121951b1c63c86faa` checkout执行完整原包门禁。输出在输入repo/runtime之外的全新私有目录：完整复制原runtime，保留所有原清单，再只应用精确来源提交的七份维护 JS和同包锁定loader新增。不是改写原包或将派生目录冒充原候选。

允许的JS为 `enhanced/playback-prefix-store.js`、`playback-range-store.js`、`playback-range-cache.js`、`playback-range-session.js`、`playback-range-renderer.js` 、`native-helper/service.js` 和 `native-helper/client.js`。每项记录来源Git blob、替换前hash、替换后hash、长度；driver自身也须与该来源提交一致。loader来源为原 `x64/electron/vulkan-1.dll`，目标 `electronapp/libmpv/x64/vulkan-1.dll`，939008字节，SHA256 `7611034fc1bc24fa103b4c6bf923974cdec46fa506952d6f82cfef836db99fd1`；保留原Electron许可材料。所有其余文件必须逐字节保持，完整派生集合/摘要在每次启动重验。

原构建的 PlaybackManager/queue/adapter 保持；native client 从精确当前来源补入有效状态更新及只读 status 接口；本轮 adapter仅设置菜单标题变更不纳入这份overlay。因此本实验不证明新设置页、菜单标题、普通main启动或安装效果。固定helper和DLL不改，不编译新内核。

## 准备与显式执行

先取得精确来源提交、干净source checkout、独立c9工具checkout和已校验原候选输入。占位命令如下，由协调者安排，不自动dispatch：

```powershell
node tools/playback-prefix-windows-auto.cjs prepare --tools=C:\owned\c9-tools --source=C:\owned\source --source-commit=<exact-40-hex-commit> --runtime=C:\owned\original-runtime --zip=C:\owned\original.zip --out=C:\owned\fresh-auto
node tools/playback-prefix-windows-auto.cjs entry-smoke --plan=C:\owned\fresh-auto\auto-plan.json --execute-electron-entry
node tools/playback-prefix-windows-auto.cjs run --plan=C:\owned\fresh-auto\auto-plan.json --execute-native
```

prepare不启动进程。entry先证明真实Electron启动、独占profile及完整物理校验，20秒停止请求上限；native仅在entry真实成功后允许，保持120秒停止请求上限。超时或不明退出不得通过。所有profile环境变量隔离，子进程不继承GitHub token/Node或代理注入。基线artifact缺失、过期或校验失败时停止，不替换输入包。

## 必须真实执行的路径

真实Electron renderer中加载已构建的维护PlaybackManager、PlayQueueManager、events、adapter、下一集renderer和native client；main使用真实service/controller/helper。一次调用原 `manager.play({items:[A,B]})` 建立合成队列，此后禁止手工preload、tick、nextTrack、伪造属性或EOF。

实际helper时钟跨过70% → renderer原定时器 → 同源metadata → 预载B → A真实EOF → 原manager stopped/nextTrack → B新generation实际解码。A 为固定 320×180/12fps、192 帧、16 秒、33,182,440 字节 AVI；B 为 320×180/24fps、192 帧、8 秒、104,194,304 字节 AVI，JUNK 将合法 idx1 移到 100 MB 预算外。实验只选择 100 MB，必须报告真实 100,000,000 字节，不能宣称完成 300 MB 预载。以实际缓存命中观察、来源仅新鲜单字节校验与预算尾块/预算外缺块，不重复首块、B真实time-pos和gpu-next输出共同证明命中。

外围替代明确列在plan：匿名loopback ApiClient facade、展示/OSD/CSS/navigation/loading、固定 Alameda 与 app.js 同语义 default alias 装载和所属文档IPC relay。show/focus请求记录但抑制，窗口始终隐藏，媒体/代次/Range/自然EOF不替代。该显示边界不同于旧hidden harness，不能声称已验证真实可视界面、Emby鉴权/Session或NAS/302。

回执包括完整源/派生证明、阈值/预载/EOF/next/B事件顺序、B前缀实际读取、没有前台累计、总媒体占用≤P、退出清空。每个helper必须自然exit0且stdio关闭，Electron必须exit及close均确认；无法确认则保存PID和UNCERTAIN，不用kill请求冒充退出。


## 独立 GitHub 标准 runner 入口

验证分支 `verify/next-episode-auto-20261024` 的现有 `public-ci.yml` 增加 `range_smoke=next-auto`，且 `release_package=false`。该模式只允许本验证分支，使用标准 `windows-2022`、独立 concurrency `ete-manual-next-prefix-auto`、15 分钟作业上限。旧 range 模式分支限制与 concurrency 保持；普通 package 路由不运行。协调者先核对精确 HEAD，再安排推送/dispatch；本文不代表已经执行。

获取仍只允许 run `40067805498` / artifact `12551020498` / base `162dc69f9c3438d99508c90321a889b693b6b10a`、原 ZIP SHA `b35d89c4d7070bc4e56223802b0db666befbc4623a43f18b8fee5a4ec67083cc`。原工具 c9 checkout、静态解包、原完整包校验与来源门禁保留。缺失/过期/拒绝就停止，不重打包或换候选。源 overlay/driver 绑定 workflow 的精确提交；不编译/下载新 helper 或内核。

prepare → 实际 Electron entry → 实际 native 自动链严格顺序。每个执行子进程不带 GitHub token，entry 20 秒、native 120 秒停止请求上限与所属退出确认保留。上传仅允许有界 `auto-entry*`、`auto-native*` 回执和控制阶段证据；不上传 profile、plan、媒体或 runtime。

原验收等待 adapter 的 `next` 日志，但生产 manager 未将 `playOptions.command` 写入 adapter streamInfo，这个日志不能证明正常 EOF 链。工具现仅包装原 `manager.nextTrack` 记录调用，再原样委托；没有直接调用 nextTrack、preload、tick，也没有注入 EOF。真实 Alameda 取代原同步装载器，原模块标识/default alias 与异步依赖复用进入同一 Node 回归。

Node 可复现命令：

```sh
node --test tests/playback-prefix*.test.cjs tests/playback-range*.test.cjs tests/ci-playback-range-smoke.test.cjs tests/manual-windows-workflow.test.cjs
```

Node 集成自然合成时钟验证阈值 → 自动 renderer 定时器 → 生产 service 二次门禁 → 真实 HTTP/store → 合成 EOF → 原 stopped/nextTrack → B 首块命中；另测原队列移除候选清空、应用关闭清空。合成时钟与压缩的 renderer 间隔不能计作真实 helper 进度或解码。低层回归覆盖共享 P（含写入预留）、租约、缺块不累计、物理抢占、取消及换候选；Windows 工具要求真实 B 解码、原生触发的预算外缺块与退出清空；精确 cfb597b 的上述受控运行已通过这些门禁，原始数值可用下述只读入口核对。Windows 活跃下载取消/换候选矩阵仍须补独立实测，不得将 Node 生命周期覆盖当作 Windows 通过。匿名同源合成媒体不证明 Emby 鉴权、302/dian115、真实 Session 或可见 UI。


执行失败时，控制脚本直接向 Actions 作业日志输出 `next-auto-failure-summary`：entry/native 阶段、允许列表原因、退出码/超时/stdio-close、固定 helper 错误标签与系统码，以及最后 16 条经过字段投影的事件。读取回执限 64 KiB、trace 限 1 MiB；缺失/损坏保持 not-recorded。摘要不打印原始 stderr、异常 detail、媒体 URL、profile 路径或环境变量；完整有界回执仍保存在 artifact，便于对照进一步定位。


prepare 的 driver 身份遵循仓库既有 tracked-text 合同：只允许工作树 CRLF/LF checkout 等价，实际源码改动、BOM 与额外内容仍拒绝。私有 `auto-driver.cjs` 直接写精确来源提交的 Git blob 字节，后续 plan/driver SHA 继续严格逐字节校验；不把 CRLF 工作树副本当成最终 driver。固定包、loader、来源、完整派生集合和退出门禁均保持。

prepare 从输入解析到 driver/plan 写出逐步记录固定阶段；受限错误分类覆盖来源不符、固定包/loader 校验、文件系统、依赖与 Git 子命令。控制脚本在输出目录尚未建立时也读取有界 prepare stdout，把安全分类直接打印到 job 日志，不转发路径、URL、堆栈或任意原始异常。旧版仅包含一行固定错误码的 stdout 也可分类。干净 `core.autocrlf=true` checkout 已复现旧 raw-byte guard 的 `driver-source-mismatch`，修复后的同一身份检查返回精确 Git 字节；这不代表 hosted prepare 或 native 已通过。


## 读取既有成功结果，不重跑播放

`range_smoke=next-auto-report`、`release_package=false` 只启动 5 分钟上限的标准 runner 读取作业。固定输入为 run `40100795549` / artifact `12562503770` / native source `cfb597b741a3741ed266fc08ea0d29cf1218e5d8`；ZIP 19,823 字节，SHA-256 `31fd3af11f29013aaadb773b30a56df9bec85fe0edb53dcde57b33b7165d7d9e`。不存在 latest 替代、安装或播放动作。

工具只读八个 allowlisted 成员，重核 trace 的原自动链判据、entry/native coordinator 与 helper 退出，然后在 job 日志打印 `existing-next-prefix-success-result`。包含实际阈值时间、事件顺序、320×180 gpu-next、预载/命中/源范围/占用、退出与身份字段；不输出任意 receipt detail、URL、profile 或环境值。下载先校验原运行/SHA/expiry 和整个 ZIP 字节身份，不解包/启动 runtime，不构建或运行 helper。

该成功运行只选 100 MB；原 occupancy 门禁按约 25 ms 状态采样检查包含预留的逻辑占用，没有连续物理峰值测量。原退出守卫检查媒体残留为空，但没有测试在未播下一集下载中退出。活跃取消/抢占、换候选与普通设置/真实源仍是明确待验收项。


## 已完成的固定 100 MB 自动链结果

精确 source `cfb597b741a3741ed266fc08ea0d29cf1218e5d8`，native run `40100795549` / job `120892348048`；只读结果 run `40102420145` / job `120897117931`。以下为既有 artifact 的明文结果，不是新的播放运行。

| 项目 | 实际结果 |
| --- | --- |
| 阈值 | 11.25 / 16 秒，达到 70% |
| 顺序 | preload 391 → ready 807 → natural EOF 836 → original nextTrack 838 → B load 840 |
| 代次与输出 | A 101、B 103；B 320×180，gpu-next |
| P / 已提交 / 报告占用 | 均为 100,000,000 字节 |
| 命中 | 154 reads，首块 0–262143；首块重复回源 0 |
| 来源 | EOF 前媒体预载 100,000,000 字节；EOF 后 probe 1、miss 3 |
| 缺块范围 | 三次均为 104071168–104194303，位于 P 之外 |
| 退出 | helper/Electron exit0、stdio close，清空门禁通过 |

缺块不累积写盘，重复尾部来源读取符合透传合同；现有记录没有逐次归因到 seek，不增加额外缓存优化。此结果仅覆盖 100 MB 选择，不代替普通默认 300 MB 验收。

## 活跃生命周期短验入口（准备态）

`range_smoke=next-matrix`、`release_package=false` 复用同一固定包、loader、七份维护 overlay、Alameda/manager/service/helper 和 A/B 合成源。prepare 与实际 entry 后，每项在新的所属 Electron/helper 进程运行；不重复已经通过的 A→B 自动链。显式本机入口为 `run-matrix --plan=<owned-auto-plan> --execute-native-matrix`，仍要求 Windows x64、实际 entry、原身份和退出门禁。

每项通过普通设置 store 的默认配置只保存 enabled=true，实际读取 70%/300 MB，P=300,000,000；不使用 100 MB 替代默认。预热 C 仍受源文件 104,194,304 字节限制，不声称已拉满 300 MB。当前视频不写盘、所有前缀/租约/预留继续使用同一个 P。最后缓冲暂存属于独立实验，不是这些检查的依赖。

- cancel：真实进度/renderer 定时器触发 B，第二块仅发出一字节后等待；用原 manager.stop 取消，核对真实请求 close、无迟到字节和无主动切集。原 Stop 的交接前缀归属保持，最终应用退出清空。
- preempt：该项仅将既有 mpv 内存缓冲选项设为 1 MiB 并读回；A 的真实原生缺块读取抢占 held B，核对 B 的客户端实际 close 先于 A 的新来源请求及 A 持续推进。不是用外部 fetch 代替 native 缺块。
- replace：用原 pause 保持 A，再用原 manager.queueNext 插入明确同系列 C；旧 B 关闭后原 renderer 自动预载 C，共享 P，B/C 均不被测试主动播放。
- exit：B 下载仍 pending、B 从未 load 时直接执行生产 service.destroy；核对实际取消、helper/Electron 退出及媒体清空。
- unsupported：合成弱 ETag 使缓存资格失败，核对 helper 仍使用原 A 来源并真实解码、下一集 unavailable、没有 B 媒体请求与缓存写入。302/auth/cross-origin 另有 Node 来源矩阵；真实 NAS/302/dian115 未验证。

请求观察器只包装原 http.request 并监听实际 close，不替换请求/响应。首块先提交、第二块保持未完成，迟到写尝试必须为 0；后台 probe/media 的实际客户端并发峰值必须 ≤1。每项安全标量结果直接打印 `next-prefix-matrix-case-result`，失败阶段/错误/事件仍直接可读。任何失败或不确定退出会停止后续实际用例，不重试或绕过门禁。

普通设置另有真实 Alameda + 原 BaseView/controller + 实际设置 IPC/store/service 的 Node 集成：页面 70%/300 MB；保存不改当前代次；下次显式播放实际预算 300,000,000。helper 与 DOM 仍为替身，不是 Windows 可见 UI 验收。单集入口禁用服务端连播时不扩队列；明确 `[A,B]` 队列继续遵循原 manager 的前进语义，不改其设置或 owner。


## 活跃矩阵首次结果与剩余四项入口

run `40104947923` / job `120904605594`、source `78fdfb114bb42d926101109b29253bb888b66335` 的 entry/cancel 通过：默认 P=300,000,000，已提交/采样峰值 262,144，后台并发 1，held 请求实际关闭、迟到字节 0、未播放 B、helper/Electron 正常退出。preempt 旧被动等待没有建立 A 前台缺块，A 自然结束后 B 也到 EOF，最终 `matrix-preempt-deadline`。旧运行没有读取缓存范围，不能将缓存覆盖推断写成实测，也不能据此宣布产品抢占失效；后三项未运行。

修正后的 preempt 在 held B 时暂停 A；仅读回隔离实验的前向 1 MiB、后向 0 字节内存设置和实际 `demuxer-cache-state.seekable-ranges`。2 秒目标必须位于缓存范围之外，再通过原 manager.seek 发起原生缺块。严格要求原代次、B 实际 close → A 新来源请求 → seek 后新进度 → unpause 后新进度；历史事件不能满足后两项。总时限仍为 35 秒，缺块阶段最多 5 秒，不延长原等待。若自然 EOF 抢先、目标仍缓存或未出现缺块，给出不同的固定失败码；cache/seek 阶段和最近 load 代次直接输出安全日志。

`range_smoke=next-matrix-remaining`、`release_package=false` 只顺序运行 preempt/replace/exit/unsupported；显式本机命令为 `run-matrix-remaining --plan=<owned-auto-plan> --execute-native-matrix`。仍必须通过 prepare、实际 entry、固定 artifact/loader/完整派生身份与所属进程退出门禁。已通过的 cancel 和主自动链不重复。新四项在精确来源 hosted 结果出现前均为待实测，普通默认设置的 Node 集成与真实 NAS/auth/302 的证据边界不变。


## 普通包回归前的 Windows 路径短检查

`range_smoke=next-settings-check`、`release_package=false` 在精确 verify 分支运行5分钟上限的 Windows 2022/Node 24.18.1 串行检查；包含安全路径诊断、真实 Alameda 设置链、普通设置/菜单及实际 junction 拒绝，不获取 runtime、不启动 helper、不重打包。临时根使用 realpathSync.native；生产路径安全门禁保持。该检查通过后再安排普通 `range_smoke=off` 测试包，不能用 Linux 的别名表示替换红绿替代 Windows 结果。


Node 自然链正例明确把网络就绪作为合成时钟的 EOF 前置条件：B 第二块先 held，自动进度到7.6/8秒后完成真实响应，自动 renderer/service 返回 ready 后合成时钟才继续自然 EOF；原 ready-before-EOF 断言保留。这是显式合成 helper 夹具安排，不替代已归档的真实 helper 自然链证据。另一个 hold-natural-eof 用例不释放该块，让原 nextTrack 取消后台请求，并验证 B 首块命中、未完成块回源、迟到字节0及当前媒体不累积。两条用例的安全数值摘要直接写入短检查日志。
