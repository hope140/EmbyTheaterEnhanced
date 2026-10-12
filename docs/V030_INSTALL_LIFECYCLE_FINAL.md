# v0.3.0 安装生命周期最终验收入口

当前 `REAL_INSTALL_NOT_EXECUTED`。2026-10-12只读探测见[环境回执](evidence/v030-final-install-environment.json)：Hyper-V/Sandbox Disabled，相关管理命令及VMMS不可用，未识别获授权、可恢复快照的Windows目标。停止真实安装/卸载尝试，未启用系统功能，未访问或覆盖现用客户端/profile。

main89a0501的installer、guard、bootstrap和DeviceId源码与已验收基线相同；PR28原guard12项/语言7场景及三项用户UI PASS可复用，来源见[V030_STABLE_READINESS](V030_STABLE_READINESS.md)。新候选另做编译、版本、来源和全部manifest路径/hash验包；这些证据不扩大到真实系统操作。已通过的中文默认、语言选择和升级目录页面不重复要求用户验收。

## 后续可恢复Windows环境内执行

1. 记录获授权的VM身份和快照ID，确认可恢复；使用合成无凭据profile/canary，记录DeviceId文件hash，禁止导入真实登录状态。
2. 准备本轮stable-rc自身EXE/provenance/sha256，以及[已发布v0.2.9安装器](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.9/EmbyTheaterEnhanced-0.2.9-win-x64-setup.exe)。v0.2.9 EXE SHA256=`2f4fa378eb75f91f21a5163d4cdb01244621d6bb8144a12c84b81ee419c914a0`，175650591bytes，2026-10-12已回读GitHub资产digest；下载后独立复算。候选身份以最终报告为准，不能改名历史322a037包。
3. 四阶段各自从对应快照开始，保存脱敏回执，结束恢复VM；任何失败停止该阶段、保存错误，再正常恢复快照，不声称安装器自动回滚。

| 阶段 | 操作与必要核验 | 当前状态 |
|---|---|---|
| 全新安装 | 干净VM安装rc；按候选manifest核对所有payload、单一卸载项、快捷方式目标、权限、首次配置/DeviceId，普通用户启动及正常退出 | REAL_INSTALL_NOT_EXECUTED |
| v0.2.9→v0.3.0升级 | v0.2.9快照创建canary；先测试运行中交互阻止及静默非零退出（Setup退出码、目标文件hash保持）；正常退出后重试升级；核对设置/DeviceId、旧文件、单一登记、路径和普通用户启动 | REAL_INSTALL_NOT_EXECUTED |
| 卸载 | 用该实例uninstaller；验证运行保护，退出后正常卸载；程序、快捷方式、登记清除，profile/canary/DeviceId按政策保留，无owned进程或非预期服务/任务 | REAL_INSTALL_NOT_EXECUTED |
| 重装 | 卸载后快照安装同rc；完整payload、单一profile/登记、canary与DeviceId复用、普通用户启动/退出，结束恢复快照 | REAL_INSTALL_NOT_EXECUTED |

VM内可沿用只读采集工具，显式指定隔离实例的程序/profile目录和独立输出：

```powershell
node tools/installer-lifecycle-snapshot.cjs upgrade C:\ETE-VM\app C:\ETE-VM\profile C:\ETE-VM\evidence\upgrade.json --isolated-environment
```

路径为VM示例，执行前替换为实际获授权目标。工具拒绝链接、默认profile和输出覆盖；快照仅记数量/树hash，registry/shortcuts/process仍UNKNOWN，必须以系统回读另行核验。配置canary与DeviceId独立比较，日志/缓存的整树hash变化不直接判为设置损失。不要通过强杀客户端取得“升级通过”。
