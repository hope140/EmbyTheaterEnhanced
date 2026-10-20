# v0.3.13 发行核验

## 发行身份

[v0.3.13 · 退出清理维护测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.13)已于2026-10-20 09:34:01（UTC+8）公开为Pre-release，Release ID417908398。产品sourceCommit为 `d313e93a9d0920af7ed27cd1743d6bb9c9178d4d`，annotated Tag对象为 `70e236f58e89d21f00d89f066020185f24197b13`；Tag解引用和最终产品main一致。产品[PR #52](https://github.com/hope140/EmbyTheaterEnhanced/pull/52)已正常合并。Stable/Latest仍为v0.3.1。后续文档提交不替代产品来源，不移动Tag或重传原附件。

## 变更及用户反馈

本版修复有PID的Helper进程error被过早视为退出，以及应用关闭时某项清理失败后跳过其他pending收尾的问题。实际exit负责进程结束确认，各清理按原同步顺序启动、分别处理throw/reject并在全部返回工作结算后统一quit。PlaybackManager/Session、generation、IPC信任、Resolver和Native归属保持。整体退出期限与强退策略未改；不能据此宣称解决所有Electron挂起或安装检测失败。

用户对原本地候选的反馈为有限试用暂时未发现明显问题，并授权发布测试版；没有完整错误注入、系统安装、真实播放/远控或设备验收的新增通过结论。

## CI与固定材料

- [Main CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39352955749)及[Tag CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39352963345)均绑定准确产品source，各1142/1142通过，失败/跳过/取消均0。产品分支[push CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39351596950)与[PR CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39352020867)也通过，分支公开集合1142/1142。
- 固定材料门禁211/211通过，失败/跳过/取消/todo均0；原材料日志SHA-256为 `a393fa0be3d2fcda813c969449808ec078e9131d4fe62a95ef3d57007659322a`。原始归档完整SHA、prepared树与锁定工具链已核对，未升级依赖/工具。
- 两份新增退出回归沿相同断言，原基线2/19、修复19/19；原候选公开离线1142/1142与本次最终source公开CI分开记录。

## Runtime与安装器

最终source从Git blobs和固定输入重建，完整runtime2160文件，payload2159项。标准build、source/runtime/native provenance与VerifyOnly通过。固定InnoUnp完整性和解包通过；全部2160个{app}路径、大小及SHA-256与runtime逐项一致。build-manifest SHA-256为 `2df843c43a42c6d990dca3eaa64758094f9d30ae1df2890d71538acbe97d0940`。

包内main.js和native-helper/controller.js与最终产品Git blobs逐字节一致。相较原d4f6e8b的0.3.12本地验收runtime，差异限六项payload文件中的应用版本/来源元数据及build-manifest；其余2153项payload字节一致。原候选source与本次产品source分别保留，不能以版本号相同或后续文档HEAD代替它们。

Native Helper的C++源码未改，二进制SHA-256保持 `baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494`，生产testing=false；固定Electron44.4.2、libmpv、schema与依赖边界保持。安装器资源版本0.3.13，Authenticode状态NotSigned。包体检查未发现本次临时验收工具、profile或凭据实例混入；生产依赖自带的上游fixture不属于本次临时工具。

## 五附件与匿名完整回读

五附件远端状态均uploaded，大小/digest与本地一致；网页初始正文和RELEASE_NOTES附件均等于产品source的docs/RELEASE_NOTES.md原始Git blob。匿名回读不发送Authorization：安装器经21个连续Range覆盖所有字节，顺序拼接计算完整SHA；其余四件完整GET。全部长度/哈希一致；上传成功、远端digest或局部抽样不能代替这项全量回读。

| 附件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.3.13-win-x64-setup.exe` | 175752088 | `4d67499f5716bc10f4ca936757a274b0a57a7f621843d27043604ff49d00a923` |
| `EmbyTheaterEnhanced-0.3.13-win-x64-setup.exe.provenance.json` | 2156 | `5648721e4fa94046a19344300cc00f98dee2558879800df7ad83dee7e29ce166` |
| `EmbyTheaterEnhanced-0.3.13-win-x64-setup.exe.sha256` | 111 | `c7473b305754f0c172f5db5bc481d3e20b414beb277ec60cd128c7c3e5d885b1` |
| `RELEASE_NOTES.md` | 2024 | `6cc51aff45d949feaea261105ae30c9af2544fc0d86b368b597dc7339998417f` |
| `SHA256SUMS.txt` | 439 | `04cbebaf3f3672c81ddfe3734781977bfa7e7e871f93fffa03eb1b4d11e0da93` |

SHA256SUMS列出其余四件，其自身SHA在表内单独记录。旧24个Release、89个附件和51行Tag引用逐项回读保持；Latest仍为v0.3.1。

## 验收边界与文档来源

本轮未代用户执行系统安装、真实Emby/CD2播放、远控、Helper ready、实际加载映像SHA或硬件验收；这些层次保持NOT_EXECUTED/UNKNOWN。有限试用、合成测试、包内文件SHA、ready握手及loaded-image SHA是独立证据。字幕/音轨切换延迟、多显示器目标映射和完整退出显示恢复仍按[已知问题](KNOWN_ISSUES.md)保留，第三方来源与对应源码义务按[许可说明](LICENSING.md)保持未决。

当前下载导航与最终记录由独立文档PR和Checks同步；文档main HEAD与本页固定的产品source分开，后续文档维护不改产品Tag与原发行附件。
