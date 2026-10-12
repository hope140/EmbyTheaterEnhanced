# 安装生命周期验收卡

## v0.3.0 当前执行入口

2026-10-12最终入口见[V030_INSTALL_LIFECYCLE_FINAL](V030_INSTALL_LIFECYCLE_FINAL.md)：升级基线v0.2.9，候选为新的stable-rc；本机只读探测未识别可靠可恢复环境，REAL_INSTALL_NOT_EXECUTED。下方旧阶段证据按原身份保留，三项中文UI体验不重复验收。

`USER_UI_ACCEPTANCE=PASS`：用户确认新候选中文默认语言、手动语言选择和升级目录页均符合预期。仅这三项前台验收完成；下方系统生命周期仍NOT_EXECUTED，不能由UI或合成检查替代。剩余正式版门禁见 [整合记录](V030_INSTALLER_INTEGRATION.md)。

本轮主要升级基线改用已发布 v0.2.9，准确 hash/sourceCommit 和候选身份见 [v0.3.0 安装器验收](V030_INSTALLER_ACCEPTANCE.md)。下方 v0.2.2 是历史方案，不能替代本轮基线。本轮真实系统安装、升级、卸载、重装及运行中升级全部 `NOT_EXECUTED`。

在独立 VM 中额外核验中文/英文首次默认、手动语言选择、升级偏好复用、中文空格目录、高 DPI、运行中客户端交互阻止/正常退出重试与静默非零退出。卸载提示须说明个人配置默认保留，配置 canary 与 DeviceId hash 应在升级/卸载/重装后独立核对。AppId 与卸载登记只有一条，快捷方式可正常启动/退出，提权后的播放器应回到原普通用户身份。编译、payload 和合成保护探针均不等同于这些结果。

## 历史验收方案

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
