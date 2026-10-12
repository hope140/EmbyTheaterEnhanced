# 项目状态

2026-10-12：当前正式版为 [v0.3.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.0)，Windows x64。发行源码为 20e42511b54989550165511a7604aa1b73519ff2；后续文档提交不改变已发布安装包来源。

已提供原生 libmpv 播放、STRM/CD2 与挂载回退、智能路径映射、诊断导出及设置页维护功能。v0.3.0 增加中英文安装器，并修复 Together 同步切集的透明屏及媒体替换状态清理。

用户已反馈 Together 使用、覆盖升级和升级后启动正常，安装器语言及目录页已有反馈；这些反馈不覆盖全部硬件、媒体和系统安装组合。全屏合成采样未得出确定结论；卸载/重装、配置与 DeviceId 逐项比对、静默安装、普通用户/UAC 等仍缺完整实测。详见 [已知问题](KNOWN_ISSUES.md)。

公开文档整理已通过 PR #32 合入 main e660167，合并后 CI 通过。CD2 新资源刷新属于后续独立实现，尚未包含在 v0.3.0。文档整理不改变源码、测试、Tag 或发行附件。

[用户指南](USER_GUIDE.md) · [贡献](CONTRIBUTING.md) · [许可及材料风险](LICENSING.md) · [公开资料整理范围](PUBLIC_DOCUMENTATION.md)

## CD2 新资源候选（目标 v0.3.1）

仅目标 FindFileByPath 确认 NOT_FOUND 后有限刷新父目录，完整消费流后最多重查一次。正常 1200ms、恢复总上限 3000ms、3层父目录、单锁与30秒冷却保持。Stop/Next/close 取消和 CD2 → Mount → Native 回退保持，播放会话及 DirectUrl header 合同不变。

PR #33 已合入真实 main e660167 并保持未合并，产品与已审核的 2b146ad 和预演 4e183e9 一致；反向 custom 顺序的单次重查回归保留。准确更新 HEAD 重新执行完整 CI、Session 回归和独立复核，构建独立验收 runtime。真实 CD2 新资源验收尚未执行；设计见 [刷新合同](CD2_NEW_RESOURCE_REFRESH.md)，操作见 [隔离验收](CD2_REAL_ACCEPTANCE.md)。当前不发布 v0.3.1，不覆盖现用 v0.3.0。
