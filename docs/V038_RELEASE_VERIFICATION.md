# v0.3.8 发行核验

## 发布身份

[v0.3.8 GitHub Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.8) 已发布，PR [#42](https://github.com/hope140/EmbyTheaterEnhanced/pull/42) 已正常合并。产品Tag/sourceCommit为 `v0.3.8` / `0bbc504fbb6ca98dfb7476e8078c4483347b4375`。Release为非draft测试版；Stable/Latest保持v0.3.1。后续文档HEAD与该产品source/tag分开记录。

| 项目 | 实际结果 |
| --- | --- |
| main CI / Tag CI | 各1095/1095，fail/cancelled/skipped均0；材料210/210通过 |
| Runtime | 2159 payload / 2160完整文件 |
| build-manifest SHA-256 | `33c810db51b5aa0198ace92642870f9d8b0e0f364dfdc3f1e1f6c8d54cedf835` |
| Payload set SHA-256 | `96c25cb1fda9206eb29046eda237d1ada98eec880829ec5c14ec1a9ea73ff3bf` |
| 标准安装器 | EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe，175754512 bytes；PE版本0.3.8，Authenticode NotSigned |
| 解包完整集合 | {app} 2160文件，与runtime逐路径、大小及SHA一致 |
| 已审候选比较 | 相对bd486f5完整集合一致；6个来源身份元数据不同，其余2154文件字节相同 |
| 隐藏检查 | 62项隔离合成通过；实际窗口show、网络、Native子进程及所属残留均0 |

来源清单记录109个产品source文件，source file-set SHA-256 `c44adf6ac2325fbe544824fce2b5322d572647b963c5672dd9bbc0de8447d4dd`，source-provenance SHA-256 `c31c300854197e9de96c6cb1a9a87db3ae52c0d059ec859c8dcb6016bb7ff6ba`。构建使用原固定输入、工具链及来源门禁；runtime/input/source provenance均绑定准确main。prepared Electron树按当前固定清单校验，本轮未重新下载Electron ZIP归档，不能表述为归档回读。

## 五个公开附件

全部附件均匿名下载全部字节后重新计算大小和SHA。安装器按序range完整覆盖0至最后字节，核Content-Range并重算完整SHA，安装器解包另核完整集合与逐SHA；其余4项完整GET。provenance、单文件.sha256、SHA256SUMS及同源RELEASE_NOTES关系一致；未用GitHub digest代替实际下载。

| 附件 | 大小 | SHA-256 |
| --- | ---: | --- |
| [EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe) | 175754512 | `2f0be46a17c16522f677e7a174da72815bec8d9a06ffb0181a5183670fdef2db` |
| [EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe.provenance.json](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe.provenance.json) | 2154 | `e46ef99b5f90651abc1ee02f46e9fec5d62b92d4d15412bf4ac6f2675147fb84` |
| [EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe.sha256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe.sha256) | 110 | `9151c3b23e737be722ab4d000a0ffe168c432a669959a43fef8848d65c6f099e` |
| [RELEASE_NOTES.md](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/RELEASE_NOTES.md) | 1731 | `7b265f43c27b32c6dc5395b3b28869beccd952f529118306d0a939a97eff2958` |
| [SHA256SUMS.txt](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/SHA256SUMS.txt) | 436 | `3198ef1223d28f2245be36642701ef99caefbf71c817d54d34ee1a5d6f84524a` |

RELEASE_NOTES.md使用产品source的原始Git blob，含其末尾LF；Release正文通过API使用同一文本。SHA256SUMS覆盖另外4项。公开附件仅上述5项，不包含候选wrapper、profile、私有harness或机器日志。

## 用户反馈与边界

用户反馈主要验收 `USER_REPORTED_NO_ISSUE`，其余 `MONITORING`；不扩写逐设备、真实硬件/播放/远控/安装PASS，不等待额外补测。隐藏62项使用实际AMD/DOM和合成API/Player/socket，不代表真实媒体、服务器、显示硬件或前台。系统安装、主动前台、真实服务器业务与个人profile/凭据读取均未执行。

完整lease/CAS、跨renderer同值接管、可靠显示目标映射和完整app-exit显示恢复仍为UNKNOWN或未实现；STRM/115内嵌字幕/音轨切换延迟与缓存优化暂缓。许可与第三方材料限制继续见[许可说明](LICENSING.md)。本轮只完成038发行，不启动后续版本。

首轮私有脚本适配和嵌套Windows PowerShell5.1的Get-FileHash发现失败、直接5.1诊断及最终PowerShell7审计均保留；旧签名查询空状态无效，另经当前宿主ErrorAction Stop只读查询记录NotSigned。所有产品、来源、SHA和原VerifyOnly门禁保持，不把工具宿主失败称为产品问题。旧bd486f5本地候选与profile保持原身份，它们不是本发行来源；旧Release/Tag及资产保持。
