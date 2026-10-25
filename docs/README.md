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

截至 2026-10-25，正式版为 [v0.4.0（Latest）](https://github.com/hope140/EmbyTheaterEnhanced/releases/latest)，最新测试版为 [v0.4.3](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.3)。v0.4.2 已发布页面／详情缓存、缓存管理及手动更新／通道选择，v0.4.3 保留这些并增加系统媒体控制与一秒视频预览。功能是否发布以对应 Release 和 Tag 为准，主分支文档不改变历史安装包。

## 开发与技术合同

从[贡献指南](CONTRIBUTING.md)开始：目录结构、依赖准备、纯文档检查、公开回归及 Windows 构建命令集中在该页。[公开 CI](PUBLIC_CI.md)解释现有工作流的检查路线、平台限制与未执行项。

| 主题 | 合同与参考材料 |
| --- | --- |
| 播放与解析 | [架构](ARCHITECTURE.md) · [播放链路](PLAYBACK_PIPELINE.md) · [Native Helper](NATIVE_HELPER_BRIDGE.md) · [STRM](STRM_RESOLVER.md) |
| 缓存及更新 | [详情缓存](DETAIL_PAGE_CACHE.md) · [缓存管理](CACHE_MANAGEMENT.md) · [手动更新](MANUAL_APP_UPDATE.md) |
| Windows 媒体集成 | [v0.4.3 接入范围](V043_NATIVE_PREVIEW.md) · [早期实验合同](WINDOWS_MEDIA_CONTROLS.md) |
| 构建与材料 | [构建合同与历史记录](PACKAGING.md) · [Actions 测试包合同](ACTIONS_TEST_PACKAGE.md) · [源码材料索引](SOURCE_MATERIALS.md) · [依赖来源研究](DEPENDENCY_RESEARCH.md) |
| 测试与发行 | [测试分层与材料用例](TESTING.md) · [Release 规范](RELEASE_CONVENTIONS.md) · [发行说明模板](templates/RELEASE_TEMPLATE.md) |

**阅读阶段记录时**：技术文档保留早期分支、候选和当时的待验收说明。例如 Windows 媒体实验“尚未纳入发行”、手动更新“独立候选”、构建合同“尚无干净 runner 成功”描述其编写阶段，已发布状态以上表和对应 Release 为准。首页布局／流畅度的显式测试参数也不等同于 v0.4.2 已发布的详情持久缓存；普通用户无需按实验启动脚本开启已发布功能。当前开发操作入口为贡献指南，具体材料身份仍按各组件合同核验。

公开离线检查、完整固定材料测试、实际客户端、真实服务器、安装与硬件验收各有范围，通过其中一层不能替代其他层。

## 发布记录与后续范围

- [v0.4.3 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.3)：系统媒体卡片、一秒预览及退出修复；[接入记录](V043_NATIVE_PREVIEW.md)。
- [v0.4.2 核验记录](V042_RELEASE_VERIFICATION.md)、[v0.4.1 核验记录](V041_RELEASE_VERIFICATION.md)、[v0.4.0 核验记录](V040_RELEASE_VERIFICATION.md)：保留准备阶段、来源及验证范围，最终附件以各版 Release 为准。
- [后续范围与实验状态](NEXT_RELEASE_SCOPE.md)、[项目方向与历史计划](ROADMAP.md)。
- [项目状态](PROJECT_STATUS.md)、[开发记录](DEVELOPMENT_LOG.md)：页首概述当前情况，其余日期条目保留当时事实。

按版本命名的合同、核验和历史计划不是当前待办清单，也不表示所有环境通过。第三方来源、版权、许可及未决义务继续以原材料为依据，不因用户选择保留、入库或发布而改为已核验授权。
