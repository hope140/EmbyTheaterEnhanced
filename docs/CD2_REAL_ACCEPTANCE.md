# 隔离客户端真实 CD2 新资源验收

本步骤面向目标 v0.3.1 的未发布候选。当前正式版仍为 v0.3.0；测试不覆盖现用客户端、不安装到其目录、不创建 Release。自动化通过不表示以下实测已经完成。

## 环境与候选身份

使用独立 Windows 测试机或已有 Windows 虚拟机，在独立目录放置候选 runtime，使用该环境的新 ETE profile。不要拷贝正式客户端的 profile、DeviceId 或 mpv 配置。只改 APPDATA 或另开一个 exe 不能证明已经隔离 Windows Known Folder、Host 和 mpv 配置；没有可靠隔离环境时先保留未执行。

候选从待验收的准确提交构建，输出必须是新的简单目录名；完整外部输入、工具链和权限要求见 [构建说明](PACKAGING.md)。例如在该提交工作树中：

```powershell
git rev-parse HEAD
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1 -OutputName ETE-CD2-acceptance
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -RuntimeName ETE-CD2-acceptance -VerifyOnly
```

源码工作树必须冻结于准确 HEAD；独立 runtime 的构建/验证结果以本地交付回执为准，真实播放仍需单独验收。运行前后核对源码提交、runtime/source/native provenance 和完整 manifest；不要拿旧安装包冒充新候选。候选仍可能显示 0.3.0：此 PR 没有变更版本，必须以 sourceCommit 区分。保留原始受验证 runtime，测试产生的文件与证据放在独立位置；不得覆盖产物。

在隔离客户端手动登录测试服务器，配置已确认的 CD2 地址、Token 和路径规则，保存并重启；选用 cloud-first 以实际进入 CD2。本验收使用 STRM 条目，MediaSource.Path 命中已确认规则，且实际播放不是 Transcode；Transcode 依合同保持 Native。先用一个已索引的已知文件确认连接、映射和普通播放，然后才新入库冷资源。记录测试设备对应的 Emby Session，确认操作目标是隔离客户端。凭据不进入报告或公开附件。

## 用例与判断

| 场景 | 操作 | 必需证据 |
|---|---|---|
| 首次冷资源 | 新入库一个 CD2 尚未发现的视频，测试前不浏览/刷新其父目录；直接在隔离 ETE 播放 | 同一 request 出现 refresh-start、refresh-end(reason=refreshed)，随后 resolve-hit 和 direct-url/cd2-http 路由；出现真实画面和正确 Session |
| 二次命中 | 重播同一文件 | resolve-hit，新的 request 没有 refresh-start/end；正常 CD2 预算保持 1200ms，无新增目录刷新等待 |
| Stop | 使用另一冷资源，在目录探测/刷新 pending 时停止 | 旧请求取消且无迟到 core-playing/load；界面保持停止，测试 Session 的 NowPlaying 清空，旧会话 Stopped 归属一致 |
| Next | 队列为冷资源 A → 已知可播 B，在 A 的探测/刷新 pending 时点 Next | A 取消；最后画面、NowPlaying 和播放报告均属于 B；随后观察超过旧请求最长 3000ms 的期限，A 不得回来 |
| 普通回退 | 在隔离规则中制造可恢复的 CD2 失败，或使用已知失败样本 | 保留真实 reason，按原规则继续 Mount/Native；确认最终 source 与 Session 正常，不把回退成功记为刷新成功 |

refresh-start 由代码严格在目标 FindFileByPath 的 gRPC NOT_FOUND 后产生。它是该边界的诊断 marker，日志并未保留完整原始 RPC 响应。若只看到 mapping_miss、timeout、auth_failed、invalid_file 或没有 refresh marker，不能把该次播放记为冷资源恢复通过。refresh-end 的 reason=refreshed 表示受控流已消费到 EOF 且最终 OK；失败、refresh_busy、refresh_cooldown 等分别记录，不等同于成功。

刚入库不保证缓存仍冷：服务器或其它客户端可能已经预热。首次直接命中的样本只证明缓存命中，记为 COLD_CASE_NOT_OBSERVED，再换新资源；不要人为清空整个网盘缓存。新的冷场景使用新文件，至少等待同一父目录 30 秒冷却或换另一受规则覆盖的父目录。

Stop/Next 必须从日志确认操作发生在 probe/stream pending 窗口。若刷新已结束才按键，只算普通停止/切集，记为 CANCEL_WINDOW_NOT_OBSERVED，不能补写取消 PASS。可以换新的冷资源重测，不能把固定 sleep 或模拟 gRPC 延迟包装成真实服务证据。

## 画面与会话

首次和二次播放分别持续观察至少 10 秒，确认真实视频区域持续出现内容，Pause/Resume 与一次 Seek 后能继续播放；记录媒体类型、窗口/全屏条件及实际范围。PositionTicks/time-pos 推进或 URL 返回本身不证明视频呈现成功，用户实际观感和连续视频区域样本应独立保留。没有查看到画面时如实记为未确认。

用测试设备的 NowPlaying、播放报告和脱敏诊断关联同一 Item、MediaSource 与 PlaySession。源替换不应改变这条身份链；Stop 清空所属会话，Next 为 B 建立对应会话，A 的迟到报告不得覆盖 B。原始 ID 只在私有证据中比较，公开报告使用哈希/一致性结论。只看到服务器接受 HTTP 请求不等于报告已落入正确 Session。

需要验证远控/Together 时，只向该隔离测试设备发送命令，检查 Pause/Seek/Stop/Next 与其画面、NowPlaying 和会话一致。未执行远控或 Together 就单独记未执行，不从本地点击或单客户端正常播放扩大结论。

## 记录与停点

每例记录准确 sourceCommit、runtime 身份、是否冷资源、操作时间、request/会话关联、路由、refresh reason、耗时、画面、Session 与结果。耗时分清整个 resolver 和 refresh block：正常共用 1200ms，缺失恢复共用总上限 3000ms，目录探测与所有刷新流共用最多 1800ms；不得为 direct/same-origin 或重查重新计满预算。

保存原始脱敏诊断及用户观察，不把解析出的 marker 当作完整网络 trace。触发鉴权错误、版本/来源不匹配、身份错乱、迟到媒体返回或不确定隔离时停止对应测试，保留现场。自然关闭本候选并检查其残留；不强杀正式客户端、不删除服务器设备，也不修改现用 v0.3.0 或个人配置。

当前真实资源、隔离客户端启动、可见画面和 Session 验收均为 NOT_EXECUTED。PR #32 已合并，PR #33 已更新到真实新 main；PR #33 合并和后续发行仍等待独立授权及准确 HEAD 验证。
