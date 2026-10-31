# Electron 44.5.0 焦点修复候选

本分支将固定 Windows x64 Electron 从44.4.2升级到44.5.0，处理原生 JavaScript 确认框关闭后输入和下拉控件可能失效的问题。当前只准备独立候选，不表示 main、已发布v0.4.7或用户安装已更新；不增加全局 focus/blur、置顶或模拟窗口切换。EWT 的异步确认框候选由插件自身维护，不混入本客户端升级。

## 官方依据与归因边界

[44.5.0官方发行说明](https://releases.electronjs.org/release/v44.5.0)列出Windows上关闭alert/confirm后输入失效修复。[44分支回移PR #54461](https://github.com/electron/electron/pull/54461)已于2026-09-26合入，提交为`517af6bea8132d312eef2bf2d82e12cf7014ba70`。其说明描述原生对话框将窗口激活交还时renderer仍被阻塞，导致Aura与Blink焦点不同步，直到窗口再次失活／激活。实现于对话框结果送达后，在view原本拥有焦点且内部状态不一致时重新同步，不以客户端强制激活窗口代替。

该机制与取消确认也能触发、输入和下拉同时不可用、切换窗口后恢复的复现条件一致。源码与上游修复支持升级候选，不替代在实际Windows客户端复现修前／修后差异，不能据此声明所有EWT下拉问题均已归因或修复。确认取消后EWT不发送删除请求，也不进行删除后的房间重绘；这排除了该取消路径必须依赖服务器删除的解释。

## 固定输入与依赖

| 输入 | 44.5.0固定身份 |
| --- | --- |
| 官方发行 | [v44.5.0](https://github.com/electron/electron/releases/tag/v44.5.0)，Stable，2026-09-29T19:09:26Z |
| Windows x64 ZIP | `electron-v44.5.0-win32-x64.zip`，157966405 bytes，SHA-256 `b3405d8847bc5054cd16272f538d22ba5b73032945e85cef26241f7135035278` |
| 完整runtime树 | 73文件，tree SHA-256 `0c3e3057b24fc4458dbcc5b038eae7b6e68d61ca140653eda668dc73c03ab084`，算法沿既有input validator |
| electron.exe | SHA-256 `3e76fb616aa60a850b7f64800dd81b21e06ddee3f1919650183b047f03e7cb9f` |
| 同源Vulkan loader | SHA-256 `e96d215161a34c5da71177a257b9e6146870438db37d65b609eac828a69f5315`，仍从标准Electron payload逐字节复制到原位置 |

归档已实际读取并与官方SHASUMS256和Release asset digest分别比对，ZIP CRC及完整提取树通过；原始归档／提取文件不进入Git。两份官方许可／通知随完整树保留，没有以旧版本通知替代新归档文件。

[44.4.2](https://releases.electronjs.org/release/v44.4.2)与[44.5.0](https://releases.electronjs.org/release/v44.5.0)公布的Chromium152.0.7977.130、Node24.21.0、V8 15.2.124.28相同；候选processVersions只将electron改为44.5.0。版本号相同不代表所有内部字节或行为相同，Vulkan loader实际已变化。项目npm、Koffi3.3.3及锁文件、Host、Native Helper、libmpv和固定工具链不升级；不更换Web快照、播放／Session归属、profile或用户配置。

## 实施与验证

固定manifest、获取计划和版本／路径守卫同步到44.5.0，继续拒绝其他版本、旧树或混合输入。Windows本地媒体组件的loader版本、原归档身份和DLL摘要同步，保持原始复制／来源关系。既有Windows打包selfcheck增加四项实际processVersions与准确提交manifest比较，再沿原Koffi加载／WinRT／DWM绑定验证；既有隐藏窗口生命周期验证继续运行，不替代可见焦点验收。

本地已完成：

- `prepare-electron-runtime.ps1`沿原归档校验、Expand-Archive、目录校验和复制后校验全部通过；准确73文件树没有手工替换成员。
- 首轮输入／版本／获取计划／本地媒体打包／退出／来源回归33/33通过。另补混合旧版本loader和错归档身份的拒绝测试，阻止在创建输出前接受混合来源。
- 增补后的同组回归35/35通过，JS548份／PowerShell53份语法和645份维护文本有限凭据模式扫描通过。

完整公开回归、静态检查及准确提交Windows CI／普通独立包结果待追加；当前不声明Windows原生FFI、窗口焦点或真实媒体验收通过。普通构建仍使用既有`public-ci.yml`，不降低门禁或改动工作流。真实验收应保持EWT版本不变，分别测试确认取消和确认成功后输入／选择器、重复操作、暂停返回以及关闭退出；实际播放／硬件与安装验证分别记录。
