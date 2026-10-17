# Web请求归属与日志标签审查

两项均已按父审限定合同本地实施。E1相关诊断45/45通过；E2直接函数材料16/16之后补上真实Movie→Search组合，19/19通过。E2合同同时闭合成功退休与失败两条终态，并保持Search专属标记和提交守卫；初稿catch-only及仅中间变换验证均不是完整组合验收。

## E1 诊断标签的条件式隐私缺口

Observed：`src/electronapp/enhanced/diagnostics.js` 的 sanitizeRecord 对 category/event（含stage回退）调用 safeLabel，只替换字符并截断，没有调用已有 sanitizeText。受信任主frame的 LOG IPC可以送入该记录，logger持久化和readRecent再次投影仍采用sanitizeRecord。合成secret assignment在标签中保留值，合成路径标签保留路径片段；相同输入放入details.message时已被脱敏。

检查到的正常产品调用使用固定标签，未发现把真实用户数据拼入标签的当前调用。故此为异常/有缺陷renderer记录可触达的条件风险，不声称常规播放发生泄露，也不扩大为新认证或IPC边界问题。

建议最小差异：只在 `diagnostics.js` 的safeLabel中先调用已有sanitizeText，再执行原字符白名单、64字符截断和fallback。普通固定标签保持字节一致；category、event、stage标签遵循与details已有相同的有限脱敏模式。允许相邻诊断单元测试覆盖secret assignment、认证头、URL、路径标签及正常标签/fallback；不新增label枚举白名单、不改变schema/字段/IPC/日志目录/轮转或授权判断。有限脱敏仍不等于完整秘密识别。

验收：合成标签用例修前保留canary，修后相关45/45通过；覆盖category/event/stage各自的assignment/header/URL、Windows两种分隔符与POSIX路径，固定标签、fallback与64长度保持。主审把原输入后缀匹配改成独立canary断言，避免路径分隔符归一后掩盖残留。私有修前/修后与源探针保留；既有schema、timestamp/level、details、序列化与快照门禁通过。

## E2 电影缓存页返回后虚拟分块不可重试

Observed：维护movieBrowser的onPause会递增epoch并拒绝所属请求；当前 `tools/patch-movie-browser.cjs` 在VirtualScroller旧epoch rejection中直接return，留下该chunk的truthy chunksLoaded标记。真实ItemsTab resume(refresh:false)经ListController/ItemsContainer复用同一VirtualScroller，不调用setItemSource重置映射。因此返回原缓存页再次请求同chunk被该标记跳过。

固定VirtualScroller输入SHA为 `D2982A619FDF3DC7F9ED13910D0CAB3723E7122440B02214057D2FC6A592A5B9`。私有探针应用当前生产patcher并接维护Movie wrapper，依次请求chunk30、pause/abort、resume(false)、重试，fetchCalls仍为1且旧chunk marker为true，迟到数据未提交。真实组件生命周期只读调用链与实际函数体合成复现分开记录，不声称前台验收。

批准的最小差异：仅修改patchVirtualScroller、对应材料selftest及必要既有来源hash。对带有现有 `_eteMovieBrowse` 的分块请求捕获一个每次唯一的局部token，并用该truthy token标记其chunk；失败回调，以及原success stale guard返回前，都只在当前map对应chunk仍为该token时清为null。保留全部paused/destroyed/epoch/abort/currentController数据守卫；当前有效成功保留loaded truthy。新query重置map或同chunk新请求使用不同token，旧回调不能清除它。非Movie保持原true/null行为，不改变查询、HTTP、缓存内容或焦点归属。

固定组件内chunksLoaded的读取是truthiness判断，setItemSource会重置map。父审还须确认新增token只承担原标记的请求归属，不改变公开接口。既有patcher已登记在overlay generator、build-input和runtime provenance fixture中；不新增generator。vendor只读，输出由准确Git来源重新生成。

必要失败回归：实际Movie wrapper pause→resume(false)取消失败可重试；已fulfilled但commit前epoch变化的成功退休可重试；旧query成功/失败不得清新map；同epoch同chunk旧请求不得清新owner；当前失败可重试；正常成功保留loaded且不重取；普通列表行为不变。扩展 `tests/movie-browser-material-selftest.cjs`，运行相邻helper、材料与最终来源门禁。

E2不涉及PlaybackManager、Session、媒体身份、Native或协议；因涉及复杂异步归属，仍先父审后实施。完整原始证据保存在 `.work/overnight/E2_CHUNK_REPRO.cjs` 与E2审核报告中。

实施后普通列表继续true/null；Movie有效成功保留truthy token，失败与成功退休都只清其当前token。同epoch替换用例使用同一map内同chunk的新owner，分别覆盖旧成功和失败。

8cc7425首次材料门禁200/207：输出绑定误用了Movie中间SHA `2ADE4984...B597A9`，生产随后还有Search guard变换，实际最终SHA为 `8BFF9879...6BAFC4`；该组合也将token误扩到Search。旧19项补充回归17通过/2失败；私有Movie-only草案先验证18/18。父审随后批准限定修正：保留原共享browse提交guard，Movie标记另用原 `_eteMovieBrowse` 的直接属性查找，避免Search变换扩大marker owner；不改变Search变换器。Search-only正常/失败/退休/新query守卫及普通列表保持，实际最终组合19/19通过。

最终组合输出SHA为 `54537E38237C5DDD5B0B087249E7B29BCFF5C409DEA4A4867FF607CAAAC3802F`；固定base和既有generator/input/provenance登记保持。原中间测试、首次材料失败与8cc公开996/996各自保留来源层次，新准确来源的组合门禁与构建重新执行。
