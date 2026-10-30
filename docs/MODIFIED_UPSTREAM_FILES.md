# 修改后的上游文件审计

审计日期：2026-09-13（UTC+8）。依据 `vendor/runtime-manifest.json`，下列文件与官方 Electron 3.0.21 对照版本不同，且作为可公开的维护文本代码保留。每个文件内都有显著声明：该文件为 Emby Theater Enhanced 维护的修改版本，修改日期为 2026-09-12/13，并按 GPL-2.0-only 分发。

| 路径 | 类型 |
|---|---|
| `src/electronapp/apphost.js` | JavaScript |
| `src/electronapp/cec/cec.js`、`command-map.js` | JavaScript |
| `src/electronapp/filesystem.js`、`fullscreenmanager.js`、`main.js` | JavaScript |
| `src/electronapp/plugins/cec.js`、`plugins/cec/cec.js`、`cec.html` | JavaScript / HTML |
| `src/electronapp/plugins/libmpv.js`、`libmpv.css` | JavaScript / CSS |
| `src/electronapp/plugins/mpvplayer/audio.js`、`audio.html`、`video.js`、`video.html` | JavaScript / HTML |
| `src/electronapp/scripts/appclose.js`、`videohandler.js` | JavaScript |
| `src/electronapp/serverdiscovery/serverdiscovery-native.js`、`serverdiscovery.js` | JavaScript |
| `src/electronapp/shell.js`、`splash.html` | JavaScript / HTML |
| `src/electronapp/wakeonlan/wakeonlan-native.js`、`wakeonlan.js` | JavaScript |

未公开的 B 类文件：`src/electronapp/package.json`、`plugins/mpvplayer/strings/en-US.json`、`plugins/mpvplayer/strings/zh-CN.json`。这些 JSON 文件不能以注释方式安全承载修改说明，且公开基线本身不承诺可独立构建，故在获得更精确的来源/修改记录前不纳入。

CloudDrive2 PR #2 继续不公开完整 `www` snapshot。`tools/patch-playbackmanager.cjs` 在本地构建时对 `www/modules/common/playback/playbackmanager.js` 应用锚点唯一的 request-generation overlay；源 snapshot 仍来自已校验 vendor，脚本在锚点缺失或重复时拒绝构建。新增的 `enhanced/cd2-service.js`、`enhanced/cd2-ipc.js`、`resolvers/cd2-resolver.js` 与最小 proto 是 Enhanced 自有维护文件。

## 2026-10-30 — 原视频下载按钮 overlay

`tools/patch-advance-download.cjs` 在准备Web overlay时，仅对固定`www/modules/commandprocessor.js`的视频下载锚点应用维护逻辑，转交`enhanced/advance-download/renderer.js`；音频、日志与字幕下载保持。vendor输入不改写，缺失或重复锚点拒绝生成。原输入SHA256为`10ED682D5897E8C065925EF6071E914CB04537067A14C4D869F3EB14F724276F`，输出为`79B0E56E2B4B486D3B59F42AE27FEDDE91FC851B791D08A59AD486D0A3C4F286`，固定于`prepare-web-overlays.cjs`；补丁工具进入构建输入合同。新下载模块为ETE维护代码，未复制GPLv3 Shim实现。
