# 独立Windows无媒体IPC与退出复现

仅工具。复用已核验2e99cf2安装包及其原摘要，静态解包、不安装；不加载播放器、Native Helper、媒体、gRPC／HTTP业务服务或真实账户。正式产品、默认设置和原四阶段门禁保持。本实验通过也不能叫共享缓存或真实影片验收通过。

## 固定案例与判据

按顺序运行三个独立Electron进程，各用新owned profile：

| 案例 | 内容 | 成功证据 |
| --- | --- | --- |
| bare | 验证、隔离、app ready，无BrowserWindow，显式退出 | window数0；同PID／父PID／browser角色；退出码0且全部流实际关闭 |
| contents | 隐藏固定data文档，WebContents执行六个表达式 | 六个原始数值结果、四次严格顺序IPC echo各一次、18个进入／返回／结算观察，以及实际退出0／流关闭 |
| frame | 相同文档、表达式、权限、会话和设置，仅改为主frame执行API | 同contents判据，不能用另一API降级或省略失败项 |

六个表达式固定为普通返回值、已完成Promise、一次await echo、一次不等待echo的调用、两次顺序await echo和microtask完成。不是可任意执行的远程脚本。IPC只接受该精确文档主frame、固定顺序数字和有限观察标签；拒绝重复、额外或越序请求。两种窗口案例均hidden／不可聚焦、backgroundThrottling=false且读回确认；无窗口弹出或前台操作。

观察表达式仍返回原值／原Promise。记录entered／returned／settled／rejected，结合主进程回执，区分尚未执行、同步段未返回、microtask未完成和结果回传未完成；拒绝不被转换为成功。

## 期限与退出

每进程35秒，包括完整来源验证；整个运行120秒。每个表达式最多3秒，并保留清理预算。终止后最多两秒确认，已计入总期限；未确认OS退出或流close必须FAIL并停止后续案例。app quit、process exit观察和回执写入均不能代替协调器看到的实际子进程exit与close。

关闭窗口前先写FAIL清理阶段，再记录销毁／回执／app.exit，window-all-closed不提前自动退出。超时只针对已记录的本子进程；已知EPERM／EACCES不继续强制重试，错误和未知退出如实报告。仅在不可确认的失败收尾释放协调器管道与引用，streamsClosed仍为false，绝不改判PASS。剩余进程由专用runner作业结束处理，不访问用户Work进程。

## 来源与公开输出

沿原安装器SHA、ZIP SHA、完整schema3物理文件集合、Git源码、provenance、Native和Electron身份门禁。每个worker在app ready之前再次验证来源；源码批读保留每个对象及正文校验。工具文件独立绑定精确Git提交及严格CRLF checkout。artifact过期、下载拒绝或校验失败立即停止，不换包／镜像／入口重试。

计划和profile不上传。仅上传candidate-source、各案例的安全JSON及总摘要：PID、阶段、预算、退出码、资源类型数量和固定数字结果。原始stderr、代码／HTML、环境变量、路径和凭据不导出。GitHub只读任务token仅用于原API下载门禁，进入Electron前删除；data会话拒绝全部其他URL。

## 正常UI单次派发

复用已有Public offline CI，选择本独立分支及精确工具SHA。为不增加第11个输入，明确组合两个现有开关：

| smoke | diagnostics | 唯一路线 |
| --- | --- | --- |
| false | false | 原普通打包／benchmark，保持原默认行为 |
| true | false | 原Native四阶段，本阶段暂停 |
| false | true | 原无包离线稳定性 |
| true | true | 本无媒体存活性job，禁止打包／benchmark／Native |

~~~text
release_package=false
build_input_benchmark=false
shared_cache_smoke=true
shared_cache_diagnostics=true
benchmark_expected_sha=<新工具准确40位SHA>
shared_cache_artifact_id=12609342891
shared_cache_zip_sha256=89b1947dc7946ec3505d4f5fb780b81df21725517d8ed46f7e37f68382396150
shared_cache_installer_sha256=1e38c2b2ed440b112e23ec838f16ca2e5debd6a88be7dc87bb42864c30c6883d
~~~

其他输入默认且本模式不使用。只执行windows-shared-cache-liveness，独立并发组，原组不变；windows-2022，job上限10分钟，不运行npm依赖安装或重新构建。预计通常数分钟，受控运行最多120秒，下载和全门禁时间另计且受job总界约束。父统一派发；本任务不自行dispatch。

若bare也不能退出，先收敛固定runtime／runner的基本退出限制；若bare通过而窗口案例失败，关注renderer／IPC及窗口退出；若仅一个执行API失败，比较对应派发链。全部通过只排除这一最小场景，后续再审原harness的file协议、服务和播放组件，不能直接推断缓存已通过。

## 本地验证范围

实际Windows三例现已通过，精确运行和与下一层实验的区别见[Native有限对照](SHARED_PLAYBACK_CACHE_NATIVE_LIVENESS.md)。以下为该次运行之前的本地验证记录，保持其原证据身份。

完整离线2700项：2687通过、0失败、13项既有平台跳过，约128.3秒。无媒体合同／收集器／路由／正式字节守卫定向30项通过；JS576／PowerShell53语法、有限凭据模式扫描及文档链接通过。确定性收集器覆盖正常退出、quit但存活、仅管道未关闭、终止无效、EPERM／EACCES及监听器／计时器收尾；未知退出均失败。独立审查无阻塞。当前环境不能运行Windows Electron，以上不代表三例已实际通过。
