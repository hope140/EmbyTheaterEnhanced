# 构建加固复核与安装器重复性

日期：2026-10-09（UTC+8）。审核基线为 `da672d24d22bb165e5fc99b6c74a09e64941fe75`，基线产物 sourceCommit 为 `3b158f69e974802ef92a3d8c7ef6815139498d1f`。执行分支为 `codex/build-review-20261009`。本轮限于构建输出写入边界、安装器文件时间元数据及相关验证，产品版本仍为0.2.4。

状态：本地审核、修正与候选验证完成。两个独立runtime和两个原始安装器均达到本轮相同输入下的文件字节一致。

## 审核结果

重新运行输入审计、输入绑定、工具链和依赖目录四组定向测试，50/50通过、0跳过。静态复核未发现正式build流程绕过锁定npm安装、提交输入或GCC/Inno树身份检查的确定问题。`copy`是build内部步骤，它自己不独立证明输入项目由npm刚刚创建；正式build负责唯一目录与npm integrity检查，保持该边界。

确认一处写入缺陷：旧`build-input-provenance.cjs write`会跟随runtime中的目标文件链接。独立临时fixture把`runtime/LICENSE`硬链接到fixture内的outside-canary，旧工具返回passed且改写了canary。复现完全在临时目录内，没有接触用户profile或日志。

修正要求是所有输出在写入前统一检查：物理runtime与父目录、目标文件链接/多链接、已完成产物和已存在通知均有明确拒绝条件；config只接受缺失或已验证的Carnival原始字节，使用同目录独占临时文件及原子替换。通知和来源记录独占创建，保留失败候选供检查。原`contract.materializeNotices`入口也走同一安全实现，不能留下旧直写路径。

## 安装器不一致的受控定位

基线两个runtime各2136文件，文件字节相同，但1244个文件的mtime不同。原安装器A/B大小为175630156/175630030，SHA不同；两者PE COFF时间戳相同，不能把差异归为PE编译时间戳。

| 对照 | 控制条件 | 结果 |
|---|---|---|
| 原配方、同一runtime A、相同basename，两个新输出目录 | 固定Inno6.7.3、同一源码配方和全部输入文件 | 两次均175630156 bytes，SHA256 `467cf2774be8b89d9ee6a8af98c064c1590e87d403b5225255bd5f8aa740accc`，也与原安装器A相同 |
| 只在Files项增加notimestamp，分别使用原runtime A/B | 保留原A/B的不同mtime和相同文件字节，不修改任何输入文件或生成后的EXE | 两次均175630818 bytes，SHA256 `9b3599c14af2ba5ed2f682643bec4d2b68e516254e25f8fbfa9114bf9148173e` |
| 对notimestamp产物做完整性及解包 | 使用固定InnoUnp，不执行安装器 | 解包2136文件，missing/extra/changed均0，与输入runtime全匹配 |

上述为固定3b158f6产物的隔离配方实验，不冒充本轮新源码的正式安装包。记录位于`.work/repro-control-a/b`、`.work/repro-notimestamp-a/b`及`.work/repro-notimestamp-payload.json`。

Inno固定6.7.3的[官方Files说明](https://github.com/jrsoftware/issrc/blob/is-6_7_3/ISHelp/isetup.xml)提供`notimestamp`用于不保存输入时间。对应[Compiler.SetupCompiler.pas](https://github.com/jrsoftware/issrc/blob/is-6_7_3/Projects/Src/Compiler.SetupCompiler.pas)在CompressFiles读取文件LastWriteTime，并在该flag下清空存储时间。实验和这条实现路径共同支持本次容器差异来自输入mtime。

正式配方保持既有ignoreversion、递归复制和目录创建行为，只增加notimestamp。安装后不会把文件时间回设为构建机的源mtime；[Setup.Install.pas](https://github.com/jrsoftware/issrc/blob/is-6_7_3/Projects/Src/Setup.Install.pas)只在存储时间有效时调用SetFileTime。文件内容、安装目录、应用身份、快捷方式和profile策略保持；没有安装实测或生成后改写EXE。

## 最终验证与交付

产品sourceCommit：`1a05f88357a08f5d7c99a7e5de28de20aad0dc79`。工程提交为`14f6d28`（安装器时间元数据）和`1a05f88`（写入边界）；worker提交`aa02d34`经主线程实际diff复核后cherry-pick到本分支。后续文档提交不改变产物身份。

| 验证层 | 结果 |
|---|---|
| writer定向回归 | 17/17 PASS、0跳过；硬链接、文件符号链接、目录junction、完整产物重写、后序notice冲突和非base config均实际覆盖 |
| 最终提交全量测试 | 535/535 PASS、0失败、0跳过；`.work/build-review-unit.log` |
| 独立runtime构建、provenance与文件对照 | A/B各2136文件，missing/extra/changed均0；source/runtime/native/Electron、34项输入绑定和精确依赖检查通过 |
| 与3b158f6产物对比 | 只有6份manifest/provenance改变，其余2130文件字节一致，包括应用JS、Host、Electron、Helper、libmpv、通知和最终config |
| 正式安装器完整字节 | A/B均175653917 bytes，SHA256相同；未改写生成后的EXE |
| 安装器完整性与解包 | A完整性通过，解包2136/2136，missing/extra/changed均0；B与A字节完全相同，不冒充额外执行了一次B解包 |
| 版本和收尾 | PE FileVersion/ProductVersion去除资源填充空格后均0.2.4；本工作树可执行进程残留0 |

主候选：

- runtime：`dist/ETE-0.2.4-build-review-1a05f88-a-win-x64/Emby.Theater.exe`。
- installer：`dist/EmbyTheaterEnhanced-0.2.4-build-review-1a05f88-a-win-x64-setup.exe`。
- SHA256：`133a74abb36e18dbd21a186c3b330759a9f213e4d0045c5a9fabcf9db4b04258`。
- 同名`.exe.sha256`和`.exe.provenance.json`均由正式package流程生成；后缀b是独立重复构建的对照。
- [结构化证据](evidence/build-review-20261009.json)记录sourceCommit、对照、安装器identity及验证边界。

主线程复核了实际diff、最终日志和产物，独立复核未发现新增明确阻断问题。主线程还发现首版新增测试错误地把EEXIST当成链接权限不支持，以及原materializeNotices入口未委托；两项均在提交前修正。最终17/17与535/535均为0跳过，不采用早期跳过结果。

本轮不启动真实客户端或服务，不执行系统安装、推送、PR、主线合并或发布。来源材料仍缺patched libmpv完整构建链、Host精确构建关系及部分Web/资产材料；本次安装器重复性不等于所有第三方组件都能从公开源码重建。历史隐藏double-Next夹具时序限制和全屏107ms观测边界保持原归属。
