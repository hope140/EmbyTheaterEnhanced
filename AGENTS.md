# 协作规范

本文件是 ETE（EmbyTheaterEnhanced）的代理协作入口。[协作细则](docs/AGENT_WORKFLOW.md)集中维护模型建议、主／子代理分工和交接要求；命令见[贡献指南](docs/CONTRIBUTING.md)，证据要求见[测试与验收](docs/TESTING.md)。这些文档不扩大用户授权或运行环境权限。

修改前阅读[架构](docs/ARCHITECTURE.md)、[项目状态](docs/PROJECT_STATUS.md)、[维护注意事项](docs/LESSONS_LEARNED.md)及相关合同，核对仓库身份、最新远端基线、Git 状态与相关源码。保留已有工作；独立任务使用独立分支／工作树，不读写其他任务工作区。

- 维护 src/ 与 native/，tools/build.ps1 生成 runtime；vendor 输入和原始归档只读。使用锁文件及固定工具链，不自动升级依赖。
- STRM 只替换最终 source。PlaybackManager、Item、MediaSource、PlaySession、Session/WebSocket、远控与 Together 生命周期保持既有归属；失败继续 Mount/Native，取消终止旧请求。
- Item.Path 是 sidecar identity，MediaSource.Path 是 source identity；DirectUrl 的 User-Agent 只作为校验过的 file-local 选项使用。
- 不修改现用客户端、个人播放器配置或服务器数据。提交、推送、PR、合并、发布、部署和系统安装按当前用户授权执行。
- 最小范围修改，运行相关验证并更新 PROJECT_STATUS 与 DEVELOPMENT_LOG。按测试合同区分证据层级，按[公开 CI](docs/PUBLIC_CI.md)核对准确 SHA；未执行、失败、跳过和受阻项如实说明，不降低门禁。
- 主代理负责用户沟通、授权边界、整合与最终验收；子代理只承担明确划定的工作。模型、推理强度与服务模式沿用用户已确认设置，具体建议与派发要求见协作细则。
- 公开资料只保留用户说明、技术合同、可复现验证方法、必要源码来源与许可信息。个人环境、原始诊断和内部工作记录保存在仓库外，不进入公开提交。
