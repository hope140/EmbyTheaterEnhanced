# v0.4.5 测试版核验

## 来源与范围

用户已确认独立候选 `7bfc147a07d4fed0b1bf0fd481ff365e00fc7857` 验收通过，并批准合入 main、发布新的测试版。该候选已于本轮快进合入 main；原 main `95dc3f3086e53a2e730eaa4a69d1fb271f7ca060` 的更新流程优化及首页图片内文字修复随版保留。增量为首页同节点导航保护、单条删除 DTO／版本端点、透明字幕背景色值和首页数据刷新后位置保持，不合入未验收的共享播放缓存、下一集预加载或飞牛认证分支。

候选 [公开 CI 40731116211](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40731116211) 与 [验收包构建 40733352952](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40733352952) 均成功。用户验收属于该候选；0.4.5 只同步根 package／lock 三处产品版本和发行文档，不修改候选功能代码。新安装器须由最终版本提交重新构建，不能改名旧验收包。

## 本版发行合同与当前状态

本页当前为发行准备记录，尚未声明 0.4.5 构建或发布完成。最终 source、准确 main／Tag CI、标准发行构建、五附件及回读结果在完成后补录；后续文档提交与产品 source 分开记录。

根 package.json、package-lock.json 的两处版本统一为 0.4.5；运行时和安装器继续由既有 builder 派生。按最终版本提交运行 `public-ci.yml`，`release_package=true`、`build_input_benchmark=false`，验证 run.head_sha 一致。完整回归、显式材料、Host／runtime 来源、安装器测试和解包全量比对必须通过，再核对标准五附件、原始 notes 与 SHA256SUMS。

Release 标题固定为“v0.4.5 测试版”，`prerelease=true`、`make_latest=false`。保留所有旧 Tag／附件和 v0.4.0 Latest；README 最新测试版入口在实际发布后再更新。

## 验收边界

本版沿用已验收的首页／删除／字幕及主线功能。候选合成数据验证不代表新包的每种 NAS、字幕样式、显示硬件或安装环境均已通过；不执行真实媒体删除，也不修改用户服务或个人配置。内容缩短时位置按有效范围限制，刷新失败仍显示原错误或回退页。安装器未签名，哈希只核对字节，不代替数字签名或许可审查。
