# EWT 客户端 Seek 修正

候选基于 `88578c91ab19d44eecddcfae096d37dc917ef1f4`，位于独立 `fix/ewt-client-sync` 分支。检查限定于 ETE 远控、单位、暂停 Seek 上报及能力声明；不据此解释某次真实环境故障或网络延迟。

## 代码证据

- `vendor/web-snapshot/www/modules/common/input/api.js` 将 `Playstate.SeekPositionTicks` 直接交给 PlaybackManager；`0` 不会在这里丢失。PlaybackManager 将 ticks 除以 10000 转为整数毫秒，libmpv setter 使用 `val != null`，也保留 `0`。
- `src/electronapp/plugins/libmpv.js` 原先对毫秒除以 1000 后向下取整，导致 `12.345` 秒变为 `12` 秒、相对后退 `0.25` 秒变为 `1` 秒。现在直接传递小数秒，保留既有绝对／相对定位模式。
- 原适配器在命令接受后发送 `seek` 事件，PlaybackManager 却未绑定它。真正位置仅走 `timeupdate`；`src/web-api/src/mit-apiclient.js` 的既有 10 秒节流明确跳过窗口内位置为 `0` 的普通更新。暂停后可能没有持续的位置事件，服务端因而不能及时得到已完成的零位置。
- Native Helper 现在只在已有唯一媒体的 `MPV_EVENT_SEEK` 后，遇到对应媒体的 `MPV_EVENT_PLAYBACK_RESTART` 时读取真实 `time-pos`。非 Seek 的启动／缓冲恢复不增加上报；未知媒体、读失败、负数和非有限值不生成完成位置。事件复用原媒体归属和 generation 过滤，不可合并为普通高频位置事件。
- renderer 在收到当前 generation 的完成位置后更新本地状态，发送一次 `seek`。PlaybackManager 沿原 Session 上报 `EventName: seek`，绕开普通 `timeupdate` 节流；暂停状态、ItemId、MediaSourceId、PlaySessionId 保持原归属。命令应答不再伪装成完成，迟到应答不修改位置，失败只记录固定事件名与既有请求标识。
- `src/electronapp/apphost.js` 广告 `remotecontrol`，Web capabilities 设置 `SupportsMediaControl: true`。未发现 ETE 在这些路径写入 `SupportsRemoteControl: false` 的证据；服务器的最终 Session 能力值未由本地 fixture 验证，不改声明或鉴权。

协议只读核对：[EWT Seek factory](https://github.com/hope140/EmbyWatchTogether/blob/7c6abfa234ea1dbf7732db26bbe9e26486f20ac8/src/EmbyWatchTogether/PlaystateRequestFactory.cs) 接受非负 ticks，[SessionBridge](https://github.com/hope140/EmbyWatchTogether/blob/7c6abfa234ea1dbf7732db26bbe9e26486f20ac8/src/EmbyWatchTogether/SessionBridge.cs) 转交 Emby Playstate；[RoomEligibility](https://github.com/hope140/EmbyWatchTogether/blob/7c6abfa234ea1dbf7732db26bbe9e26486f20ac8/src/EmbyWatchTogether/RoomEligibility.cs) 要求双方 Session 支持远控。mpv 的 Seek／完成事件语义见[官方手册](https://mpv.io/manual/stable/#list-of-events)。未改 EWT 服务端或其超时。

## 可复现验证

从已准备固定 Web 材料的仓库运行：

```sh
node --test tests/ewt-native-completion.test.cjs tests/native-helper-client.test.cjs tests/native-helper-service.test.cjs tests/playbackmanager-request-session.test.cjs tests/native-helper-lifecycle.test.cjs tests/native-helper-protocol.test.cjs tests/libmpv-stats.test.cjs tests/mpv-settings-assembly.test.cjs tests/playback-lifecycle-patchers.test.cjs
node --test tests/build-input-contract.test.cjs tests/runtime-provenance.test.cjs tests/web-overlay-preparation.test.cjs tests/native-helper-version-metadata.test.cjs tests/native-helper-thread-construction.test.cjs tests/native-helper-compiler-environment.test.cjs tests/client-diagnostics.test.cjs
```

两组分别为 148／148 和 62／62 通过，合计 210 项、0 失败、0 跳过。Native 采样分支随后增加限定 Seek 的守卫，相关源码合同／线程构造 4 项复验通过；同一实际 C++ 分支在独立 Linux stub 中用 `g++ -std=c++17 -Wall -Wextra -Werror` 编译执行通过，覆盖零值、小数、无 Seek、重复完成、无效位置、读失败及媒体变换。它不等于 Windows Helper 编译或实际 mpv 播放证据。

关键回归使用真实 input/api、生成后的 PlaybackManager、维护 ApiClient 节流、libmpv AMD 模块与 renderer endpoint，IPC／Native 完成事件为内存替身，不启动进程或访问服务器。覆盖暂停 Seek 0、真实落点、小数秒、命令应答先后、相继命令及反序应答、旧 generation、Stop 和拒绝脱敏。可通过 `ETE_EWT_LIBMPV_SOURCE` 与 `ETE_PLAYBACKMANAGER_PATCH_TOOL` 分别指定基线源码，保持同一断言比较；基线 8 项中 2 通过、6 失败，修正后 8／8 通过。新夹具接线期间的缺失替身方法已经补齐，未把这些接线错误算作产品缺陷证据。

## 验收边界

未执行全量回归、Windows 完整 Helper 编译／runtime 构建、真实服务器或双端 EWT 验收。Windows 验收使用独立构建及隔离测试设备，在人工选定的测试媒体上暂停后 Seek 到 0、小数秒和连续两个目标，核对暂停保持、实际位置及原 Session 进度；不向现用设备或用户正在播放的媒体发命令。正常播放、Stop／换集与无 Seek 的启动也需保持原行为。

本分支不包含其它并行修复。后续整合时重点复核 `src/electronapp/plugins/libmpv.js`（stop/create、pause intent）和 `native/mpv-helper/ete-mpv-helper.cpp`；`tools/patch-playbackmanager.cjs`、其会话测试和状态／开发日志也可能产生上下文冲突。`native-helper/controller.js` 未修改。版本、会员认证、NAS 凭据、个人配置与服务端数据未改；未推送、合并或发布。
