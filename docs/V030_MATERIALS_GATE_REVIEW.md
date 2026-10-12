# v0.3.0 剩余许可、分发材料与安装门禁增量审查

日期：2026-10-12（UTC+8）。审查基线为 `a8ba606c0bb4d8c4540ff7f9ad17eccb3d35db50`（main，PR #28 已合入的树）。本报告服务于内部候选审查，不是正式 main 发行产物；主线程当前 guard 12、language 7、定向 91 已完成，最终构建仍待 review。本报告只新增本文件，不修改源码、vendor、安装器、客户端、系统或服务器；不构成法律意见、发布批准或 Stable 授权。

## 审查范围与判断口径

已读取 `AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/PROJECT_STATUS.md`、`docs/LESSONS_LEARNED.md`，以及 `V030_INSTALLER_INTEGRATION.md`、`V029_INSTALL_MATERIALS_REVIEW.md`、`THIRD_PARTY_MATERIALS_AUDIT.md`、`THIRD_PARTY_MATERIALS_REQUEST.md`、`THIRD_PARTY_MATERIALS_CLOSEOUT_027.md`、`LICENSING.md`、`SOURCE_MATERIALS.md`、`THIRD_PARTY_NOTICES.md`、`BUILD_INPUT_AUDIT.md`。另只读核对指定独立 P1 报告 `P1_REMOTE_PRESENTATION.md` 的根因、窗口合成和 fullscreen 边界。本轮复用这些文件中带有 sourceCommit、输入身份和验证层级的历史证据，不把旧候选、测试版发布或文档回读改标为本轮新运行。

`PASS` 只表示对应证据层通过；`WAITING_EXTERNAL` 表示材料尚未取得或关系尚不能建立；`NOT_EXECUTED` 表示尚未做实际环境操作。发行权、适用许可和对应源码材料必须逐组件判断，项目根 `GPL-2.0-only` 不能统一覆盖第三方组件。

## 现有 PASS 与可复用边界

