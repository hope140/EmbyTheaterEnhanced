# PLAY-01：Stop 后迟到播放意图的归属修复

日期：2026-10-10（UTC+8）。独立分支 `codex/play01-stop-boundary`，起点 `db8f0176b9c071b1f396d16d76b796340800070f`。该起点包含上一轮交付文档和探针，产品仍与审核main `0b782dd`、v0.2.7 `d8fcb0f9`一致；SEC/LIFE/CI产品补丁没有合入。本轮没有修改版本或已发布产物。

## 根因与调用链

维护位置是 `tools/patch-playbackmanager.cjs`，构建时对固定Carnival PlaybackManager生成补丁。原始vendor只读，SHA256为 `8df9ea6f1be13f355925b2fd1b9bf7539c5a624d8731be484959a4ec861a1ebd`。以下vendor行号均绑定该输入。

1. Next/Previous（2293–2318）同步选择队列项，进入playInternal（814），复制options并领取manager请求序号。PlaybackInfo、原生路径与player.play随后异步完成。原有Next的元数据守卫有效，本轮没有将它误报为新缺陷。
2. 公开Play（2107）先translateItems、getCurrentUser（794）、intros（754），之后才进入playInternal。此前未领取序号的意图能在Stop之后继续领新号。这与“Stop终止此前已发起的意图”不一致。
3. 已开始播放的音轨/质量操作进入changeStream（441），经device profile、PlaybackInfo（479）、stopActiveEncodings（502）、setSrcIntoPlayer（513）再次调用player.play。原成功路径不检查manager代际，原stream上的request ID仍为旧值。
4. libmpv.play在beginPlayRequest中允许与highest相同的request ID，因为同一会话的正常换流需要复用该ID；随后创建新的generation，经Resolver、Native endpoint、loadfile到core-playing。libmpv的Stop同步退休当前generation，但不会把旧manager ID永久禁用。这里的等号允许规则不应改成拒绝。
5. manager.Stop原本同步递增序号，却没有覆盖changeStream成功路径。换流已设置isChangingStream时，onPlaybackStopped（1463）还会跳过原会话报告。旧player.play完成/失败也可能重新写streamInfo，覆盖或清除Stop后新播放的B。
6. terminal物理Stop尚未完成时，公开新Play可能继续进入PlaybackInfo。新Play应允许，但其物理播放准备必须等待旧Stop完成；不能用重复Stop或sleep代替归属。

原始复现：A第一次load → 音轨PlaybackInfo挂起 → Stop完成（currentItem=null，manager序号2）→ 旧响应返回 → 使用request1开启新generation并第二次load A。新代码在旧响应继续点直接结束，load仍为1。

## 最小归属规则与修改理由

- 公开本地Play入口复制options并同步领取既有request序号；用户信息、片头与item解析回调检查该序号，进入playInternal时复用捕获值。Next/Previous仍在原同步入口领取新号。Stop后明确新Play领取新序号，正常允许。
- 每次changeStream捕获原streamInfo对象、manager序号、request ID和独立owner。profile、PlaybackInfo、encoding完成、setSrc入口、player.play成功/失败各继续点共同检查owner、stream与序号。候选stream显式使用捕获的request ID，不从可能复用的item options重新领取身份。
- 同一流的并发换轨用owner区分，不改变manager请求ID的对外身份。有效同ID换流保留；被替代的成功/失败不能再写状态、报告、load或启动额外encoding清理。原编码清理只在当前有效路径执行，未新增针对迟到metadata的服务器清理策略。
- Stop先同步递增序号，并清除当前换流owner及其isChangingStream，再调用既有物理Stop与报告链。保存其完成Promise作为新播放的等待屏障；重复Stop共享该屏障，保留拒绝。新播放只有在屏障排空后继续，物理Stop首次调用仍同步发生。
- manager侧也检查初始player.play完成与失败，防止下层迟到Promise恢复旧Session。没有改变libmpv、Native Helper、Resolver、Session实现或STRM→DirectUrl/CD2→Mount→Native规则。
- setSrc已接管后的结果由其守卫及原错误恢复链拥有。`sourceAdmitted`用于保留合法自动重试的拒绝；外层不能因原stream已被合法候选替换而吞掉重试错误。未接管的过期请求仍安静结束。

