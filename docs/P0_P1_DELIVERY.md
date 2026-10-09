# P0/P1 本地交付记录

## 基线与范围

2026-10-09 只读核验：远端 main 为 `46e995ef83fca7f7a882e3dc633bdcc2d2d521c7`，正式 Latest 为 v0.2.2。v0.2.4 Pre-release 的产品 sourceCommit 为 `03a2e3b9ea7f1cf786b034b0a1882b10de79a39c`，完整候选文档 HEAD 为 `ebcb655ad6b5ae19f09b2cbeee90b7cc5838e957`。本轮从该完整 HEAD 创建隔离分支 `codex/p0-p1-diagnostics-20261009`，主目录和已有候选的未提交资料原样保留。

允许本地源码、测试、文档、可回滚提交及独立候选构建。目标为 P0 状态收口与主线整合审查准备、P1 最小诊断与交付自动化。预热为可选后续候选，本轮不实施；性能研究、Hydration、Forge 与圆角不进入本轮。

## P0 主线整合审查

main 到 ebcb655a 共 71 个文件，10,979 行新增、623 行删除，`git diff --check` 通过。差异分为 Settings/maintenance、Native Helper 持帧与取消、窗口/全屏状态、工具测试和历史证据四组。已有两父整合提交 `cc603ba` 的第一父为 `6be48ed`、第二父为 `21ef9a4`；本轮沿用完整候选，没有重新拼接旧分支。

静态比对确认 `native-helper/service.js` 与 helper C++ 与全屏候选 `1e86e51` 一致；main/libmpv 的交叉合并增量对应维护 IPC/About 和窗口状态。v0.2.4 后续设置修正仅触及设置页与版本元数据。对 endpoint/current generation、begin/arm 等待前后复核、presentation epoch/token、stale response 清理、libmpv stop/play 请求边界和 fullscreen placement revision/HWND 的审查没有发现可据当前证据确定的整合缺陷。

候选范围较宽，适合按上述四组审阅；静态审查不替代运行验收。README、ROADMAP、KNOWN_ISSUES 的当前状态已统一到 v0.2.4；历史状态和失败证据继续按原提交归属保留。主线整合未执行。

## 当前已确认状态

- Settings 一致性修正已通过用户验收并随 v0.2.4 测试版发布。
- 顶部细条已由用户确认消失；统一候选已补齐边缘锁定、尺寸恢复、普通缩放、重复全屏、最小化恢复、关闭保存、10 次 Next/Previous 和 Stop。
- 上一集/下一集按用户所测场景记为基本解决并观察。
- 全屏跨编码 Previous 为 73 帧、max107ms，保持 INCONCLUSIVE；旧快速夹具 next.selected=false 与基线一致，保留原失败，不改断言或产品掩盖。

## P1 实现与本地交付

诊断设计见 [P1 contract](P1_DIAGNOSTICS_CONTRACT.md)。源码新增旁路 controller observer、main 侧有限关联与阶段记录、preload 全局错误投影和可信 IPC 二次校验；普通播放/Resolver/Session/native 协议与窗口时序保持既有实现。打包增加根版本、lockfile、runtime 应用与 build manifest 的一致性 gate。

状态：`LOCAL REVIEWABLE DELIVERY COMPLETE`。准备阶段使用固定 manifest 验证的归档、完整 Electron 44.4.2 运行树、固定 Native Helper header 与既有锁文件。主线程审核 worker diff 和测试，并完成独立 Tier 2 核心复核；复核发现的 pending-drop 计数在写盘失败后丢失问题已修复，同步 throw、Promise rejection 和 resolve(false) 三个回归通过。

| 层级 | 实际结果 | 本地证据 |
|---|---|---|
| 起点基线 | 串行 430/430 PASS，0 skipped | `.work/p0-p1-baseline/baseline-tests.log` |
| 最终产品源码 fb10f92 | 串行全量 455/455 PASS，0 skipped；包括 privacy、stale/helper、unattributed、IPC、pending/rate limits、failure isolation | `.work/p1-full-unit-final.log` |
| 后续 runtime 工具专项 | 8/8 PASS，覆盖缺事件、坏 JSONL、canary、越界路径、来源及隔离 marker | `.work/p1-runtime-tools-unit-final.log` |
| 正式 build / provenance | source/runtime/native PASS，2149 payload files；加 build manifest 共 2150 | `.work/p1-build-fb10f92.log` |
| 版本与 About IPC | root/lock/runtime/build/installer 均 0.2.4；真实 maintenance IPC 的版本与来源匹配 | `.work/p1-final-identity.json`；最终 runtime 的 injection marker |
| 假 CD2 与合成媒体 pipeline | ordinary/STRM、Pause/Seek/Resume/Stop、Item/Source/Session/report、Next、generation takeover、Stop late-load prevention 全通过；fake calls 7、cancel 2、active 0 | `.work/p1-runtime-575f7b156cf643219a2de75b5f97048e/electron-smoke.json` |
| 实际产品 JSONL | 110 条合法记录；begin/retire 各 6，start/file-loaded 各 5，end 1，hidden 12；两类 renderer 错误各 1，安全位置保留；准确关联 10，canary 0 | 同目录 `p1-diagnostics-result.json` |
| 隔离与进程收尾 | appData/userData 显式绑定临时目录；application 注入 1、auxiliary 0；6 个 observed descendants，exit 0、timeout false、candidate residual 0；现有日志 hash/length 未变 | 同目录 `runner-result.json`、`p1-diagnostics-injection.json`；`.work/p1-existing-log-after-final.json` |
| 整包脱敏 | READY、redactionPassed=true，8 个内容文件 + manifest，ZIP 9 entries，canary 0，版本 0.2.4 / 来源 fb10f92 | `.work/p1-bundle-audit.json`；`.work/p1-final-bundles/ETE-Diagnostics-20261009-094618/` |
| 安装器 | Inno 完整性通过；解包 2150/2150 文件路径与 SHA 全匹配，missing/extra/mismatch=0；PE 双版本 0.2.4 | `.work/p1-installer-audit.json`、`.work/p1-installer-meta.json` |