| 项目 | 当前证据 | 结论边界 |
|---|---|---|
| 安装器工程门禁 | `V030_INSTALLER_INTEGRATION.md:5` 记录候选 `40c704d` 的中文默认、手动语言选择、升级目录页为 `USER_UI_ACCEPTANCE=PASS`；同页及 `V030_INSTALLER_INDEPENDENT_REVIEW.md` 记录输入、编译、解包、回归和合成 guard 证据 | 可复用为安装器工程/三项前台体验证据；不等于完整系统安装或 Stable 通过 |
| 安装器生命周期 | `V030_INSTALLER_INTEGRATION.md:7`、`V029_INSTALL_MATERIALS_REVIEW.md:13,22,36-41` 明确全新安装、升级、卸载、重装、UAC、普通用户、快捷方式、登记和运行中升级仍 `NOT_EXECUTED` | 当前 Stable 安装门禁未闭合 |
| 项目通知随包合同 | `V029_INSTALL_MATERIALS_REVIEW.md:65-69,79-83,100-104` 记录四份项目通知、Electron 两份通知、npm notices、helper/libmpv 路径和退役 Pepper 的验证规则；历史候选/解包回读通过 | 只有最终准确 main 构建再次满足 path/hash 集合才可作为正式附件证据；研究报告不扩大 payload |
| Electron 44.4.2 | 固定官方 archive、73-file tree、`LICENSE` 与 `LICENSES.chromium.html` 已有证据（`V029_INSTALL_MATERIALS_REVIEW.md:50`、`SOURCE_MATERIALS.md:28`） | 未从 Chromium/Electron 源码重建是已披露的复现边界，不单独构成发行阻断 |
| libmpv archive/DLL 身份 | archive SHA256 `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`，归档 DLL 与打包 DLL SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c` 已对应（`SOURCE_MATERIALS.md:35-45`） | 关闭 archive 取得及成员字节对应观察；不关闭 winbuild、依赖、配置、工具链和完整通知材料 |
| npm 与继承包 | 33-package lock/fresh extraction、七个 registry tarball 的 SRI 和随包许可文本已有历史证据（`V029_INSTALL_MATERIALS_REVIEW.md:51-52`、`SOURCE_MATERIALS.md:29-30`） | 继承包 metadata、README 缺失、`power-off` 导入差异及完整 import history 仍单独披露 |

## Stable 前仍需处理的实际门禁

下表的“发行阻断”只针对适用 copyleft 组件的对应源码/通知履行路径未闭合；不能把“发行权/适用 license 尚未确认”写成已认定违法，后者一律保持 `UNKNOWN`，等待提供者事实和发行责任人决定。没有确认 copyleft 义务的组件只记录材料与权利状态缺口。

| 门禁 | 状态 | 阻断性质与最小收口 |
|---|---|---|
| 独立 Windows 系统安装 | `REAL_INSTALL_NOT_EXECUTED` | Stable 前置门禁。需可恢复快照的隔离 Windows，实际跑全新安装、v0.2.9 升级、卸载、重装，并回读 payload、旧文件、profile/DeviceId、快捷方式、卸载登记、UAC、普通用户和运行中升级失败/重试；不能用合成 probe、编译或解包代替。 |
| Together 双端 SyncPlay | `ROOT_CAUSE_CONFIRMED / WINDOWED_SYNTHETIC_VISUAL_PASS / FULLSCREEN_INCONCLUSIVE / REAL_TOGETHER_ACCEPTANCE=PENDING_USER_ACCEPTANCE` | P1 证据已定位 `PlayNow → replacement Stop → carrier hidden → transparent background exposed` 根因；产品修复由 `31d1107` 整合到 `5288fb9`，后续 `a31163b → c27755c`。窗口合成证据已有，真实主控/被控联测仍需用户验收；fullscreen 继续 `INCONCLUSIVE`，不能由窗口 PASS 代替。 |
| Host 与未匹配支撑 DLL | `发行阻断（适用 copyleft 时）：源码/通知履行未闭合；发行权/适用 license=UNKNOWN` | 对适用 copyleft 组件，精确对应源码/通知履行路径尚未闭合；不能从公开参考源或文件版本推断发行权/适用 license，后者保持 `UNKNOWN`。仍缺 Host 精确 source/build 关系，以及 `MediaBrowser.Model`、`SharpCompress`、`SocketHttpListener`、`System.Configuration` 的准确输入和适用通知。 |
| CEC、driver、RefreshRate | `发行阻断（适用 copyleft 时）：源码/通知履行未闭合；发行权/适用 license=UNKNOWN` | 公开 Host archive 中有八项 binary identity，但对应源码、构建材料和完整通知履行尚未闭合；libCEC 参考源码不能自动覆盖 driver installer。具体发行权和适用许可保持 `UNKNOWN`，需逐项材料索引与提供者事实。 |
| patched libmpv | `发行阻断（适用 copyleft 时）：源码/通知履行未闭合；发行权/适用 license=UNKNOWN` | archive/DLL 字节关系已确认，但缺 winbuild revision、workflow/build log、resolved dependencies、patch/config/toolchain 和完整 notices。固定 mpv `Copyright` 显示许可模式依构建选项和依赖而定，因此发行权/适用 license 不能推断；单个 mpv commit、header 或 DLL 文件名也不能替代对应源码/通知履行。 |
| 离线 Web、字体、图片及继承 overlay | `DISTRIBUTION_RIGHTS/LICENSE=UNKNOWN; MATERIALS_WAITING_EXTERNAL` | 冻结的 761 Web 路径、23 字体、19 图片只是输入身份盘点，不是逐资产来源或再分发条件。仍需精确 revision、依赖锁、overlay/import 映射和适用通知；当前不据此断言存在 copyleft 义务，待提供者事实确认。 |
| ServiceStack.Text 许可履行路线 | `RELEASE_GATE: OBLIGATION_PATH_NOT_CLOSED` | `4.5.14` DLL 与 NuGet 成员已有 EXACT 观察。主线程再次核对固定许可证：FOSS exception 明确包含 GPL 2.0，但仍要求 Software 遵守 AGPLv3、Additions 提供完整源码且满足该 exception 条件；商业许可是另一入口。不能把 AGPL/GPL 名称直接判为不兼容，也不能仅凭项目 GPL 声明证明闭合。需绑定 Host/Additions 精确来源并记录满足的许可与源码获取路径；本轮未取得商业授权证据。 |
| Electron 源码重建、剩余 MSYS2 recipe、工具源码到 binary 重建 | `REPRODUCIBILITY GAP` | 这些是可复现性/材料完整度问题。按当前证据不自动升级为分发阻断；若正式发布策略要求完整对应源码、获取安排或可重建保证，则需在 Stable 决策中明确加门禁。 |
| 最终 Stable 产物与发布 | 未执行 | 必须从准确最终 main 生成新 runtime/installer，复核版本、source/runtime/package provenance、完整 path/hash、签名状态和附件下载回读；当前候选不可改名冒充正式产物。最后仍需用户明确 Stable 发布决定。 |

## 可独立关闭的工作项

下列工作彼此独立，可在不改播放核心的前提下推进，但完成一项不替代其它门禁：

1. 有隔离环境后执行四阶段 Windows 安装生命周期及运行中升级/静默失败回读。
2. 在已有根因和窗口合成证据基础上，完成真实 Together 主控/被控验收；fullscreen 保持 `INCONCLUSIVE`，其状态由专项文档维护。
3. 对最终 main 做一次材料索引和 payload gate，确认四份项目通知、Electron notices、npm notices、helper/libmpv 和 Pepper exclusion 的最终 path/hash。
4. 取得或确认 Host、libmpv、CEC/driver、Web/资产和未匹配 DLL 的对应材料、适用通知或公开获取安排；收到材料后只读 hash/来源/边界预检，再作发行决定。

这些工作均不能把 `WAITING_EXTERNAL`、`REAL_INSTALL_NOT_EXECUTED` 或 `REAL_TOGETHER_ACCEPTANCE=PENDING_USER_ACCEPTANCE` 改成 PASS。历史 v0.2.9 发布也不构成 v0.3.0 的授权、材料闭合或系统验收。

## 官方固定来源核对

2026-10-12 访问并保留以下原始固定入口，仅用于核对文本/身份，不作法律解释：

- [ServiceStack.Text `e5819a8...` license.txt](https://github.com/ServiceStack/ServiceStack.Text/blob/e5819a8de75a8bae64ddc7a64008613067893e32/license.txt)：文本列出 AGPL-3.0、FOSS License Exception 及商业许可入口；适用路线未在本报告判断。
- [mpv `dd5d17d...` Copyright](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/Copyright)：许可模式依源码选择、构建选项和依赖，不能由 header 或文件名推断 DLL 完整组成。
- [Electron v44.4.2 release](https://github.com/electron/electron/releases/tag/v44.4.2)：官方 archive 身份入口；不代表本项目从源码重建 Electron。
- [Windows Host reference `708fadc...`](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13)：公开参考源入口；不代表 Carnival Host binary 已由该源精确生成。
- [libmpv SourceForge archive record](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download) 与 [Inno Setup 6.7.3 release](https://github.com/jrsoftware/issrc/releases/tag/is-6_7_3)：固定归档/工具来源入口。

## 验证

- 只读检查：`git status --short --branch`、`git log -1 --oneline`，确认基线为 `a8ba606` 且工作树初始干净。
- 文档证据：逐项读取本报告“审查范围”列出的项目文档，并核对相对链接、sourceCommit、状态词和证据层级。
- 官方来源：访问上节列出的固定源码、许可证、release 和 archive 页面。
- 本报告完成后执行 `git diff --check`；未运行安装器、客户端、服务器、真实 Emby/CD2 或 Together 双端，也未下载/执行第三方程序。

## 最终结论

当前 v0.3.0 可保留安装器工程与三项用户 UI `PASS`，并可把 Electron 未源码重建单列为复现边界。Stable 仍不能放行：独立 Windows 安装生命周期未执行，真实 Together 主控/被控验收仍 `PENDING_USER_ACCEPTANCE`，fullscreen 仍 `INCONCLUSIVE`；对适用 copyleft 组件的对应源码/通知履行路径未闭合，Host/libmpv/CEC/driver 等发行权或适用 license 仍 `UNKNOWN`。这些实际发行材料门禁与系统/用户验收需要分别收口；仅缺少精确重建或工具链重建能力不自动构成阻断。是否接受剩余材料风险、是否进入最终构建和是否创建 Stable Release，必须由用户在上述证据收口后明确决定。
