# Electron 44.5.0焦点修复与验收来源

## v0.4.9 发行准备

0.4.8基线候选 d630438 已完成用户验收；运行时、维护源码和修复范围保持该候选，按0.4.9重新生成标准发行包，不将普通验收包改名发布。准确来源、构建、公开附件及验证边界见[v0.4.9核验](V049_RELEASE_VERIFICATION.md)。下文保留候选准备及当时的未发布状态；用户反馈不冒称助手独立真实服务／前台实测。

本候选基于最新main `51eb44921f614defad8126d44cfaa54f3c9f4333`，保留已发布0.4.8的全部产品源码、已看集数筛选、下载管理和自动刷新。应用版本仍为0.4.8，普通验收安装器文件名带`test-<source>-<run>-<attempt>`，Electron固定44.5.0；不合main、不创建Tag或Release。正式公开0.4.8仍采用44.4.2，原发行附件和Latest保持。

此前de364b2／构建41176768478只基于0.4.7，虽通过Windows自动化，也不含新下载筛选；不作为当前推荐验收包，更不能用其结果冒称本组合已通过。当前包必须从本轮准确新提交重新构建。

## 当前验收包与准确来源

- 来源：`d63043837b103df7c19272e5ff29dd434728c2ab`，基于main 51eb449；应用0.4.8、Electron44.5.0，全部src、下载筛选、package／依赖锁和安装器／工作流与基线逐字节核对保持。
- [Windows公开CI41181127475](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41181127475)：success，2308项为2303 pass／0 fail／5 skip。
- [普通验收构建41181189855](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41181189855)：success，完整2403项为2401 pass／0 fail／2 skip，Host材料2/2；实际44.5.0四项processVersions、Koffi／WinRT／DWM绑定和隐藏窗口退出六场景通过，原安装器编译／解包回比及上传通过。
- [验收附件13035303016](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41181189855/artifacts/13035303016)：164494204 bytes，API ZIP digest `011e90fb52d2fd1c5d437c5a4a54ba408c47b505e44902b720111324225c075b`，有效至2026-11-01T07:53:00Z。
- 安装器：`EmbyTheaterEnhanced-0.4.8-test-d63043837b10-41181189855-1-win-x64-setup.exe`；CI生成摘要为`b43a65458f9a1ab8ea42510f7cd0ecdab91929612f3a19c0638bada19f6aa757`。该值来自实际构建日志，不是独立回读安装器重算值。

本地读取上述Actions ZIP被存储服务返回Forbidden、0字节，已停止且未重试或换通道；目前确认CI内包体门禁、实际日志和附件API来源，未独立解包附件或执行安装器。该限制与真实焦点／播放未验收分别保留，不把API摘要当作本地文件验证。没有合main、Tag或Release。

手动验收时先正常退出ETE再自行安装，核对关于页为0.4.8及Electron44.5.0；保持EWT版本不变，打开删除房间确认框并取消，不切换窗口直接测试输入与下拉，无需真删房间。再核对“下载全剧／本季”仍有已看筛选，并检查实际常用影片播放／退出。此清单是待执行验收，不是已通过记录。

## 修复与固定输入

[Electron44.5.0发行说明](https://releases.electronjs.org/release/v44.5.0)及已合入44分支的[PR54461](https://github.com/electron/electron/pull/54461)包含JavaScript对话框结果送达后同步Aura／Blink焦点的修复。它与确认取消后输入和下拉同时失效、切换窗口恢复的复现条件吻合，但不替代真实ETE／EWT修前修后验证。本候选不增加全局focus/blur、置顶或模拟窗口切换，不改EWT插件。

沿用已独立取得并匹配官方SHASUMS256与Release digest的44.5.0 Windows x64归档：157966405 bytes，SHA-256 `b3405d8847bc5054cd16272f538d22ba5b73032945e85cef26241f7135035278`。73文件树SHA为`0c3e3057b24fc4458dbcc5b038eae7b6e68d61ca140653eda668dc73c03ab084`，electron.exe SHA为`3e76fb616aa60a850b7f64800dd81b21e06ddee3f1919650183b047f03e7cb9f`；同源Vulkan loader改为`e96d215161a34c5da71177a257b9e6146870438db37d65b609eac828a69f5315`，保持原始复制／来源合同及两份上游许可通知。

44.4.2与44.5.0公布的Chromium152.0.7977.130、Node24.21.0、V8 15.2.124.28相同，但Electron和DLL字节改变。只迁移旧候选的固定输入、获取／版本守卫、本地媒体loader及相应测试，不回拷旧src或应用版本。下载与全部src、package／依赖锁、Host／Native Helper／libmpv源码和安装器／工作流与当前main逐字节核对；运行时版本与新loader例外均有独立清单。

## 验证与验收边界

本轮必须验证已看筛选、目录／持久任务／本地播放接口、输入来源／版本／loader／来源合同，并沿既有只读权限public-ci普通验收构建完整运行回归、Host／Native Helper、实际新版Electron的Koffi／WinRT／DWM绑定和隐藏窗口退出、安装器编译／解包回比。新来源、运行编号和结果按完成后回执追加；不复用旧0.4.7安装器改名。

本地组合定向75/75、公开2308项为2277 pass／0 fail／31平台skip，覆盖原下载筛选／管理及Electron输入／版本／来源／本地媒体；JS548份、PowerShell53份语法和645份维护文本有限凭据模式扫描通过。既有官方归档经原prepare流程在本工作树重新验证／提取及复制后校验，73文件树和EXE一致；Windows及包体结果以上节准确来源为准。

上述自动化不替代真实EWT确认取消／确认后不切窗口也可输入和展开下拉、STRM／CD2真实播放、远控／系统媒体与硬件／安装体验。隐藏窗口生命周期测试的SMTC／DWM／capture等使用替身，不冒称可见播放或系统卡片已验收。

这是沿用现有ETE安装标识及默认个人配置的覆盖安装验收包，不是自动隔离profile的便携版；仅由使用者正常退出客户端后自行安装，助手不操作现用前台或用户目录。新包保留0.4.8下载功能；实际焦点和播放结果仍须使用者验证。
