# v0.4.17 修复测试版准备

候选版本为 **0.4.17**，拟用 Tag **v0.4.17**，拟用标题 **v0.4.17 测试版**，渠道 `testing`、`prerelease=true`、`make_latest=false`。此前的 0.4.16 仅为本地验收包；使用更高版本避免已安装同版本时更新器不提供候选。本文是发布准备记录，不表示 Tag、Release 或资产已经创建。

## 来源与范围

以 main `bafe793bb8685737c708c2e7eeaf3a82fbede962` 为基础，保留已合并 PR #95 的分支队列隔离、四个白名单测试文件的受控进程并行及完整来源门禁。在独立分支重放修复来源 `f9118df0eb2d29ea2f746ff990d4a9d1a1e2e752` 的五项提交；冲突只涉及两份追加记录，保留双方内容。

产品范围为播放错误提示的请求归属、加载期 EOF／起点处理、解析设置保存后的新播放配置快照、[安全网络诊断](MEDIA_NETWORK_DIAGNOSTICS.md)和[完整下载本地优先](LOCAL_DOWNLOAD_PRIORITY.md)。提前下载、mpv 正常缓存、共享及配置 lease 生命周期保留，不引入下一集预载或播放暂存。

版本的真实输入是根 `package.json.version`、根 `package-lock.json.version` 及 `packages[""].version`。runtime package、build manifest、安装器和发行来源由标准构建使用同一产品版本生成并核验。固定上游模板的历史版本不手动改写。

## 证据边界

用户已确认原验收包修改解析设置后无需重启即可生效；其他播放异常因为偶发，尚不能确认全部解决。没有据此宣称未知直链根因已修复或所有播放路径均通过实际验收。

历史来源 `f9118df` 曾完成本地完整回归 2546 pass／0 fail／3 skip、显式材料 136/136，以及 Windows 构建、完整 Helper 隐藏合成 smoke 和解包比对。这些只属于原提交。本候选的 main 整合、版本与发行说明变化需重新运行受影响测试及准确来源的 Windows 构建；结果以 PR 检查和对应 Actions run 的真实回执为准，不沿用旧包作为发行资产。

网络诊断只输出允许的枚举、数字与运行内 HMAC 引用。实际固定 DLL 覆盖 HTTP 状态及部分 curl 失败；匿名日志保留 Helper 级归属。DNS／TLS 握手／超时等仅有格式投影测试的项目，不宣称实际触发覆盖。完整本地文件首次读取校验可能耗时，支持取消且不沿用旧五秒网络预算；没有完整离线入口。真实安装、偶发故障复现、真实服务器播放及跨环境使用仍须继续测试。

## 发布前置与授权边界

标准入口是 [Manual verified release](ACTIONS_RELEASE.md)，从 main 调度，要求准确 source 已包含在 main，且已有 Tag 指向该准确 source。正常 `public-ci.yml` 的 `release_package=true` 仅构建、核验并上传 Actions artifact，不创建 Tag 或 Release。

本阶段仅准备非保护分支、草稿 PR、测试与标准五附件构建。真正发布仍需单独确认：将已核准 PR 合入 main，核对合并后的准确 source，创建并推送 `v0.4.17`，再从 main 以 `channel=testing`、`expected_latest_tag=v0.4.0` 调度发行。若复用既有发行材料，其 source SHA 必须完全一致；合并导致 SHA 改变时必须重新构建对应来源，不能改名复用草稿分支安装器。正式 Latest 保持 v0.4.0。