内部contract的变化是**请求归属更早确定、换流有独立owner、terminal完成形成新播放屏障**。ItemId/MediaSourceId/PlaySessionId、正常Playing/Stopped报告内容、队列含义与fallback规则保持。

修改位置（绑定产品提交 `1a62f3d`）：`tools/patch-playbackmanager.cjs:23` 为playInternal身份消费，`:56` 为terminal等待，`:303` 为换流owner判定，`:359` 为已接管source的错误传播，`:419` 为Stop完成屏障。其余新增替换是上述入口与继续点的窄守卫；没有修改vendor字节。

| 时序 | 修复前 | 修复后 |
| --- | --- | --- |
| Next → PlaybackInfo pending → Stop → 返回 | 已有request守卫能阻止加载 | 保持原保护，单个/重叠请求及逆序返回均验证 |
| Play → user/intro/item准备pending → Stop → 返回 | 可能在playInternal重新领新request ID | 入口已捕获旧ID，停止于继续点 |
| A换流 → PlaybackInfo pending → Stop → 返回 | 旧ID可建立新libmpv generation并load A | owner与sequence失效，不进入player.play |
| Stop pending → 用户新Play B → Stop完成 | 可能过早进入新播放准备 | B获得新身份，等待旧物理Stop排空后继续 |
| A换流/初始player.play pending → Stop → B → A完成/失败 | 旧结果可能重写stream或进入错误恢复 | 旧回调不控制B，合法当前重试仍保留原错误 |

## 确定性验证与失败记录

测试使用deferred Promise/gate决定顺序。轮询只等待已记录的门控条件；没有以固定sleep决定竞态或放宽原断言。原16个PlaybackManager测试与原Native lifecycle测试块保留。

```powershell
node --test tests/playbackmanager-request-session.test.cjs tests/review-probes/play01-native-gates.cjs
node tests/review-probes/change-stream-stop.cjs
npm test -- --test-concurrency=1
```

PlaybackManager测试需要固定vendor输入，可用进程内 `ETE_PLAYBACKMANAGER_SOURCE` 指定；RED可用 `ETE_PLAYBACKMANAGER_PATCH_TOOL` 指定保存的旧patch。独立Native探针执行真实生成的manager与真实libmpv模块，Native endpoint/服务API为离线fake；这不等于Electron runtime验收。

- 原探针本轮再次RED：期望1次load，实际2；原日志与exit1保存在 `.work/play01/original-red.*`。
- 第一组完整RED：30项，21通过/9失败。当前成功路径、前置入口与terminal屏障的失败均保留在`matrix-red.log`，不是只运行预期通过的Next样本。
- 补充旧基线：11项，5通过/6失败，日志`extra-baseline-red-v2.log`。当前不可转码末端失败按原行为检查alert和Stopped，不虚构其Promise原本应reject。
- 首轮修改的有效自动重试错误传播出现真实回归：41项39通过/2失败，日志`extra-current-green-attempt1.log`；独立review做同fixture前后对照确认。修正sourceAdmitted后该两项通过，原失败保留。
- 首次patch应用有一处重复anchor，未进入产品测试，日志`matrix-green-attempt1.log`。收窄精确anchor后正常应用；未关闭唯一匹配检查。
- 修复后的原始探针load保持1，旧stream不恢复；`original-probe-green.log`。真实libmpv的Native创建/Resolver门控在旧、新代码均2/2通过，保留为既有不变量回归。

## 本地验收

| 检查 | 结果 | 层级 |
| --- | --- | --- |
| 最终PlaybackManager + Native门控 | 46/46；失败/跳过/取消均0 | UNIT_VERIFIED |
| 完整离线回归（固定vendor、prepared preload齐全） | 681/681；失败/跳过/取消均0 | UNIT_VERIFIED |
| 独立复核重跑 | PM 44/44、Native门控2/2、原Native lifecycle 6/6 | UNIT_VERIFIED |
| 主线程与独立diff审查、语法和diff检查 | 通过；原测试断言保持 | STATIC_VERIFIED |
| 固定源码构建及来源校验 | exit0，2,136 payload文件，包含manifest共2,137 | STATIC_VERIFIED |
| 隔离runtime：CD2 hit400 / direct0 / miss0 | 三组均PASS，自然exit0、无强清理、残留0 | ISOLATED_RUNTIME_VERIFIED |

