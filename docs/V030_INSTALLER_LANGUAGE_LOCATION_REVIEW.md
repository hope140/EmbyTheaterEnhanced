# v0.3.0 语言与安装位置独立复核

结论：`INSTALLER_READY_WITH_LIMITATIONS`，本次增量没有未关闭的 actionable finding。只复核英文 language name 与原生目录页，不替代首份安装器报告；reviewer 不改产品、主树或注册表，不提交或发布。基线为 PR #28 的 `7bbd5f7e954d315455414299c58dfd991eca4534`；候选冻结 source 为 `40c704db5239b76a63c8fca4ef5a361c4352648e`。原独立报告原文件/hash 保持。

## 源码结论

当前增量未发现 actionable finding。英文内部名从 `default` 改为 `english`，所有英文 Messages/CustomMessages 前缀同步；中文内部名 `chinesesimplified` 保持。仍为两种语言，未增加 legacy alias、自定义选择页或登记迁移。`DisableDirPage=no` 显示原生目录页，`UsePreviousAppDir=yes` 保持旧目录预填。AppId、admin 权限、Run flags、guard、profile 和生产播放器均不变。

独立核对固定上游 checkout 为 `4adf37ed7f3fd2bd11c6836ba056e3de170fbabf`，相关源文件没有工作区 diff。

| 行为 | 固定上游 native 依据 |
|---|---|
| 旧记录为 `default` | Setup.MainFunc.pas:412 的 GetPreviousLanguage 只匹配本包 Name；本包没有 default 时返回 -1 |
| 交互默认语言 | Setup.SelectLanguageForm.pas:58 优先有效 previous；找不到时使用已由 UILanguage 激活的 ActiveLanguage，手动选择保持 |
| silent 默认语言 | Setup.MainFunc.pas:3644 在没有匹配的 /LANG 参数时复用有效 previous；I=-1 时不覆盖已探测的 UI 默认 |
| 显式 /LANG | SetupLdrAndSetup.InstFunc.pas:269 优先按内部名匹配，匹配后 ddMatchLangParameter 阻止 previous 覆盖 |
| 保存新偏好 | Setup.Install.pas:293 按 ActiveLanguage.Name 保存 Inno Setup: Language；后续 english/中文记录能继续精确匹配 |
| 目录页与旧位置 | Setup.WizardForm.pas:1123 只有 dpYes 或 dpAuto 且旧目录存在时隐藏目录页；dpNo 保持显示。1411 的 FindPreviousData 在 UsePreviousAppDir=yes 时读取旧 Inno Setup: App Path，1150 预填 |

## 兼容边界

- 支持的显式静默参数为 `/LANG=english` 与 `/LANG=chinesesimplified`，匹配不区分大小写。`/LANG=Chinese` 和旧 `/LANG=default` 不再构成匹配的显式选择，会进入原生默认/previous 回退；脚本若要强制英文应使用 english。
- v0.2.9 的 legacy default 与首份 v0.3.0 候选保存的 default 英文记录都会重新按 UI 语言选择一次；在中文 Windows 上可能默认中文，即使首份候选曾选过英文。用户可手动重选英文，成功安装后保存 english，后续继续复用。旧中文记录不受 name 修改影响。
- 系统 UI 语言未命中本包支持的语言时，原生逻辑退到首项 English。中文主语言匹配还检查代码页，不能据此声称繁体中文 Windows 一定自动选简体中文。
- `DisableDirPage=no` 影响交互向导；silent 安装不会因此展示目录页，仍可按原生 /DIR 与旧目录/默认目录规则选目标。允许选择目录不等于已验证迁移、旧目录清理或产品升级生命周期。

## 原生与测试证据

主线程 PS5.1 原生语言探针 7/7 已独立回读日志及七个 result 文件，实际覆盖无记录、legacy default、未知 name、新英文/中文偏好、显式英文覆盖中文偏好、显式中文覆盖英文偏好；本机 UI fallback 为 chinesesimplified。staged fixture 除随机 AppId 外与冻结模板完全相同；语言名与产品一致。

native-language.log SHA-256 `c5658d57a76503717dbac0844e76e5e86db13edf0c554bc71f8744ee938b41a3`；focused-tests.log SHA-256 `101ba9733b2501963cb1cd9d7db65dc8a6526f3cb936d1952898f88c8e60c7ff`。

