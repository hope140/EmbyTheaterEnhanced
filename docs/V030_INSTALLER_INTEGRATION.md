# v0.3.0 安装器整合与稳定版门禁

2026-10-12增量：PR28已合并至main `a8ba606`；Together修复进入独立OPEN [PR29](https://github.com/hope140/EmbyTheaterEnhanced/pull/29)，受控根因和窗口合成验证已有，真实双端仍PENDING_USER_ACCEPTANCE、全屏INCONCLUSIVE。本轮新内部候选及门禁统一见[V030_STABLE_READINESS](V030_STABLE_READINESS.md)。下方旧日期记录保留阶段身份，以最新readiness为准。

## 用户前台验收

2026-10-11，用户明确确认新候选的中文默认语言、手动语言选择、升级安装目录页面均符合预期，没有发现新的界面问题。`USER_UI_ACCEPTANCE=PASS`，来源为用户前台报告，绑定候选source `40c704db5239b76a63c8fca4ef5a361c4352648e` / SHA256 `70b8c5bbeb4589e8e4842bd70706c5ce980d521fdc5f596e2969f099f124b1f1`。匿名回执见 [用户验收证据](evidence/v030-installer-user-ui-acceptance.json)。

这个PASS只覆盖上述三项。完整全新安装、v0.2.9升级、卸载、重装、运行中升级/静默失败、配置与DeviceId保留、卸载登记/快捷方式和普通用户启动的系统验收仍 `NOT_EXECUTED`。没有把界面体验、合成注册表探针、编译或解包转成完整系统生命周期PASS；英语Windows、DPI和UAC也没有新增通过结论。

## 整合范围与回执入口

本次仅整合 [PR #28](https://github.com/hope140/EmbyTheaterEnhanced/pull/28) 的安装器、相关测试、版本与来源绑定及验收文档。用户已授权门禁满足后转为Ready for Review并使用Merge Commit合入main，再验证main CI。最新HEAD、合并提交和main CI以该PR的实际GitHub记录及对应提交检查为准；本次不创建v0.3.0 Tag/Release，不把内部候选改标为main正式产物。

开工PR HEAD `19d37ba69bc5453108ed38f55f3626c9634f29c8`，main `6eb11b9350889bc4152c22c68bf7e204f3c1bce5`。原两次Hosted CI689/689、定向11/11、原生初始化7/7、39input/4通知和2139文件证据保持准确来源；验收状态文档提交后重新检查实际最新HEAD的CI、未解决review threads与diff。

PlaybackManager、Session、Resolver、Native Helper、mpv配置、HDR/OSD/远控/窗口播放核心没有生产源码改动；版本metadata不等于新增播放功能。原候选安装包仍绑定40c704d，后续整合或文档提交不重写它的provenance。

## v0.3.0 Stable 尚需完成

1. 在安全隔离Windows环境完成全新安装、v0.2.9升级、卸载和重装；逐项核验payload、原位置/选择其它位置的状态、profile/登录/STRM/CD2/播放器设置/DeviceId保留、快捷方式和单一卸载登记。
2. 完成运行中升级的交互阻止/正常退出重试、静默非零退出且产品文件未修改、失败后的明确恢复路径；核验UAC与普通用户启动、高DPI/中文空格目录及需要支持的英文Windows环境。
3. 独立核查 [SyncPlay主控下一集时被控端偶发透明屏幕](SYNCPLAY_NEXT_TRANSPARENT_SCREEN_TASK.md)，明确根因或证据边界和正式版处置；必要修复单独审查并做真实双端回归。本安装器PR不修复、不关闭此项。
4. 按既有 [材料清单](V029_INSTALL_MATERIALS_REVIEW.md) 收口第三方对应材料和分发边界，保留未取得材料的真实状态，不因测试版既往发布自动视为完成。
5. 在上述门禁及发布范围获确认后，从准确的最终main新建正式构建，验证版本、锁定工具链、source/runtime/package provenance、文件集合/哈希和安装兼容；重新产出正式安装包及附件。当前候选不能改名或复用来冒充正式main产物，签名状态须如实披露。
6. 最终发行复核、明确Stable发布授权后，才创建正确Tag/Stable Release，并做附件下载与身份回读。该发布步骤不属于本次整合。

已通过的三项用户界面验收不再作为待验收项重复列入；未来产品或安装器改变相应行为时按影响补验证。
