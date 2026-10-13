# 协作规范

修改前阅读 docs/ARCHITECTURE.md、docs/PROJECT_STATUS.md、docs/LESSONS_LEARNED.md，核对 Git 状态与相关源码。保留已有工作。

- 维护 src/ 与 native/，tools/build.ps1 生成 runtime；vendor 输入和原始归档只读。使用锁文件及固定工具链，不自动升级依赖。
- STRM 只替换最终 source。PlaybackManager、Item、MediaSource、PlaySession、Session/WebSocket、远控与 Together 生命周期保持既有归属；失败继续 Mount/Native，取消终止旧请求。
- Item.Path 是 sidecar identity，MediaSource.Path 是 source identity；DirectUrl 的 User-Agent 只作为校验过的 file-local 选项使用。
- 不修改现用客户端、个人播放器配置或服务器数据。提交、推送、PR、合并、发布、部署和系统安装按当前用户授权执行。
- 最小范围修改，运行相关验证并更新 PROJECT_STATUS 与 DEVELOPMENT_LOG。区分单元、隔离 runtime、真实服务、视觉与安装证据；未执行项如实说明。
- 明确规格的测试、脚本与文档优先 GPT-6 Luna；跨模块实现优先 GPT-6.1 Sol；高风险设计与最终复核优先 GPT-6 Astra。按当前运行时支持选择，主线程沿用用户配置，派发记录注明实际型号与角色；历史结果保留原型号身份。
- 公开资料只保留用户说明、技术合同、可复现验证方法、必要源码来源与许可信息。个人环境、原始诊断和内部工作记录保存在仓库外，不进入公开提交。