fixture 为 lowest、Uninstallable=no、64-bit 安装模式，无 Files/Registry/Run，InitializeSetup 返回 False。controller 只使用随机 GUID 的独占 HKCU64 测试叶子键，先检查不存在、写 owner sentinel、限定两种 value/禁止子键；更改前复核所有权，finally 仅用 DeleteSubKey 删除 exact leaf，不使用递归删除。成功终态发生在清理核验之后，日志终态支持随机键已移除。reviewer 仅阅读代码及文件证据，没有运行探针或操作注册表。它只证明合成前置语言选择，不能替代产品 HKLM64/admin、真实 UAC、安装、卸载或前台语言/目录页。

受影响定向测试 11/11 日志已回读，无失败、跳过或取消；`7bbd5f7..40c704d` 的 diff 检查通过。原完整 762/762 和运行 guard 只属于首份候选的原证据，本轮没有重跑或将旧结果重标为新全量验收。冻结增量无 src/native/guard/语言资源/toolchain/package 编译流程差异。

## 候选产物

| 项目 | 独立回读结果 |
|---|---|
| 文件 | `EmbyTheaterEnhanced-0.3.0-installer-candidate-40c704d-win-x64-setup.exe`，175,668,946 bytes |
| SHA-256 | `70b8c5bbeb4589e8e4842bd70706c5ce980d521fdc5f596e2969f099f124b1f1`，与 `.sha256` / `.provenance.json` 一致 |
| 身份 | source `40c704db5239b76a63c8fca4ef5a361c4352648e`；产品/installer `0.3.0`；数值 PE `0.3.0.0`，x86 Setup (`0x014c`)；固定 Inno 6.7.3 和原完整 compiler tree |
| runtime manifest SHA-256 | `dd73ead4bc29dca979774a31a38287e3b9d815b171156ddaf3a211d9bcdad861`，与 installer receipt 一致 |
| 输入 | 当前只读 inspect 与 built input provenance 为 39/39；changedInputs 0，guard hash 保持 `2323845849a5f6a16e979bb7023f763ee056ea3fc98d461950f305660f4ebb6a` |
| 包内语言 | 仅 `english` / `chinesesimplified`；LangOptions `$0409` / `$0804`。产品定义的 14 条 CustomMessages 全部匹配源码；另有受控语言资源继承的 24 条通用消息，不误算为产品新增消息 |
| payload | runtime / extracted `{app}` 均 2,139 files（2,138 payload + manifest）；独立逐文件 SHA-256 missing/extra/mismatch 均 0，manifest mismatch 0 |
| 相对首份候选 | 文件集合相同；除 build manifest 与五份来源 JSON 外所有文件字节相同，package/version 与生产二进制不变 |

container/extraction 终态与主线程 artifact-verification.json 已回读。unpacker LangOptions 是 stub，不能由它声称逐条原生页面文案或实际界面验收；Authenticode 仍为 NotSigned。复核没有运行产品、探针或 control.exe，没有重新构建或重跑完整矩阵。

## 目录序列化证明

最初的本地产物验证器要求解包脚本出现 literal `DisableDirPage=no`，因此断言失败；这是对解包序列化规则的误读。固定 `RebuildScript.pas` blob `089b64d1a1c33050031a792fbbb0d43c1c18351f`（repository commit `b94b34935ff4b1019359462c154509de9fd951b9`）第 605 行仅在 `sh.DisableDirPage <> dpNo` 时输出该 directive；独立计算该源码 blob identity 相同。

同一锁定 ISCC/unpacker 下，无安装 fixture 的三组 compile/extract 结果已逐项回读：源码 no 对应 dump 省略，auto 对应显式 auto，yes 对应显式 yes；control.exe 未执行。新候选的 omission 与 no control 相同，首份候选显式 auto。再结合固定 compiler 的 `no → dpNo` 与 39 输入绑定，支持目录页启用结论。验证器按来源与三组对照修正后 PASS，产品、候选 SHA 均未改变。没有将 absence 单独视为证据，也没有声称直接读出不存在的 no 行。

真实安装生命周期与前台 UI `NOT_EXECUTED`；新 Stable、merge 与发布不属于本复核。

上游依据链接均固定为上述 commit：[GetPreviousLanguage / silent 初始化](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/Setup.MainFunc.pas#L412)、[交互语言选择](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/Setup.SelectLanguageForm.pas#L58)、[默认与显式语言](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/SetupLdrAndSetup.InstFunc.pas#L269)、[目录页](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/Setup.WizardForm.pas#L1123)、[保存语言](https://github.com/jrsoftware/issrc/blob/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Projects/Src/Setup.Install.pas#L293)。
