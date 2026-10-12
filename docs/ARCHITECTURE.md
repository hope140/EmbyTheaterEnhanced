# 架构与维护边界

普通媒体链路为 Emby Web → PlaybackManager → libmpv adapter → Electron main Native Helper supervisor → Windows helper → 内嵌 libmpv。Native Helper 是唯一生产 bridge；旧 Pepper/PPAPI 不进入 runtime。

PlaybackManager 拥有 Item、MediaSource、MediaSourceId、PlaySessionId、Session/WebSocket、进度、远控与 Together 生命周期。STRM Resolver 只决定最终 loadfile source，不重建播放会话。Item.Path 是 sidecar identity，MediaSource.Path 是 source identity，options.url 是原生播放 source；普通媒体和 Transcode 保持原生链路。

STRM 按持久化 rules 的 cloud-first、mount-first 或 custom 顺序尝试 DirectUrl、CD2 同源 HTTP、Mount 和 Native。main 持有 Token、gRPC 与映射；renderer 只通过窄 IPC 请求结果。source/cloud/mount 三个前缀分开，严格路径边界、最长前缀匹配和拒绝路径穿越。DirectUrl 只开放经过校验的 file-local User-Agent，未知 additionalHeaders 回退同源 HTTP。

当前 CD2 stages 共享 1200ms absolute budget，连接最多 200ms、Find 最多 350ms、下载阶段最多 500ms。连续 direct/same-origin 尝试复用 Find 结果。RPC/mapping/响应失败继续 Mount/Native；Abort/superseded 向上终止。PlaybackManager request id、libmpv generation、AbortSignal、IPC request id 和 gRPC cancel 共同阻止迟到响应加载旧媒体。

媒体替换复用 request-bound presentation intent 与原生 prepare/stop/arm/reveal，已有 intent 在前置异步阶段随新请求接管。未 arm 的准备持帧有独立 15 秒上限；terminal Stop、失败、音频切换和退休请求清理所属状态。Session 与远控仍由原链拥有。

透明主窗口拥有 UI/OSD/输入，独立 video host 承载 helper child HWND。窗口与全屏状态由 main 管理；Helper 失败不退回旧 bridge。销毁共享 Promise，并等待所属进程退出和资源清理，保留错误。

About 校验固定 provenance/manifest 与二进制身份，实时运行状态独立读取；缺失信息保留 UNKNOWN/NOT AVAILABLE。诊断旁路复用 logger 与 sender 校验，不改变 source 或播放时序。

构建由 tools/build.ps1 从固定 sourceCommit 的 Git blob、生成器和锁定外部输入组装。source-provenance、runtime-provenance 和 build-manifest 分层记录；完整运行时仍依赖仓库外输入。Electron 使用固定 44.4.2 Windows x64 完整树。

[STRM](STRM_RESOLVER.md) · [配置](STRM_RESOLVER_SETTINGS.md) · [DirectUrl](CD2_DIRECT_URL.md) · [Native Helper](NATIVE_HELPER_BRIDGE.md) · [构建](PACKAGING.md)
