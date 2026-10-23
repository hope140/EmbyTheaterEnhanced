# CEC 与旧 Host 自更新退役候选

本地统一候选处理System.Configuration私有DLL、CEC全链和旧Host自更新。没有提交、推送、发布或改动正式安装、用户profile、系统驱动。JSON损坏/截断输入已选择明确报错，不伪造默认对象；消费者错误边界和源码交接仍待完成，不能把组合候选称作全部通过。

## 实际退出范围

- Electron不再注册electroncec、自动spawn cec-client、维护CEC进程owner或显示CEC设置；五份专属JS/HTML维护源码退出。普通sendCommand、键鼠/其它遥控及其它插件保留。
- 固定708fadc的Host源码候选删除CEC安装入口及其调用，不再检查/提示安装CEC驱动或传CEC参数。Electron参数保留app/data/mpv三项，profile及退出钩子不变。现有共享VC++辅助不作无关删除。
- Host不再消费pending更新ZIP，SystemUpdateTask/ApplicationUpdater退出编译，旧更新helper退出工程Content。CanSelfUpdate恒false；v1检查返回无更新，安装接口明确不支持。ETE关于页/本项目Release手动安装和服务器更新路径不改。
- 首启bootstrap及可选PowerShell入口停止创建cec-driver/cancel；缺配置仍首次复制，已存在配置和任何旧CEC标记原样保留。
- 完整官方Host来源仍为19文件；新投影排除System.Configuration.dll和五份CEC二进制，输出13项，其中EXE/PDB须由已验证的源码构建产物替换，不能冒充官方原样。CEC二进制少1,449,744 bytes，私有DLL少93,200 bytes，五份产品JS/HTML少16,065 bytes；新Host/PDB体积差异待真实产物计入。

所有必要许可、历史manifest/hash及原始输入保留。没有安装器、DPInst、系统驱动或AMD系统文件的执行/卸载；RefreshRate.exe、electronrefreshrate、mpv刷新率和普通HDMI音视频保留。

## 构建与来源门禁

[native/windows-host](../native/windows-host/README.md)保留完整四文件补丁、55份原始材料及44编译项合同。正常build在创建dist前要求已核验的源码Host锁与EXE/PDB输入；缺失时明确失败，不回退原Host。最终source provenance校验两个派生产物和来源记录，同时完整官方19文件继续单独校验。产物称为ETE源码修改派生Host，不因此宣称Common、Sharp、Model等所有来源/许可均已闭合。

Windows隔离核验已报告实际官方db22 Model下三份Host合同与六例8154/XML/pending不变/三参数/退出通过；历史f2eeca混入导致的CoreLib7故障已经区分。这里没有把摘要当成完整客户端GUI/实播证据。当前等待经确认的EXE/PDB/构建回执纳入锁定输入；缺少该锁和材料时完整构建不可用。

## 升级残留

[精确名单](../installer/retired-runtime.json)限定十一项旧程序叶文件：五份CEC二进制、五份上一维护版本CEC源码、私有System.Configuration.dll。五份JS/HTML指向旧Git blob，不能拿原始Carnival的不同字节冒充。内容不符、重定向、目录替代或访问受阻均在准备阶段阻止升级；不删除未知文件。既有进程/文件锁守卫保留。

清理仅针对注册安装目录，并拒绝Windows目录及用户profile范围；先安装新载荷，再在ssPostInstall重检归属/路径/hash/访问并逐个删除已知叶文件。无递归目录删除、旧程序调用、系统驱动卸载或profile清空。若安装后清理失败，保存错误并重新运行可信安装器；安装器既有“不提供自动回滚”边界仍适用，之前可信安装包和Git历史保留恢复来源。不同旧版本或改动过的程序文件不自动猜测删除，应先查看具体差异或使用新目录。

Pascal身份表与JSON名单有一致性测试；Windows编译、忙文件/重定向/未知hash/注册归属及真实升级负例仍需隔离验收，不以静态合同测试代替执行。

## 统一验收

一个最终测试包覆盖直启Host、安装后启动、快捷方式及可选入口；首次/已有profile、无cancel屏蔽、pending文件保留、无CEC进程/提示/提权/旧更新请求；普通播放、配置、字幕/音轨、刷新率、键鼠/其它遥控及退出保持。升级测试仅使用归本次测试所有的目录和注册记录。已存在CEC硬件功能已经退役，不再要求硬件CEC验收。JSON错误边界、完整GUI/实播及升级执行证据未闭合前不发布。
