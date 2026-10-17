# v0.3.9 安装升级验证测试版发行合同

## 已执行的发行结果

[v0.3.9 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.9) 已公开，产品source `06d34a712e26e0d6d0b299b487cfd68625df71ed` / annotated Tag `v0.3.9` 固定，PR #43已正常合并。准确main新构建、包体/来源/解包、main与Tag各1095公共测试、材料210、一次H7及父实际安装后复核通过；五附件匿名全字节重hash、旧20Release/资产与43行旧Tag、Latest031保持已核。完整结果见[发行核验](V039_RELEASE_VERIFICATION.md)。后续文档HEAD独立于产品source，以下实施条款保留为执行合同，原验收边界不变。

## 当前授权与身份

用户最新明确“那就发布吧，发布后准备后续版本内容”，现发布真实0.3.9安装升级验证Pre-release；此前无功能修复时不发039的收口选择由本指令覆盖。功能代码沿用038，只更新版本元数据、来源与验收/交付文档，不虚构修复或新增功能。Release标题为 `v0.3.9 · 安装升级验证测试版`，Stable/Latest保持031，签名继续暂缓。

准确文档起点为5b0cccea4718777a41010eab45acf73aeccf1a64，基于main a1b2a04d21c023062934351f29868e9c1c908b7a；已发布038产品source为0bbc504fbb6ca98dfb7476e8078c4483347b4375。隔离发行分支为codex/v039-release-closeout。最终产品source必须取正常合并后的准确main，Tag固定该source，后续文档HEAD不重标Tag。

## 实施与验收

只改package.json、package-lock.json中的根版本、CHANGELOG/RELEASE_NOTES、README及必要验收/发行/后续规划文档；私有发行脚本可作有界路径/版本适配，不进入产品。核心、安装器功能、依赖、默认内核和固定工具链保持；出现必要产品功能改动先带证据父审。原038公开资产、当前安装038、原036备份及原profile/DeviceId均保护。

1. 版本和用户说明提交后执行公共门禁并推送PR；父实际审累计diff/checks，CI通过后正常merge。
2. 准确main重新运行材料门禁和标准来源构建、VerifyOnly、固定Inno编译及完整解包。runtime/manifest/input/source/native provenance均绑定最终source，Native testing=false；完整集合及逐项SHA通过，签名状态只报实际NotSigned/UNKNOWN。
3. 新runtime逐文件与已发行038比较，只接受版本派生及准确来源身份元数据差异，逐项解释，不复用038计数充当039结果。profile/备份/日志/harness不能进入runtime或附件。
4. 父实际核新包source/hash/规范参数及私有runner窄差异后，在同一精确APP上仅一次038→039静默同目录升级，重核H0备份/当前源、完整payload/登记/入口/资料/有效DeviceId和所属进程。保留桌面与开始菜单，不启动应用/服务器/播放，不重跑036↔038/卸载矩阵。
5. 五附件为标准安装器、provenance、单SHA、同source RELEASE_NOTES及SHA256SUMS。发布Pre-release后匿名完整GET或顺序range保存所有字节并独立重hash，核来源/校验/notes关系及旧资产、Latest031保持，完成主线文档与远端读回。

原H0–H6只证明036与038之间的有界子场景；父最终审核已通过，原Desktop链接另由父从H0原件按字节恢复。未覆盖完整14项、空资料首次应用初始化、UAC拒绝/接受、人工取消、故障恢复、前台/真实播放和服务器；固定Inno673两项已核延后残留不手删，旧失败保持。

## 发布后的有限准备

仅在039发布闭环后更新下一阶段规划和差异/条件清单，先核已交付功能，移除已完成安装检查。列优先级、实际问题、依赖、允许范围/验收及需用户选择项；签名、缓存、切轨延迟、圆角和硬件缺口保留暂缓。CEC/WOL/发现/开机启动先核已有能力及实际需求，不自动全加。040仅为条件主题，不实现下一版产品。父负责规划最终审核，完成后结束。
