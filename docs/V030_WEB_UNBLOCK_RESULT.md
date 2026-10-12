# v0.3.0 Web 与资产材料解阻结果

日期：2026-10-12（UTC+8）。本地工作基线 `72d4688821822860d20342ae8c784a279b06b4f5`。
本轮为 Tier 1、明确集合内的材料补件；Playback/Session impact 为 NONE。模型继承父线程，不切换路由。最终许可组合和发行判断由父线程复核。

## 实际取得的材料

本轮实际取得 21 个 Roboto 字体的准确内嵌版权/许可证据、Google 官方 Roboto Apache 2.0 全文、Apache 官方全文、Google Material Icons 官方 Apache 2.0 全文，以及 jQuery 3.6.0 官方 registry 源包内 MIT 版权/许可全文。补件与逐文件证据位于 [notice 索引](redistribution-notices/web/INDEX.md) 和 [机器回执](evidence/v030-web-unblock.json)。产品、vendor、安装器和 runtime 字节未修改。

| 目标 | 本轮证据与已关闭层级 | 剩余工作 |
|---|---|---|
| 21 个 Roboto WOFF2 | 每个文件解码到 `Copyright 2011 Google Inc. All Rights Reserved.`、`Version 2.137; 2017`、nameID 14 的 Apache 2.0 URL。许可身份和仓库完整 notice 材料闭合 | 将已复核全文与版权加入现有随包 notice。没有把未 bit-exact 重建字体升级为发行权阻断；全包许可组合另由 parent 判断 |
| 2 个 Material Icons Round WOFF/WOFF2 | 均解码到 Google 2019 版权、family、`2022-04-11T03:57:28.928963` 生成时间。官方 Apache 全文已取得 | 两个文件 nameID 13/14 均不存在，故本轮仍未关闭许可声明与实际导入的关系。需要准确原字体包/导入记录及适用声明，或后续选择来源明确的官方版本；不是仅因不能逐字节重建而阻断 |
| jQuery slim | 目标保留完整 `3.6.0` slim excluded-feature 字符串，官方源包声明 MIT，完整版权/许可已取得，notice 补件材料闭合 | 目标删除原 banner、重新压缩且 identifiers 不同；尚未证明全部修改与官方源码对应。MIT 不普遍要求对应源码，不能把该差异自动当作分发权未知。将完整 notice 随包后，source/minifier 关系单独记录 |
| 19 个图片 | 准确文件/hash 已回读；其中 18 个在 www，另 1 个是 `electronapp/logowhite.png`。主题 `logo.png` XMP 给出既有 overlay 署名和 2021 编辑记录；部分图仅有编辑软件名 | 未发现图片许可授予声明。编辑软件名和 EXIF/XMP 不是授权。仍需图形原始来源、修改/再分发依据和归属 notice |
| 其它核心 Web、第三方 JS/WASM/CSS | 准确集合和 Carnival / ETE 变换关系已绑定。720 文件中仅 app.js、PlaybackManager、apiclient.js、toast.css 四路径与 Carnival base 不同 | 原始完整 Web 的授权/适用许可、逐组件通知，以及实际适用 copyleft 时的对应源码/构建说明仍需提供者资料；不要求所有 minified JS 都 bit-exact 重建 |

现有候选仍没有这些新补件。`docs/redistribution-notices/web` 不在当前四文件随包 contract 内；本轮 `NOTICE_SUPPLEMENT_READY` 仅指仓库内完整材料已准备，不把旧 runtime 的 `NOTICE_GAP` 改成已交付。parent 可将经复核的全文整合到 `THIRD_PARTY_NOTICES.md`，或另行批准明确随包路径，再为新候选绑定身份。

## 准确输入与验证

本轮目标为 `ETE-v0.3.0-stable-rc-20261012-internal`，`sourceCommit=7827425e07024fcca3bf671aa4401bb3020291b0`，版本 `0.3.0`。实际 manifest 为 2138 文件，`payloadSetSha256=1353809d891dc8fed0cb8fc5318c801c2050380dcc2cbb9cf4c30527cd6df349`，manifest SHA256 为 `fd27dfea9418fed1a5eecef69af53624692847cdfa48ae53cea52af8444cac10`。该身份与历史 `322a037` 材料集合分开。

