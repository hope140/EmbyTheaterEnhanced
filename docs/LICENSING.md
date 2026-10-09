# 许可与公开范围

## 结论

本仓库维护层采用 **GPL-2.0-only**，完整文本见根目录 `LICENSE`。

依据是官方 `MediaBrowser/emby-theater-electron` 的 3.0.21 对照提交与 `MediaBrowser/emby-theater-windows` 的 3.0.20 对照提交均提供 GNU GPL v2 文本。所审计的维护源码没有发现明确的 “version 2 or any later version” 版权/许可声明；GPL v2 文本末尾的示例不是对本项目的额外授权。因此不能证明 `GPL-2.0-or-later`，本项目保守地使用 `GPL-2.0-only`。

`src/electronapp/package.json` 中的 `MIT` 字段与上述官方仓库根许可不一致，不能单独作为整个衍生维护工程的许可依据。

## Git 公开源码范围

- 可审计的维护脚本、测试、安装器、文档和许可文件。
- 已确认可维护的 Electron 应用层文件；其具体来源判定保留在 `docs/CARNIVAL_BASELINE.md` 与 `vendor/runtime-manifest.json`。
- 构建输入清单和哈希，不包含输入本体。

## 修改后的上游文件

首次公开前已审计 `vendor/runtime-manifest.json` 中 B 类、且进入公开基线的文本代码文件。每个此类 JavaScript、CSS 或 HTML 文件内均带有 2026-09-12/13 的显著修改声明，并指向根 `LICENSE`。无法在严格 JSON 中安全添加注释的 B 类 `package.json` 与翻译 JSON 已排除，等待其来源和修改记录可单独证明后再公开。审计清单见 `docs/MODIFIED_UPSTREAM_FILES.md`。

## Git 中不包含的材料

- `vendor/carnival/`、`vendor/patch/` 和原始 Carnival SFX、综合补丁 ZIP。
- `dist/`、`build/`、安装器、原生 DLL/NODE/EXE/PDB 及其他生成二进制。
- `src/electronapp/www/` 的完整离线 Web 快照：其大部分归为 E 类，精确上游来源与再分发权尚未独立确认。
- 原始真实播放证据：其中包含私人媒体库的内部标识；公开文档只保留脱敏结论。
- 任何凭据、用户 profile、安装测试输出、日志、缓存和本机路径。

上述是 Git 跟踪边界，不表示安装包不携带这些组件。来源未知不构成已确认的授权；新增分发材料仍需逐项核对来源、适用条件、对应源码和第三方通知。

## 当前分发事实与材料状态

`v0.1.1-baseline` 是历史源码治理起点；项目此后已发布 Windows 安装包，2026-10-09只读核验 Latest 为v0.2.2、最新Pre-release为v0.2.4。发布存在这一事实不表示来源、通知或完整对应源码材料已经闭合。

[构建输入审计](BUILD_INPUT_AUDIT.md) 对P1本地候选fb10f92分别记录CONFIRMED、MISSING和UNKNOWN。已确认Electron许可文件和npm可见license文件随包保留；候选完整payload中没有根项目LICENSE/THIRD_PARTY_NOTICES。Host/支撑DLL、CEC/RefreshRate、libmpv及其依赖、离线Web/资产的精确对应源码或完整通知材料仍有缺口。该候选与已发布v0.2.4的03a2e3b不是同一个sourceCommit。

维护层的GPL-2.0-only声明保持；第三方组件不能由该声明统一推定许可。后续需按实际发行文件集合补齐来源、适用许可文本、构建材料、完整对应源码或适用的获取安排，再作专门审查。本页和本轮事实清单不构成法律合规认证，也不改变已发布资产。
