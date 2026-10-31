# v0.4.10 测试版核验

## 准备状态

准备 Windows x64 testing 标准发行材料，尚未合入 main、创建 Tag 或发布。正式 Latest 核对为 v0.4.0／Release 422090288，最新测试版为 v0.4.9／Release 429821685；本版 testing 不改变正式 Latest。

## 来源与范围

远端 main 基线为 `cd39dd10dd7d1bebd1bd3fcb478cbc9002bdc4eb`，产品与 v0.4.9 来源 `07326205f9260e817e88655081a1df44cc96e445` 相同。片头修复与脱敏定位诊断来自 `3d3f1ad7a272cb4850b3a5f195a46ef1c8d18f70`，验证记录为 `5e5e736e6c54c940a19c5ce8d5e6e7043d9467e4`。本轮仅在该候选上同步根 package／lock 三处版本为 0.4.10，并更新发行说明与核验文档；准确发行源码在提交后补记。

已确认并修复片头跨集残留、异步验证后的旧点击作用到新播放，以及片头终点达到／超过片长。普通 Seek／EOF 行为保持，只增加有限脱敏诊断；现场普通拖动后提前结束的根因未确认。详细边界见[定位诊断说明](SEEK_EOF_DIAGNOSTICS.md)。

与 main 对比，未修改预载／缓冲暂存实现、下载功能、固定 Electron／libmpv／Host 输入、vendor、native、安装器或工作流。EWT 插件由独立项目处理，本候选不包含其代码。

## 验证

产品候选的本地公开 2339 项为 2308 pass／0 fail／31 平台 skip，定向 overlay／来源材料 98/98、定位／隐私接线 99/99，JS 552／PowerShell 53 语法及有限凭据模式检查通过。首轮未提交生成器被来源守卫拒绝的三项失败保留在[维护记录](DEVELOPMENT_LOG.md)。这些是候选证据，不冒充新版本准确源码的 Windows 构建结果。

0.4.10 准确提交将执行版本／发行合同回归、Windows 公开 CI，以及既有 `public-ci.yml` 的 `release_package=true`、`build_input_benchmark=false` 标准构建。标准构建成功才形成可供后续既有 release 流程复用的发行材料。结果、run／artifact 身份与独立字节核验状态在实际取得后补记。

## 发布与验收边界

既有发布流程要求准确 source 已包含于 main、新 Tag 固定同一 source，并满足五附件、来源、notes 与 Latest 保护门禁。本轮先完成普通分支与标准构建；合 main 前停下报告准确待合内容，不提前派发不满足条件的发布，也不修改门禁。

当前没有操作现用客户端、登录真实服务器或执行可见播放复现。合成测试、Windows 自动化、安装包字节核验与实际片源验收分别记录；普通 Seek 后 EOF 仍属于待现场诊断的问题。
