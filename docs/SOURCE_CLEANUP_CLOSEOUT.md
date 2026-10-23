# 来源清理候选收尾

本轮隔离测试包已获用户验收确认。Windows构建、安装器核验、升级、测试副本实际STRM播放及正常Host入口已获通过回报。结论限定于该候选和实际执行范围，不外推为所有环境、硬件或全部许可通过；必要第三方声明继续保留。

## 来源与交付状态

| 对象 | 身份／状态 |
| --- | --- |
| 公开源码交接 | `d0ea97369e52dccacbb1e6bbf5dbd9419a0733cd`，独立分支 `codex/test-without-private-system-configuration` |
| 公开交接tree | `54107e55fdbc4904df0dcda1815c892a250b8392` |
| 已验收本地测试包来源 | `ad77308cd83bd629a7b75349d727044f9fa1d86b`；包含本地真实验证锁及构建修正，不能冒充公开交接提交 |
| 统一Host业务来源指纹 | `81b18ab1264941b7121967770d9b791af7fd4436b6cf910da443c92f967eea45` |
| 后续差量 | 构建／测试修正和32文件验证器已交付于 `0a8bf15c25df507fe4c7b55431bb3bbd8e67f09f`；接线及文档／schema修正仍为本地差量，尚未成为已验收包的一部分 |
| 发行 | 尚未合main、调整版本号或发布本轮正式版；已有tag／附件保持 |

本轮准备完成文档和可恢复构建后再核对最终来源；最终整合提交的测试结果、产物哈希及发布状态须另行记录，不能复用旧回执宣称新提交通过。

## 当前产品范围

- 原14项用途清理及后续批准的旧logo、移动端原生相机设置和三Web残留已按快照规则退出活动源码；历史manifest/hash、必要声明及Git历史保留。普通CSS、服务器原生定制、devices管理页和有效播放资源保持。
- 默认配置由维护源生成，默认值及首次缺配置才复制的语义保持；中文37键中13项为选定修订、24项继承原文。没有把继承内容重标原创。
- 完整npm来源33包／1142文件保持，runtime仅精确排除20项，投影1122文件；锁、完整恢复输入及LICENSE／NOTICE不删。
- CEC专属源码、spawn／协议／设置、Host驱动提示和二进制运行投影退役；不卸系统驱动、不删用户profile。旧Host自更新停止检查和消费pending文件，ETE发行版更新及服务器更新保持。
- 官方Host完整来源19项，运行投影保留10项，其中EXE/PDB替换为已验证的ETE源码构建产物，另加固定Newtonsoft依赖。ServiceStack／Sharp和私有System.Configuration不再进入当前运行投影，官方Model和其它仍用依赖按原合同校验。
- JSON／ZIP维护源及API正常传输接线采用已审范围；坏JSON明确报错是批准的行为变化。源码来源、必要声明及既有行为边界分别记录，不能由测试成功推导全库许可结论。

## 剩余工程步骤

1. 已正常Git同步38文件交付，核对parent／tree和验证器32文件共196010字节；原验证器字节不改，已验收包来源仍独立记录。
2. 已接入 `tools/windows-host-verifier/` 和 `tools/Test-SourceBuiltHost.ps1` 薄包装及官方私有配置DLL的临时对照输入。验证入口使用PowerShell7；builder继续Windows PowerShell5.1、net462/x86，保留固定依赖和全部断言。32文件和薄包装绑定构建输入与runner生成器身份，合成ZIP按二进制原字节比较。
3. runner自行恢复源码／依赖，编译并执行自己的匹配字节探针，由真实回执生成 `.work/source-built-host/verified-runtime.json`。缺输入／失败一律停止，禁止复制外部验收回执或回退旧Host。
4. 在最终提交运行完整适用回归、材料、语法、安装器解包集合及provenance检查；再完成一次干净GitHub Windows构建。记录平台skip、runner差异、实际测试数量和未覆盖项。
5. 核对文档链接和当前说明后准备正式版评审。版本号、tag、main合并和Release按后续明确安排执行。

已通过候选验收不消除MSB3277、纯net462运行兼容或未执行环境的限制。安装器当前没有显式最低.NET检查，不以Host工程声明代替该门槛。旧失败Base64包未作为验证器来源。

构建操作见[PACKAGING](PACKAGING.md)，Host锁与投影见[WINDOWS_HOST_INPUT](WINDOWS_HOST_INPUT.md)，退役和升级名单见[CEC_RETIREMENT](CEC_RETIREMENT.md)，云端入口见[ACTIONS_TEST_PACKAGE](ACTIONS_TEST_PACKAGE.md)。

## 当前本地整合验证

隔离提交快照 `7e95be4e051ca596c9fc8e2a3954945f04428a81`：普通回归1576项，1566通过、0失败、10项既有平台skip；显式材料自测135项全部通过。构建输入、32文件验证器身份、413份JavaScript／47份PowerShell语法及文档链接检查通过。验证器及builder原字节、业务来源指纹保持。源码接线已具备提交后尝试干净GitHub Windows构建的条件，但该执行尚未发生；包括Framework实现精确哈希在内的既有断言仍须由实际runner满足，失败不得放宽或用外部回执替代。
