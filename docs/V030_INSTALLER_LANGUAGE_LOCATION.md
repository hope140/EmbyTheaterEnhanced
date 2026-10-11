# v0.3.0 安装器语言与目录体验改进

本轮延续 `codex/v030-installer` / Draft PR #28，根据用户反馈修正中文 Windows 升级时仍选中英文、升级时无法自行选择安装目录两项体验。开工 HEAD `7bbd5f7e954d315455414299c58dfd991eca4534`，远端 main 仍为 `6eb11b9350889bc4152c22c68bf7e204f3c1bce5`。首份候选及其证据保持原身份，不覆盖原文件，不创建 Stable Tag/Release。

## 原生行为与修改

Inno 6.7.3 的固定源码 `4adf37ed7f3fd2bd11c6836ba056e3de170fbabf` 中，`Setup.MainFunc.GetPreviousLanguage` 仅查找与当前 `[Languages] Name` 相同的旧语言名；不存在时返回 -1。`Setup.SelectLanguageForm.AskForLanguage` 此时使用按 Windows UI 语言选定的 `ActiveLanguage`。静默初始化使用相同旧名查找；有效 `/LANG` 参数优先于旧偏好。这发生在 `InitializeSetup` 前，不能靠该事件修改最初的语言下拉默认值。

英文内部名从旧版的 `default` 改为 `english`，中文名保持 `chinesesimplified`，其它设置继续使用 `UsePreviousLanguage=yes`、`LanguageDetectionMethod=uilanguage`、`ShowLanguageDialog=yes`。旧版唯一英文记录将自然回到系统语言；新候选保存的 `english` 或 `chinesesimplified` 会在后续安装继续复用。手动语言选择仍使用原生下拉框。

兼容边界：首份内部候选中的 `default` 英文记录同样会重新按系统语言选择一次；无法仅从该内部名区分旧版唯一英文和首份候选的手动英文选择。已有中文偏好不变。显式英文参数使用 `/LANG=english`，中文使用 `/LANG=chinesesimplified`；旧 `/LANG=default` 不再是有效语言名。没有修改或删除已有卸载登记来改变默认值。

目录页原来未设置 `DisableDirPage`，采用原生默认值 `auto`，检测到已安装实例时会隐藏。现在设置 `DisableDirPage=no`，全新及升级安装均显示原生目录页；`UsePreviousAppDir=yes` 继续预填原位置。AppId、原生目录选择、快捷方式、权限、完成页启动方式和运行/占用保护保持。选择其它目录时仍检查现有登记目录中的运行实例，不新增旧目录自动清理或 profile 迁移。

## 检查与候选

受影响安装器/启动/输出命名定向测试7/7已通过。原完整离线762/762及旧合成运行保护12项仅按首份候选来源复用；本轮没有重跑这些不受影响的完整矩阵。新的原生语言初始化探针、编译、版本/来源、两语言及目录标志、解包与独立审查结果在工程收尾回填。

原生语言探针只使用独占随机GUID的临时 HKCU 测试键，无产品文件、Run 或安装 Registry 条目；初始化返回 False。它不写真实 ETE 登记、profile、DeviceId 或安装目录。合成测试只证明原生初始化语言选择，不代表实际前台下拉框、目录页操作、UAC 或完整安装生命周期。

真实独立 Windows 安装、升级/更换目录、卸载/重装与前台页面仍 `NOT_EXECUTED`；用户报告两项体验问题不构成其它安装阶段通过。本轮继续 `INSTALLER_READY_WITH_LIMITATIONS`，等待用户体验新候选。

来源：[固定旧语言查找源码](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/Setup.MainFunc.pas)、[固定语言框源码](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/Setup.SelectLanguageForm.pas)、[DisableDirPage](https://jrsoftware.org/ishelp/topic_setup_disabledirpage.htm)、[UsePreviousAppDir](https://jrsoftware.org/ishelp/topic_setup_usepreviousappdir.htm)。