准确核对 720 个 Web 文件、23 个 Web 字体、19 个指定图片的路径/hash，全部匹配目标 manifest。WOFF/WOFF2 的 name table 通过仅依赖 Node zlib 的只读解析器解码，23 个字体均成功；nameID 0/1/2/3/5 及实际存在的 8/9/11/13/14 保存到 JSON，13/14 不存在时保存空数组。图片仅解析指定文件的 PNG 文本/XMP、GIF comment 和 JPEG ASCII source markers，没有打开播放器、安装器或扫描用户媒体。

官方定向搜索 3 条、公开材料请求 9 次，总数 12，已停止。其中 4 个 Material font 固定版本路径返回 404，未拿到字体，不据此声明来源匹配；有效材料全部按实际 bytes/hash 保存。已读取历史 CLOSEOUT_027/查询回执，未重跑完整离线 Web 失败搜索，也未做产品构建、CI 安装、播放或历史大回归。

额外覆盖提醒：目标 manifest 中另有 `external/Presets/fonts/Source Han Serif SC-Bold.ttf`，它不属于本轮原先明确的 23 个 Web 字体。JSON 单独标为 `NOT_REVIEWED_IN_THIS_23_FONT_SCOPE`，由 parent 做该单目标核查，不能将本轮 23 个字体结论外推过去。

## 剩余 A / B / C 路径

A 优先继续补当前组件。向提供者索取以下最少资料，接受条件是材料能解释已列目标，而非要求所有文件必须 bit-exact 重建。

1. 当前 Carnival 离线 Web snapshot 的适用许可/再分发声明，覆盖核心入口、完整 import/修改范围和图形。若有对应源码义务，提供完整 source tree/archive、依赖版本/锁、生成说明及修改；仅 GPL license 文本或部分 components 仓库不能代替对应源码。
2. combined patch 的 apiclient.js、toast.css 及原图 overlay 的来源与修改说明。ETE 的 tracked 变换和 PlaybackManager overlay 已有本地源码 contract，不要求重新提供同一 ETE 修改。
3. Material Icons Round 两个目标的原始字体包/官方来源记录和适用许可说明。Roboto 21 个文件已有内嵌许可声明，无需再凭字体名称猜授权。
4. 19 个图形的原始来源/许可或权利人授权，特别是主题 logo 的 overlay 署名、fresh/rotten 评分图标和背景图。请求可按 JSON path/hash 发送，避免要求不相关用户媒体。
5. subtitles-octopus JS/WASM 及其链接/内嵌库的实际许可、对应版本与通知；其它未保留版本/banner 的第三方库按 import 映射补适用 notice。不能从 npm Node 闭包的许可外推这些 Web 库。

B 仅在 A 无法取得资料后作为实施建议，本轮不改产品。之前找到的 MediaBrowser components/defaultskin 仓库属于部分 GPL 参考，不是已匹配的当前完整 Web 来源；以它们组装一个完整客户端需要另外固定可用官方源码基线、补齐依赖、保留本项目 source replacement / Session / UI 功能并完成功能验收。不能将“找到 GPL 原版”改标为当前 Carnival bundle 的对应源码，也不能以删除客户端入口收尾。

对局部图形，可另行制作拥有明确项目授权的同尺寸 logo、splash、背景、equalizer 与图标，维持原引用/尺寸/动画用途；评分徽标改用经确认的文字/自制形状会改变视觉表现和品牌表达，需产品确认。若 Material 字体改用来源明确的官方版本，必须核对 ligature、codepoint、字宽和样式，避免按钮缺图或布局变化。Roboto 已有许可证据，应优先保留。以上均为候选，未制作、替换或删除任何资产。

C 可以单独规划 source-only 交付，只包含权利已确认的维护源码/工具及所需声明，并明确外部输入与构建限制。不得附带未知 Web、字体、图形或二进制；也不得称为可安装的 Windows 全客户端。现有源码树中派生/导入材料仍需逐项判断，不能因为 tracked 就自动认定全部有权发行。

本报告只提供材料与边界，不批准 Stable。用户已报告覆盖升级、升级后启动正常的验收事实由 parent 记录；它不替代本材料门禁，也不推定配置、DeviceId、卸载或其它生命周期结果。
