# 0.2.5 测试版发布记录

发布时间：2026-10-09 13:27:06（UTC+8）。Release ID：407543805。

本次为 Windows x64 测试版（Pre-release）。正式 Latest 继续为 [v0.2.2](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2)。

### 下载

- [Windows x64 安装包（.exe）](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.5/EmbyTheaterEnhanced-0.2.5-test-win-x64-setup.exe)
- [SHA256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.5/EmbyTheaterEnhanced-0.2.5-test-win-x64-setup.exe.sha256)
- [安装包来源记录](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.5/EmbyTheaterEnhanced-0.2.5-test-win-x64-setup.exe.provenance.json)

GitHub 自动生成的 Source code 附件是源码归档；安装客户端请下载上面的 `.exe`。

### 本次变化

- 增加有限、脱敏的播放诊断，帮助关联播放请求、原生文件事件、切集持帧动作及 Renderer 错误的包内位置。日志有限频和容量边界，诊断异常不参与播放结果。
- 源码仓库增加离线阶段分析工具，按显式提供的单份日志分析阶段关系；缺失、归属冲突或无法确定的时间保持不可用。这是问题定位工具，不代表实际播放耗时已改善。
- 构建过程绑定准确源码提交、固定工具链和依赖文件集合；安装包补齐项目通知与来源索引，并加强构建输出写入检查。
- 安装器不再保存构建源文件的修改时间。同提交、同固定输入下重新构建的两份 runtime 与两份原始安装器字节一致。

本版继承 v0.2.4 的设置页一致性修正，以及此前的原生持帧切集和全屏窗口修复。Electron、libmpv、依赖版本和既有播放身份链保持当前基线。

### 验证范围

- 最终 sourceCommit 全量测试 535/535、writer 定向 17/17 通过，均为 0 失败、0 跳过。
- 两个独立 runtime 各 2,136 文件，完整路径与 SHA256 一致；source/runtime/native/Electron、34 项提交输入、精确依赖和 4 份通知检查通过。
- 两份原始安装器各 175,631,770 bytes，SHA256 相同。主安装器完整性通过，解包 2,136/2,136 文件逐项匹配 runtime；对照安装器为同字节证据。PE FileVersion/ProductVersion 均为 0.2.5。
- About 真实 maintenance IPC 读回版本 0.2.5 与准确 sourceCommit；appData/userData 在 bootstrap 前隔离并读回，运行结束进程残留 0。
- 隐藏假服务/合成媒体首轮在 queue-play 阶段达到 25 秒超时。新 profile 复验跑到 pipeline-complete，普通/STRM 的暂停、跳转、恢复、身份和 Session 报告、generation 接管与 Stop 防迟到加载通过；完整 runner 仍返回失败，保留 next.selected=false 与假 CD2 cancelCount=1（门槛为 2）。回读历史 3b158f6 原始失败证据，这两项及相邻断言一致；未修改断言或继续重复至通过。
- 复验中 123 条诊断记录、两类安全 Renderer 位置、12 项请求关联、raw canary 排除及 sourceCommit 校验通过；同份合成日志的离线分析完成。该诊断结果不替代完整 runtime runner 的失败状态。

### 保留的边界

- 本轮未执行系统安装/升级/卸载、真实 Emby/CD2、真实远控、可见首帧、HDR 或多显示器验收。隐藏测试中的 `file-loaded/core-playing` 不能证明屏幕首帧。
- 历史快速连续 double-Next 夹具存在 `selected` 断言时序限制；本次隔离结果只代表对应单次运行，不把它升级为稳定性已全面关闭。
- 既有全屏跨编码 Previous 的 107ms 采样间隔仍为 INCONCLUSIVE；播放后全屏圆角和其他观察项继续按 [Known Issues](https://github.com/hope140/EmbyTheaterEnhanced/blob/codex/release-v0.2.5-test-20261009/docs/KNOWN_ISSUES.md) 跟踪。
- 构建依赖外部固定材料。patched libmpv 的完整构建链、Host 精确构建关系，以及部分 Web/资产/辅助组件材料仍有缺口；[来源索引](https://github.com/hope140/EmbyTheaterEnhanced/blob/v0.2.5/docs/SOURCE_MATERIALS.md) 随安装包提供。本次字节重复性不表示所有第三方组件均可从公开源码重建。

### 产物身份

- 版本 / Tag：`0.2.5` / `v0.2.5`
- sourceCommit：`3ab10c94d75659c0a421b729aac3147afa680751`
- 安装包：`EmbyTheaterEnhanced-0.2.5-test-win-x64-setup.exe`
- SHA256：`76d7766cc824bf65f585cd89f0e68841628b2063381aa85392513ed1653d0d65`
- 文件大小：`175,631,770` bytes

该 tag 精确对应构建源码；发布分支后续的验收与导航文档提交不替换产品 sourceCommit。

## 工程与证据

本次从完整构建复核分支5af8443建立独立发布分支，产品提交3ab10c9统一版本并从提交字节正式构建。两次runtime分别位于dist/ETE-0.2.5-3ab10c9-a-win-x64与后缀b目录。与原1a05f88候选只有8个版本/来源记录文件不同，余下2128文件字节一致；源码src/native/tools/installer/vendor保持审核基线。

[结构化验证与发布证据](evidence/release-v0.2.5-20261009.json)分别记录静态、构建、安装器、隐藏runtime和真实验收边界。原0.2.4及更早验收继续保持各自版本/提交归属。

## 发布回读

- Release 407543805 为已发布的 Pre-release（draft=false），正式 Latest 仍为 v0.2.2。Annotated tag object为632f783e18c5e46d38d33c14e8f5693096a89b19，解引用精确等于产品sourceCommit。
- 三个asset均uploaded，大小和GitHub SHA256 digest逐项匹配本地；发布说明读回一致。完整下载的`.sha256`与`.provenance.json`分别匹配本地，校验文件内的EXE SHA也一致。
- 完整EXE回下载未完成：串行约50KB/s，Schannel分段传输遇到接收错误56，最后一次Node/OpenSSL分段续传在240秒边界结束。共收到171,530,320 / 175,631,770 bytes，12/16段完整；没有将部分文件重组或标为完整SHA通过。两种链路的公开首1MiB与本地对应字节相同。所有下载进程已结束，部分材料保留在本次工作树的ignored目录。
- 发布前后的6个旧Release、9个旧asset的内容、标记和身份保持；30个既有远端refs未变，main仍46e995ef83fca7f7a882e3dc633bdcc2d2d521c7。本次只新增发布分支、准确tag和测试版。
- 发布后文档提交保存下载导航、已执行验证和完整回下载限制；该文档HEAD不作为安装包sourceCommit。
