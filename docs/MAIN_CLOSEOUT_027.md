# 0.2.7 主线整合与当前计划收尾

日期：2026-10-10（UTC+8）。完整0.2.7维护已合入main，测试版已公开。整体项目审核直接使用main并记录实际HEAD，入口见 [AI审核指南](AI_REVIEW_GUIDE.md)，待做事项见 [路线图](ROADMAP.md)。

## 已完成的整合

用户明确要求将已完成的项目成果合并并收尾。[PR #21](https://github.com/hope140/EmbyTheaterEnhanced/pull/21)于12:04:50（UTC+8）以普通merge commit合入main，保留完整发布、维护与审阅历史。

| 对象 | 准确身份 |
|---|---|
| 合并前main | bc50d181cd5cafd14b31e2c0d24cbf7fd73b0ee1 |
| 获审阅发布HEAD | 1addcc732bb94c552bd512776326a5b50e54d77a |
| PR #21合并提交 | ef4fcf58ec9fcfa4728ef42eba25911f8c0de7ab |
| 合并树与发布HEAD共同tree | 442933b7b24300c47546f5fcd6d633b9369d57a0 |
| 安装包产品sourceCommit | d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0 |
| 产品tag | v0.2.7；annotated object b53f36f54685554d8d342fb30a07ffa51f1c526b |

合并前回读确认为OPEN、非Draft、MERGEABLE/CLEAN，检查集合为空；提交操作绑定准确head SHA。合并后回读MERGED，父提交顺序与上表一致，合并tree等于已审阅tree。GitHub没有返回CI检查结果，因此未记CI通过。

## 证据身份复核

- src、native、tools、tests、installer、vendor六棵Git tree与完整维护交付0bcbfc74逐项相同；src/native也与固定产品d8fcb0f9相同。
- 34项被构建消费的输入Git blob与产品d8fcb0f9相同，9份公开原始日志/回执的Git blob与工作副本字节、大小和SHA256均匹配索引。
- v0.2.7的tag、三个资产ID/名称/大小/digest与发布回读一致，仍为Pre-release；Latest保持v0.2.2。安装器SHA256仍为86bee55146714f4f7e493cadb8b483537644f513c92364df7fc0c18f5315f3db。
- 原产品651/651、工具42/42、父会话53/53和十组隔离运行按原来源复用。合并及后续导航收尾仅修改文档，不重建产品，不将旧结果改标为新运行。

逐项身份及远端合并回读见 [机器记录](evidence/main-closeout-027-20261010.json)。该JSON固定记录PR #21完成时的事实，后续纯文档提交的实际HEAD通过Git回读，不替代产品来源。

本次导航收尾共14个文档/证据文件，232个相对链接无缺失，新增公开文本未检出私人路径或凭据候选，diff空白检查通过；相对完整维护交付的产品、工具、测试与构建输入变化为0。

## 文档与待办收尾

README、审核指南、当前状态、路线图和Release入口统一使用main。旧发布分支仍用于历史追溯。当前待办移除了原A1维护整合、D1项目规则、R1测试版发布和About实现；各历史阶段的OPEN、待打包、FAIL与UNKNOWN仍保留原时间/来源，不当作当前状态。

后续顺序为独立整体审核反馈处置、第三方准确材料到达后的复核、独立环境中的安装生命周期，以及具备设备和样本后的显示专项。旧实验分支和未筛选的本地资料按 [同步范围](REMOTE_SYNC_027.md) 保留，不向main引入未经确认的实现。

## 保留的边界

四类第三方材料仍WAITING_EXTERNAL；0.2.7系统安装/升级/卸载/重装、真实Emby/CD2/远控、前台可见视频、HDR/多屏没有新增验收结论。历史直接app.exit根因仍UNKNOWN。全局S6按用户选择保持候选，不属于项目待完成工作。现用客户端、主目录未提交资料和原产物保持。
