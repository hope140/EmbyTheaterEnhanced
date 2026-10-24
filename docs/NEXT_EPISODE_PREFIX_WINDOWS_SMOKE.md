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
