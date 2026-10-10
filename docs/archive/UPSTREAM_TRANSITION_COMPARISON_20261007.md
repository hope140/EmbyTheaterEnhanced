# 历史研究：2026-10-07 上游切集呈现对照

本文归档自当时本地研究，下面的“当前”“下一步”和 USER VISUAL FAIL 均指 2026-10-07 的旧候选，不代表 0.2.7 的当前实现或验收状态。后续已采用 native 持帧并取得各自验证；当前 contract 以 [架构](../ARCHITECTURE.md)、[切集实现](../NEXTTRACK_TRANSITION_OVERLAY.md) 和 [已知问题](../KNOWN_ISSUES.md) 为准。本归档用于理解演变，不授权重做旧方案；原正文保留如下。

---

# 旧版 Emby 与当前切集呈现对照

日期：2026-10-07（UTC+8）。范围：源码与历史对照；未启动客户端，未修改产品行为。本轮用户要求优先理解、仿照旧官方生命周期，相邻封面提前准备仍未采纳。

## 参考边界

- 官方 Electron 参考固定为 `db0f4c814ee1e7d9b5f50010065c5cb64a20357e`（3.0.21），本机缓存位于 `.work/upstream/electron/MediaBrowser-emby-theater-electron-db0f4c8/`。
- 本轮以固定提交的远端内容校验缓存：`main.js` 与 `plugins/libmpv.css` 规范化换行后文本相同；`plugins/libmpv.js` 的规范化 Git blob SHA 为 `db0c623f54945ab9d3023d1e745dea730e063200`，与 GitHub 固定提交目录 API 返回值一致。参考不只依赖本机目录名。
- Carnival 基线为只读 `vendor/carnival/electronapp/`。其中离线 `www` 的精确官方 Web 来源尚未证明，不能将该 PlaybackManager 快照标为官方 3.0.21 的完整 Web 源码。
- 当前问题候选为 `88f56b7`；previous 入口补齐为 `456df8e`；`4f8a7f9` 只增加观察工具与测试。三者与正式发行基线分开。
- 本文能够确认源码顺序和所有权差异，不能由源码证明旧官方从无黑帧，亦未完成同媒体、同窗口条件下的旧新版本视觉 A/B。

## 官方适配层原有行为

