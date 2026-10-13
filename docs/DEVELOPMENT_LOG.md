# 维护记录

## 2026-10-13 插件设置兼容候选

- 基线为 v0.3.1 / 080d352。主目录旧 Settings 支线及其已有改动未修改，候选使用独立 managed worktree / codex/plugin-settings-compat。
- Model Tier：Tier 2；Model：主线程用户配置，独立核心审核 GPT-5.6 Sol High，明确测试任务 GPT-6 Luna High；Reason：模块兼容与页面异步生命周期，播放/认证边界冻结；Escalated：无，未重开播放架构。
- 模型选型建议更新为 GPT-6 Luna / GPT-6.1 Sol / GPT-6 Astra，分别对应明确规格执行、跨模块实现与高风险设计/最终复核；既有完成审核保留实际型号。此前 GPT-5.6 Sol High 派发依据为原项目旧 Tier 2 推荐。
- 最终准确候选另交 GPT-6.1 Sol High 做只读审核，范围为本次源码/变换及取消、字段、通知、命令边界；这是一轮独立后续审核，不改写此前审核的型号或结果。
- 真实 frozen viewmanager 的确定性 RED 复现 controller reject 叠页及取消后迟到覆盖。受控变换增加隐藏暂存、取消/代际检查和安全失败清理；独立审核补齐普通/插件混合导航、权限/controller 前置迟到与当前页面 resume 的归属检查。router 仅添加该取消检查，原权限表达式、input/API 与播放模块保持。
- 新维护模块补齐传统两个依赖与 GenericUI 页面、页签、字段、命令、通知、Dialog/Wizard 生命周期。NAS 只读资源用于协议对照；没有复制其实现、执行 DLL、保存设置或触发命令。
- 首轮公开离线测试 741/741；后续公开集合一次运行 760 项，759 通过、1 项旧 transform 断言失败，该断言已同步并在增量集合复测通过。材料层完整适用测试 82/82，最后生成器变更再验 overlay/provenance fixture；最新插件相关增量集合 70/70。按收尾指示保留原始结果，不重复已完成矩阵或合并成一次准确候选全套绿色声明。
- 隐藏 Electron 44.4.2 合成 fixture 42 项通过，真实 AMD/字段编辑器与控件、13 组传统依赖 identity 均有机器证据，配置/命令只发往 loopback。最后取消入口先拒绝已 abort signal；子菜单显示副本安全转义，命令和确认由 canonical metadata 恢复，ItemList 动作提示补齐。真实三个插件前台结果仍待验收。
- 正式源码绑定构建已实际拒绝未提交生成器，门禁保持；没有提交、推送、发布、部署、系统安装或真实 profile/前台操作。候选实验不能称为正式 package/provenance 通过。

## 2026-10-13 最终审核两项 P2 收口

- 主会话对上一封存修订完成源码/构建差异/receipt 复核及准确公开回归 761/761；该结果保留原修订身份，不作为本次增量源码的全套回归声明。
- responseHelper 失败和取消统一拒绝清理后的 typed Error，只保留静态分类及安全 status；原 response 与 alert/module 错误不向下游传播。
- 插件导航与 GenericUI router 的错误 toast 在实际 AMD 回调执行时重新校验请求归属；新增 deferred 模块测试保留 RED 42/46、修复后 GREEN 46/46。当前有效失败提示及 signal 单独取消均有断言。
- 两项修复由主线程实现，明确 toast 测试由 GPT-6 Luna High 执行；冻结核心、依赖、认证与业务接口保持。后续证据与重新封存文件以本次 P2 报告为准。
- 收口定向 56/56，受影响 overlay/provenance fixture 6/6；隐藏 Electron 45 项通过，其中新增3项直接检查浏览器中的 typed rejection、敏感字段清理及 AbortError 静默。7个受影响脚本语法/有限凭据扫描与 diff-check 通过。旧761/761保持上一封存修订身份，未重复完整公开矩阵。

## 2026-10-12

- 整理 README 与 CHANGELOG，更新 v0.3.0 下载和版本导航。
- 增加用户配置与贡献指南，分离历史内部迭代资料；原件已在仓库外逐文件校验归档。
- 保留版权、第三方通知、固定输入清单、必要技术合同和许可风险事实。Git 历史及既有发行附件保持。
- 验证结果由该文档 PR 的检查记录提供。真实播放、系统安装和完整发行重建不属于此次文档整理的验证范围。
- Release 正文及过时标题整理后，已回读确认附件和 Tag 保持；文档 PR #32 已以 Merge Commit 合并，main CI 通过。

## CD2 新资源整合与 v0.3.1

- PR #33 合入 PR #32 的真实 main，产品与已审核的 2b146ad / 4e183e9 保持；文档冲突沿用精简公开状态。
- 复核 Proto、取消、预算、单次重查、回退及 UA/header 边界；准确候选提交接受完整公开 CI 与独立复核。
- 增加首次冷资源、二次命中、Stop/Next、播放画面及 Session 的隔离验收步骤。六项真实 CD2 验收为 USER_REPORTED_PASS，工程测试与用户反馈保持各自证据边界。
- PR #32、#33 已合并，对应 main 公开 CI 成功。v0.3.1 同步产品版本、下载导航、更新说明和已知限制；运行公开离线测试、语法及凭据检查，结果以发布准备 PR 的 CI 为准。
- 正式产物从最终 main 使用原固定输入及工具链单独构建；发布身份与回读证据保存在 Release 附件及本地审计记录中。
