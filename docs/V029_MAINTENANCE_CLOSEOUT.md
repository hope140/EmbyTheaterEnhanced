# v0.2.9 综合维护收尾

日期：2026-10-11（UTC+8）。最终状态：`V029_PRE_RELEASE_PUBLISHED`。

v0.2.9 产品/构建最终main HEAD：`084554e07782ca6461b7ed67cadd298a92450b24`。最终文档main HEAD以本报告所在的main文档收尾提交及交付回执标识，产品输入等价性独立核对；文档HEAD不替代下方安装包sourceCommit。

## 来源与工作区

开工 fetch 确认 `main=9774b73469dea9a3651f03737153c872947223ee`，PR #25 MERGED，main CI [38102353653](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38102353653) SUCCESS。原工作区仍为旧 Settings 分支且有未提交文档；全部已有 worktree、研究、真实验收和未提交成果保留。此次使用独立发布分支，文档、安全、安装材料和独立审核采用互斥文件所有权；隐私实现另用独立分支。未修改现用 v0.2.8 客户端或用户配置。

开工最新版为 [v0.2.8 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.8)，来源 `888310de8ebae941b407ae070102b84d4fec1e5e`；正式 Latest 仍 [v0.2.2](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2)。v0.2.8 三个附件身份只读核对，不改写历史资产。

## 任务矩阵

| 分类 | 实际结果 |
|---|---|
| COMPLETED | 状态/worktree/PR/Release/CI审计、文档对账、最小隐私修复、全量门禁、独立审查、PR26/main、最终来源构建、八组隔离runtime、2139文件解包及v0.2.9三个附件下载回读 |
| READY_TO_RELEASE | 本轮待发布工程已交付为V029_PRE_RELEASE_PUBLISHED，没有遗留手工发布步骤 |
| ACTIONABLE_NOW | 没有剩余本轮阻断；后续只按真实样本或外部材料推进下列有限事项 |
| EVIDENCE_GATED | 系统四阶段安装、真实 CD2 not_found 样本、特定媒体与历史异常新证据 |
| DEFERRED | 内嵌字幕/音轨切轨性能 USER_ACCEPTED；HDR、多屏/Mixed-DPI；对应第三方材料 WAITING_EXTERNAL；Renderer 迁移、Forge |
| EXCLUDED_BY_USER | 圆角调整、115/T4 继续实验、生产缓存调参、稳定播放与 Session 重构、现用客户端卸载/重装 |

## 产品变化与文档

相对 v0.2.8，PR #25 已加入外挂字幕等待结束后的 Play、最新选择序号、MediaSource 联合守卫。适用快速外挂字幕 A/B/Off、Stop、换集期间的过期 `sub-add`；原 700ms 等待保留，已提交命令不被撤回。内嵌 sid/aid、缓存、Session、Resolver、Native Helper 合同保持。真实 Emby 验收复用准确 `11a1c50` 的历史证据，身份关系见 [整合报告](V029_SUBTITLE_INTEGRATION.md)，不是本次新包实服/视觉验收。

本轮增加必要诊断隐私修复。合成 RED 已确认自由文本 Basic 凭据、多 Cookie 尾值以及带空格绝对路径可能泄漏。修复只限 JS 日志与 PowerShell 诊断序列化/末端门禁及合成回归，不涉及播放行为。范围、失败与最终复核见 [安全审查](V029_SECURITY_REVIEW.md)。原始 RED 和准备/验证失败日志完整保留，不删除断言或弱化门禁。

版本提交只将根 package 与 lock 的三个产品字段改为 0.2.9，不改变依赖版本、tarball integrity 或包选择。34 项固定构建输入中版本元数据和新增当前许可导航按实际 diff 绑定；最终 runtime 从准确 commit blob 重建，不能重命名旧产物。

README、ROADMAP、Known Issues、PROJECT_STATUS、DEVELOPMENT_LOG 完成当前事实同步；ARCHITECTURE、TESTING、PACKAGING、LICENSING 和 CHANGELOG 增加当前导航，既有历史大段保留。新增独立安全、安装材料、审核和本综合报告。圆角记 `USER_REPORTED_RESOLVED / NO_CHANGE_REQUIRED`，未新增视觉 PASS；切轨延迟记 `DEFERRED / USER_ACCEPTED`。

