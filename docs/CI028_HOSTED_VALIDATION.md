# CI028 远端整合与验收

2026-10-10（UTC+8），用户批准整合已验收CI修复、普通推送独立候选，并在Hosted GREEN及diff复核后创建PR；不自动合并main。

## 整合与文件保护

Fetch确认main仍为 `0b782ddec404f4148cb6c8c16f19bc22201d3252`，原远端候选为 `aa86ddc6b0d5a911440ee6dff41ac20147e8f8e6`。aa86ddc是CI修复分支db9ccde的直接祖先，因此采用快进，无cherry-pick、无冲突。六个原修复提交SHA保持，候选当时比main超前19项。

原候选工作树的两份tracked文档和一份未tracked调查稿保留原字节，将该工作树置于 `codex/integration-028-local-docs@aa86ddc`，再在干净工作树快进统一候选。三份文件前后SHA256一致；未覆盖、stash、还原或提交它们。普通push后从GitHub重新读取提交关系和14个增量文件，均与本地一致。

新增五项测试为：build-input物理夹具、dependency物理夹具、匿名路径诊断、真实junction诊断和PowerShell编码矩阵。没有删除原测试；公开runner及六份材料排除列表保持原字节。652→657为新增覆盖，不能归因于排除失败样本。

## 首次Hosted GREEN

固定推送HEAD为 `db9ccdeb0f932f2dc5eb769353203f03da1684a8`；[run 38040747159](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38040747159) 在2026-10-10 17:21:06（UTC+8）完成，conclusion为success。

| 实际执行检查 | 原始结果 | 层级 |
| --- | --- | --- |
| 公开离线测试 | 657/657，fail/cancel/skip/todo0，292372.7765ms；87文件发现、81执行 | UNIT_VERIFIED，Hosted执行 |
| Windows临时路径诊断 | SUCCESS，真实短名及raw/native差异已观测；物理根一致 | STATIC_VERIFIED，Hosted执行 |
| JavaScript语法 | 220个tracked文件PASS | STATIC_VERIFIED，Hosted执行 |
| PowerShell语法 | 25个tracked文件PASS | STATIC_VERIFIED，Hosted执行 |
| 有限敏感模式扫描 | 268个tracked文本PASS；不等于完整秘密审计 | STATIC_VERIFIED，Hosted执行 |
| diff检查 | PASS | STATIC_VERIFIED，Hosted执行 |

回读job steps，以上每步均有开始/结束时间及success，未跳过。六份材料文件仍NOT_EXECUTED；缺少公开Carnival/vendor/preload不被记为PASS。[首次RED](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38036913645)的626 PASS/26 FAIL及本地中间失败完整保留在 [原机器索引](evidence/ci028-windows-compat.json)。原索引按上一轮身份保留，不将其NOT_EXECUTED历史改写为曾经通过。

本次Hosted诊断确认raw TEMP/mkdtemp/child含短名且resolve/native不相等，lstat不为symbolicLink；物理路径相等。Windows PowerShell5.1为5.1.26100.33438，默认代码页1252，旧无BOMParseFile=21/执行=1，BOM版解析及执行均0。PowerShell7为7.6.6、代码页65001，两变体均通过。此结果印证修复机制；原失败run本身未采集路径/代码页，仍按UNKNOWN保留。两种生产路径validator未改变，真实junction拒绝的测试也实际通过。

工作流有原固定Actions的Node20弃用提示（执行时被Runner切至Node24），不影响本次success；本轮没有修改Actions pin或扩大CI迁移。

## 最终diff与验收结论

主线程复核main→db9ccde完整文件范围及已验收产品关系，增量仅14个CI/测试/编码/文档文件。产品/runtime来源仍为 `b139d87da06cfba153a828766926b78230be4a0f`；34项构建输入及src/native/installer/package/lock均未被CI028改变，本轮没有新播放代码、重新构建或修改版本。此前723/723、119/119、runtime8/8保持原来源，不冒充本轮新执行。

满足Hosted GREEN和diff复核条件，工程状态更新为 **READY_FOR_MERGE**，随后创建main目标PR。后续仅文档的提交及PR检查分别绑定各自HEAD回读；本报告与 [机器索引](evidence/ci028-hosted-validation.json)只声明db9ccde这次run，最终分支/PR状态以GitHub实际检查和交付回执为准。

用户六项真实播放验收继续USER_ACCEPTANCE_PASS；字幕/音轨延迟P2/LEGACY_BEHAVIOR/ACCEPTED_WITH_FOLLOWUP；四阶段安装专项NOT_EXECUTED，按用户确认不阻断推送。没有自动merge、Release/tag、安装或新增真实服务操作。
