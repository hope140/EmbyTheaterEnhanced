# v0.2.9 第二阶段 A：外挂字幕竞态隔离验收

日期：2026-10-10。基线为 `v0.2.8@888310de`；候选仅位于独立 `codex/v029-subtitle-race-exp` 工作树。结论：**READY_FOR_INTEGRATION_REVIEW**，仅指此最小候选可供正式整合审查，尚不是 main、发布包或真实 Emby/115 用户验收。

## 修复 diff 与 RED/GREEN

完整产品 diff 只在 `src/electronapp/plugins/libmpv.js` 增加播放器实例级 `subtitleSelectionSequence`，在每次 `setSubtitleStream` 入口递增并保存当前 `mediaSource` 引用；700ms Promise 回调只有当前 Play、最新序号、同一 MediaSource 同时成立才调用原有 `sub-add`。原等待时间、命令参数、缓存、mpv 设置、PlaybackManager、Session、Native Helper、IPC 均未变。Stop 和新 Play **不增加字幕序号**，而是经既有 Play 归属失效；不能将这两种机制混称。

Phase 1 的原始 8 项用例未删除或削弱断言，未修复 v0.2.8 的 RED 为 **8 项中 4 通过、4 失败**（A→B、A→Internal B、A→Off、A→B→A）。随后增加“timer 已触发但 Promise callback 未运行时 Off”“默认外挂字幕随后 Off”两项，本阶段再增加重复 A→A 一项。现有完整 AMD 插件、公开 `player.play()`/`player.setSubtitleStreamIndex()` 入口与虚拟时钟的 **11/11 GREEN**；包括 A→B、A→Off、A→B→A、A→A、Stop、新 Play 及延迟回调拒绝。原始 RED/GREEN TAP 仍在本工作树忽略的 `.work` 目录。

## 真实 Helper/mpv 与桌面画面

测试使用准备脚本校验的 Electron 44.4.2、固定 libmpv DLL，以及从本分支原生源码编译的普通 Native Helper。独立 profile/runtime 与合成的 45 秒本地 MKV、内容分别为 `EXTERNAL A` / `EXTERNAL B` 的 SRT 仅在本工作树 `.work` 中。完整生产 `libmpv.js` AMD 插件通过其公开字幕选择入口，经真实 main service、renderer bridge、Helper 和 mpv 执行；Emby Item/MediaSource 是合成输入，未连接真实服务器。每个快速操作相隔 **100ms**，均落在原 700ms 等待内；最终等待 850ms 后回读 Helper/mpv `sid`、`track-list`、`core-idle`，同时获取 mpv 字幕帧和屏幕中独立 runtime 窗口的实际可见截帧。前景 UI 必须透明，符合产品 Native Helper 视频承载窗口的叠放方式；不透明探针曾遮挡真实视频，修正后才采用最终 `visible-6` 证据。

最终 [匿名运行记录](evidence/v029-subtitle-visible-result.json) 共 8/8 场景通过，Helper operation error 为 0。探针对黑色合成画面的字幕区域统计亮像素：选中字幕须超过 100，Off 须少于 20；遮挡视频或误截其他桌面内容不能作为 PASS。单次 A/B 均选中 1 个外挂字幕轨；A→B 仅提交 B、[桌面显示 B](evidence/v029-subtitle-visible-A-to-B.png)；A→Off 无旧 `sub-add`、`sid=false`、选中字幕轨 0、[桌面无字幕](evidence/v029-subtitle-visible-A-to-Off.png)；A→B→A 仅提交最后的 A、[桌面显示 A](evidence/v029-subtitle-visible-A-to-B-to-A.png)。重复 A→A 只提交一次最新 A。Stop 未提交旧 A，`core-idle=true`；换集后只提交新 Play 默认 B，路径归属变为第二个合成媒体、[桌面显示 B](evidence/v029-subtitle-visible-new-Play.png)。[单次 A](evidence/v029-subtitle-visible-single-A.png) 与 [单次 B](evidence/v029-subtitle-visible-single-B.png) 证明正常外挂字幕仍能选择。两个媒体文件内容相同而路径不同，仅用于区分 Play 身份。

mpv 内部截帧与桌面截帧分别保存 SHA256；同一内容的 A/B/Off 对应各自一致，人工逐张查看了最终六张桌面证据。所有场景无错字幕、无未选字幕，播放态 `core-idle=false`（Stop 除外），没有观察到播放中断。测试使用合成 Session 事件接收器；**真实 Emby Session/WebSocket 和真实 STRM/115 仍 NOT_EXECUTED**，不能据此宣称真实服务器状态无异常。

## 回归与边界

`node --test` 覆盖字幕所有 11 项、Native Helper client/service/protocol/lifecycle/terminal/diagnostics/version、PlaybackManager 请求与 Session 归属、播放时序和 libmpv stats，**151/151 PASS**。探针隐藏和前台可见运行均为 8/8 PASS；最终采用带亮像素自动校验的前台 `visible-6`。测试文件、脚本与产品源码 `node --check`、`git diff --check` 和有限敏感字段扫描通过。测试没有调整缓存、没有扩大生产 IPC 权限，也没有修改现用客户端。

本候选的剩余验收：在后续正式整合审查后，用用户真实 Emby 外挂字幕（包括 STRM/115）确认字幕加载、Session/远控与安装版表现；不得将合成媒体结果提升为这些层次的 PASS。已经发送给 Helper 的 `sub-add` 无法被本门槛撤回；它只阻止尚在 700ms 回调中的旧命令。