## 安全、测试与 CI

本轮初始公开离线运行 668 项，667 PASS / 1 FAIL：临时 Git fixture 的 `normal write atomically transforms the base config and copies raw notice blobs` 报 `Unable to read committed build inputs`。未改实现或断言的单例复跑 1/1 PASS；根因尚未确认，最终完整固定输入集合仍须通过。此失败与主工作树修改未提交时构建输入校验拒绝属于不同证据，不能混作同一根因。

初始材料六文件与额外 PLAY-01 native gates 合计 73/73，失败/取消/跳过 0；材料测试与公开集合合起来覆盖全部发现文件。初始静态 JS 223、PowerShell 5.1/7 各 26、有限凭据扫描 272 文件通过；最后新增测试后数量按最终运行重新记录。有限凭据和格式回归不证明所有未知秘密都已覆盖。

最终本地输入固定后的公开全集为 686/686、六材料文件加额外 PLAY-01 为 73/73，失败/取消/跳过/todo 均为 0。覆盖 89 个发现文件中的 757 项，以及额外 2 项 PLAY-01 native gates，合计 759 项执行；focused 47 和独立 34 已包含重复覆盖，不能累加。测试开始时为 `1012dac`，其后只提交非构建文档为 `0bac2e8`；生产/工具/测试及34输入身份完全相同。原 Git fixture 失败 case 在固定全集中通过，根因仍不猜测。

最终静态 JS 224、PowerShell 5.1/7 各26、有限凭据273、文档14文件/266相对链接通过。候选 `0bac2e8b2294fb4011bb3f2cef0c48624a35a570` build/VerifyOnly、34输入/4通知和 2138 payload 加manifest共2139文件通过。初次 `1012dac` 构建因主线程提交文档移动 HEAD 被 Native source gate 正确拒绝，保留原partial/log，不记为PASS。

