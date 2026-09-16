# 待办

- [x] 原归档哈希、解包、源码与 vendor 划分。
- [x] 项目知识库与当前状态。
- [x] 构建 portable runtime、复核输入文件。
- [x] 编译 setup.exe、解包并核对载荷。
- [x] 隔离 Electron Web UI 启动、播放器注册检查。
- [x] 播放链、Session/远控静态审计。
- [x] 禁用外置入口、添加容错诊断及测试。
- [x] Windows host 启动，以及可见窗口中的独立内嵌播放器合成媒体测试（分层验证）。
- [x] 执行授权独立目录 setup 安装、快捷方式启动、0.1.0→0.1.1 覆盖升级与卸载测试。
- [x] 真实 STRM 两集播放与 Item/MediaSource/PlaySession 验证；普通文件库内无样本，保留本地验证。
- [x] 真实服务器 Pause / Resume / Seek / Stop / Next 验收；WatchTogether 按用户确认的后台控制口径通过。
- [x] 配置加载规则、playing 属性及真实 gpu-next/d3d11va 硬解验证；HDR/画质效果样本未覆盖。
- [x] 查明缓存整数回传截断，修复精确诊断并验证 5 档容量；确认 Windows Known Folder 与 MPV_HOME 配置路径机制。
- [x] 本地 PlaybackManager → libmpv、播放报告和远控消息分派 fixture 集成验证，包含 NextTrack。
- [ ] 核对来源未明的 Web 资源和精确 native bridge 构建来源。
- [ ] 用户授权后初始化 Git 并按小范围提交。

## Post-Bridge

- [ ] **CD2 Cold Directory Discovery Recovery**（POST-BRIDGE / DEFERRED / CORRECTNESS RECOVERY）
  - 真实观察：有效 STRM target 初次可能得到 CD2 `FindFile = not_found`，直到先手动浏览或枚举对应 CloudDrive2 父目录；浏览到 exact directory/file 后，同一 ETE playback 可成功通过 CD2 DirectUrl 解析。
  - 归因：CD2 path visibility / cold directory discovery false-negative，不是 DirectUrl timeout、libmpv failure、Session failure 或 media decoding issue。
  - 后续方向：`FindFile(target)` definitive `not_found` → deterministic path hydration → find nearest known ancestor → 仅枚举 target path segments → 仅重试一次 `FindFile`；命中继续正常 DirectUrl/same-origin flow，未命中继续现有 Mount/Native fallback。
  - 硬约束：no recursive scan、no full-tree refresh、no fixed parent-level heuristic；仅 definitive `not_found` 触发 hydration；timeout/transport/auth errors 不触发；遵守 absolute resolver budget、Abort/generation safety、single retry、fail-open；不修改 PlaybackManager/Session。

- [ ] **Next Episode Prefetch**（POST-BRIDGE / DEFERRED）
  - 在固定 playback-progress threshold 后 best-effort 预热 STRM/CD2 下一集。
  - 真正 NextTrack 仍走正常 PlaybackManager → Resolver → fresh DirectUrl，不复用 Session/PlaySessionId 或长期缓存 URL。
  - 先调查 CloudDrive2 是否有针对真实云文件的 prefetch/read-ahead API；失败不得影响当前播放。
  - Future next-episode warmup may reuse CD2 path hydration first; Phase 1 may warm only metadata/path visibility before considering media-byte prefetch。

第一轮按当前用户确认口径关闭。后续 Mount、CD2 和自动映射需另行确认范围，尚未进入实现。
