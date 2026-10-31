# 共享缓存Windows工具存活性审查

本阶段只修工具、来源校验和诊断，不改产品树或原安装包。已有真实前后seek及原生恢复推进证据；完整Native四阶段仍未通过。不得以本地Node测试、app quit、helper退出或回执写入宣称Electron进程已退出。

## 分开的假设

| 假设 | 可证实或否决的证据 | 本地结果及限制 |
| --- | --- | --- |
| 同步来源复核挤占原40秒阶段 | 记录完整candidateVerification用时，以及每次操作的requested／effective预算；保持原时限比较 | 固定源码149个blob逐一启动Git的成本可重现；批量读取正文全部相等。没有Windows改后用时 |
| renderer执行或Promise结算停滞 | 同一表达式的entered／returned／settled或rejected观测，加实际Native属性／时间推进 | 观测表达式返回原值／原Promise，保持异常；单元验证不改变语义。未本地复现Windows停滞 |
| app quit与OS退出、管道关闭混淆 | spawned PID绑定worker pid／ppid／browser角色，分别记录exit／流close／child close／kill原因 | 受控Node进程可复现quit后存活和退出后遗留管道，后者保留数字退出码；不是Electron结论 |
| Electron退出前尚有事件循环资源 | 清理前、回执前、app.exit、app.quit及process exit的资源类型计数 | 只记类型和数量，不输出socket地址、路径、栈或凭证；需要Windows实际回执 |

反向unpause在一轮只有约3秒有效预算，不能描述为完整5秒Native命令超时。其renderer入口不等待Native IPC；Native响应迟到也不是该求值停滞的既定解释。关闭隐藏页面背景节流未充分解决问题，不再将其当根因结论。

## 实质来源门禁优化

将源码对象的逐个`git cat-file blob`调用替换为一个本地`git cat-file --batch`。请求只接受固定树中完整对象ID；去重相同对象，按原路径全量逐项比对。二进制帧核验对象顺序、blob类型、规范长度、正文边界、换行和总大小，并重算SHA-1／SHA-256 Git对象ID。拒绝缺对象、多余字节、非ASCII头、错误正文或不完整响应，无逐文件降级路径。

安装器摘要、原物理清单和文件全集、所有provenance、Git树／源码SHA256、Native和Electron树门禁均保留；每个worker仍完整核验。仅减少本地Git进程启动，不挪走校验、不扩大播放预算、不改来源身份。源码集正文有64MiB上界，实际受控基准为约1.49MB；不是视频驻内存缓存。

## 进程与诊断合同

协调器直接spawn经验证的electron.exe，shell=false；PowerShell只包装协调器Node。成功必须由该spawn PID对应的browser进程产生回执，父PID也须匹配。`app-quit`不是退出码；必须继续取得该进程的exit及全部流关闭，任一超时仍失败。

保留原粗粒度timedOut字段供现有门禁使用，另写terminationReason明确deadline、stdout／stderr上限、spawn／process错误。记录首次终止理由及有界时序，不把输出超限当性能问题，不把未知退出改成成功。生命周期文件仅含PID、事件、耗时和受限资源类型数量；求值日志仅含固定标签及预算数值，原表达式和媒体信息不输出。

下一步应先审阅这些本地证据，再确定专用Windows最小renderer IPC／Promise和退出复现。该场景应排除真实媒体、Native播放及缓存业务，保留固定Electron和owned profile；区分入口、同步返回、Promise结算与结果送达，并独立验证自然退出。当前云环境没有Windows、可用Electron或Xvfb，本地Node模型不能代替它。不要继续用整套四阶段反复试错，也不更改正式播放器或用强制process.exit冒充修复。

## 本地验证范围

完整离线2689项：2676通过、0失败、13项既有平台跳过；最后PID边界收紧后相关21项再通过。Git批读6项覆盖二进制／空blob、重复对象、SHA-1／SHA-256、非ASCII／错误头、短正文／多余字节及错误哈希；收集器6项覆盖quit／exit／延迟流close／deadline／输出上限／spawn失败；表达式2项验证原Promise身份与失败不变。语法和有限凭据模式／文档链接检查通过。本地受控Node进程另复现同样事件分类，原始报告保存在仓库外，不发布。

这些证据支持工具门禁优化与诊断合同，不证明Windows Electron的运行或退出已修复。

下一阶段已准备[独立无媒体复现](SHARED_PLAYBACK_CACHE_NO_MEDIA_PROBE.md)，不重排原Native四阶段。
