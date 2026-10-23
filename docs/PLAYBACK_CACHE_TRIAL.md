# 完整本地对象的主进程适配候选

这是 `feature/playback-cache` 的下一阶段：此前只在 tools 中运行的字节 store 移至维护源码 `enhanced/playback-cache-store.js`，旧 `tools/prototypes/playback-cache/store.cjs` 仅作兼容入口。新 `enhanced/playback-cache-trial.js` 已接入真实 `native-helper/service.js` 的最终 loadfile 分派点。它仍不是默认启用的用户功能，也没有部分缓存播放或真实预加载。

## 开启范围与运行方式

唯一入口是由可信主进程测试 harness 显式向 `createService()` 传入 `playbackCacheTrial`。应用 `main.js`、renderer、配置页、环境变量与命令行没有新增开关；缺配置/策略、不合法配置、未能打开专属 store 都完全关闭缓存适配。没有增加 IPC operation、helper 线协议或依赖，后台下载器/代理仍未实现。

测试配置必须同时给出：

```js
playbackCacheTrial: {
    config: {
        enabled: true, testOnly: true,
        policy: {maxBytes, maxEntries, ttlMs, minFreeBytes},
        networkPolicy: 'offline-fixtures-only',
        activeLeasePolicy: 'retain-until-media-close',
        verificationTimeoutMs
    },
    parent, fixtureSourceRoot,
    catalog: [{source: absoluteSyntheticSourcePath, identity}],
    getContext, revalidate
}
```

以上变量全由隔离测试提供，示例没有产品默认容量/TTL/超时。试验硬上限为1 MiB逻辑媒体、16条目及2000ms鉴权等待；这只是约束同步I/O候选的测试规模，不是正式策略。`source` 只能是明确物理 fixture 根目录内的本地普通文件；URL、未知 source、路径重定向及 UNC fixture 根不进入命中。不得指向真实用户配置、媒体库或NAS。

先由维护 store API 用合成文件正文准备完整对象并关闭，再由 service 独占打开。同一试验目录不能并发打开两个 store。`tests/playback-cache-adapter.test.cjs` 完整演示准备60-byte PCM WAV、构造配置、创建真实 service、注入模拟 helper、发送原 begin-generation/loadfile/stop 和销毁；不需要打包或运行既有客户端。

## 新授权与 source 选择

`getContext()` 是主进程测试 owner，提供 `{serverId, accountId, authEpoch}`；`revalidate({source,identity,context,signal})` 返回本次新验证的 `{identity,context,proof}` 或拒绝。proof沿用强ETag/完整长度/direct-file/Range/授权有效期合同。这里的 provider 是**显式注入的离线 mock**，不是产品 Emby/CD2 权限查询实现，renderer也不能通过新的IPC提交“已授权”布尔值绕过它。

选择前后核对服务器、账号、鉴权代次，以及全部媒体/版本/representation身份；只有 grant当前、对象完整且全文digest核验通过才获取本地source lease。service从异步选择返回到真正分派loadfile前，再核对owner、授权/TTL和上下文，堵住交接微任务窗口。缺失、部分、损坏、超时、拒绝授权或身份不符均保留原source及原file-local参数。原source仍由原播放链/服务端负责权限，候选不把缓存拒绝改写为整个原生播放禁止。

匹配时只有最终helper loadfile的source改为完整本地对象；本地命中不带远端User-Agent参数。Item/MediaSource/PlaySession、原endpoint/generation、队列与Session事件都不重建。cached load命令拒绝或匹配的cached media error最多回原source一次，原参数保持；缓存的迟到错误不能误报替代source失败，替代source自己的错误仍走原有失败出口。Stop/Next/退休/销毁使pending选择失效，迟到grant不能发起旧loadfile。

## 租约与物理关闭

