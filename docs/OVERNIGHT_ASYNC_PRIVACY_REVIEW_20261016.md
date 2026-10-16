# Web请求归属与日志标签审查

当前状态为 `PARENT_REVIEW_REQUIRED`，以下两项仅复现并提出最小差异，产品与测试尚未修改。

## E1 诊断标签的条件式隐私缺口

Observed：`src/electronapp/enhanced/diagnostics.js` 的 sanitizeRecord 对 category/event（含stage回退）调用 safeLabel，只替换字符并截断，没有调用已有 sanitizeText。受信任主frame的 LOG IPC可以送入该记录，logger持久化和readRecent再次投影仍采用sanitizeRecord。合成secret assignment在标签中保留值，合成路径标签保留路径片段；相同输入放入details.message时已被脱敏。

检查到的正常产品调用使用固定标签，未发现把真实用户数据拼入标签的当前调用。故此为异常/有缺陷renderer记录可触达的条件风险，不声称常规播放发生泄露，也不扩大为新认证或IPC边界问题。

建议最小差异：只在 `diagnostics.js` 的safeLabel中先调用已有sanitizeText，再执行原字符白名单、64字符截断和fallback。普通固定标签保持字节一致；category、event、stage标签遵循与details已有相同的有限脱敏模式。允许相邻诊断单元测试覆盖secret assignment、认证头、URL、路径标签及正常标签/fallback；不新增label枚举白名单、不改变schema/字段/IPC/日志目录/轮转或授权判断。有限脱敏仍不等于完整秘密识别。

验收：当前合成标签用例修前保留canary，修后无canary/路径片段；合法标签、schema、timestamp/level、details、现有序列化与快照门禁保持。私有证据为 `.work/overnight/E1_REPRO.cjs`、`.json` 及E1审核清单。

## E2 电影缓存页返回后虚拟分块不可重试

Observed：维护movieBrowser的onPause会递增epoch并拒绝所属请求；当前 `tools/patch-movie-browser.cjs` 在VirtualScroller旧epoch rejection中直接return，留下该chunk的truthy chunksLoaded标记。真实ItemsTab resume(refresh:false)经ListController/ItemsContainer复用同一VirtualScroller，不调用setItemSource重置映射。因此返回原缓存页再次请求同chunk被该标记跳过。

固定VirtualScroller输入SHA为 `D2982A619FDF3DC7F9ED13910D0CAB3723E7122440B02214057D2FC6A592A5B9`。私有探针应用当前生产patcher并接维护Movie wrapper，依次请求chunk30、pause/abort、resume(false)、重试，fetchCalls仍为1且旧chunk marker为true，迟到数据未提交。真实组件生命周期只读调用链与实际函数体合成复现分开记录，不声称前台验收。

建议最小差异：仅修改patchVirtualScroller和对应材料selftest。对带有现有 `_eteMovieBrowse` 的分块请求捕获一个每次唯一的局部token，并用该truthy token标记其chunk；失败回调仅在当前map对应chunk仍为该token时清为null，然后保留现有paused/destroyed/epoch阻止旧数据提交的检查。新query重置map或同chunk新请求使用不同token，旧回调不能清除它。未带Movie browse state的VirtualScroller保留原true/null行为；不改变页面查询、加载策略、HTTP、缓存内容或焦点所有者。

固定组件内chunksLoaded的读取是truthiness判断，setItemSource会重置map。父审还须确认新增token只承担原标记的请求归属，不改变公开接口。既有patcher已登记在overlay generator、build-input和runtime provenance fixture中；不新增generator。vendor只读，输出由准确Git来源重新生成。

必要失败回归：pause→resume(false)同chunk重新fetch；旧query失败不得清新query标记；同chunk旧请求失败不得清新owner；真实当前失败可释放并重试；迟到成功不提交；普通列表标记/行为不变。扩展 `tests/movie-browser-material-selftest.cjs`，运行相邻维护helper用例、材料与最终来源门禁。

E2不涉及PlaybackManager、Session、媒体身份、Native或协议；因涉及复杂异步归属，仍先父审后实施。完整原始证据保存在 `.work/overnight/E2_CHUNK_REPRO.cjs` 与E2审核报告中。