持帧 prepare/arm/clear 的关联和失败隔离有单元覆盖；本轮隐藏 runtime 只取得 prepare 的 unavailable 记录，没有把隐藏窗口当作可见持帧或真实首帧验收。旧 rapid fixture 的其它模式限制及 Previous max107ms 仍按原证据保留。

## 本地提交与产物

- 分支：`codex/p0-p1-diagnostics-20261009`。
- `97a6448`：P0 文档、基线审查和诊断 contract。
- `ef2a8d5`：有限播放与 Renderer 诊断及回归测试。
- `fb10f920a39112ff72b0f82715da8345702f634b`：版本一致性 gate；正式产品 build sourceCommit。
- `7ecb5ef`：独立 runtime runner、真实产品日志校验及测试；只增加工具/测试，产品字节不变。后续交付文档提交同样不改变上述产物身份。
- `413b640`：将已验证的四层 provenance 校验固化到 runner 启动前；候选四项复核通过。
- runtime：`dist/ETE-0.2.4-p1-fb10f92-win-x64/Emby.Theater.exe`。
- installer：`dist/EmbyTheaterEnhanced-0.2.4-p1-fb10f92-test-win-x64-setup.exe`，175,626,639 bytes。
- SHA256：`d23ff3a0a7794fa66250e2cdfef7f8bc85a4bd4cab0b48d3f57cfbe5e679a84e`；同名 `.exe.sha256` 已生成。

Native Helper binary SHA256 仍为 `28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`。相对完整 v0.2.4 候选，main.js、libmpv.js、Resolver、native C++ 和版本/锁文件没有变更。

可复跑自动化入口（在持有上述 dist 的工作树内）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/test-p1-diagnostics.ps1 -RuntimeName ETE-0.2.4-p1-fb10f92-win-x64
```

runner 使用新临时目录、合成媒体和 loopback fake CD2；启动带 runtime 版本元数据的测试 package，显式固定 Electron appData/userData，绑定精确应用文档，完成后校验来源/记录/进程。它不会要求用户登录或点击。构建/打包 gate 已在产品提交 fb10f92 下执行；后续工具/文档 HEAD 不冒充 runtime sourceCommit。

## 测试入口偏差与修正

首轮 `.work/p1-runtime-9888a5bd2740436ca9789f6027f10351/` 仅设置进程 APPDATA，Electron Windows Known Folder 的 appData 仍指向现有 Enhanced profile，导致合成诊断追加到其既有 JSONL。该轮功能检查通过但隔离验收不通过，不能用作本轮隔离 PASS。检查发现既有 system.xml、device identity 和 cancel 文件的修改时间均早于本轮；本轮未改写或清理用户日志以掩盖该偏差。

wrapper 随后在产品 bootstrap 前使用 app.setPath 显式绑定并读回 appData/userData，后两次运行确认临时日志存在、既有日志 hash/length 不变。中间一次独立 cjs 入口的 appVersion 是 Electron 44.4.2，属于 harness 元数据；最终 runner 改为带 runtime package version 的测试 package，app/About IPC 和导出包均为 0.2.4。产品源码、runtime 与安装包未因此重建或更换。

## 验收边界

本轮 runtime 使用合成媒体、假服务和临时 profile。日志中的 native file-loaded/core-playing 仅为事件证据；真实首帧、真实 Emby/CD2、服务器远控、HDR、多屏和系统安装生命周期仍按独立专项验收。新增 Renderer observer 用于定位历史错误，未预判或宣告其业务根因修复。

安装脚本静态核对：既有 Enhanced profile 位于应用数据目录，bootstrap 仅补缺失文件；安装器没有清理该目录的动作。此结论是配置保留策略审计，不是 clean install/upgrade/uninstall/reinstall 实测。

本轮止于可审阅本地交付；main 合入、PR、推送、发布和系统安装仍需单独决定。
