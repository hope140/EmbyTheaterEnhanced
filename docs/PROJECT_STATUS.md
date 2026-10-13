# 项目状态

2026-10-13：插件设置兼容候选已完成本地实现与后台合同验证，基线为 v0.3.1 / 080d352。主会话对上一封存修订完成审核及公开回归 761/761。最后两项 P2 修正后的定向测试 56/56、overlay/provenance fixture 6/6、隐藏 Electron 45 项通过；旧版公开回归不改写为本修订全套结果。当前待主会话确认 P2 收口及本地提交授权，真实神医助手、Madby、Backup & Restore 的前台结果尚未验证。详见 [兼容合同](PLUGIN_SETTINGS_COMPATIBILITY.md)。

2026-10-12：当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)，Windows x64。准确发行源码、安装器 SHA-256 和来源记录见 Release；同名 Tag 固定最终 main 源码。

已提供原生 libmpv 播放、STRM/CD2 与挂载回退、智能路径映射、诊断导出及设置页维护功能。v0.3.0 增加中英文安装器，并修复 Together 同步切集的透明屏及媒体替换状态清理。

用户已反馈 Together 使用、覆盖升级和升级后启动正常，安装器语言及目录页已有反馈；这些反馈不覆盖全部硬件、媒体和系统安装组合。全屏合成采样未得出确定结论；卸载/重装、配置与 DeviceId 逐项比对、静默安装、普通用户/UAC 等仍缺完整实测。详见 [已知问题](KNOWN_ISSUES.md)。

公开文档整理通过 PR #32 合并，CD2 新资源刷新通过 PR #33 合并至 main 2479d02，对应公开 CI 成功。v0.3.1 在该已验收实现上同步产品版本和发行文档；固定依赖、工具链及播放架构保持。

[用户指南](USER_GUIDE.md) · [贡献](CONTRIBUTING.md) · [许可及材料风险](LICENSING.md) · [公开资料整理范围](PUBLIC_DOCUMENTATION.md)

## CD2 新资源刷新

仅目标 FindFileByPath 确认 NOT_FOUND 后有限刷新父目录，完整消费流后最多重查一次。正常 1200ms、恢复总上限 3000ms、3层父目录、单锁与30秒冷却保持。Stop/Next/close 取消和 CD2 → Mount → Native 回退保持，播放会话及 DirectUrl header 合同不变。

反向 custom 顺序的单次重查回归保留。六项真实 CD2 验收结果为 USER_REPORTED_PASS，不改写为独立机器实测。设计见 [刷新合同](CD2_NEW_RESOURCE_REFRESH.md)，验证方法见 [隔离验收](CD2_REAL_ACCEPTANCE.md)。新版本安装器从最终 main 单独构建并核对版本、完整 payload 与来源，既有用户反馈不替代新产物身份校验或完整系统安装验收。
