# 文件级 runtime 基线组装

Current selection follow-up: inherited npm is now an independent 29-file component, leaving 61 physical old Carnival inputs and one current libmpv patch. See [fixed inherited npm](INHERITED_NPM_INPUT.md).

Current contract update: the historical stage-one full-input gate described below has been superseded. Normal builds require 90 consumed Carnival inputs and one libmpv patch; 144/48 predecessor records remain metadata only. See [current input selection](LEGACY_INPUT_SELECTION.md). Historical counts below describe their named baseline, not current physical requirements.

`tools/assemble-runtime-base.cjs` 从已有权威输入推导文件清单，替代
`build.ps1` 的 Carnival 整树复制。它不建立第二份 vendor manifest，
也不把外部 Web、Host 或字体转为项目自有源码。

## 输入与输出归属

- `vendor/runtime-manifest.json` 仍固定全部 Carnival 输入路径、大小和 SHA256。
- 所选 sourceCommit 的 `src/electronapp/` Git blobs 决定产品源码覆盖路径。
- `prepare-web-overlays.cjs` 的既有合同决定 Web overlay 输出路径。
- 根 npm lock 决定由全新依赖安装取代的旧包目录。
- 原 retired bridge 清单、固定 Electron 与 libmpv 组装步骤保持。

读取清单不要求本地已有第三方材料，也不生成或修改 runtime：

```powershell
$sourceCommit = (git rev-parse HEAD).Trim()
node tools/assemble-runtime-base.cjs summary . $sourceCommit
node tools/assemble-runtime-base.cjs plan . $sourceCommit
```

`plan` 列出每个基线文件的 `copy`、`replace` 或 `exclude` 动作、原因、
大小和原始 SHA256。它是现有 manifest、合同和 Git tree 的投影，不能作为
修改 vendor 身份的新依据。`summary` 仅省略逐文件部分。

生产构建在原 build-input 门禁之后调用 `assemble`，复用既有
`runtime-dependency-contract` 的新建 runtime、路径和 ownership token。
目标只允许是项目 `dist` 下的简单目录名，且只能已有当前 owner 标记。
材料文件集合、全部大小/哈希及物理路径在首个 payload 写入前校验；
额外文件、缺失、修改、链接或重定向均拒绝。逐文件复制使用排他创建并回读哈希，
失败时保留所属的新建输出，不覆盖旧 runtime，不自动清理输入。

## 阶段一的准确边界

在提交 `e286aee124f4cf7bd65d11d3febe7c01b4ac75cf` 上，原清单共
1,009 文件。清单推导的阶段一复制项为 797 文件：

| 复制归属 | 文件数 | 当前来源与后续处理 |
| --- | ---: | --- |
| 离线 Web 原文件 | 694 | 外部冻结 Web；精确上游版本和原构建配方仍未确认 |
| PlaybackManager 模板 | 1 | 同一 Web 输入；继续应用既有 patch |
| 继承 npm 文件 | 29 | 原七包身份与差异保留，未擅自改为 registry 原包 |
| 应用 package 模板 | 1 | 继续由 build.ps1 设置产品名称和版本 |
| 其他旧资产 | 72 | Host/DLL、CEC、RefreshRate、语言文件、windowsync、默认配置、external 资源和旧批处理等；保留原行为，未声称全部运行必需 |

其余 212 文件不再先复制到 runtime：45 个产品源码覆盖项、25 个 Web
overlay 基础副本、24 个由 lock 依赖取代的旧包文件、原 libmpv、preload、
Host 配置各一份，以及旧 Electron 73 文件、Pepper 一文件、旧外置播放器
Web 41 文件。各自生成/复制步骤保持原合同；Host 配置写入器已有“目标缺失”路径。
新源提交改变覆盖路径或 overlay 合同时，以实际 `plan` 为准。

本基线的 ActionSheet CSS 已成为第25个 Web overlay，不能沿用旧基线
798/211的计数。新提交中的 Windows 媒体展示维护模块继续由产品 Git blobs
进入 runtime；`native/windows-media/` 的可选 Koffi/SMTC/DWM 试验依赖仍未
纳入普通正式构建合同，本阶段不启用、不补装也不重构该试验。

**这仍依赖全部 1,009 份 prepared Carnival 输入。** 原全输入验证及
source-provenance 的历史 Electron/Pepper 身份记录没有移除。
阶段一减少的是无效复制，尚未解除原归档内容、完整 Web 或 Windows Host 依赖。
`prepare.ps1` 仍在缺失 prepared 树时解包，`build.ps1` 不重新解包或下载 Carnival。

下一步可分别处理小型 preload/package/windowsync/config 模板、旧 npm 包、
Web 源快照及 Host 的独立来源。未完成前，不宣称纯仓库源码构建，
也不更换 Windows Host、播放器、服务器或个人配置。

## 云端开发与后续拆分

源码维护、清单查询、合成逻辑测试与语法检查可以先准备到云端；Node固定为
24.18.1，依赖使用 `npm ci --ignore-scripts`。没有vendor材料时使用公开离线
测试入口而不是把完整 `npm test` 的材料缺失计成通过。本项目CI目前使用Windows；
其它云宿主的实际兼容性须在目标环境首跑核验，不能用本机结果代替。
Windows工具链、Host、窗口/硬件与真实播放继续分层验收。

完整去掉老包打包依赖仍是后续目标。建议按以下顺序推进，不能以改存储位置
或重命名vendor目录代替完成：

1. 将preload、package、windowsync、默认config等小型模板改成明确仓库输入，
   将实际需要的继承npm包纳入锁文件或替换为维护实现，保留已知差异。
2. 给离线Web与补丁的apiclient/toast建立逐文件来源和可维护输入，迁移既有
   overlay合同，消除对完整Carnival/patch树的组装依赖。
3. 独立固定libmpv、RefreshRate及可选CEC输入；明确移出不再需要的旧资源，
   同时调整历史来源校验，使其不再强制读取已退役的二进制实物。
4. 最后单独处理Windows Host源码/启动入口与DLL依赖，保持用户目录、启动、
   窗口与播放契约并做Windows验收。之后以无Carnival归档/目录的干净检出
   完成构建和打包，才可声明解除老包依赖。

正常集成路线为已审阅的任务分支进入main，再从main创建后续任务分支。
本候选基于已推送的e286aee，尚不代表它已进入main；不自动合并或改变默认分支。

## 验证

公共合成回归覆盖新旧组装后文件集合与字节等价、真实依赖替换合同、owner、
链接/路径边界、额外/缺失/被篡改输入，以及新生成器进入 build-input 门禁：

```powershell
node --test tests/runtime-base-assembly.test.cjs tests/runtime-dependencies.test.cjs tests/build-input-contract.test.cjs
```

固定材料齐备时，另外显式运行：

```powershell
node --test tests/runtime-base-material-selftest.cjs
```

材料自测用真实产品 Git blobs、原 preload/Web/PlaybackManager 生成器、配置
变换和固定 libmpv，比较新组装与旧复制路线的中间 payload，逐文件核对路径、
大小和 SHA256。对比边界在 fresh npm、官方 Electron 和 Native Helper 组装之前；
不编译 helper、不运行应用、不打安装包，也不绕过已提交 build-input 门禁。
独占产物会在测试结束时清理，准确范围与脚本工作字节 SHA 保存在忽略的
`.work/verification/` 独占回执中。该回执不代表新提交已完成正式构建。
