# v0.3.9 发行核验

[v0.3.9 GitHub Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.9) 已公开，PR [#43](https://github.com/hope140/EmbyTheaterEnhanced/pull/43) 已正常合并。产品 Tag/sourceCommit 为 `v0.3.9` / `06d34a712e26e0d6d0b299b487cfd68625df71ed`，Release 为非 draft 测试版。后续文档 HEAD 与产品 source/tag 分开，不重标 Tag。

## 来源与构建

| 项目 | 当前证据 |
| --- | --- |
| 版本 / 产品 Tag | 0.3.9 / `v0.3.9` |
| 产品 sourceCommit | `06d34a712e26e0d6d0b299b487cfd68625df71ed` |
| 产品功能变化 | 0；版本身份更新，功能沿用 0.3.8 |
| main CI | [run 39039311946](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39039311946)，1095/1095 通过 |
| tag CI | [run 39041737001](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39041737001)，1095/1095 通过 |
| 材料门禁 | 210/210 通过；失败、取消、跳过均为 0 |
| build-manifest SHA-256 | `43166a3d55912add2b36e9361a617e4319d68162ae5a4d535549c6108087aa13` |
| payload set SHA-256 | `f1b68ca3c013c61287096347ca9f30fd744e058db25a2038730d476e5894efd6` |
| 完整解包集合 | 2160文件，与标准runtime逐路径、大小及SHA一致 |
| Authenticode | `NotSigned` |
| Stable / Latest | 实际远端读回保持 `v0.3.1` |

最终 runtime 共 2160 个文件，含 2159 个声明 payload。相对 0.3.8 的严格比较记录 7 个派生版本/身份文件变化，2153 个文件字节一致；native helper 的 testing 标记为 false。

## H7 本机升级验收

H7 是在已核验 0.3.8 基线上，对同一安装目标执行的一次 0.3.8→0.3.9 安装器升级。H7 回执和升级后独立程序读回均为 PASS：

- 安装器执行 1 次，卸载器执行 0 次，Emby Theater 应用启动 0 次。
- 2159 个声明 payload 全部匹配；实际程序目录 2163 个文件，缺失 0、变化 0，另列 3 个额外文件。
- 994 项 PROFILE 全文件保持不变。
- 桌面与开始菜单两个快捷入口均存在，且 target 已核验。
- 安装器根进程与所属 Inno TEMP 子进程均通过绑定进程句柄确认实际退出码 0；所属 TEMP 根已消失。

本次 H7 只代表该次同目标升级与文件/资料回读。既有 0.3.6↔0.3.8 有界生命周期验收属于先前证据，不能替代 H7，也不合并成额外场景通过。H7 不覆盖 14 项完整矩阵、真实播放、远控或其他未执行场景。

## 安装器与五个附件

| 附件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.3.9-win-x64-setup.exe` | 175736588 | `1a323bc48b931884ec7cbeec6a0acf01961291add9e7dcf53d6fd853ca94b9cf` |
| `EmbyTheaterEnhanced-0.3.9-win-x64-setup.exe.provenance.json` | 2154 | `8c3d64011d77535dfe19b3dac5b3cf4d599235de50a863ed555305d03d8074de` |
| `EmbyTheaterEnhanced-0.3.9-win-x64-setup.exe.sha256` | 110 | `edb7068731399c8301b7c5d2c53a43f301c4fcc51f18057bcd53935bf213f2f6` |
| `RELEASE_NOTES.md` | 1885 | `886bf2d80f36e016238564a432802cba1849712a35b33f98906f4c3bc9b55b3b` |
| `SHA256SUMS.txt` | 436 | `e21b86485c7a576742c2f35605e972737d7745c4b34b2c42c04b00d2c05f675f` |

## 公开附件与远端核验

四个小附件已通过匿名完整 GET 下载；安装器通过21个有界 range 覆盖第0至最后字节，逐段核 Content-Range、长度并按顺序组装，完整175736588字节 SHA-256 与上表一致。五文件各自的实际下载字节均重新计算 SHA；provenance、单文件 SHA、SHA256SUMS 及产品 source 的 RELEASE_NOTES Git blob/公开正文相互对应。未用 GitHub digest 替代实际下载。

公开读回确认5附件、非 draft/Pre-release、产品 annotated Tag/source、PR #43 正常合并；此前20个 Release 及其附件身份/正文/标志、43行旧Tag引用保持，Stable/Latest仍0.3.1。仅公开上述5附件，不包含profile、备份、私有harness和机器日志。

## 验收边界与过程记录

H7与安装后父独立5组回读均通过；原0.3.6↔0.3.8子场景分开保存。固定Inno6.7.3的两项已核卸载延后残留仍保留，不手删，也不宣称全盘TEMP文件清零。完整14项、空资料首次应用初始化、UAC接受/拒绝、人工取消、失败恢复、前台、真实Emby播放与远控没有在本次发行中新增验收。

材料门禁首次汇总解析未识别 Node TAP 的 `ℹ` 前缀而误标 FAIL；原运行日志保留，初版回执原字节未恢复，主线程从同一日志独立复算210/210且未重跑。旧失败及后续独立验证回执分开。安装器PE原始版本字符串的尾部ASCII空格按实际记录，数值版本为0.3.9.0；没有为显示差异重建安装包。