最终patch SHA256为 `23f8860f2126be3f6a74c05632b7b93625310f4ccd047238fbc0d6d6f44d18bc`。原始日志保存在 `.work/play01/targeted-final.log`、`full-regression.log` 与 `independent-*.log`；独立复核结论与其发现的已修复回归保存在 `independent-review.md`。本轮固定输入到位，未因缺少vendor/preload跳过测试；公开checkout仍需遵循材料依赖边界，不能把此本机结果当作公开CI结果。

### 隔离构建与运行

固定产品/测试提交为 `1a62f3d6675a48050df6827c3807d9720f45f560`。本地runtime为 `dist/PLAY01-1a62f3d`，版本字段仍为0.2.7，仅作为隔离验证产物，不是新发布包。运行使用现有未修改的隐藏窗口runner、独立appData/userData/MPV_HOME及本地假服务；三组bootstrap前隔离读回通过。

```powershell
pwsh -NoProfile -File tools/build.ps1 -OutputName PLAY01-1a62f3d
pwsh -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName PLAY01-1a62f3d -Cd2Mode hit -Cd2DelayMs 400 -ProductCloseAfterPipeline -AboutAsync
pwsh -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName PLAY01-1a62f3d -Cd2Mode direct -Cd2DelayMs 0 -ProductCloseAfterPipeline -AboutAsync
pwsh -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName PLAY01-1a62f3d -Cd2Mode miss -Cd2DelayMs 0 -ProductCloseAfterPipeline -AboutAsync
```

固定Electron44.4.2、libmpv、编译器树、34项构建输入及source/runtime/native来源均校验通过；未升级依赖或安装软件。三组诊断分别128/129/98条，准确request关联12/12/10。普通媒体、STRM、队列切集、Pause/Resume/Seek/Stop与现有generation门控在该离线pipeline通过；CD2 miss未阻断既有降级。主线程独立按原始Playing/Stopped的ItemId/MediaSourceId/PlaySessionId分组，每组均恰好5对且先Playing后Stopped。运行后逐文件复核2,136个payload哈希及2,137总文件数一致。

PLAY-01专用迟到PlaybackInfo时序由Node中真实生成的manager与真实libmpv JavaScript配合受控gate验证；没有将三组常规runtime扩大为该时序的Electron直接复现。真实Emby/CD2、真实远控、字幕章节的真实内容、用户可见首帧/连续性和系统安装均NOT_EXECUTED。没有缺vendor/preload而漏跑的本机测试，但材料未提供的公开checkout不能复用本机完整构建可执行性的结论。

机器证据、准确命令及108份本地原始证据的相对路径/字节数/SHA256见 [证据索引](evidence/play01-stop-boundary.json)。原RED、初次anchor错误、合法retry错误传播回归及修复后GREEN均保留；未将包含本机绝对路径的原始日志复制到公开文档。后续收尾仅改文档，不改变构建输入，不为相同产品重复构建。

## 回滚与边界

产品/测试/根因报告提交为 `1a62f3d6675a48050df6827c3807d9720f45f560`，可通过 `git revert 1a62f3d6675a48050df6827c3807d9720f45f560` 单独回滚（本轮未执行回滚）。后续同分支docs提交只记录验收与当前计划。若未整合，直接不采用本分支即可；原v0.2.7及SEC/LIFE/CI分支均保留。构建产物只用于本地隔离验证，不安装到现用客户端。

下一步仅建议独立PLAY-01 PR，保留与SEC/LIFE的可独立回滚边界；真正整合前应复核基线漂移，组合候选另跑验收。是否创建PR、合并或发布仍需用户授权，本轮未执行。

离线假API只能验证请求与报告序列，不能证明真实服务器已收到报告或转码资源已回收。真实服务器、可见画面与正式版组合候选仍须另行验收；本修复不关闭上一轮SEC02完整隔离迁移和第三方材料缺口。
