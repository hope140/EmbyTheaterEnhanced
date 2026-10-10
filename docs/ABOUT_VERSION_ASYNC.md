# About 包内版本异步校验

日期：2026-10-10（UTC+8）。基线为完整维护提交
`6815d2fa93bf613d028dbaa96328c7ef3e0e55b5`，独立分支
`codex/about-async-20261010`，版本保持0.2.6。用户随后明确授权仅在本分支本地提交、
正式构建、隔离验证和本地候选交付。最终产品sourceCommit为
`7cc7eb85cfa64c20ec9f161d2a6649a49637cacd`，观测工具提交为
`c9502aec5a451e9dfa6b7696ba44309b336985c3`；后续文档提交不替代产品身份。

P2原因是About信息查询在Electron main同步读取并哈希Helper和libmpv。
维护GET_INFO、COPY_ENVIRONMENT、CHECK_UPDATE及诊断EXPORT共享该调用；
诊断GET_STATUS不在此调用链。外层async IPC不能移走内部同步I/O和SHA256。

## 实现与边界

包内四个固定路径使用异步FileHandle读取，单次read与SHA256 update最大64 KiB。
provenance保持64 KiB上限，build manifest保持2 MiB上限，两个二进制各保持128 MiB上限。
JSON只在有界元数据上解析；二进制按块哈希，不在main分配或哈希整个DLL。
首次查询也使用相同异步路径，查询不启动Helper、播放器或其它进程。

main创建一个固定runtimeRoot/sourceCommit的reader。仅进行中的查询共享Promise，
完成或UNKNOWN后立即清除。每次后续查询重新读取并校验全部字节；没有跨查询的成功或失败缓存。
这保留文件变化检查和错误恢复，代价是后续独立查询仍有完整读取耗时。
包内结果冻结，实时Helper状态在await包内校验后分别读取，不被共享或缓存。

每个文件先lstat，打开后的handle stat、读取结束后的handle stat及整轮结束后的
四文件快照均比较dev/ino/mode/size/mtimeNs/ctimeNs/birthtimeNs。
链接、非普通文件、超限、截断、读取错误、读取期间身份变化返回UNKNOWN。
所有已打开handle在finally关闭。固定路径、sourceCommit、manifest到provenance的hash、
schema/protocol/testing/version和实际二进制SHA256检查保持。
Helper版本仍来自构建时提取的唯一源码声明，libmpv仍来自固定manifest。
这是一致性检查，不能认证整个未签名包同时被修改的情况，也不是对恶意并发写入的原子文件系统快照。

三个维护IPC和诊断EXPORT等待getAppInfo后再使用对象；sender验证继续先于读取。
复制只构建一次白名单快照，用同一对象生成剪贴板文本并返回页面。
renderer的请求代际、迟到成功/失败及loading收尾逻辑保持，GET_STATUS继续独立读取运行状态。
PlaybackManager、Session、Resolver、DirectUrl、Native生命周期和窗口呈现不在本次diff。

## 本地证据

对照使用只读旧候选的119,725,568 bytes DLL和同一Node24.18.1。
新函数从当前工作源码加载，旧runtime只作为固定二进制输入；该试验不是新Electron runtime验收。

| 函数级模式 | 总耗时ms | 零延时timer实际延迟ms | 完成前timer ticks | 查询期间最大timer间隔ms |
| --- | ---: | ---: | ---: | ---: |
| 旧同步连续三次 | 266.80 | 266.87 | 0 | 未采到 |
| 新首次 | 124.69 | 1.43 | 124 | 1.52 |
| 新重复 | 118.03 | 0.60 | 117 | 2.01 |
| 新三路并发 | 113.90 | 0.57 | 114 | 1.91 |

三路并发共享同一个Promise，仅打开4个文件，DLL总读取119,725,568 bytes，
最大read为65,536 bytes。首次/重复也重新完整读取；总耗时没有被描述为性能加速，
本次目标是让main事件循环能够继续处理其它工作。这是单次本地样本，不是延迟上界承诺。
原始脚本和数据在 `.work/about-async/benchmark.cjs` 与 `responsiveness.json`。

定向37/37通过，覆盖身份与hash不符、超限、截断、读中变化、handle关闭、
UNKNOWN恢复、首次/重复timer、并发共享/清除、异步IPC、复制同快照、
ready/stopped动态状态、renderer迟到结果归属及诊断导出等待。
最终完整单测646/646，0失败/取消/跳过；7个JS/CJS语法、diff、6份文档链接及新增文本隐私检查通过。
首次全量640/646的6项失败来自隔离树未复制固定patch client输入，原日志保留；
补齐并hash核验1,060个vendor文件后，原失败组14/14及上述最终全量通过，未修改或弱化测试。
来源、测试日志hash与验证层级见
[结构化证据](evidence/about-version-async-20261010.json)。

## 正式候选与来源

从7cc7eb85正式Git blobs构建 `dist/ETE-0.2.6-about-async-7cc7eb8-win-x64`。
source/runtime/native/Electron、34项构建输入、锁定依赖树与package VerifyOnly通过。
payload为2,136文件，含build manifest完整runtime为2,137文件。相对旧7ec6ace，
payload差异为4个产品JS及5份来源记录，build manifest随之更新；EXE/DLL字节保持，旧产物只读保留。

