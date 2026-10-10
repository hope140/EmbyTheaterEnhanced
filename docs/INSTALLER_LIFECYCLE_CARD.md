# 安装生命周期验收卡

现有 `tools/test-installer.ps1` 是0.1.0→0.1.1历史入口，不能直接用作下一正式版四阶段验收。新验收使用精确v0.2.2正式安装器和待批准候选，两者SHA256/sourceCommit分别记录。安装器执行仅限获授权、可恢复快照的独立Windows VM；本轮没有运行安装/卸载。

新增 `tools/installer-lifecycle-snapshot.cjs` 只读显式目录，拒绝链接输入、不覆盖输出，不读默认profile、不启动进程、不改注册表。它只生成文件数量/树hash/DeviceId文件hash，不保存实际路径、设置、Token或DeviceId内容。快照不等于安装验收，快捷方式/注册表/进程字段保持UNKNOWN，须由VM操作员另行核验。

VM内确认目录后可执行：

```powershell
node tools/installer-lifecycle-snapshot.cjs before C:\ETE-VM\app C:\ETE-VM\profile C:\ETE-VM\evidence\before.json --isolated-environment
```

`app`和`profile`必须替换为VM内该实例实际路径，evidence放在两个被测树之外。后续分别以clean、upgrade、uninstall、reinstall阶段名和不重复输出文件运行。ACK只确认采集范围，不代表安装授权。

| 阶段 | 前置/操作 | 必须核验 | 回滚 |
|---|---|---|---|
| 全新安装 | 干净VM、无ETE安装/profile，运行候选installer | payload路径/hash匹配manifest；快捷方式/卸载登记指向本实例；首次bootstrap设置与DeviceId；缓存位置；正常启动/关闭 | 恢复安装前快照 |
| v0.2.2升级 | 另从v0.2.2已装快照开始，创建无凭据canary并正常退出，再覆盖候选 | 设置canary与DeviceId文件hash不变；候选payload缺失/多余/不匹配；快捷方式/注册表仍正确；无旧版本文件/并行实例残留 | 恢复旧版快照 |
| 卸载 | 升级通过后的快照，运行该实例的正式uninstaller | 程序目录、快捷方式、卸载项清除；profile/DeviceId按现有保留政策保留；缓存分类为有意保留或异常残留；owned进程退出 | 恢复卸载前快照 |
| 重装 | 卸载后快照上装同候选 | payload完整；设置/DeviceId复用；只使用一套profile；快捷方式可启动并正常退出；无额外安装/缓存树 | 恢复卸载后快照 |

profile整树hash可因日志/缓存变化而变化，不能据此判定设置丢失。设置canary应独立记录hash；DeviceId文件hash只有预期没有格式迁移时才直接比较。新建profile应得到新identity，升级/重装应复用已有合法identity。不要记录真实登录凭据。

本轮验证：只对临时合成目录运行快照测试（2/2），四阶段真实结果全部NOT_EXECUTED；不声称当前机器存在可用VM，旧2026-10-10能力探测按其历史来源保留。正式执行前重新确认隔离环境、快照和权限。
