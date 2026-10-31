# v0.4.7 测试版核验

2026-10-31 已发布 [v0.4.7 测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.7)，prerelease=true、draft=false。正式 Latest 保持 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)，Release 对象仍为422090288。

## 发布来源与验证

| 项目 | 已核对结果 |
| --- | --- |
| Tag／产品源码 | `v0.4.7`固定`5190a7020d0d00ea06776676921469736859bfbd`，与标准构建及公开安装器provenance一致。 |
| 合入main | 先核对main仍为`a958d52ea1dc866c0852d3158c0063a9bf75a4c5`，再正常快进到`b5367fc255561b75986a467f42ae331a3d3d7ffe`；b5367fc比产品来源只多验证文档。没有强推或移动旧Tag。 |
| 准确源码CI | [41169421561](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41169421561)在Windows执行full公开路线成功，固定组件、语法、有限凭据模式及diff检查通过。 |
| 标准发行构建 | [41169467426](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41169467426)从同一源码成功，release_package=true，实际执行完整材料及安装器门禁，22分42秒。 |
| 自动发布 | [41171790099](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41171790099)从main手动触发，testing渠道，复用上述同源码构建；preflight、build和publish均成功。 |
| 公开回读 | Release 429738414于2026-10-31T05:15:53Z公开，标题准确；Tag、测试标志、说明正文、五附件身份和正式Latest均回读核对。 |

## 公开五附件独立核验

五项均从实际公开browser下载地址重新获取，大小／SHA-256与Release API digest相同；安装器来源JSON、单文件校验、SHA256SUMS全部匹配。原始notes及网页正文均与产品来源Git blob逐字节一致。

| 公开附件 | bytes | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.4.7-win-x64-setup.exe` | 162030104 | `8157ed8b38d075bba080992933dce04d8c813729b11895745455be127b814d42` |
| `EmbyTheaterEnhanced-0.4.7-win-x64-setup.exe.provenance.json` | 2154 | `d2853453676afe382c6e0bca71a624b903aea09e58cf9332734f81922d5df33e` |
| `EmbyTheaterEnhanced-0.4.7-win-x64-setup.exe.sha256` | 110 | `99d7d5f4d5d9542caeb59272bc8724a3b0e757534d42e323247695254156bc5c` |
| `RELEASE_NOTES.md` | 2608 | `f2b379589f78326809fac07689e1931f30e3c9357f5f97b1f50afc071bb0dffe` |
| `SHA256SUMS.txt` | 436 | `21a450ce620f57be593cbfe6a68ef8283c3af637e9a9c389fef269cd04982a4d` |

本轮不安装／启动客户端，不操作Work前台，不追加使用者手动验收。Actions原artifact ZIP独立读取曾返回Forbidden、零字节，未重取或换通道；本节是正常发布后新公开Release附件的独立下载证据，未把原ZIP API元数据冒充字节验证。

## main／Tag后续CI

合入main触发[41171720759](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41171720759)，Tag推送触发[41171767026](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41171767026)，两次均为success，实际执行full公开路线及其余源码检查；分别绑定main合入提交b5367fc和准确Tag来源5190a70。发布后的文档补记不改变Tag或原始二进制。

## 发布前准备（历史记录）

以下保留准备阶段的范围、输入缺口和当时发布条件；不再表示当前未发布。

### 来源与范围

承接已由使用者验收的提前下载候选产品源码`00b409b5cd36c9875a2bf046bce718d97464cc68`，以及仅修改测试夹具／文档的分支HEAD`3ea303fefaf0538e17f9be5add6be2ecb8ea8848`。本轮产品增量只精简季／剧下载菜单及相同确认窗口标题、在完成提示中加入任务标题；原生toast接收HTML，故影片标题转义后作为普通文字显示，保留同一完成状态只提示一次的行为。没有修改取源、续传、文件归属、播放链或已验收的数据行为。

package与lock三处版本同步为0.4.7，发行说明包含本次首次纳入测试版的在线提前下载功能。新CI、标准发行构建与附件核验必须绑定本轮准确源码，不能以00b409b的旧0.4.6验收包代替。

### 验证与发布条件

针对性回归验证真实菜单overlay、确认窗口标题、电影／剧集完成消息、HTML标题转义和重复完成事件；版本／发布合同及固定材料按原门禁执行。准确提交、命令和结果随实际完成追加。

产品修正提交`91bd67de6e417048f527e188e76e1c2756f6cabd`本地针对性49/49、公开2297项为2266 pass／0 fail／31平台skip；JS548、PowerShell53语法和有限凭据模式645文件检查通过。扩展材料230项为227 pass／3 fail／0 skip，三项均因Linux工作区缺少固定vendor/windows-host或vendor/libmpv输入，未视为通过；完整材料门禁由恢复锁定组件的标准Windows构建执行。发行说明另将核验链接改为Release页面可用的完整地址，后续产品／生成器字节与91bd67d相同。

现有[发布流程](ACTIONS_RELEASE.md)要求从main手动触发，目标source已包含于main，并有同版本准确Tag、testing渠道说明及标准五附件。当前候选未满足main包含条件，未触发发布、不改门禁、不以普通测试artifact冒充已公开Release。后续testing发布应保持v0.4.0 Latest，渠道为prerelease，不能执行stable发布。

本轮不操作Work前台或用户目录，不追加真实Emby／CD2、可见播放、系统安装或文件系统兼容验收。既有手动验收反馈与新的自动测试证据分开记录。