原函数级对照输入归属旧 `dist/ETE-0.2.6-maintenance-7ec6ace-win-x64` / sourceCommit7ec6ace。
新构建输入为 `vendor/patch/payload/libmpv/mpv-1.dll`，新输出归属7cc7eb85 runtime。
三个DLL各为119,725,568 bytes，SHA256均为
`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，
各自manifest/provenance和固定native manifest一致。相同DLL字节不意味着相同产品来源。

固定准备材料在独立树复制后重验：Carnival/patch共1,060文件；Electron44.4.2为73文件；
UCRT64为6,990文件，Inno `{app}`118文件，innounp5文件及两个固定归档均符合lock。
旧工具链额外5个未锁定文件留在旧树。源码和个人profile均不从旧产物反向覆盖。

安装候选为 `dist/EmbyTheaterEnhanced-0.2.6-about-async-7cc7eb8-win-x64-setup.exe`，
175,627,068 bytes，SHA256
`7037014b2f3e5088bf11c1ee9c9079b19b4dff1cbf8cc57e988dbd2b24fb0116`。
SHA256/provenance两个companion绑定产品sourceCommit和runtime manifest；Inno完整性检查、
2,137文件解包比较和运行后runtime重新核验均通过，missing/extra/mismatch为0。
本地交付目录为 `dist/delivery-0.2.6-about-async-7cc7eb8/`。

## 实际IPC与隔离运行

显式opt-in观测工具通过唯一实际应用renderer调用原GET_INFO/COPY/CHECK_UPDATE/diagnostics EXPORT，
初始观测结束后才放行原pipeline。剪贴板写入截获到内存，保存对话框返回固定证据文件，
更新网络使用本地release fixture；诊断文件仍由产品原导出handler写出。
观测保留logger的status/exportReport等方法，并在实际exportReport收到appInfo时捕获独立快照。
查询上下文通过AsyncLocalStorage计数，Helper spawn与Native调用均0；不提交播放命令。

| 实际维护IPC字段 | 初始快照 | helper-ready后首个GET |
| --- | --- | --- |
| nativeHelper | 1.0.0 | 1.0.0 |
| libmpv | v0.41.0-920-gdd5d17d32 | v0.41.0-920-gdd5d17d32 |
| nativeHelperState | stopped | ready |
| runningNativeHelper | NOT AVAILABLE | 1.0.0 |
| runningLibmpv | NOT AVAILABLE | mpv v0.41.0-920-gdd5d17d32 |

所有快照appVersion=0.2.6、sourceCommit=7cc7eb85。复制文本匹配本次返回的同一个完整白名单info；
诊断输出与其自己实际收到的commit/state/helper/mpv匹配。运行状态每份快照分别校验，
ready时严格匹配握手，非ready时运行字段为NOT AVAILABLE；换流允许ready/stopped自然变化。

最终新工具完整pipeline的main timer延迟：初始单次/三并发为1.83/0.90ms，
ready单次/三并发为0.36/0.23ms；查询期间最大timer间隔分别6.01/1.70/7.02/5.03ms。
这是实际隐藏Electron main的单次观测，仍不是可见视频连续性证明。

串行idle正常关闭与最终hit400完整pipeline均PASS、自然exit0、无强清理、残留0。
pipeline保留普通/STRM、Next/generation、精确取消和原Session断言；
从 `/emby/Sessions/Playing` 与 `/emby/Sessions/Playing/Stopped` 原始records独立配对，
普通/STRM/队列A-B-C共5对ItemId/MediaSourceId/PlaySessionId完整且顺序正确。
P1诊断129条，12项准确请求关联、两类Renderer位置及脱敏通过。观测工具定向49/49，
产品完整646/646沿用同一产品源码结果；未重复未受工具变化影响的检查。

## 保留的失败与验证边界

第一版observer在hit400换流时错误要求整组查询一直ready：实际首个GET为ready，
随后三并发GET为stopped，COPY又为ready，全部与各自运行状态一致。原pipeline播放和5对Session通过，
但observer判FAIL使normal-close夹具拒绝关窗；外层120秒按精确归属强清理，残留0。
该run及原hash保持FAIL，不改判、不覆盖。独立只读核实后修正观测contract，
仍要求ready阶段首个GET确证ready；补状态变化/无缓存运行版单测后只执行一次新工具完整pipeline。
最终通过记录和原失败分列在结构化证据中。

工具审查还修正了15秒race后继续等待jobs的问题：超时直接封存FAIL，迟到完成不能改写receipt，
fake-clock覆盖真实deadline helper。单个IPC限5秒，观测收尾限15秒，runner原120秒不扩大。

所有配置隔离在本次appData/userData/MPV_HOME，使用本地fake服务与合成媒体。
系统安装、真实Emby/CD2/远控、可见视频、HDR/多屏未执行；旧直接app.exit根因仍UNKNOWN。
本轮仅本地提交与交付，已发布v0.2.6身份保持。历史记录见 [grpc/About维护](MAINTENANCE_GRPC_ABOUT.md)。
