# v0.3.7 发行核验

## 发布身份

[v0.3.7 GitHub Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.7) 已发布；PR [#41](https://github.com/hope140/EmbyTheaterEnhanced/pull/41) 已合并。产品Tag/sourceCommit 为 `v0.3.7` / `bf6e48214820fac0558bdfe7f37526f1c7a3d7c2`。Release为非draft测试版；Stable/Latest保持v0.3.1。后续文档HEAD与该产品source/tag分开记录。

| 项目 | 最终身份 |
| --- | --- |
| 主线CI / Tag CI | 各 977/977 通过；固定材料门禁 200/200 通过 |
| Runtime | 2159 payload / 2160完整文件；build-manifest SHA-256 `1439f6521e32d40758b049f4e15eb4ed171a9698bdbc27d776c9dfb303cec19e` |
| Payload set | SHA-256 `6844035b721bbafc782a45ad53a9363070c654c4cba98ebc92e0a7f115359c1e` |
| 安装器 | `EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe`，175733823 bytes，SHA-256 `aca0ff577ad111f726bf769706b23d5e0e2d7d1706e7bfa768c2d15e9db1f49d` |
| 解包完整集合 | `{app}` 2160个文件，与runtime逐路径、逐SHA一致 |
| 候选比较 | 与已审1246da1候选文件集合一致；6项source/provenance身份元数据变化，其他产品文件字节完全一致 |
| 隐藏检查 | 53项隔离合成检查通过；实际窗口show、网络请求、Native子进程和所属残留均为0 |

来源清单记录109个产品source文件，source file-set SHA-256 `08805be515ec709799946321ec4067b598a6446bbb2902d05cd0ac92f166b3fb`；source-provenance SHA-256 `e51ee6abce2dc9900024177d4640713f49ed0bc48255c785a965a18ac6eeeadf`。主线最终构建使用原VerifyOnly及来源/provenance验证；安装器provenance绑定sourceCommit、v0.3.7、安装器字节及runtimeManifest SHA。固定prepared物理输入按原清单和工具链校验；本轮没有重新取得或独立回读Electron ZIP归档，不能将prepared树核验表述为该归档回读。

## 五个公开附件

以下附件均已匿名完整回读，并逐项核对长度、SHA、安装器provenance、单文件校验、SHA256SUMS和RELEASE_NOTES关系。

| 附件 | 大小 | SHA-256 |
| --- | ---: | --- |
| [EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.7/EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe) | 175733823 | `aca0ff577ad111f726bf769706b23d5e0e2d7d1706e7bfa768c2d15e9db1f49d` |
| [安装器provenance](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.7/EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe.provenance.json) | 2154 | `b927785033c89a858fcc60a709c92c51ece70ef700a402c886ba012a434de294` |
| [安装器.sha256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.7/EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe.sha256) | 110 | `53d0e48e20ed628e2d432c972c0604a357f86a2231a92551556163c5285298df` |
| [RELEASE_NOTES.md](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.7/RELEASE_NOTES.md) | 1639 | `043c871e8ebd1beec4d3656f5928ccc14b4176a2fd52826af877ff46539970fd` |
| [SHA256SUMS.txt](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.7/SHA256SUMS.txt) | 436 | `48a64463c6a1172775d26474dbd3059e8bbb1f500ab0dae7fdd84eabf17af6c0` |

## 用户反馈与验收边界

用户按父会话清单第1—4与第6项反馈正常，仅记录已测场景 `USER_REPORTED_NORMAL`。第5项电源/退出组合由用户明确暂缓，记录为 `USER_DEFERRED_NOT_TESTED`，不作为本次发行等待条件。未说明的媒体/设备组合不扩写为PASS。

53项隐藏检查使用隔离AMD/DOM、合成API/Player/socket等替身；0 show/网络/Native/所属残留只描述本次隐藏运行。它们不替代真实前台视觉、真实服务器播放/远控、OS电源效果、系统安装或硬件验收；本执行会话的独立执行证据仍保持NOT_VERIFIED/NOT_EXECUTED，用户已测场景另按USER_REPORTED_NORMAL记录。本次授权未包含系统安装、主动前台、真实服务器写入、读取旧profile或启动后续版本。

旧本地候选wrapper ZIP仍绑定source1246da1023c43981c7ed40a4e556cb95c7eb7e02，240504661 bytes，SHA-256 `9e7ea2d64df19838e2942674f4efbe23be54cfeff8b0eadab74fea281180ed6c`；它是历史候选，不是本发行安装器来源。旧候选目录/profile/log保持，不读取、不修改、不纳入发行附件。
