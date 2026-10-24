# 九项bug修复候选与新增简验

## 本轮反馈与收尾

用户对415ddf88九项候选反馈除两处固定无效设置外其余通过；这保留为该候选有限验收，不将未明确执行的多版本/双端/硬件检查自动标通过。两处设置隐藏及0.4.1版本收尾见[v0.4.1准备记录](V041_RELEASE_VERIFICATION.md)，最终包仍按新准确来源核对。

保留六项检查点`61dc31814ee66580a55ec0d7a5acbc4b13db0b96`，只追加缩略图纯源`66c6a32d2aca38d922fdb88a6a0e586eae394c1c`；两者共同基线为发布main88578c91。原四项纯源2570c326、EWT纯源cb0ebf78、缩略图纯源66c6a32d均保留。最终九项SHA/新包run及结果按交接绑定，不使用六项包或单缩略图99项检查代替九项验收。

## 缩略图三项增量

1. 已有非空ThumbnailSet即使没有章节，也允许预览；客户端不生成服务端缺失的缩略图。
2. Metadata与图片请求都使用`PlaybackManager.currentMediaSource(currentPlayer)`的实际MediaSourceId，不猜item首个版本；来源缺失或接口不支持时只退回时间/章节文字，不用无版本重试拿到另一版。
3. player/item/server/address/account/credential epoch、实际source与playSession共同界定代次。停止/释放/OSD暂停/销毁及身份变更使所属在途请求取消、旧成功或失败不回填新owner；旧display-item元数据不能改新页面。空结果复用，临时失败可重试，图片仍沿原CSS URL/HTTP缓存，不承诺取消每条Chromium图片缓存传输。

现用VideoOSD overlay仍从固定vendor源转换，许可及原始输入不改；维护ApiClient只增加可选ThumbnailSet AbortSignal转交，保留旧服务器空结果，源码/AMD与selection哈希同时绑定。溯源与限制见[API输入合同](INDEPENDENT_API_INPUT.md#emby-seek-thumbnail-preview-boundaries)。不新增Home缓存、图片缓存库/配额/TTL、媒体播放缓存、手动更新或原生预览功能。

## 与六项的交互及证据

六项行为和原简验沿[六项组合清单](AUDIT_EWT_ACCEPTANCE.md)。缩略图修复不改seek命令、真实seek完成事件或Session上报；当前播放内Seek可以复用同版本ThumbnailSet，不能解除显式暂停。Stop/Next/身份轮换必须同时阻止旧seek进度与旧预览回复污染替代项目。原有界历史、secrets恢复及Framework来源门禁保持。

补充组件测试连接真实libmpv adapter/renderer endpoint事件与固定OSD片段，验证暂停Seek完成保持当前版本/暂停，以及Stop替换同时拒绝旧seek和旧缩略图回复。PlaybackManager/DOM facade及native IPC仍有替身，完整生成PlaybackManager/Session由既有EWT矩阵覆盖；不把两项组件测试当完整Windows客户端。

准确候选执行普通全套、全部显式材料、九项定向交集及原OSD未修复基线对照。还验证API AMD可重现、选择清单、overlay输入/输出与生成器合同、固定许可/vendor字节和HEAD来源。结果以本轮日志为准，Windows/多版本真实服务未测保持NOT EXECUTED。

## 新增给用户的简单验收（与原六项一起测）

父先按新九项准确来源完成独立Windows包验证和隔离启动；旧六项包不用重复验收，旧Windows1683pass不代表九项。测试时段由父协调，当前Work前台保持禁用。使用自己选定的专用媒体/Session，不影响他人在播。

1. **无章节预览**：选择服务端已生成缩略图、但没有章节标记的视频，悬停/拖动进度条应出现对应预览；没有服务端缩略图时允许只有时间文字，不要求客户端生成图片。
2. **多版本绑定**：同一条目选画面明显不同的A/B版本，分别看相同位置预览，应匹配实际播放的版本；切到B后不短暂回显A。实际服务端是否支持带MediaSourceId的ThumbnailSet/图片接口需记录；若不支持，应稳定文字回退，不能宣称多版本已验通过。
3. **快速切换与组合动作**：预览加载中快速换集/换版本、Stop后重播，或退出再进；允许安全清空/文字回退，不允许旧图/旧章节回填新项目。在EWT专用会话暂停Seek到0和小数位置后，仍暂停、进度报真实落点，预览继续对应当前版本。账号/服务器切换只在已选专用测试环境执行，不能借复制登录配置来准备。

原六项简验继续保留：播放→Stop再Play→Next→退出；自动切率等待中暂停保持、明确恢复；EWT暂停Seek0/12.345秒/连续目标及Stop换集后无旧进度污染。R3/R4不需额外人工长期守候。

父统一新Windows排包，绑定最终九项SHA、release_package=false、新run/artifact；Host/Helper构建、来源/VerifyOnly和解包检查保持。现有纯源分支、main、正式v0.4.0及旧artifact不改。本任务不创建PR、不合main、发Release或占当前前台；用户简验后再按父统一安排后续发布，难复现问题继续在真实环境观察，不宣称已彻底解决。
