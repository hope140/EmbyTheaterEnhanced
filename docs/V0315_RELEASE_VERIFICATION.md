# v0.3.15 发行核验

## 最终产品身份

[v0.3.15 · 播放后退出修复测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.15) 于 `2026-10-21T15:17:01Z` 公开，Release ID `419704000`，Pre-release、非 Latest。Stable/Latest保持v0.3.1。

PR [#59](https://github.com/hope140/EmbyTheaterEnhanced/pull/59) 正常合并，产品source为 `e150981d85369b9e61559ee53978a25cdad6f7ad`；annotated `v0.3.15` 对象为 `5e718fe7c42fc38790142d95ee278ad011f75b15`，精确解引用到该source。修复基于0.3.14产品`ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867`，范围只有任务栏媒体销毁、回归及版本/发行文件，依赖、Host/Model及拆分分支未混入。

本页为发行后文档记录；产品Tag、五附件和source中的原始notes保持发行字节。

## 修复与测试

原`closed`回调在窗口已销毁时读取`window.webContents`，导致第74行`Object has been destroyed`并中断监听清理。改为绑定时保存所属emitter，dispose先退休状态、重试与监听，只对存活窗口清空已注册按钮；迟到IPC与重复/重入清理安全，保留任务栏播放控制。

同17项回归原发布源码13通过4失败，修复17/17。固定Electron44.4.2原源码三组复现同栈异常，正常before-quit顺序通过；最终构建输出的Electron和模块四组全部退出0，确认真实销毁getter仍抛错而本模块不再访问它。

最终main本地公开集合1202/1202、材料212/212，失败/跳过/取消0；345 JS、28 PowerShell语法及396文本有限模式通过。[main CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39622092517) 与 [Tag CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39622246879) 各1202/1202并完成全部后续门禁。

## 标准构建与包体

从最终source Git blobs、固定prepared材料和锁定工具链重新构建，版本、source/runtime/native provenance、VerifyOnly通过。最终runtime2163完整文件，含2162 payload及build-manifest；固定InnoUnp完整性及解包通过，全部2163路径、大小、SHA-256与runtime一致。

安装器FileVersion/ProductVersion均为0.3.15，175756102字节，NotSigned。build-manifest SHA-256为 `e1aaa3c0d35f3d37c6d44ee411215e49d041028edd4c2b3e899c7481c4933e08`。

## 五附件与公开回读

| 附件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.3.15-win-x64-setup.exe` | 175756102 | `15d750c1babddefd6d4cfc02dd52103e7189e38afe3870113000c34ae5e0bace` |
| `EmbyTheaterEnhanced-0.3.15-win-x64-setup.exe.provenance.json` | 3945 | `734ca53f0c1623cbd117e911b53480d8380fa9dc7ca50a6c9034babe30f70881` |
| `EmbyTheaterEnhanced-0.3.15-win-x64-setup.exe.sha256` | 111 | `988834b0dd756d786a93580a2be481eef6862ec19fcea6b7a4b981cc095ac4b4` |
| `RELEASE_NOTES.md` | 2233 | `c555401b6acc51675a26d2a08ba4c2ccaf77de683fdf622aba1dd4be2a1cf954` |
| `SHA256SUMS.txt` | 439 | `42617d1b9de33a5a810a2297aa1ab27ef05098cd3d0503bb90447df178281ce4` |

SHA256SUMS列出前四件，其自身SHA在上表单列；RELEASE_NOTES附件与最终source的`docs/RELEASE_NOTES.md`原始字节、初始网页正文一致。五附件匿名完整回读通过；安装器通过168个匿名HTTPS Range请求完整重组并验证整文件SHA，其余附件也逐字节核对大小与SHA。

## 历史对象与验收边界

旧26个Release的受保护字段、99旧附件与56行旧Tag引用保持。v0.3.14网页在0.3.15公开及回读完成后，仅将已知问题标题和计划句改为已在新版修复并链接本版；问题描述、其他正文、标题、状态、发布时间、Tag及原始附件保持。网页后续维护与原始notes字节分别记录。

播放/暂停状态由IPC夹具注入，未执行真实媒体、完整ETE Host、服务器、Helper实际播放或系统安装矩阵。整体退出期限、强退策略、显示恢复及字幕/音轨延迟等既有限制保持；可选FFI普通打包边界、第三方来源、对应源码与许可未决事项保持原意。
