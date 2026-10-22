# 来源与许可问题清单

[返回统一索引](../DEPENDENCY_RESEARCH.md)。记录日期：2026-10-22；以来源/许可闭合为新功能前的首要目标。`byte相同`、`源码可得`、`适用许可明确`、`实际分发范围明确`和`自有修改边界明确`是不同结论。

## 按五个维度闭合

| 内容 | 来源定位 | 许可文本与适用版本 | 实际使用及分发范围 | 自有修改边界 | 未闭合决策／最小下一步 |
|---|---|---|---|---|---|
| 597份已定位Web | 既有联合审计已确认官方发行物byte身份；本PR交付其中160份独立对应证据 | 仍须按组件与准确版本绑定文本；不能以官方归档或历史Emby GPL声明统一覆盖2022网页 | 清单是冻结输入，最终生成/替换/分发还须沿现有构建合同核对 | 相同输入不证明所有runtime输出未修改；overlay另列 | 优先把既有597证据映射到适用许可/notice及当前消费者；缺文本或适用范围时记录具体缺口 |
| 6份JS AST、1份CSS AST及114份非空未解释Web | AST对应保留独立等级；其余精确来源/引入revision未明 | 源码相似或AST同不补足许可、版权及版本适用证据 | 先核定哪些仍被复制/生成/实际分发，不按文件数假设必用 | 当前videoosd亮度/触控/倍速、码率默认值等有具体差异，作者未明 | 按原116清单扣除1份CSS结构对应及1份已定位CustomCssJS后的114清单定点追函数/补丁；无法闭合且仍需使用的，列明确替换或独立重写候选后另作决定，不直接替换 |
| 空serviceworker | 空文件身份可核对 | 空字节不作为作者或年代指纹，也不推导整包许可 | 核定是否仍为所需占位/构建输出 | 不将空文件算作社区修改成果 | 随用途核对处理，不扩大来源扫描 |
| 两份用户Web载体 | 冻结底稿及用户增量关系分开记录 | 用户修改不改变底稿及独立库的适用文本 | [PR #67](https://github.com/hope140/EmbyTheaterEnhanced/pull/67)提取增量，合并与runtime关系仍以该PR结果为准 | ApiClient的openWebSocket/reportPlaybackProgress及toast既有块删除，不代表整文件用户原创 | 核对提取后可重现输出、原作者通知和补丁边界；PR未合并前不写已交付 |
| 官方Host/Model、继承npm等固定组件 | 依各组件manifest固定身份；当前Model已换官方字节 | 每个组件的准确许可/notice单列，不从Host或Electron根LICENSE覆盖全部DLL/npm/Web | 核对生产复制与随包通知，历史manifest记录不等于当前物理输入 | 维护源码、输入及生成关系按原合同区分 | 从[源码材料索引](../SOURCE_MATERIALS.md)、[Host输入](../WINDOWS_HOST_INPUT.md)、[Model输入](../MODEL_COMPATIBILITY_INPUT.md)、[继承npm](../INHERITED_NPM_INPUT.md)逐项引用已有材料，不重复宣称全部对应源码已重建 |
| 14项旧资源 | 来源普查停止；不继续扩大未知包检索 | 是否还需要取得或保留某条目通知，须结合准确用途/分发范围 | 转下节用途清理；保留未闭合消费者证据 | 不把名称相似、版本变体或旧包载体当作项目原创 | 先完成消费者清单，再决定保留、退役或另提替换；不擅自改固定输入 |

## 本PR实际观察到的许可材料边界

- 所取官方4.7.6 netcore ZIP的条目名中，`license|copying|notice`（不区分大小写）命中0；这是文件名盘点，**不是全内容许可审计，也不证明内容没有许可**。归档身份见[证据JSON](evidence/web-history-20261022.json)。
- 官方Electron 3.0.19 commit `915af80eeba533e3014192708ca3b722046fad03` 的[LICENSE.md](https://github.com/MediaBrowser/emby-theater-electron/blob/915af80eeba533e3014192708ca3b722046fad03/LICENSE.md)包含GNU GPL v2文本，SHA256 `f371b80469fb235bc500ec29e0e85b682d4a6157a158567d828ff0be544d4f1d`。该源码无www，并不因此确立另取2022 Web整树的适用许可。
- 所核对webcomponents/defaultskin tips未见根级license/copying/notice命名文件。历史声明或链接不能自动替代准确分发版本的文本与范围核对。已有文件内声明和通知须保留，不自行重归属。

## 固定版本许可新证据

官方[4.7.6 arm64 Debian包](https://github.com/MediaBrowser/Emby.Releases/releases/download/4.7.6.0/emby-server-deb_4.7.6.0_arm64.deb)为76,094,120 bytes，SHA256 `2a75311bb9c9e44fd2cb7d6e2fb1d7d55de8927213a7c30fa12d92fa196c0efe`。仅静态读取ar/tar/DOCX，不执行安装器或产品。

其中`data.tar.xz`内`opt/emby-server/licenses/license.docx`为18,373 bytes，SHA256 `a6d7ea65dcb06392479a85e1a10a7aeb872d803da6f784f6935fcd4ee63008c6`，文本标注更新于2018-04-11。它给出有限个人使用许可和有条件的完整Server复制例外，并限制修改、分发及面向公众提供下载；本轮没有由此建立拆取Web、修改后公开分发的许可依据。

同包有独立组件notice和95行组件索引，但未建立这些文本对当前剩余Web的逐文件适用关系。应先明确Web与独立组件的许可链，再判断需要哪些补充依据或替换候选，不能从Electron根GPL文本或官方托管印象覆盖整个Web。

另核对[现行Terms](https://emby.media/terms.html)，页面标注2026-08-16，含第三方组件独立条款；它不能替代4.7.6随包文本或证明2022适用关系。原始HTTP读取返回403，已用允许的网页读取取得内容；未伪造HTML原件hash。原包、DOCX、索引与解析边界均记录在证据JSON中。

## CustomCssJS固定来源
+
+已按指定固定路径核对[Shurelol/Emby.CustomCssJS commit 6933b58](https://github.com/Shurelol/Emby.CustomCssJS/tree/6933b58c62f98b0919977e953f068b1a581a7a1c)，不继续扩搜作者。`Emby.CustomCssJS/CustomCssJS.js`为4,416 bytes、SHA256 `3eaec19e8a27ef2894d262d2b8569bb6b1275baca249b1457f6679474c856009`；冻结文件4,548 bytes、SHA256 `2177de28dcc4e715f07c63329dc361c5b4ddd37eb7e59f273830b22acea37912`。仅将CRLF改LF即逐字节一致，上游无末尾换行保持。组件版本1.0.0.2及历史0fee38fa同文本结论引用对应组件核对结果，未重搜历史。
+
+同commit的[LICENSE](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/LICENSE)含GPLv3全文，35,149 bytes、SHA256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`。这是固定来源与文本证据，不代表ETE整体许可、组合与分发范围已经闭合。[PR #69](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)退役集成尚未合并，不将其计为已删除；后续仅跟随用途清理。
+
+## 旧资源实际用途清理

14项（8变体、6旧包）不再列为活跃来源追溯。用途清理先为每项列出构建读取、runtime路径/加载方、安装器或手工分发消费者及现有通知；确认无消费者后才能提出退役候选。动态消费者或分发边界不明时保留问题，不因检索没有结果就删除。清理进展见[PR #69](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)，尚未合并，不记录为已删除。

## 未闭合决定如何记录

每项仍使用的内容至少要有：准确路径/hash、已确认来源及范围、对应许可文本/版本或明确缺项、生产/分发消费者、维护补丁归属、选择理由与验证边界。可比较的选择包括继续取最小来源/许可证据、使用已有明确许可的等价候选，或独立重写；本PR不执行替换、不认定任一候选已经可发行。

v0.3.16已公开发布；发布或构建成功不表示许可清零或全部对应源码完成。已移除的libmpv对应源码覆盖专项不在本问题清单内；不因本页扩大总目标而自动恢复。