独立 `PREMERGE_REVIEW_PASS` 后创建 [PR #26](https://github.com/hope140/EmbyTheaterEnhanced/pull/26)，准确 HEAD 为 `2a4ea1fb9830447d8372e6f46d6caef9c8c6f557`，目标 main 仍 `9774b73`。Push [38133680652](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38133680652) 与 PR [38133686686](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38133686686) 均 SUCCESS；PR 日志实读686/686、JS224/PS26/有限扫描273和diff通过，无未解决review thread、MERGEABLE/CLEAN。

按 Merge commit 合入 main 为 `084554e07782ca6461b7ed67cadd298a92450b24`，父提交为开工main与准确PR HEAD，merge tree 与PR HEAD相同。合并后 [main CI 38134108870](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38134108870) SUCCESS，日志实读686/686、JS224/PS26/有限扫描273及diff通过。公开 Hosted 保留六份材料依赖文件 `NOT_EXECUTED`，本机材料层结果单列。CI 有 pinned Actions runtime 被 Hosted Node24接管的上游提示，但各步骤均success；本轮不自动升级Action锁。Renderer 风险矩阵与兼容设计见安全审查；此次不迁移旧 Web 的全部隔离开关。

## 安装生命周期与第三方材料

安装准备工具合成测试 3/3 PASS；未发现可用独立 VM/Sandbox，未启用任何系统功能。全新安装、升级、卸载、重装均 `REAL_INSTALL_NOT_EXECUTED`。解包、哈希和隔离 runtime 不替代系统验收。profile/DeviceId 保留、快捷方式与服务/任务行为仅静态核对，实测范围见 [安装材料审查](V029_INSTALL_MATERIALS_REVIEW.md)。

四份 vendor manifest、锁定工具链、安装/引导与 DeviceId 输入相对 v0.2.8 没有改变。旧 Host/DLL 对应源码、libmpv 构建及依赖、冻结 Web/字体图像来源和剩余 MSYS2 recipe 继续 `WAITING_EXTERNAL`；没有凭项目 GPL 推定所有组件授权。范围内未发现相对旧版本新增的高风险材料问题，但不声称完整分发合规或对应源码闭合。

## 构建、资产与最终状态

最终产品/构建 main HEAD 为 `084554e07782ca6461b7ed67cadd298a92450b24`。在该 main CI 成功后，从固定来源新建 `RELEASE-029-084554e`，没有复用或更名旧包。34 输入、4 notices、88 tracked product 文件、Native source/header/compiler/helper、Electron73文件、npm33+7包/1171文件及全部 source/runtime provenance 通过。

八组隐藏隔离 runtime 为 idle、playing、stopped、hit0/400/800、direct400、miss400，均自然exit0、未timeout、无外层强清理、候选残留0。三组正常关闭与五组完整pipeline各自执行；原始 Item/MediaSource/PlaySession 三元身份由主线程与独立审核分别复算25对，一对一且Start先于Stop。DirectUrl专用UA匹配、普通请求未继承。实际产品关闭证据不解决历史 app.exit 根因；子进程观察另保留固定2秒快照不是穷尽观察的边界。全部属于 `ISOLATED_RUNTIME`，实服/可见/系统安装仍未执行。

运行后的 package重新核验通过，固定 Inno6.7.3 编译三个标准资产。PE字符串版本0.2.9、fixed numeric版本0.2.9.0；容器完整性通过，解包2139/2139，missing/extra/mismatch均0，runtime/manifest/安装器provenance及SHA companion完全绑定。最初PE探针误要求字符串含第四段且未Trim padding，修正为实际字符串与四段numeric双验；安装器没有因此改写。

| 资产 | 大小 / 身份 |
|---|---|
| `EmbyTheaterEnhanced-0.2.9-win-x64-setup.exe` | 175650591 bytes；SHA256 `2f4fa378eb75f91f21a5163d4cdb01244621d6bb8144a12c84b81ee419c914a0` |
| 同名 `.sha256` | 110 bytes；准确引用上述hash和EXE文件名 |
| 同名 `.provenance.json` | 3943 bytes；sourceCommit084554e、version0.2.9、installer size/hash和工具链绑定 |

runtime build manifest SHA256为 `3f93b40fa8ca2bdb5e0fc5c89072089c9432d46bb0737de9e60d52b82bae96ab`。

公开入口为 [Emby Theater Enhanced v0.2.9 测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.9)，Release ID `409622572`、Pre-release=true、Draft=false。annotated Tag对象 `b4ab009e03cab5afc9fa7407f719c24ede7a2e97` 的实际commit为 `084554e07782ca6461b7ed67cadd298a92450b24`，本地与GitHub ref/tag object回读一致。

| 实际下载入口 | 远端/本地回读 |
|---|---|
| [Windows x64安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.9/EmbyTheaterEnhanced-0.2.9-win-x64-setup.exe) | 175650591 bytes，HTTP200，SHA256同上 |
| [SHA256附件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.9/EmbyTheaterEnhanced-0.2.9-win-x64-setup.exe.sha256) | 110 bytes，HTTP200，文件SHA256 `fd6be796cdf357bab53e3597655482cdfc3153eb9f6cca0bd10f70d438a8ca39` |
| [Provenance附件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.9/EmbyTheaterEnhanced-0.2.9-win-x64-setup.exe.provenance.json) | 3943 bytes，HTTP200，文件SHA256 `f2ddc77bfb15c54e3c6594554d632d21e30c451746d10e5aa3fc557a773bec1c` |

三个附件均实际重新下载，其size/hash与本地和GitHub digest相同；下载的provenance和SHA companion再次绑定正确sourceCommit、version、EXE大小/hash与runtime manifest。旧v0.2.8 Release/三个asset ID、size、digest、链接及tag对象在发布前后完全一致。正式 [Latest v0.2.2](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2) 再次回读保持。

原始本地日志、失败目录与安装/来源回执保留在本任务隔离输出；[公开机器摘要](evidence/v029-maintenance-closeout.json) 只保留匿名结果、准确身份、相对证据位置和hash。最终文档提交只同步交付结果，须保持34输入、产品/Native/工具/测试与发布源完全相同；不重标产物、不重建或修改历史Release。

## 下一阶段

只保留持续观察的黑帧、旧白屏、特殊 app.exit 与 transport stress 差异；新真实样本触发 CD2 Hydration、特定媒体或经用户重启的切轨专项；独立系统到位执行四阶段安装。长期单列第三方对应材料、Renderer 兼容隔离和正式稳定版准备；设备验证与 Forge 继续按条件推进。
