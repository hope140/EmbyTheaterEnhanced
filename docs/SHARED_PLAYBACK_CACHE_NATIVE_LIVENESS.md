# Native媒体层的有限存活对照

仅独立工具，复用原2e99cf2包，不安装、不重包、不改产品协议或默认开关。不启动完整应用、PlaybackManager、Alameda、缓存、账户、HTTP或gRPC服务；真实115请求为零。使用已有生成器创建5秒、64×64、30fps的无音频Y4M小文件，逐进程校验固定路径、大小和摘要，播放来源只允许该文件。

## 已证实的前提

[无媒体Windows运行40231087731](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40231087731)的bare、WebContents、主frame三例均通过。三个实际子进程分别约6.655、7.340、7.339秒，PID与回执／父进程绑定，退出0且流关闭，无signal或超时。固定Electron44.4.2；两个窗口案例六个脚本、四次顺序IPC与18个进入／返回／结算记录完整。来源复核约6.6秒；这个结果不代替媒体、Native或缓存验收。

## 最小增量

三个新进程使用相同隐藏data文档、窄preload、主frame执行方式、权限与来源门禁；均创建真实原生产service、carrier和helper，缓存关闭：

| 案例 | 唯一增加的工作 | 必须证明 |
| --- | --- | --- |
| helper-idle | create／原握手，不加载媒体 | helper空闲时六个原脚本／IPC返回，关闭helper后renderer仍返回固定值 |
| helper-playback | 在相同setup上加载本地小文件 | 实际time-pos推进，脚本与退出仍通过 |
| helper-preview | 在相同播放上额外采集一次预览 | 原capturePreview返回有色像素，脚本与退出仍通过 |

每例另测`Promise.resolve(undefined)`及25毫秒定时完成的undefined Promise；旧播放动作返回Promise<void>，而此前六个脚本都返回数字，这个差异尚不能凭静态分析认定为根因。八个表达式均记录进入／同步返回／结算，共24个标记；undefined额外项独立记录结果类型，不伪造JSON数值。主进程记录100毫秒tick最大滞后和有界资源类型数量。预览像素只在main检查，不写日志或传renderer。

原service负责真实helper生命周期和surface，禁止窗口显示或聚焦。helper退出、流关闭与进程退出分别验证；post-helper固定表达式失败不能抹去已经证明的helper退出。只有一个helper且退出0、无signal／协议／操作错误、无pending请求，才可通过。carrier显式销毁前要求所属helper退出并关闭流。

每进程原35秒／整轮120秒不增加，来源复核也计时。截止前5秒开始失败清理，服务destroy与所属helper退出／流关闭分别有界；最后硬期限只写FAIL与实际已知状态，未知不变成成功。EPERM／EACCES禁止重复发送终止请求；不访问用户Work进程。协调器仍要求同一实际PID退出0及close，无确认则停止剩余案例并FAIL。

## 正常UI派发

沿已有Public offline CI，选择本独立分支及准确工具SHA。为保持既有10个输入，组合smoke＋diagnostics仍只选择存活性job；仅在此组合中，原本不使用的warm-calls字段新增明确`native-liveness`选项。其他warm-calls值仍运行原无媒体三例，原默认值及单开关／打包／benchmark路线不变。不是benchmark，也不会串跑两个suite。

~~~text
release_package=false
build_input_benchmark=false
shared_cache_smoke=true
shared_cache_diagnostics=true
benchmark_warm_calls=native-liveness
benchmark_expected_sha=<准确新工具40位SHA>
shared_cache_artifact_id=12609342891
shared_cache_zip_sha256=89b1947dc7946ec3505d4f5fb780b81df21725517d8ed46f7e37f68382396150
shared_cache_installer_sha256=1e38c2b2ed440b112e23ec838f16ca2e5debd6a88be7dc87bb42864c30c6883d
~~~

benchmark_trials保留默认4且此模式不使用。只运行windows-shared-cache-liveness；Windows2022、只读contents/actions、原独立并发组及10分钟job界不变。静态解包及全物理清单、provenance、Git对象与来源关系仍必验。原artifact到2026-10-26 18:16:23 UTC过期；实际下载先重核元数据，过期或拒绝立即停止，不换来源／原包身份。

通常预计数分钟；受控三个进程最多120秒，下载和验证另受job总界。父统一派发，不自动dispatch。安全输出沿原candidate-source、liveness-summary与三个case／stages，原始stderr、profile、计划和媒体不上传。公开日志可直接读取固定脱敏摘要，不依赖下载artifact才知道结果。

## 如何解释结果

idle失败说明helper／carrier或其事件路径已足以引出问题；播放失败而idle通过再查解码／native事件；仅preview失败再查截图请求／GPU readback。三例都通过，只排除该小场景，下一步才比较旧file协议、Alameda、PlaybackManager和跨contextBridge事件回调。不会据此宣称共享缓存四阶段通过，也不会把本地Node模拟当实际Windows证据。

本地完整离线2708项，2695通过、0失败、13项既有平台跳过，约60.7秒。末次表达式标记细化后，收集器／suite／正式基线／工作流定向38项通过。JS578、PowerShell53语法及有限凭据模式扫描通过；新增文档链接与补丁格式检查通过。正式工作流守卫只剥离准确的实验选项声明后继续与固定基线逐字节比较，并拒绝默认值／类型／额外选项漂移。新三例尚未实际Windows运行。
