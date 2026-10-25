# v0.4.4 测试版核验

## 来源与范围

本批以 main 合并 PR #82 的 `dd0fd523522016e7d51653a32084cd21df80e85f` 为功能基线，包含 PR #80 的包内 Anime4K 资源退役、PR #81 的脱敏播放诊断和 PR #82 的详情图片交接／首页驻留返回修复。版本提交只同步根 package／lock 三处版本值与发行文档，运行时和安装器仍由现有 builder 派生，不改固定依赖、授权、导航代次或播放策略。

用户对 `f7b60add83762d2d34892c5008fbc08135c84012` 验收包反馈暂未发现问题并批准测试发行。该包的 Windows run [40206256432](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40206256432) 全回归 2178/2178、0 skip，Host／runtime 来源及安装器解包比对通过。六项 Electron 窗口退出探针只覆盖受控窗口生命周期，不代表普通客户端安装、真实播放退出或所有 NAS／硬件组合验收。旧验收包不能改名为新版本，也不能替代新版本最终 source 的构建结果。

## 新版构建与发布合同

根 package.json、package-lock.json 根及 packages[""].version 一致为 0.4.4。最终 main source 必须含上述功能基线及版本提交；核对普通 CI 后，按准确 Tag／main 手动运行 `public-ci.yml`，参数 `release_package=true`、`build_input_benchmark=false`，回读 run.head_sha 与产品 source 一致。

新安装器必须从最终 source 重新构建；核对 Host、完整回归、显式材料、runtime 版本／来源、安装器测试／解包全量比对、五附件及原始 notes。Release 标题固定为“v0.4.4 测试版”，`prerelease=true`、`make_latest=false`，保留 v0.4.0 Latest 和所有旧 Tag／附件。构建 workflow 仅暂存附件，不自动发布。

本页为发布准备时的证据边界；最终 Tag、run、安装器 SHA-256、五附件及公开回读结果待实际完成后补记。README 的最新测试版下载入口只在真实 Release 资产存在后更新。包内缓存不替代服务器授权、最新进度或播放数据；飞牛认证、共享视频缓存及未合并更新优化不在本批。
