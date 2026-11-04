# v0.4.11 字幕多选测试版发行核验

## 发布后回读（2026-11-02）

[PR #88](https://github.com/hope140/EmbyTheaterEnhanced/pull/88) 以 merge commit `5749f99182cbf6ec6f2b9ed9ed2d5db70e3a258d` 合入 main，保留准确发行来源 `ab66744349794221a4b633af325dcb3a52a39fc9` 为父提交；轻量 Tag `v0.4.11` 指向该来源。[标准发行构建](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41468086861) 和[发布工作流](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41544694352)均成功；准确源码的 Windows 完整测试 2444 项：2442 pass／0 fail／2 skip，安装器解包与 runtime 回比通过。

[公开 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.11) ID `432074897` 为 `prerelease=true`、`draft=false`，五附件已公开并与构建回执的大小／哈希一致；安装器 SHA-256 `77da76f96db178f09af8467ddd2a8aba80ec0a95ea233ba93edf0b518dc02573`。正式 Latest 回读仍为 `v0.4.0`（Release ID `422090288`）。用户已验收字幕多选设置；默认轨道实际由服务器返回的选轨结果决定。此版不含更新交接修复。以下为**发布前候选阶段记录**，其中“未合并／未发布”只描述当时状态。

## 来源与范围

已发布 v0.4.10 的产品 Tag 固定 `52288ab3f3d6a9fb51f0f205c38df6339e702a01`，其后 main 文档提交为 `2e728a6b11865720bddca543870bf9ff5b6871d3`。本版仅基于该 main 纳入字幕候选 `aa63c4613c270e9225031d1f9213888351d7b80c` 的三项提交，并同步根 package／lock 三处产品版本到 0.4.11，准备 testing 发行说明。更新退出／安装交接修复 `d2a7a0f58eb011b6c2b4b021a3351aef098d4b12`、提前 EOF 新诊断及暂停的播放异常修复均不在本版范围。

字幕首选语言使用现有服务端字段保存有序的逗号分隔值；PlaybackManager 与 Native 选轨链路保持。旧服务器对多值的实际解释及真实播放仍需现场验收，不把设置保存等同于实际字幕选轨。

## 已有候选证据

字幕原候选 `aa63c461` 的 [Windows 公开 CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41456344531) 和[普通手动验收包](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41456366621)均成功。普通包完整 Windows 测试为2444项：2442 pass／0 fail／2 skip，安装器编译、测试、解包和 runtime 回比成功；文件名带 `0.4.10-test-aa63c4613c27-41456366621-1`。这是产品候选证据，不是本版准确0.4.11源码或标准发行包。旧的 `409b31b` 手动运行 `41453274888` 因来源夹具缺新生成器而失败，已在 `aa63c461` 修复，不把该失败算成通过。

## 准确版本门禁与发布停点

本版准确来源提交后须重新运行 Windows 公开 CI、`public-ci.yml` 的 `release_package=true`／`build_input_benchmark=false` 标准构建，并独立核对来源绑定、版本、材料、Host、安装器编译／解包回比、五附件的名称／大小／SHA-256、provenance、原始 notes 与校验表。普通0.4.10-test包不能通过改名变成0.4.11发行包。

经用户确认 main 合并影响后，核对 main 未漂移，正常合入字幕独立分支；新 `v0.4.11` Tag须固定被 main 包含的准确发行源码。既有 `Manual verified release` 使用 `channel=testing`、`expected_latest_tag=v0.4.0` 和同源码成功标准构建，保持正式 Latest `v0.4.0` 不变。发布后再独立回读实际五附件、渠道、Tag、来源和 Latest。当前没有合 main、Tag、Release 或公开附件的结果。

更新修复分支保留0.4.10源码版本。其独立普通验收包应先安装运行，再选择测试通道由该客户端发起升级到公开的0.4.11；这样执行的是修复版自身的退出与交接逻辑。该现场操作及结果需独立记录，不能由两次构建成功替代。
