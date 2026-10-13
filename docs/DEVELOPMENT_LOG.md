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
- 提交前源码绑定构建曾拒绝未提交生成器，门禁保持；该阶段实验未取得正式 package/provenance 通过证据。后续本地提交及构建结果见下方交付记录。

## 2026-10-13 最终审核两项 P2 收口

- 主会话对上一封存修订完成源码/构建差异/receipt 复核及准确公开回归 761/761；该结果保留原修订身份，不作为本次增量源码的全套回归声明。
- responseHelper 失败和取消统一拒绝清理后的 typed Error，只保留静态分类及安全 status；原 response 与 alert/module 错误不向下游传播。
- 插件导航与 GenericUI router 的错误 toast 在实际 AMD 回调执行时重新校验请求归属；新增 deferred 模块测试保留 RED 42/46、修复后 GREEN 46/46。当前有效失败提示及 signal 单独取消均有断言。
- 两项修复由主线程实现，明确 toast 测试由 GPT-6 Luna High 执行；冻结核心、依赖、认证与业务接口保持。后续证据与重新封存文件以本次 P2 报告为准。
- 收口定向 56/56，受影响 overlay/provenance fixture 6/6；隐藏 Electron 45 项通过，其中新增3项直接检查浏览器中的 typed rejection、敏感字段清理及 AbortError 静默。7个受影响脚本语法/有限凭据扫描与 diff-check 通过。旧761/761保持上一封存修订身份，未重复完整公开矩阵。

## 2026-10-13 本地提交与隔离验收交付

- 用户授权精确审核的31文件本地提交及必要状态同步、构建与后台验证。实现提交 d4440ed；仅整理7个测试文件末尾多余空行，保留代码逻辑与原换行。没有推送、PR、合并、Tag、Release、部署或系统安装。
- 提交后公开离线测试 764/764、材料层测试 130/130、隐藏 Electron 合成验证45项通过，前台动作为 NONE。旧761/761继续保留此前封存修订身份。
- 固定输入与完整工具链通过校验，源码绑定构建、2144项 payload 集合和三层 provenance 校验通过；native helper 为正常构建，testing=false。状态同步后从最终提交重新构建，准确交付身份见产物清单。
- 隔离入口在 bootstrap 前绑定 appData、userData、sessionData、temp、日志、crashDumps 与 MPV_HOME，生成新 DeviceId，不复制现用 profile 或凭据。后台探针加载实际主页面并抑制显示调用；启动 dry-run 通过。
- 明确脚本任务由 GPT-6 Luna High 执行，隔离脚本最终只读审核由 GPT-6 Astra High 完成。审核发现的状态文件链接写入、根目录父层重解析边界及 Electron ASAR 物理文件校验问题已修复；环境字典保持对象返回，避免 PowerShell 枚举破坏子进程隔离环境。
- 本验收包直接运行 Electron，不能称为 Host 或安装等价验证。HTTP(S) 护栏限定默认 Chromium session，拒绝 UI/Command 与非浏览请求（登录/能力注册除外）；不证明任意插件 GET 或其它协议都无副作用。真实三个插件视觉、播放及远控结果尚未执行。

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
