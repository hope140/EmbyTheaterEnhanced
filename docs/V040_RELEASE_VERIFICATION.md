# v0.4.0 发行核验与准备状态

## 当前状态

用户已确认准备并在真实构建核验后发布 **v0.4.0 正式版**，`prerelease=false`，保留旧 v0.3.16 prerelease、tag及附件。本页当前是发布准备记录：正式source、Tag、五附件和Release对象尚未产生，不把版本准备当成已经发布。当前公开Latest仍为v0.3.1。

本轮只包含已批准的来源清理、CEC／旧Host自更新退役、维护源码与构建／文档收尾。原生Windows控制、缓存／预加载及FNConnect等后续功能在独立分支，不进入此版或成为额外发布门槛。

## 已验收候选与新云端基线

先前本地候选的实际来源为 `ad77308cd83bd629a7b75349d727044f9fa1d86b`。该候选的Windows构建、安装器核验、升级、测试副本实际STRM播放和正常Host入口检查获通过反馈，用户确认验收通过。此证据不冒充后来每份新安装包的GUI／媒体实测；本轮无需重复已接受的功能验收。

后续正常Git交接与构建接线在 `6858c71103605ff66c630f1cd7e1e9fdbdeab000` 达成一次干净Windows测试包闭环，tree为 `534b762bb9f0ee77de4113467005350ebb07dbc6`。这份包内版本仍为0.3.16，只用于验证构建；不可改名、修改回执或借用旧锁成为v0.4.0。

## 干净GitHub Windows测试构建

[run39974691780](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39974691780)，`workflow_dispatch`，`release_package=false`，来源6858c711。manual job从15:01:43到15:17:35 UTC，共15分52秒；镜像Windows2022 `20261021.343.1`。

- 固定官方源码／依赖恢复，MSBuild17、net462/x86 Host编译及本次实际验证通过，生成来源／run绑定锁；没有导入Work产物或旧回执。
- 普通回归1609/1609通过，失败／跳过均0，测试496218.6494ms；415份JS、47份PowerShell语法及502文本有限凭据模式检查通过。完整安全审计并非该扫描的含义。
- 显式Host材料检查、Native Helper固定工具链编译、runtime／来源门禁、安装器编译、固定unpacker完整性和解包集合／大小／逐文件SHA256比较通过。
- 此run未运行全部显式材料文件；正式 `release_package=true` 必须另执行全套显式材料自测并记录新结果。

[artifact12511028415](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39974691780/artifacts/12511028415) 为17文件、164336955字节；GitHub元数据与上传日志均记录归档SHA256 `227e63055c4396bb007e64c283b74d4da092564c17a7ae1e415cd61efccbd51f`，保留至2026-10-24。安装器名为 `EmbyTheaterEnhanced-0.3.16-test-6858c7110360-39974691780-1-win-x64-setup.exe`。独立下载读取归档内部清单与回执尚未完成，不能把服务端摘要核对称为本地完整字节复核。

旧Windows2022镜像曾被System.Configuration固定GAC／SHA门禁拒绝，原失败保留；新镜像成功不表示所有镜像兼容。固定允许值与非reference检查保持，没有通过信任未知实现来取得成功。

## 正式构建与五附件待核验

v0.4.0须从版本／文档定稿后的准确新提交重新构建，手动输入 `release_package=true`。版本一致性、完整普通测试、全部显式材料、实际Host与Native编译、runtime／provenance和完整安装器比较均须通过；任何失败停止，不回退旧Host或以历史成功代替。

预定五文件为以下标准名称，必须在新run实际产物中逐项确认后才可上传：

1. `EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe`
2. `EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe.provenance.json`
3. `EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe.sha256`
4. 精确source Git blob的 `RELEASE_NOTES.md`
5. 列出前四件实际SHA256的 `SHA256SUMS.txt`

正式run在所有构建与包体检查后，重新核对五附件、安装器来源／版本／大小／SHA、单文件校验及四项校验表、notes原Git blob，再输出 `RELEASE_FILE_EVIDENCE` JSON，含每文件名称／大小／SHA及sourceCommit、version、runId／attempt，`releasePublished=false`。缺件或漂移阻止成功证据输出和上传。独立回读仍须与这些实际值核对。

正式安装器大小／SHA、notes blob、artifact、source／tree、Tag解引用、main／Tag CI和Release及附件身份均待新执行记录。标准五文件之外的辅助构建报告留在Actions artifact，不自动成为Release资产。

## 来源与验证边界

Host业务来源指纹保持 `81b18ab1264941b7121967770d9b791af7fd4436b6cf910da443c92f967eea45`；官方Model、Newtonsoft、固定libmpv和完整工具链分别按其合同校验。版本改号不表示更换这些二进制输入。完整来源、必要notice与被退休运行投影分别保留。

MSB3277 ReaderWriter引用冲突警告、纯net462运行兼容和未执行的硬件／完整安装矩阵边界保持。安装器没有新增显式最低.NET检查。云端使用受控Host生命周期替身，不执行完整Electron或媒体；未签名状态及第三方来源／对应源码／许可未决事项不因版本号、测试或发布而消失。

## 发布完成条件

先核对新提交真实五附件及来源，再按正常保护流程集成目标源码、建立不覆盖旧对象的v0.4.0 Tag并核对CI。Release标题为“v0.4.0 正式版”，渠道／Latest与正式版一致，公开后回读准确tag、状态、正文及五附件。存在具体权限或校验阻塞时保留证据并停止受阻动作，不能把计划当已完成。