固定参考的 [plugins/libmpv.js](https://github.com/MediaBrowser/emby-theater-electron/blob/db0f4c814ee1e7d9b5f50010065c5cb64a20357e/plugins/libmpv.js) 中：

1. `createMediaElement`（381–417）仅在容器不存在时创建 `application/x-mpvjs` embed；存在则直接复用。
2. `play`（475–494）完成必要 OSD 路由、display sync、创建/复用之后，监听 `core-playing` 并发起 `playInternal`。播放 Promise 等待该事件；容器 opacity 的设置发生在等待过程内，不能改述成官方已等待可见首帧才揭开画面。
3. `stop(false)`（656–664）发送 mpv `stop`，保留容器与插件；`destroy` 走独立销毁流程。保留播放器不等于保证 mpv 保留上一帧。
4. 此官方适配层未包含 Carnival 的 `backdropUrl` 背景逻辑，也没有当前 `nexttrack-transition` 的选图、两帧等待及 180ms 淡出模块。这不是对未取得的在线 Web UI 全部行为作否定结论。

旧版也不能概括为“视频始终在网页内合成”：官方 [main.js](https://github.com/MediaBrowser/emby-theater-electron/blob/db0f4c814ee1e7d9b5f50010065c5cb64a20357e/main.js) 的 `onLoaded`（265）将主窗口 HWND 暴露为 `PlayerWindowId`，`libmpv.js:550` 将其传入 mpv `wid`；Windows 配置非 `libmpv` VO 时，`play:487–491` 会令网页视频容器透明。Pepper 控制通道与具体 VO 呈现方式需要分别描述。

## Carnival 增加的背景行为

`vendor/carnival/electronapp/plugins/libmpv.js`：

- 399–405：首次创建容器且提供视频 backdrop 时设置背景图/背景样式；全屏还设置 onTop。
- 415：初建 embed opacity 为 0。
- 488–504：等待 `core-playing` 后将 embed opacity 设为 1，按 VO 条件处理容器 opacity，再进入 `showOsd`。
- 635–647：OSD/窗口播放移除背景和 onTop 的样式类；没有清除 inline `backgroundImage`，也没有在每次复用时刷新该背景。
- 692–704：仍区分临时 `stop(false)` 与销毁。该背景代码不能直接解释为每次切集都会准备下一集海报。

实际 Carnival `www/modules/common/playback/playbackmanager.js:2293–2321` 从现有队列选择 next / previous，并进入原有 `playInternal`；`:890–900` 在同一播放器承接时调用 `stop(false)`。这条本机 Web 调用链与上述适配层复用语义吻合，但其精确官方 Web 版本仍保持未确认。

## 当前发生过的三类改动

| 阶段 | 已核验历史 | 与呈现相关的变化 |
|---|---|---|
| Native Helper 迁移 | `0511786` 增加 adapter；`7e130c4` 于 2026-09-17 退役 Pepper | 新建独立黑色视频承载窗口，位于透明主窗口后方；helper 管理 native child，renderer 通过 IPC 控制显示 |
| Electron 44 升级 | 2026-09-19 升级系列；`8be3b6b` 修正 apphost 命令解析 | 更换完整 runtime 并适配窗口打开/内部协议；Native Helper 迁移在此前已发生，不是该升级提交临时新增 |
| 切集过渡层 | `15c3a0e` 于 2026-09-24 新增，随后修正图片铺满和取消清理 | 点击切集时插入黑底、异步请求图片，`core-playing` 后进入淡出；这是 Enhanced 新行为 |

`git log 58bea97^..faf8c81 -- src/electronapp/plugins/libmpv.js src/electronapp/native-helper/service.js src/electronapp/native-helper/client.js` 为空：该 Electron 升级区间没有修改这三个播放文件。升级期已闭合的旧冻屏问题是 apphost `loaded/` 命令解析与既有窗口加载链，不能直接迁用为本次切集短闪的根因。

现代 Electron 不能直接保留旧 Pepper hosting。官方 [Chromium 129 roll / PPAPI 删除提交](https://github.com/electron/electron/commit/c9b7806418d145abf4098ec60b964bfd24b2369c) 删除 Pepper patch、host factory 和 helper。本项目历史隔离检查还记录 18.3.15/21.4.4 通过、22.3.27/28.3.3 在 ready 前失败；本轮核对了该历史报告，没有重跑旧二进制，也不把已测失败点当成精确首个不兼容版本。

## 与本次短闪的对应关系

当前 Native Helper `service.js` 的 stop 分支先设置 `surfaceWanted=false` 并隐藏 surface；renderer 在 `core-playing` 后把逻辑 endpoint 的 opacity 设为 1，`client.js` 将它翻译为异步 `set-visible` 通知。此时“播放核心开始工作”“主进程收到显示通知”“屏幕出现新视频帧”并非同一个完成事件。

过渡层的黑底先插入 DOM，然后才设置 `image.src`；`beforeTeardown` 等待网页两次 RAF，不等待图片 load/decode。因此海报就绪前出现黑底有明确的代码路径，并在此前受控连续采样中观察到。当前不能把这一路径宣称为用户全部短闪的唯一根因。

海报后的短黑仍未稳定复现；淡出以 `core-playing` 和网页绘制时机为依据，不具备 native 首帧呈现确认。该差异是待验证的时序风险，尚不是已闭合的尾段黑帧根因。用户包上一集未进入 wrapper 是独立的确定遗漏，已在 `456df8e` 补齐，但尚无新用户视觉 PASS。

## 按旧逻辑对齐的工作方向

以原有队列选择、同播放器复用、临时 stop 与真正 destroy 分离为基线，保持 PlaybackManager、Session 和 source identity 所有权。下一步优先核查 Native Helper 对这套生命周期的呈现映射，以及已有过渡层的接入边界；不把增加图片预加载当成默认修复前提。是否调整具体隐藏/显示点，需要匹配的可见证据，不能仅凭旧版源码声称新结构已等价。

本轮验证：固定官方源码、Carnival 源码、当前候选源码与 Git 历史交叉核对；文档链接与 `git diff --check` 检查。未重跑构建/测试、未进行真实播放或旧新视觉 A/B；切集视觉状态继续为 `USER VISUAL FAIL`。
