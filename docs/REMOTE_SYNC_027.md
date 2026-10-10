# 0.2.7 本地到远端同步范围

日期：2026-10-10。用户要求公开应进入仓库的本地项目成果并发布测试包，供其它AI整体审核。本轮从已审阅交付0bcbfc74建立独立发布分支；不使用旧主目录的工作副本作为最新源码。

## 纳入公开审核入口

- 完整0.2.7维护历史及最终源码、测试、构建工具、S1–S5项目文档和结构化验证资料。发布分支包含0bcbfc74及其全部祖先，原维护和About分支的提交可以沿此历史追溯，不需要为每个已覆盖工作分支再制造一个审核入口。
- 已验证的EXE、SHA256和provenance作为v0.2.7 Pre-release资产，产品tag精确绑定d8fcb0f9。源代码和安装器身份不因发布说明更新而重标。
- 9份已核验可公开的原始日志/回执及SHA256索引，见 [AI审核入口](AI_REVIEW_GUIDE.md)。
- 旧主目录中仍有独立研究价值的上游切集对照，添加明确历史作用域后归档；原本地正文保留不动。

## 分支盘点与取舍

盘点时有63个本地分支头，其中45个已由远端引用可达、46个被完整交付历史包含，两组有重叠。14个头同时不属于上述两组；“非祖先”不等于功能未纳入，也不等于应该直接合并或推送。以下是这些头的处理方式，不执行删除或重写历史。

| 类别 / 本地分支 | 处理及理由 |
|---|---|
| codex/source-materials-20261009 | 15个改动路径在交付树均存在，10个Git blob完全相同，其余5份持续维护文档已有后续更新。实质材料索引已公开；原独立头05a08e9留本地作历史追溯，不声明它本身已经远端可达 |
| codex/build-input-writer-safe、codex/fake-cd2-fixture、codex/pipeline-deadline-watchdog-20261009 | 独立执行/夹具分支，最终交付已有相应后续实现与测试；原分支差异作为本地研究参考，不自动并入获审阅产品 |
| codex/electron44-activation-reconcile | 历史激活/生命周期候选，未按当前产品重新验收；保留本地，不当作缺失的当前修复推送 |
| audit/daily-use-readiness、codex/project-roadmap-docs、docs/subagent-policy | 旧审计/导航/委派说明被较新的交付文档覆盖，保留历史本地分支 |
| codex/v0.2.3-settings-ux、fix/product-session-identity | 旧Settings/Session候选，较新成果已进入交付；保留旧工作树和未提交资料 |
| docs/known-issues、spike/electron-mixed-dpi-bounds-isolation、spike/helper-composition-gate、spike/win32-mixed-dpi-root-cause | 历史问题与实验，不能据此向当前产品加入未批准功能或未经确认的显示补丁；保留本地 |

旧主目录中的README和状态文档仍有0.2.4/旧main导航，不能覆盖最新交付文件。NIGHT_AUDIT_REPORT、NIGHT_DIAGNOSTICS_AND_PREWARM和UNATTENDED_WORK_PLAN的结论已有后续文档覆盖或属于历史草案，留本地；上游切集对照以 [历史研究](archive/UPSTREAM_TRANSITION_COMPARISON_20261007.md)单独公开。

## 保留在本地的内容

原始归档、vendor准备材料、node_modules、runtime副本、个人配置、真实服务资料、原始截图以及未经筛选的日志不进入Git。公开测试包承载已验证的产品字节，公开证据只包含经过检查的项目资料。第三方缺口继续如实披露，不把资料尚未取得改写成已完成。

本轮不会执行push --all、强推、删除旧refs或覆盖主目录未提交文件。完整审核分支与审核PR提供当前项目入口；main保留为对照基线，合并决定与整体审核分开。全局S6按用户决定保持候选，不上传或更改全局协作规则。
