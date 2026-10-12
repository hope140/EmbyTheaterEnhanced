# CD2 新资源有限刷新

目标版本 v0.3.1；本页是独立产品 PR 的设计和验证合同，不表示已发布。

参考 [ETLP beta 固定实现](https://github.com/hope140/embyToLocalPlayer/blob/54b2abae0537f1b4c65752edaac059d3cda4790e/utils/clouddrive2_client.py)。ETE 仅将 FindFileByPath 的 gRPC NOT_FOUND 判为可刷新的 not_found；mapping_miss、空/无效文件响应、timeout、鉴权及其它错误均不触发。

确认目标缺失后，从直接父目录向上最多探测 3 层，找到存在的目录，再按祖先到直接父目录顺序调用 GetSubFiles(forceRefresh=true, checkExpires=true)。路径不得越过命中规则 cloudPrefix，禁止刷新 /。消费全部数据直到流结束且最终状态成功，不保留目录列表；随后目标文件最多重新查找一次。刷新或重查失败继续 CD2 → Mount → Native；取消向上终止。

正常命中的 RPC 数和 1200ms shared absolute budget 不变。仅 NOT_FOUND 的恢复允许共享期限扩展 1800ms，总上限 3000ms；父目录探测与全部刷新流共用最多 1800ms，重查最多 350ms，下载阶段沿用最多 500ms。所有阶段还受同一次请求的 absolute deadline 限制，direct/same-origin 连续尝试不获得新预算或二次恢复。

每个 service 只有一个刷新锁，锁忙立即跳过；同一目标父目录有 30 秒冷却，包括失败和取消。冷却索引最多 64 项，固定 3 层与有界期限防止无限遍历或重试。Stop/Next/close 通过已有 requestId 和 Abort 链取消流及探测；每个 await 后检查 entry 归属，迟到 end/status/data 不可触发重查或下载。

Token、流目录、条目与 URL 保留 main-only；诊断只增加固定阶段/原因、层数及耗时，不输出路径。PlaybackManager、MediaSource、PlaySession、远控、Together、Native Helper 和 DirectUrl 的 file-local UA/header 边界保持。

验证覆盖新文件、缓存命中、父目录缺失、鉴权、超时、流完整结束、并发/冷却、Stop/Next/close 和 late response，以及原 direct/same-origin/Mount/Native 回退。真实新资源需要用户新入库样本，尚未执行；假服务测试不替代真实 CD2 或呈现验收。

## 本候选自动化验证

- 新恢复测试 26/26；包含真实 loopback gRPC 假服务、两种 EOF/最终状态顺序、3000ms 共享上限、父目录探测期间取消与 64 项冷却容量。
- CD2/预算/STRM/设置相关新旧集合 117/117。
- 使用 manifest 哈希核验的只读原始输入执行 PlaybackManager/Session/Stop/Next 测试 58/58。
- 完整公开离线集合 728/728；按既有 runner 排除 6 份材料依赖测试。上述 58 项单列，不与公开集合相加冒充完整实服验收。
- JavaScript、PowerShell 语法、有限凭据扫描、proto 哈希与差异检查通过。

## 真实新资源验收入口

在实际 ETE 客户端使用本 PR 的候选后，新入库一个尚未由 CD2 目录缓存发现的资源。测试前不要手动浏览/刷新该父目录，以免提前预热缓存。记录脱敏的 cd2 resolve/refresh 阶段、原因与耗时；仅目标查询确认为 not_found 才能把后续恢复归因于本功能。

先播放新资源，核对刷新完成后命中和实际视频/Session；再次播放同一文件验证正常缓存命中没有刷新事件。新冷场景需要另一新资源，或等待 30 秒冷却后使用尚未发现的文件。刷新期间分别操作 Stop 和 Next，确认旧媒体不会在迟到响应后加载；不能仅以 URL 返回或时间推进代替可见画面与远控/Together 验收。

实际客户端、冷资源及实测诊断目前未提供，以上步骤尚未执行。本 PR 不合并、不发布 v0.3.1，也不改现用客户端。
