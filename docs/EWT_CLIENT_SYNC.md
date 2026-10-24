# EWT 客户端 Seek 修正

## 当前组合范围

本页保留独立EWT来源cb0ebf78的技术合同与历史回归范围。当前与四项审查修复一起验收，组合来源及当前执行结果单独记录于[六项修复组合](AUDIT_EWT_ACCEPTANCE.md)；下文独立分支及不含其他修复是原来源阶段说明，不拿单分支计数替代组合验证。

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
node tools/prepare-preload.cjs .
node --test --test-reporter=tap --test-concurrency=1 tests/*.test.cjs
node --test --test-reporter=tap --test-concurrency=1 tests/*-material-selftest.cjs
```

完整普通回归覆盖 176 份测试文件、1629 项：1619 通过、0 失败、10 项既有 Windows 平台限制跳过。显式材料回归覆盖全部 21 份文件、135 项，全部通过且无跳过。构建输入 173 项、Native 合同 8 项及七组固定组件身份通过；418 份 JavaScript、47 份 PowerShell 语法、有限凭据模式和差异检查通过。固定 Native client.h 哈希与提交源码物化身份另行核对。

关键回归使用真实 input/api、生成后的 PlaybackManager、维护 ApiClient 节流、libmpv AMD 模块与 renderer endpoint，IPC／Native 完成事件为内存替身，不启动播放器进程或访问服务器。覆盖暂停 Seek 0、真实落点、小数秒、命令应答先后、相继命令及反序应答、旧 generation、Stop、拒绝脱敏，以及命令已接受但无完成事件时不伪造位置、不阻塞下一命令。原 8 项断言通过 `ETE_EWT_LIBMPV_SOURCE` 与 `ETE_PLAYBACKMANAGER_PATCH_TOOL` 指定基线源码比较，为 2 通过、6 失败；修正及缺失事件用例共 9／9 通过。

Native 采样／重复完成／失败／媒体变换的实际 C++ 分支在独立 Linux stub 中用 `g++ -std=c++17 -Wall -Wextra -Werror` 编译执行通过。它不等于 Windows Helper 编译或实际 mpv 播放证据。显式材料初跑暴露新增用例越过原 observer 夹具截取边界，已将新用例移到原边界后，86 项受影响回归及全部材料／普通回归复验通过；固定 Host、继承 npm 与 libmpv 缺失材料按原来源／哈希恢复，没有放宽输入守卫。

## 验收边界

剩余未执行项是 Linux 无法执行的 Windows PowerShell／安装集成、Windows 完整 Helper／Host 编译及 runtime／测试包构建、真实服务器或双端 EWT 验收。Windows 验收使用独立构建及隔离测试设备，在人工选定的测试媒体上暂停后 Seek 到 0、小数秒和连续两个目标，核对暂停保持、实际位置及原 Session 进度；不向现用设备或用户正在播放的媒体发命令。正常播放、Stop／换集与无 Seek 的启动也需保持原行为。

本分支不包含其它并行修复。后续整合时重点复核 `src/electronapp/plugins/libmpv.js`（stop/create、pause intent）和 `native/mpv-helper/ete-mpv-helper.cpp`；`tools/patch-playbackmanager.cjs`、其会话测试和状态／开发日志也可能产生上下文冲突。`native-helper/controller.js` 未修改。版本、会员认证、NAS 凭据、个人配置与服务端数据未改。候选仅正常推送独立分支供后续测试包使用，提交包含 `[skip ci]` 以遵守本轮不启动工作流的限制；不合 main、不发布、不执行 workflow dispatch。