源路径只暴露给主进程适配器，renderer不获得新的缓存路径接口。活动对象被pin：测试配置显式选择“直到实际媒体关闭”，所以TTL/原授权期限到达后禁止新命中，但不凭清理定时器删除当前正在读的文件。并非正式确定了播放中撤权规则；该行为只能在显式离线测试策略下使用。

逻辑 `retire-generation`、Stop被接受、transport terminal和进程exit是不同终态。新增controller内部 `onMediaClosed` 回调只在已验证helper身份和transport后，针对真实raw end-file ID及可归属mediaIdentity触发，包括已退休generation；旧事件仍不交给renderer。service只释放helper/generation/mediaIdentity三者匹配的lease；实际媒体ID未确认时保守留到所属helper的exitPromise兑现。原生文档把END_FILE定义在文件卸载后，本轮仅依据其合同，不冒充固定DLL实测。[固定v0.41.0 client API](https://github.com/mpv-player/mpv/blob/v0.41.0/include/mpv/client.h)。

正常/异常helper退出的资源兜底均等待既有exitPromise；仅transport失效或退出结果不确定时不提前释放。source预派发被退休时可以立即释放，因为尚未发给helper。没有增加强杀、系统设置修改或文件强制删除。遇未知媒体归属可能保守占用试验配额直到helper退出，不能为提高命中率猜测已经关闭。

鉴权超时会让原播放继续；忽略AbortSignal的mock verifier最多占一个pending记录，后续缓存选择跳过，直到它实际结算。provider不能在迟到结果中获得store写入或source加载权限。它不是可强杀任意外部I/O的沙箱；真实鉴权provider的请求取消/资源退出仍须另行实现和验证。

## 验证与测试包门槛

Node24.18.1/Linux下新增16项适配验证，连同缓存/HTTP/调度及全部相关Native Helper、STRM、切集和kernel服务/启动回归，共189/189通过、0跳过。覆盖完整命中、部分/损坏/缺失、身份/新授权、TTL清理与pin、预派发超期、Stop/Next迟到grant、一次fallback、迟到cached error、旧generation关闭和transport/真实exit分离。

初次11项适配运行4通过/7失败，主要是夹具先删临时目录再关闭store的清理顺序，并暴露缓存I/O异常后status再次抛错；修正夹具归属清理及固定unavailable状态后11项通过，随后补充边界用例和上述189项回归。前期89/103/104/120项是相应阶段证据，不能与本次覆盖范围混为单次全量结果。

复现命令：

```sh
node --test tests/playback-cache-*.test.cjs tests/native-helper-*.test.cjs tests/strm-resolver.test.cjs tests/nexttrack-transition.test.cjs tests/mpv-kernel-service.test.cjs tests/mpv-kernel-bootstrap.test.cjs
```

证据为真实维护service/controller/store加模拟helper、合成本地WAV及既有小型回环HTTP；没有运行固定WindowsDLL/完整Electron客户端、访问真实账号/媒体/NAS/服务器或进行安装/性能测量。实际mpv读取`.bytes`封装探测、外部字幕/sidecar、Session/远控/Together及Windows文件共享行为仍需后续验收。

普通安装包仍不会出现此试验入口，因此此时不申请云UI触发“缓存功能包”。若后续要做可交互试验包，须先单独确定主进程离线harness入口/材料及真实鉴权接入合同；不能把mock授权搬成正式鉴权，不能仅为可打包扩大renderer/helper协议。正式v0.4.0收尾仍优先，真实发布点确定后再重基。

## 与其他分支的潜在冲突

需父协调与 `auditfix` 的重叠文件：`src/electronapp/native-helper/service.js`、`src/electronapp/native-helper/controller.js`。前者含可选source选择、一次回退和取消/退出lease收尾，后者只加已验证end-file的主进程资源回调；不得整文件覆盖对方改动。新增store/trial模块及专属测试独立；PROJECT_STATUS/DEVELOPMENT_LOG等文档需逐段合并。renderer `plugins/libmpv.js`、`main.js`、Native C++/协议、构建脚本与其他功能实现保持本轮未改。
