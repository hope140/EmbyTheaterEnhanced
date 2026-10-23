# CEC 与旧 Host 自更新退役

当前维护源码退役CEC全链和旧Host自更新，同时移除应用私有System.Configuration以及旧JSON／ZIP依赖的runtime投影。隔离候选已获用户验收；公开交接源码、实际测试包来源与后续runner验证仍分开记录，见[收尾清单](SOURCE_CLEANUP_CLOSEOUT.md)。未据此发布新版本或认定全库许可已通过。

## 退出范围与保留行为

- Electron不再注册electroncec、自动spawn cec-client、维护CEC专属进程owner或显示CEC设置；五份专属JS/HTML退出维护源码。普通sendCommand、键鼠／其它遥控、窗口清理及其它插件保留。
- 固定官方源码派生Host不再检查／提示安装CEC驱动或向Electron传CEC参数，app/data/mpv三项及profile位置保持。共享VC++辅助不作无关删除。
- Host不再消费pending更新ZIP；SystemUpdateTask／ApplicationUpdater退出编译，旧助手退出Content。CanSelfUpdate=false，v1检查成功返回无更新，安装接口为faulted NotSupportedException Task。ETE关于页检查本项目Release、用户下载安装及服务器更新路径保持。
- 首启bootstrap和可选PowerShell入口停止新写cec-driver/cancel；不删除已有配置、标记或归档。缺配置仍仅在首次复制默认值。
- 完整官方Host来源19项保持；runtime排除9项，保留10项中的EXE/PDB替换为已验证源码构建产物，另加固定Newtonsoft依赖。ServiceStack／Sharp不再进入当前Host编译及运行投影；不能将派生产物称为官方原样。

RefreshRate.exe、electronrefreshrate、mpv刷新率和普通HDMI音视频保留。移除已退役功能不要求CEC硬件功能验收，不执行系统驱动卸载或操作AMD／GAC文件。必要许可及历史来源清单保留。

## 来源及构建门禁

[Host维护合同](../native/windows-host/README.md)固定55原始文件、6替换＋2新增、57最终选择及46编译项。普通build在创建dist前要求真实已验证锁和EXE/PDB，或当前runner生成的完整回执；缺材料明确失败，不能使用原版Host回退来掩盖缺失。最终provenance分别记录完整官方输入、9项排除及派生产物身份。

当前Host源码移除CEC和旧更新入口，JSON／ZIP合同已在隔离Windows范围验证。完整客户端候选也已完成本轮验收；这不等于尚未执行的干净GitHub构建、所有硬件或全部许可结论。

## 升级残留

[精确名单](../installer/retired-runtime.json)共14项旧应用叶文件：五CEC二进制、五维护版本CEC源码、私有System.Configuration，以及ServiceStack.Text.dll／xml和SharpCompress.dll。JS/HTML使用明确旧Git blob身份；不把原始包的不同字节当成同一个可删除对象。

清理限定注册应用目录，拒绝Windows目录、用户profile及重定向；准备阶段检查内容、访问和进程／文件锁。新载荷安装后在ssPostInstall再检查并逐叶删除。未知hash、目录替代或访问失败保留错误，不猜测删除、不递归清目录、不卸载系统驱动、不清空用户数据。

真实升级及相关Windows负例的准确执行范围随候选回执记录，静态一致性测试不冒充执行结果。安装器既有不提供自动回滚的边界保持；旧可信安装包及Git历史保留恢复来源。
