# v0.4.4 测试版核验

## 实际发布结果（2026-10-26）

[v0.4.4 测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.4) 已于 2026-10-26 00:46:50 UTC 发布，Release ID 为 `423758655`，`draft=false`、`prerelease=true`；Latest 正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/latest)。产品 Tag／sourceCommit 固定为 `b6fe06b984d74f60bdf82527d0666e920449dedb`；后续文档 main 不改变该来源、Tag 或原始附件。

- [Main CI 40248273710](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40248273710) 与 [Tag CI 40248295647](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40248295647) 均为 2080 pass／0 fail／3 skip。
- [标准发行构建 40248484001](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40248484001) 从上述 source 重新构建，`release_package=true`、`build_input_benchmark=false`；全套 2178/2178、显式材料 135/135 通过，Host／runtime 来源及安装器解包全量比对通过。
- 发布协调端完成五附件下载核对，公开 Release 资产及 GitHub 摘要回读一致；未给旧验收包改名或替换旧版本附件。
- 用户先前对 f7b60add 独立包反馈暂未发现问题。新发行包的构建、解包与受控窗口探针不等于追加普通系统安装、真实播放退出、NAS 或全部硬件验收。

标准五附件为 [Windows x64 安装器](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/EmbyTheaterEnhanced-0.4.4-win-x64-setup.exe)、[来源记录](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/EmbyTheaterEnhanced-0.4.4-win-x64-setup.exe.provenance.json)、[安装器校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/EmbyTheaterEnhanced-0.4.4-win-x64-setup.exe.sha256)、[原始说明](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/RELEASE_NOTES.md)和[四附件校验表](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/SHA256SUMS.txt)。安装器为 162,005,715 bytes，SHA-256 为 `20059a9340d34e23636845f0d8f46fff74a4e6dc752b96c4d023c7765ba65f5f`；原始说明为 2,317 bytes，SHA-256 为 `41601c101545d85c83971ae06595911c10366a88f87cc5f171565f8b055ba97e`，与产品 source 的 Git blob 一致。安装器未签名，哈希核对不代替数字签名或许可审查。

下文保留准备阶段的功能来源与发布合同，实际完成结果以上节为准。

## 来源与范围

本批以 main 合并 PR #82 的 `dd0fd523522016e7d51653a32084cd21df80e85f` 为功能基线，包含 PR #80 的包内 Anime4K 资源退役、PR #81 的脱敏播放诊断和 PR #82 的详情图片交接／首页驻留返回修复。版本提交同步根 package／lock 三处版本值与发行文档，并将原生接线测试中过期的固定 0.4.3 断言改为根版本一致性检查；原接线和字节门禁保留。运行时和安装器仍由现有 builder 派生，不改固定依赖、授权、导航代次或播放策略。

用户对 `f7b60add83762d2d34892c5008fbc08135c84012` 验收包反馈暂未发现问题并批准测试发行。该包的 Windows run [40206256432](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40206256432) 全回归 2178/2178、0 skip，Host／runtime 来源及安装器解包比对通过。六项 Electron 窗口退出探针只覆盖受控窗口生命周期，不代表普通客户端安装、真实播放退出或所有 NAS／硬件组合验收。旧验收包不能改名为新版本，也不能替代新版本最终 source 的构建结果。

## 新版构建与发布合同

根 package.json、package-lock.json 根及 packages[""].version 一致为 0.4.4。最终 main source 必须含上述功能基线及版本提交；核对普通 CI 后，按准确 Tag／main 手动运行 `public-ci.yml`，参数 `release_package=true`、`build_input_benchmark=false`，回读 run.head_sha 与产品 source 一致。

新安装器必须从最终 source 重新构建；核对 Host、完整回归、显式材料、runtime 版本／来源、安装器测试／解包全量比对、五附件及原始 notes。Release 标题固定为“v0.4.4 测试版”，`prerelease=true`、`make_latest=false`，保留 v0.4.0 Latest 和所有旧 Tag／附件。构建 workflow 仅暂存附件，不自动发布。

README 的最新测试版下载入口在真实 Release 资产存在后同步。包内缓存不替代服务器授权、最新进度或播放数据；飞牛认证、共享视频缓存及未合并更新优化不在本批。准备合同不替代上节的固定产品来源与实际发布结果。
