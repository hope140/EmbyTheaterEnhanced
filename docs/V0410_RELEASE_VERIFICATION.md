# v0.4.10 测试版核验

## 已发布结果

[v0.4.10测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.10)已于2026-10-31T16:17:25Z公开，Release 430043604，prerelease=true、draft=false；正式 Latest 保持同一对象422090288／v0.4.0。

| 项目 | 来源与结果 |
| --- | --- |
| 产品／Tag来源 | `52288ab3f3d6a9fb51f0f205c38df6339e702a01`；main从cd39dd1正常快进，新Tag v0.4.10固定同一提交。 |
| Windows公开CI | [41216718273](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41216718273) success，2339项为2334 pass／0 fail／5 skip，实际full路线。 |
| 标准发行构建 | [41216728814](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41216728814) success，release_package=true、build_input_benchmark=false，用时24分5秒；完整2436项为2434 pass／0 fail／2 skip，显式材料135/135、Host材料2/2、Electron44.5.0接口绑定、隐藏窗口退出及安装器编译／解包回比通过。 |
| testing发布 | [41218837469](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41218837469) success，复用同源码标准构建，五附件与Latest保护门禁通过。 |

本地发行合同52/52通过；初次未提交锁文件被来源守卫拒绝的记录保留。标准构建附件13049021858已独立下载，164494505字节、ZIP SHA-256 `126f14e242dd68419a5cb1b8697d8a863bafa106b2c711fc83fb6d88f6bd4148`，解出原始五附件和build summary后核对source／version／run／releasePackage、两份校验和notes通过。公开后五附件另从本Release下载，逐项与构建字节、API大小／digest一致；Release正文和原始notes与来源Git blob逐字节相同。

| 附件 | bytes | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.4.10-win-x64-setup.exe` | 161846800 | `ad5ea57b3b3f303e89d22ecd82340ab788b99f83fed0da141241dd164f61456f` |
| `EmbyTheaterEnhanced-0.4.10-win-x64-setup.exe.provenance.json` | 2156 | `a066304311ab73b4bc88f1861d81abd6b4b6726d67a92e048e27a2523eeedc38` |
| `EmbyTheaterEnhanced-0.4.10-win-x64-setup.exe.sha256` | 111 | `df041b8c16d81d495a6d9d577d2dc12223b474ea37af84203ef59d7c4c4e642f` |
| `RELEASE_NOTES.md` | 2446 | `23328666c44aeba7e91c2104bf8fea4d9fe4028758a96c176f5d734f32d92496` |
| `SHA256SUMS.txt` | 439 | `944c0e335137bdbc1ad39613a873fa6af6c0df3eb7774999d775944fb2f87d0c` |

产品／生成器／测试保持已验证片头与诊断候选，版本和发行资料之外未混入预载／缓冲暂存、下载功能或EWT代码变更。普通拖动后提前结束的现场根因仍未确认，真实服务器、可见播放和完整安装矩阵未独立验收；本轮未操作现用客户端。源码、自动化、安装包字节与实际播放证据分别保留。

## 发布前准备（历史）

以下保留准备阶段的状态与边界，不表示当前尚未发布。

## 准备状态

准备 Windows x64 testing 标准发行材料，尚未合入 main、创建 Tag 或发布。正式 Latest 核对为 v0.4.0／Release 422090288，最新测试版为 v0.4.9／Release 429821685；本版 testing 不改变正式 Latest。

## 来源与范围

远端 main 基线为 `cd39dd10dd7d1bebd1bd3fcb478cbc9002bdc4eb`，产品与 v0.4.9 来源 `07326205f9260e817e88655081a1df44cc96e445` 相同。片头修复与脱敏定位诊断来自 `3d3f1ad7a272cb4850b3a5f195a46ef1c8d18f70`，验证记录为 `5e5e736e6c54c940a19c5ce8d5e6e7043d9467e4`。本轮仅在该候选上同步根 package／lock 三处版本为 0.4.10，并更新发行说明与核验文档；准确发行源码在提交后补记。

已确认并修复片头跨集残留、异步验证后的旧点击作用到新播放，以及片头终点达到／超过片长。普通 Seek／EOF 行为保持，只增加有限脱敏诊断；现场普通拖动后提前结束的根因未确认。详细边界见[定位诊断说明](SEEK_EOF_DIAGNOSTICS.md)。

与 main 对比，未修改预载／缓冲暂存实现、下载功能、固定 Electron／libmpv／Host 输入、vendor、native、安装器或工作流。EWT 插件由独立项目处理，本候选不包含其代码。

## 验证

产品候选的本地公开 2339 项为 2308 pass／0 fail／31 平台 skip，定向 overlay／来源材料 98/98、定位／隐私接线 99/99，JS 552／PowerShell 53 语法及有限凭据模式检查通过。首轮未提交生成器被来源守卫拒绝的三项失败保留在[维护记录](DEVELOPMENT_LOG.md)。这些是候选证据，不冒充新版本准确源码的 Windows 构建结果。

0.4.10 准确提交将执行版本／发行合同回归、Windows 公开 CI，以及既有 `public-ci.yml` 的 `release_package=true`、`build_input_benchmark=false` 标准构建。标准构建成功才形成可供后续既有 release 流程复用的发行材料。结果、run／artifact 身份与独立字节核验状态在实际取得后补记。

## 发布与验收边界

既有发布流程要求准确 source 已包含于 main、新 Tag 固定同一 source，并满足五附件、来源、notes 与 Latest 保护门禁。本轮先完成普通分支与标准构建；合 main 前停下报告准确待合内容，不提前派发不满足条件的发布，也不修改门禁。

当前没有操作现用客户端、登录真实服务器或执行可见播放复现。合成测试、Windows 自动化、安装包字节核验与实际片源验收分别记录；普通 Seek 后 EOF 仍属于待现场诊断的问题。
