# 文档索引

## 使用客户端

| 需要了解的内容 | 入口 |
| --- | --- |
| 版本选择与下载 | [项目首页](../README.md#下载安装) · [全部 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases) |
| 校验、安装、手动更新、卸载与 STRM 配置 | [用户指南](USER_GUIDE.md) |
| 更新、缓存、系统媒体预览等常见问题 | [常见问题](USER_GUIDE.md#常见问题) · [已知问题与验证范围](KNOWN_ISSUES.md) |
| 导出日志与反馈 | [反馈步骤](USER_GUIDE.md#问题反馈) · [诊断字段合同](CLIENT_DIAGNOSTICS.md) |
| 各版更新内容 | [变更记录](../CHANGELOG.md) |
| 项目许可与第三方来源 | [许可说明](LICENSING.md) · [第三方通知](../THIRD_PARTY_NOTICES.md) |

截至 2026-11-09，正式版为 [v0.4.0（Latest）](https://github.com/hope140/EmbyTheaterEnhanced/releases/latest)，最新公开测试版为 [v0.4.19](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.19)。测试版保留缓存、手动更新、系统媒体控制与提前下载等已有功能；v0.4.19 修复字幕选轨、改善首页刷新与返回位置，并补充配置／CD2 诊断。播放成功率退化和提前 EOF 的根因仍未确认。main 的原生优先误报回退修复待后续发布，独立验收包 `a5287159` 尚待用户验收、未合入 main 或发布。功能是否发布以对应 Release 和 Tag 为准，主分支文档不改变历史安装包。

本轮先完成现有测试与稳定性验收，再准备正式版，不插入新需求，版号和日期未定。预载、播放暂存、最近搜索已取消，提前下载保留；飞牛继续独立开发，安排在本轮正式版之后发布。WOL／服务器自动发现仅列为正式版后精简候选。具体范围与验证条件见[当前范围](NEXT_RELEASE_SCOPE.md)及[路线图](ROADMAP.md)。

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

**阅读阶段记录时**：技术文档保留早期分支、候选和当时的待验收说明。已发布版本准备记录中的“未合并／未发布”按其日期和准确源码理解；不据此把尚待验收的 `a5287159` 写成已发布。Windows 媒体实验“尚未纳入发行”、手动更新“独立候选”、构建合同“尚无干净 runner 成功”也描述其编写阶段，已发布状态以页首和对应 Release 为准。首页布局／流畅度的显式测试参数不等同于 v0.4.2 已发布的详情持久缓存；普通用户无需按实验启动脚本开启已发布功能。当前开发操作入口为贡献指南，具体材料身份仍按各组件合同核验。

公开离线检查、完整固定材料测试、实际客户端、真实服务器、安装与硬件验收各有范围，通过其中一层不能替代其他层。

## 发布记录与后续范围

- [v0.4.19 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.19)：字幕选轨、首页刷新和配置／CD2 诊断；[变更记录](../CHANGELOG.md)。待验收包与 main 待发布修复见[项目状态](PROJECT_STATUS.md)。
- [v0.4.13 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.13)：音轨语言多选与音轨／字幕语言排序；[发布后核验与候选历史](V0413_LANGUAGE_PREFERENCES.md)。
- [v0.4.12 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.12)：更新退出与安装交接修复、提前 EOF 定位日志；[发布后核验与候选历史](V0412_RELEASE_VERIFICATION.md)。
- [v0.4.11 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.11)：字幕首选语言多选；[发布后核验与候选历史](V0411_RELEASE_VERIFICATION.md)。
- [v0.4.10 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.10)：片头归属修复及定位诊断；[发行核验](V0410_RELEASE_VERIFICATION.md)。
- [v0.4.9 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.9)、[v0.4.8 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.8)、[v0.4.7 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.7)：焦点修复、下载筛选与提前下载；核验见 [v0.4.9](V049_RELEASE_VERIFICATION.md)、[v0.4.8](V048_RELEASE_VERIFICATION.md)、[v0.4.7](V047_RELEASE_VERIFICATION.md)。
- [v0.4.6 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.6)：配置持久化修复和文档维护；[实际发布与五附件核验](V046_RELEASE_VERIFICATION.md)。
- [v0.4.5 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.5)：首页导航／滚动、单条删除、透明字幕及更新交接修正；[发行记录与验证边界](V045_RELEASE_VERIFICATION.md)。
- [v0.4.4 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.4)：详情／首页交接修复、诊断补充与旧 shader 退役；[发行核验](V044_RELEASE_VERIFICATION.md)。
- [v0.4.3 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.3)：系统媒体卡片、一秒预览及退出修复；[接入记录](V043_NATIVE_PREVIEW.md)。
- [v0.4.2 核验记录](V042_RELEASE_VERIFICATION.md)、[v0.4.1 核验记录](V041_RELEASE_VERIFICATION.md)、[v0.4.0 核验记录](V040_RELEASE_VERIFICATION.md)：保留准备阶段、来源及验证范围，最终附件以各版 Release 为准。
- [当前范围与功能取舍](NEXT_RELEASE_SCOPE.md)、[项目方向与历史计划](ROADMAP.md)。
- [项目状态](PROJECT_STATUS.md)、[开发记录](DEVELOPMENT_LOG.md)：页首概述当前情况，其余日期条目保留当时事实。

按版本命名的合同、核验和历史计划不是当前待办清单，也不表示所有环境通过。第三方来源、版权、许可及未决义务继续以原材料为依据，不因用户选择保留、入库或发布而改为已核验授权。
