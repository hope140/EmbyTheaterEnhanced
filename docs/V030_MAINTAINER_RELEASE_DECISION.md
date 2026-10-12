# v0.3.0 维护者发布决策

2026-10-12（UTC+8）。决定来自维护者本轮明确指令。

**LICENSE_GATE_WAIVED_BY_MAINTAINER**。这是维护者接受现存许可证与第三方材料风险的决定，**不代表合规验证通过、未知授权已确认或已知GPL组合问题已解决**。

## 当前执行政策

1. 终止当前许可证专项审计；内部许可材料未完全闭合不再自动阻止常规开发、CI、构建和发行准备，不再无限等待该专项。
2. 保留所有既有LICENSE、THIRD_PARTY_NOTICES、版权归属、原始快照、审计报告与历史结论。UNKNOWN、对应源码/通知缺口及GPL组合待决保持真实状态，不改为PASS。
3. 主项目继续基于官方Emby GPL-2.0维护，不擅自重授权上游代码；本决定不是上游或第三方授予的新许可。
4. 不再主动开展Carnival来源追溯、第三方补件、bit-exact重建或重复法律审计。未来收到具体有效权利主张后，仅针对相关组件处理；本任务不建立主动监控或发送外部联系。
5. 工程完整性检查继续：版本、完整manifest路径/hash、来源/provenance、锁定工具链、随包通知和实际构建失败仍如实判断。本决定不豁免这些工程检查，也不扩大未执行验收为PASS。

## 明确保留的已知风险

- libmpv/FFmpeg固定配方的GPLv3条件与现有GPL-2.0-only Helper直接加载组合未闭合；兼容授权或替代构建均未实施。
- Host/Additions、实际Web及libmpv缓存链接依赖等对应源码/构建材料和完整通知履行安排仍有缺口。
- 具体定制增量和独立DLL、图片/字体、driver的来源/适用条款仍有UNKNOWN；modified思源字体RFN及driver内含组件等条件未解决。

详细事实保留在[PR31 GPL审核](V030_PR31_GPL_RELEASE_REVIEW.md)、[材料解阻结果](V030_RELEASE_UNBLOCK_PLAN.md)和其证据中。这里记录维护者风险接受，不删除这些证据，不进行新的法律结论审计。

## 工程验收与发布权限

项目保持 **V030_FEATURE_FROZEN**。Together、Windows覆盖升级及升级后启动使用、安装器UI用户PASS保留原范围；配置/DeviceId比对、卸载/重装、静默退出码和UAC等未确认场景仍披露，全屏合成采样仍INCONCLUSIVE。

本轮已授权：核对并以Merge Commit合并PR31，从合并后的main重新构建v0.3.0安装包，验证通知/版本/SHA256/manifest/provenance，准备正式Release Notes和发行附件。构建必须使用新的独立输出，现用客户端、原始输入和历史候选不覆盖。

**PUBLICATION_PENDING_MAINTAINER_APPROVAL**：公开上传安装包、创建v0.3.0 Stable Tag或GitHub Release尚未授权。工程准备完成后，只把准确的新产物、验证结果和剩余质量风险交给维护者作最终发布决定，不把本次准备授权扩大为公开发布授权。
