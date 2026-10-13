# 项目状态

2026-10-13：268598b 候选的真实前台结果为 USER_REPORTED_FAIL：神医助手、Madby、Backup & Restore 均显示加载失败并保留旧页面。本次修正共享 AMD 身份重复实例及 Emby 4.10 的 RegularPage 协议；真实管理员只读后台工作实验已通过三个 controller/DOM、神医和 Madby 各两个额外页签、普通设置返回 Backup 的单页切换。公共回归770/770、材料层130/130、隐藏合成45项通过。正式产物的准确 sourceCommit、payload/provenance 及后台回执以独立验收包记录为准。产品版本保持0.3.1；本修订前台视觉仍待用户验收，直接 Electron 检查不代表 Host、安装或真实播放通过。详见 [兼容合同](PLUGIN_SETTINGS_COMPATIBILITY.md)。

2026-10-12：当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)，Windows x64。准确发行源码、安装器 SHA-256 和来源记录见 Release；同名 Tag 固定最终 main 源码。

已提供原生 libmpv 播放、STRM/CD2 与挂载回退、智能路径映射、诊断导出及设置页维护功能。v0.3.0 增加中英文安装器，并修复 Together 同步切集的透明屏及媒体替换状态清理。

用户已反馈 Together 使用、覆盖升级和升级后启动正常，安装器语言及目录页已有反馈；这些反馈不覆盖全部硬件、媒体和系统安装组合。全屏合成采样未得出确定结论；卸载/重装、配置与 DeviceId 逐项比对、静默安装、普通用户/UAC 等仍缺完整实测。详见 [已知问题](KNOWN_ISSUES.md)。

公开文档整理通过 PR #32 合并，CD2 新资源刷新通过 PR #33 合并至 main 2479d02，对应公开 CI 成功。v0.3.1 在该已验收实现上同步产品版本和发行文档；固定依赖、工具链及播放架构保持。

[用户指南](USER_GUIDE.md) · [贡献](CONTRIBUTING.md) · [许可及材料风险](LICENSING.md) · [公开资料整理范围](PUBLIC_DOCUMENTATION.md)

## CD2 新资源刷新

仅目标 FindFileByPath 确认 NOT_FOUND 后有限刷新父目录，完整消费流后最多重查一次。正常 1200ms、恢复总上限 3000ms、3层父目录、单锁与30秒冷却保持。Stop/Next/close 取消和 CD2 → Mount → Native 回退保持，播放会话及 DirectUrl header 合同不变。

反向 custom 顺序的单次重查回归保留。六项真实 CD2 验收结果为 USER_REPORTED_PASS，不改写为独立机器实测。设计见 [刷新合同](CD2_NEW_RESOURCE_REFRESH.md)，验证方法见 [隔离验收](CD2_REAL_ACCEPTANCE.md)。新版本安装器从最终 main 单独构建并核对版本、完整 payload 与来源，既有用户反馈不替代新产物身份校验或完整系统安装验收。
