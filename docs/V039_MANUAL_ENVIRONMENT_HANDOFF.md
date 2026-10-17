# v0.3.9 安装验证环境交接

> 本文保留原guest准备路线。用户已明确允许在本机验证ETE客户端，guest不再是前提；当前权限、只读预检、精确路径及备份/恢复门禁以[本机验收合同](V039_HOST_ACCEPTANCE_CONTRACT.md)为准。以下停点不再阻塞本机路线。

## 当前结果与最小条件

安装准备合同已获父审核通过，当前停在 `WAITING_DEDICATED_WINDOWS_ENVIRONMENT`。尚未发现确认产品缺陷，也没有039候选；已发布可用版本仍是038。此停点需要的是专用安装测试环境，不要求补测038普通播放，也不涉及签名。

最小需要一台**专用可丢弃Windows x64 guest或测试机，以及可确认恢复的快照/还原点**。用户只需提供或启动该环境，说明OS、环境身份、还原点和受控访问方式；不必手测完整14项矩阵。可自动执行的安装、文件/资料摘要、登记及退出码读回由父会话/执行会话继续处理；若UAC或交互取消确需人工，只列当时必要的最小动作。

现用Windows及其客户端/profile不作为测试机。当前没有批准启用主机虚拟化、安装VM软件、修改Windows功能或启动宿主前台；不能因为临时 `/DIR` 或 `/VERYSILENT` 就在宿主运行安装器。安装器仍可能写固定卸载登记、程序文件和系统快捷方式。

## 环境启动与guest写入分别确认

| 事项 | 提供什么 / 如何判断 | 当前状态 |
| --- | --- | --- |
| 环境身份 | 明确是专用guest/测试机、Windows x64版本和专用测试账户，不含个人资料 | NOT_PROVIDED |
| 可回退性 | 明确快照/还原点名称、覆盖OS登记/程序/资料的范围和恢复办法 | NOT_VERIFIED |
| 启动/访问 | 用户启动环境，或明确授权具体环境的启动与受控连接；不发送个人密码、私钥或profile | NOT_ESTABLISHED |
| guest内系统写入 | 父审一次精确方案后，允许该guest内固定AppId安装/覆盖/卸载及相应Program Files、HKLM64卸载登记、快捷方式和TEMP操作 | PENDING_ENVIRONMENT_SCOPE |
| 输入/输出 | 安装输入只读且按SHA绑定；单独输出摘要与必要日志；限定共享目录、网络及剪贴板边界 | PENDING_ENVIRONMENT_SCOPE |

允许启动某台guest，不等于已经允许其中全部安装副作用；允许guest内安装，也不授权启用/改造宿主虚拟化。具体环境合同确定后按整体授权执行适用矩阵，不要求用户逐项重复产品审批。guest销毁/还原也只按该合同执行，不操作其他环境。

## 已准备与未执行

已完成[范围合同](V039_SCOPE_AND_CONTRACT.md)、原安装/保留规则盘点、12项相关Git blob与night5341的绑定，以及3套项目内合成资料的BEFORE快照和18文件字节回读。C包原15项静态/合成和D包有限资源证据继续复用，038完整包体与来源门禁继续适用；本交接不重复这些绿灯。

合成资料只有不可执行sentinel、配置/有效合成DeviceId、CEC cancel和保留canary；它们不是安装好的客户端。真实系统安装、升级、原允许降级、卸载、重装、UAC、取消、失败恢复和静默退出均为 `NOT_EXECUTED`。没有启动installer、Host、Electron或Native，没有生成操作后的假快照。项目专用可回退guest仍为 `NOT_ESTABLISHED`；这不表示机器上不存在其他VM。

## 准确参考安装包

当前只引用已发布038，不将旧包改名为039，也不为交接再次下载或复制大型包。

| 项目 | 身份 |
| --- | --- |
| 版本 / 产品Tag | [v0.3.8 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.8) / `v0.3.8` |
| 产品source | `0bbc504fbb6ca98dfb7476e8078c4483347b4375` |
| 发行文档main基线 | `a1b2a04d21c023062934351f29868e9c1c908b7a`，与产品source分开 |
| 文件 | [EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe) |
| 大小 | 175754512 bytes |
| SHA-256 | `2f0be46a17c16522f677e7a174da72815bec8d9a06ffb0181a5183670fdef2db` |
| 关系校验 | [单文件SHA](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe.sha256)、[provenance](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe.provenance.json)及[038发行核验](V038_RELEASE_VERIFICATION.md) |

038发行时已有匿名全字节回读。本次交接只将公开版本/资产元数据与该既有记录对应，不声称重新下载。未来导入guest时再核所用副本的大小/SHA及来源；不执行宿主中的现用安装包。

如覆盖/升级或原允许降级需使用037等旧可信包，先单独固定其版本、产品Tag解引用source、文件名、大小、SHA及provenance；保留各自原身份，不能沿用038来源或预认它是039候选。具体版本对由父审环境方案确定，不在本交接中混用未确认的旧包。

## 最小验收顺序

1. **首次安装**：在无本项目登记、无程序树的专用guest收集BEFORE，运行准确参考安装包；读回完整payload、登记、快捷方式、退出值和所属进程。静默安装按原 `skipifsilent` 不启动应用，因此不能要求安装器立即生成profile/DeviceId。必要的guest首次应用启动须列入精确许可；未启动则初始化保持未验证。
2. **覆盖升级**：固定可信版本对，在专用账户的正确资料位置准备合成配置、有效DeviceId及保留canary，再记录程序与资料摘要。正常关闭所属客户端后覆盖，核程序更新及原资料/身份字节保留；不强关进程，不改变降级策略。
3. **卸载保留资料**：从同一可信安装记录卸载，核程序/登记/快捷方式变化、profile/config及有效DeviceId保持。除退出值外，还要确认卸载所属临时clone清理完成；不凭父进程退出认定收口。
4. **重装身份保留**：沿固定目录与包版本重新安装，核保留资料和有效身份文件不变。只读身份文件的保持不等于服务器登记或应用实际读取已经PASS；真实业务不进入本轮。

四步均保存独立前后回执、准确installer/source、原始退出值、失败信息和恢复结果。快照收集器的隔离确认参数只是路径确认，不能替代guest隔离证明。输出仅为摘要及必要日志，不导出个人profile或凭据。

默认/自选目录、中文/空格路径及静默读回可在以上顺序内自动覆盖。忙碌/ACL拒绝、安装前或复制中取消、故障恢复、标准用户/UAC和原允许降级按环境能力及具体父审方案补充；不在宿主注入故障，不以强杀当用户取消，不把未执行项改成PASS。细项与退出码预期见[完整矩阵](V039_SCOPE_AND_CONTRACT.md)。

## 恢复入口与收口

私有 `.work/V039_TASK_STATE.json` 是恢复入口，包含准确工作树、基线/文档HEAD、报告和合成快照路径。先读状态与本交接，再判断环境身份、回退点、连接和guest副作用许可是否已具备；不重跑旧共享probe、不覆盖回执、不在宿主调用 `tools/test-installer.ps1`。

当前可独立准备已完成，等待上述环境条件；父独立证据审核另以其自有目录结果记录。若有环境，继续经过审核的系统矩阵并只修证据明确的局部缺陷；如没有确认产品改动，交审核结果而不生成空039包。已有条件发布授权保留，必要人工门禁不跳过，签名继续暂缓，不开始040。
