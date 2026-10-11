# v0.3.0 安装器语言与目录体验改进

本轮延续 `codex/v030-installer` / Draft PR #28，根据用户反馈修正中文 Windows 升级时仍选中英文、升级时无法自行选择安装目录两项体验。开工 HEAD `7bbd5f7e954d315455414299c58dfd991eca4534`，远端 main 仍为 `6eb11b9350889bc4152c22c68bf7e204f3c1bce5`。首份候选及其证据保持原身份，不覆盖原文件，不创建 Stable Tag/Release。

## 原生行为与修改

Inno 6.7.3 的固定源码 `4adf37ed7f3fd2bd11c6836ba056e3de170fbabf` 中，`Setup.MainFunc.GetPreviousLanguage` 仅查找与当前 `[Languages] Name` 相同的旧语言名；不存在时返回 -1。`Setup.SelectLanguageForm.AskForLanguage` 此时使用按 Windows UI 语言选定的 `ActiveLanguage`。静默初始化使用相同旧名查找；有效 `/LANG` 参数优先于旧偏好。这发生在 `InitializeSetup` 前，不能靠该事件修改最初的语言下拉默认值。

英文内部名从旧版的 `default` 改为 `english`，中文名保持 `chinesesimplified`，其它设置继续使用 `UsePreviousLanguage=yes`、`LanguageDetectionMethod=uilanguage`、`ShowLanguageDialog=yes`。旧版唯一英文记录将自然回到系统语言；新候选保存的 `english` 或 `chinesesimplified` 会在后续安装继续复用。手动语言选择仍使用原生下拉框。

兼容边界：首份内部候选中的 `default` 英文记录同样会重新按系统语言选择一次；无法仅从该内部名区分旧版唯一英文和首份候选的手动英文选择。已有中文偏好不变。显式英文参数使用 `/LANG=english`，中文使用 `/LANG=chinesesimplified`；旧 `/LANG=default` 不再是有效语言名。没有修改或删除已有卸载登记来改变默认值。

目录页原来未设置 `DisableDirPage`，采用原生默认值 `auto`，检测到已安装实例时会隐藏。现在设置 `DisableDirPage=no`，全新及升级安装均显示原生目录页；`UsePreviousAppDir=yes` 继续预填原位置。AppId、原生目录选择、快捷方式、权限、完成页启动方式和运行/占用保护保持。选择其它目录时仍检查现有登记目录中的运行实例，不新增旧目录自动清理或 profile 迁移。

## 检查与候选

最终状态 `INSTALLER_READY_WITH_LIMITATIONS`。新候选 sourceCommit 为 `40c704db5239b76a63c8fca4ef5a361c4352648e`，文件 `EmbyTheaterEnhanced-0.3.0-installer-candidate-40c704d-win-x64-setup.exe`，175668946 bytes，SHA256 `70b8c5bbeb4589e8e4842bd70706c5ce980d521fdc5f596e2969f099f124b1f1`。同名SHA256/provenance及README均已独立交付，复制后hash一致；版本仍0.3.0 / numeric 0.3.0.0，Authenticode=`NotSigned`。

受影响安装器/启动/输出命名/版本定向测试11/11通过。JS225、PS5.1/7各28、有限凭据扫描276和diff检查通过；39inputs/4通知、固定Native/Electron/source/runtime/dependency与编译前后package均通过。2138payload加manifest总2139，容器完整性及解包逐文件missing/extra/mismatch均0；build manifest SHA256 `dd73ead4bc29dca979774a31a38287e3b9d815b171156ddaf3a211d9bcdad861`。包内 `english`/$0409 与 `chinesesimplified`/$0804、14条产品自定义消息实际一致。与首份候选相比仅五份来源JSON及manifest变化，其它产品文件、package版本和二进制完全相同。

原完整离线762/762及旧合成运行保护12项仅按首份候选准确来源复用；本轮没有重跑这些不受影响的完整矩阵。此次改动只在安装器及相应测试，新原生探针与实际新编译产物作为本轮证据，不将旧测试改标为新运行。

原生语言探针只使用独占随机GUID的临时 HKCU 测试键，无产品文件、Run 或安装 Registry 条目；初始化返回 False。它不写真实 ETE 登记、profile、DeviceId 或安装目录。合成测试只证明原生初始化语言选择，不代表实际前台下拉框、目录页操作、UAC 或完整安装生命周期。

主线程PS5.1原生初始化7/7通过：无旧记录/legacy `default`/未知语言均回到当前Windows UI（实际0804简中），保存的 `english`/中文分别复用，有效两个 `/LANG` 分别覆盖旧偏好。每个probe确认原有合成语言值不变，结束时确认唯一owned叶子键删除。它使用HKCU64而非真实产品HKLM64，并不证明登记写入、安装完成后保存或用户前台交互已经通过；英语Windows系统未执行。

目录页验证中，初次本地验包辅助脚本误要求解包文本显式含 `DisableDirPage=no`，触发断言失败。检查实际unpacker重建源码及固定工具实编的no/auto/yes三个无安装样包后确认：no被有意省略，auto/yes分别输出显式值。`RebuildScript.pas`源blob `089b64d1a1c33050031a792fbbb0d43c1c18351f` 的条件是 `sh.DisableDirPage <> dpNo` 才输出；正式新包与no对照相同，旧包明确auto。修正辅助验包器为源契约加三个对照的对应检查后通过，没有改动产品或包字节。该解包文本不保证直接重新编译的行为相同，也不当作前台页面证据。

独立审查确认无未关闭问题，报告见 [增量审查](V030_INSTALLER_LANGUAGE_LOCATION_REVIEW.md)，匿名结果与原始日志hash见 [机器证据](evidence/v030-installer-language-location.json)。原始记录在 `.work/v030-language-followup/evidence/`，native probe在 `.work/installer-language-probe-9472fe4347c04736abec51b49ccb60b0/`，解包在 `.work/v030-extracted-40c704d/`，三个编译对照在 `.work/v030-language-followup/directory-controls/`。后续报告提交不重标候选source，也不为文档重新构建。

真实独立 Windows 安装、升级/更换目录、卸载/重装与前台页面仍 `NOT_EXECUTED`；用户报告两项体验问题不构成其它安装阶段通过。本轮继续 `INSTALLER_READY_WITH_LIMITATIONS`，等待用户体验新候选。

来源：[固定旧语言查找源码](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/Setup.MainFunc.pas)、[固定语言框源码](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/Setup.SelectLanguageForm.pas)、[DisableDirPage](https://jrsoftware.org/ishelp/topic_setup_disabledirpage.htm)、[UsePreviousAppDir](https://jrsoftware.org/ishelp/topic_setup_usepreviousappdir.htm)。
