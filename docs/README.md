# 文档索引

截至 2026-11-11，[v0.4.21 测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.21) 已公开发布，正式 Latest 仍为 v0.4.0。发行源码为 bd3b32e69b7ac6a2243ebf831ac60f58d4aff0d9，产品代码与已验收的 a83f9fa81702 一致；公开标准包和旧验收包分别记录来源与哈希。 [v0.4.21 发行核验](V0421_RELEASE_VERIFICATION.md)。

## 使用客户端

| 需要了解的内容 | 入口 |
| --- | --- |
| 版本选择与下载 | [项目首页](../README.md#下载安装) · [全部 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases) |
| 校验、安装、手动更新、卸载与 STRM 配置 | [用户指南](USER_GUIDE.md) |
| 更新、缓存、系统媒体预览等常见问题 | [常见问题](USER_GUIDE.md#常见问题) · [已知问题与验证范围](KNOWN_ISSUES.md) |
| 导出日志与反馈 | [反馈步骤](USER_GUIDE.md#问题反馈) · [诊断字段合同](CLIENT_DIAGNOSTICS.md) |
| 各版更新内容 | [变更记录](../CHANGELOG.md) |
| 项目许可与第三方来源 | [许可说明](LICENSING.md) · [第三方通知](../THIRD_PARTY_NOTICES.md) |

当前以 ETE 0.4.21 正常使用观察为主，EWT 已通过使用验收并进入约一周观察期；稳定后再确认正式发布。提前 EOF 的原始原因仍未确认。版本入口以页首为准，当前计划统一见[待办清单](NEXT_RELEASE_SCOPE.md#当前待办清单)，历史排期不作为正在运行的任务。

## 开发与技术合同

从[贡献指南](CONTRIBUTING.md)开始：目录结构、依赖准备、纯文档检查、公开回归及 Windows 构建命令集中在该页。[公开 CI](PUBLIC_CI.md)解释现有工作流的检查路线、平台限制与未执行项。

| 主题 | 合同与参考材料 |
| --- | --- |
| 代理协作 | [统一入口](../AGENTS.md) · [模型建议、分工与交接](AGENT_WORKFLOW.md) |
| 播放与解析 | [架构](ARCHITECTURE.md) · [播放链路](PLAYBACK_PIPELINE.md) · [Native Helper](NATIVE_HELPER_BRIDGE.md) · [STRM](STRM_RESOLVER.md) · [Seek／EOF 调查阶段记录](SEEK_EOF_DIAGNOSTICS.md) |
| 缓存及更新 | [详情缓存](DETAIL_PAGE_CACHE.md) · [缓存管理](CACHE_MANAGEMENT.md) · [手动更新](MANUAL_APP_UPDATE.md) · [更新交接安全](UPDATE_HANDOFF_SAFETY.md) |
| Windows 媒体集成 | [v0.4.3 接入范围](V043_NATIVE_PREVIEW.md) · [早期实验合同](WINDOWS_MEDIA_CONTROLS.md) |
| 构建与材料 | [构建合同与历史记录](PACKAGING.md) · [Actions 测试包合同](ACTIONS_TEST_PACKAGE.md) · [源码材料索引](SOURCE_MATERIALS.md) · [依赖来源研究](DEPENDENCY_RESEARCH.md) |
| 测试与发行 | [测试分层与材料用例](TESTING.md) · [Release 规范](RELEASE_CONVENTIONS.md) · [发行说明模板](templates/RELEASE_TEMPLATE.md) |

历史候选与编写阶段的说明见[历史索引](HISTORY.md)，当前开发命令以贡献指南为准。

公开离线检查、完整固定材料测试、实际客户端、真实服务器、安装与硬件验收各有范围，通过其中一层不能替代其他层。

## 当前计划与历史记录

- [项目状态](PROJECT_STATUS.md)：当前发行、观察项和阻塞。
- [后续范围](NEXT_RELEASE_SCOPE.md)：唯一待办入口、取消项与启动条件。
- [项目方向](ROADMAP.md)：中长期取舍；[维护记录](DEVELOPMENT_LOG.md)：近期变化。
- [历史记录索引](HISTORY.md)：旧排期、发行核验、调查和原始阶段记录。

来源、许可与验证边界继续按各组件合同核验；历史候选不是当前待办。
