# 架构与维护边界

普通媒体链路为 Emby Web → PlaybackManager → libmpv adapter → Electron main Native Helper supervisor → Windows helper → 内嵌 libmpv。Native Helper 是唯一生产 bridge；旧 Pepper/PPAPI 不进入 runtime。

PlaybackManager 拥有 Item、MediaSource、MediaSourceId、PlaySessionId、Session/WebSocket、进度、远控与 Together 生命周期。STRM Resolver 只决定最终 loadfile source，不重建播放会话。Item.Path 是 sidecar identity，MediaSource.Path 是 source identity，options.url 是原生播放 source；普通媒体和 Transcode 保持原生链路。

STRM 按持久化 rules 的 cloud-first、mount-first 或 custom 顺序尝试 DirectUrl、CD2 同源 HTTP、Mount 和 Native。main 持有 Token、gRPC 与映射；renderer 只通过窄 IPC 请求结果。source/cloud/mount 三个前缀分开，严格路径边界、最长前缀匹配和拒绝路径穿越。DirectUrl 只开放经过校验的 file-local User-Agent，未知 additionalHeaders 回退同源 HTTP。

当前 CD2 stages 共享 1200ms absolute budget，连接最多 200ms、Find 最多 350ms、下载阶段最多 500ms。连续 direct/same-origin 尝试复用 Find 结果。RPC/mapping/响应失败继续 Mount/Native；Abort/superseded 向上终止。PlaybackManager request id、libmpv generation、AbortSignal、IPC request id 和 gRPC cancel 共同阻止迟到响应加载旧媒体。

新资源候选仅在目标 FindFileByPath 确认 NOT_FOUND 后允许一次有限恢复：父目录最多 3 层且不越映射边界，GetSubFiles 流必须完整结束及最终 OK，目标最多重查一次。目录探测/刷新块最多 1800ms，恢复总期限最多 3000ms；正常命中保持原 1200ms。单锁、30秒冷却和取消限制重复/迟到工作，详见 [恢复合同](CD2_NEW_RESOURCE_REFRESH.md)。

媒体替换复用 request-bound presentation intent 与原生 prepare/stop/arm/reveal，已有 intent 在前置异步阶段随新请求接管。未 arm 的准备持帧有独立 15 秒上限；terminal Stop、失败、音频切换和退休请求清理所属状态。Session 与远控仍由原链拥有。

透明主窗口拥有 UI/OSD/输入，独立 video host 承载 helper child HWND。窗口与全屏状态由 main 管理；Helper 失败不退回旧 bridge。销毁共享 Promise，并等待所属进程退出和资源清理，保留错误。

About 校验固定 provenance/manifest 与二进制身份，实时运行状态独立读取；缺失信息保留 UNKNOWN/NOT AVAILABLE。诊断旁路复用 logger 与 sender 校验，不改变 source 或播放时序。

About 的 M01 状态模型分别展示已校验包内 libmpv 文件 SHA、编译期预期版本/API/SHA 和 ready Helper 握手报告的运行版本/API/受限能力子集。包内文件 SHA 不表示当前加载映像 SHA；当前映像哈希与 Native 属性回读仍为 UNKNOWN。固定 Native render path 为 gpu-next/D3D11，mpv-vo/mpv-gpuapi 设置页值不作为 Native property 应用。

构建由 tools/build.ps1 从固定 sourceCommit 的 Git blob、生成器和锁定外部输入组装。source-provenance、runtime-provenance 和 build-manifest 分层记录；完整运行时仍依赖仓库外输入。Electron 使用固定 44.4.2 Windows x64 完整树。

CustomCssJS 作为固定源哈希的 Web overlay 构建：服务器/本地 CSS 仍按既有选择加载；服务器/本地 JavaScript 配置保留，但不会在可信 renderer 中求值，检测到旧脚本选择或无效 JS 配置时显示一次提示。JS 配置解析失败不阻断 CSS。该边界只关闭 CustomCssJS 执行入口，不代表 renderer 已整体隔离；应用 preload 的 window.fs/window.ipc 能力仍由其他产品代码使用。

固定源哈希的 item 详情 overlay 仅退役旧外置播放器按钮与 fromPlayEnded 计时器；externalplayers/autoplay 旧值保持不写不删，普通下一集仍由 PlaybackManager 的 Emby EnableNextEpisodeAutoPlay 与 PlayQueue/nextTrack 管理。构建排除旧 Pepper input；两份旧 Carnival 批处理因动态/外部 Host 消费者和手工工作流尚未闭合而继续保留。旧 AppHost sleep/shutdown/restart 协议动作已从 Web 能力广告、Web 调用入口、命令白名单和 main 分派移除；未知命令仍完成空响应，windowstate、exit、loaded、音视频通知与安全外链链路保持。

[STRM](STRM_RESOLVER.md) · [配置](STRM_RESOLVER_SETTINGS.md) · [DirectUrl](CD2_DIRECT_URL.md) · [Native Helper](NATIVE_HELPER_BRIDGE.md) · [构建](PACKAGING.md)

插件设置候选在受控 Web overlay 中增加窄路由/依赖映射及插件页导航事务，维护模块复用原 API client、字段编辑器和通知出口；共享播放、认证和 input/API 模块保持。来源、取消、错误与验收边界见 [兼容合同](PLUGIN_SETTINGS_COMPATIBILITY.md)。
