# grpc-js 与 About 本地维护

2026-10-10后续：独立审阅发现包内版本同步读取/哈希造成main阻塞，
本地异步修复与证据见 [About异步版本校验](ABOUT_VERSION_ASYNC.md)。
以下7ec6ace候选和八组运行记录保持原身份，不作为后续修复的runtime验收。

日期：2026-10-09（UTC+8）。基线为 main 合并提交
bc50d181cd5cafd14b31e2c0d24cbf7fd73b0ee1，分支
codex/maintenance-grpc-about-20261009，版本保持0.2.6。

grpc-js 精确锁定从1.14.4更新到1.14.6，proto-loader与其它包保持。
官方 [High公告](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j)
修复版本为1.14.5；[Low公告](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4)
为1.14.6。[1.14.6记录](https://github.com/grpc/grpc-node/releases/tag/@grpc%2Fgrpc-js@1.14.6)
说明继续修复Low剩余入口，并有客户端分配优化。因此采用包含两项完整修复的最小补丁。
生产源码只创建CD2客户端，未发现Server/getAuthContext/xDS入口；历史包未被证明遭受攻击。
锁文件仅该包版本、URL与integrity变化，固定依赖树由原contract重新生成。
维护环境npm audit退出0，全部级别0；完整原始JSON保留在本地证据目录。

About的随包版本来自提交中的Helper源码版本声明和固定libmpv清单。
构建把版本与source blob、二进制SHA256同时记录；验证器复核版本来源。
main仅读固定runtime路径，检查sourceCommit、build manifest对native provenance
的SHA256绑定及实际Helper/DLL哈希。缺失、格式错误、身份不符均保持UNKNOWN。
此一致性校验不是代码签名或对整个未签名包同时被修改的安全认证。
不会为查询版本启动Helper或播放器。

包内版本与当前Helper状态、运行中握手版本分开。未ready时运行版本为
NOT AVAILABLE。About每次恢复重新读取；复制操作返回与剪贴板相同的白名单快照，
并更新当前页面；请求代际保护防止迟到响应覆盖较新快照。sender验证与renderer
权限不变，播放、Session、Resolver及UA路由代码保持。

CD2/预算/Resolver/依赖定向69/69通过，About/源码版本提取15/15，全量638/638。
语法、文档链接、diff及公开文本检查通过。最终产品sourceCommit为
7ec6aceb2c97185fa8fd9a128b8737f02c0c3b19；后续文档HEAD不替代产品身份。
Native/Electron/source/runtime provenance及package VerifyOnly通过。
新runtime为 dist/ETE-0.2.6-maintenance-7ec6ace-win-x64，payload 2136文件，
包含build manifest的完整runtime为2137文件；依赖combined 1171文件。
实际维护IPC读回Helper 1.0.0、libmpv v0.41.0-920-gdd5d17d32。
八组idle/playing/stopped/miss400/hit0/hit400/hit800/direct400串行隔离通过，
全部自然exit0、无强清理、残留0，About初始运行版本保持NOT AVAILABLE；ready后的版本投影有单测覆盖，
本轮未取ready后实际IPC快照。
安装候选为 dist/EmbyTheaterEnhanced-0.2.6-maintenance-7ec6ace-win-x64-setup.exe，
175664480 bytes，SHA256
5ba18620dc3cf2717a6a0c1c384aca10e73b6a9247ccd954cf79c881f0d590b6。
Inno完整性与2137文件解包比较通过，missing/extra/mismatch全部0。
准确来源、runner/日志/产物hash见 [结构化证据](evidence/maintenance-grpc-about-20261009.json)。
初次全量执行在测试更新前载入旧About期望，629/631，两项旧contract断言失败；
原日志保留，最终回归使用更新后的真实contract。

验证边界：隔离runtime只使用本地fake API/CD2及合成媒体，显式隔离appData、
userData与MPV_HOME，隐藏窗口并阻止focus。系统安装、真实Emby/CD2/远控、
可见视频连续性、HDR/多屏没有本轮验收。旧直接app.exit根因保持UNKNOWN。
发布v0.2.6及355f4e6产物保持，本轮为独立本地工程交付。
