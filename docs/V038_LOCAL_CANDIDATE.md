# v0.3.8 本地候选交付

2026-10-17，状态 `V038_LOCAL_CANDIDATE_COMPLETE`。产品来源固定为 `bd486f5fa625496086248b80a3f8859dc19b19da`，版本0.3.8，分支 `codex/v038-display`。本报告所在后续提交只同步文档；产品构建清单和ZIP仍绑定上述来源，最终文档HEAD另由本地回执记录。

## 使用与范围

候选目录为 `dist/ETE-v0.3.8-display-bd486f5-20261017`，入口 `Start-Candidate.cmd`；ZIP为 `dist/ETE-v0.3.8-display-bd486f5-20261017.zip`，同级有 `.zip.sha256`。解压后保留完整目录结构，通过该入口启动。资料保存在候选同级 `ETE-v0.3.8-display-bd486f5-20261017-profile`；本机隐藏验证已创建此候选专用目录，ZIP不包含它，解压后的首次启动自行创建。未复制现用profile或登录凭据。

该入口直接运行来源绑定的Electron；它不是Host启动或系统安装验收。本轮没有执行CMD的可见启动，机器检查通过外部安全harness加载候选的实际 `launch.cjs`，抑制窗口动作并阻断网络和Native子进程。CMD内容已静态核对。

候选继承夜间设置顺序、显示失败收口、诊断标签脱敏和电影分块归属四项维护，并加入已批准的有限显示修正。

- A/B1：原三个显示动作共用main FIFO，从接收起计5000ms绝对期限；未确认退出的工具保留隔离。XHR及整次显示探测上限8000ms，失败降级可选显示探测；当前播放与取消判断保持。
- N1：同adapter/request的FPS任务共享drain并合并最新目标，退休清理所属等待；成功后的原3000ms稳定等待保持。
- N2：destroy恢复前在同一8000ms预算内观察current，仅已观察值仍等于本实例预期时发原始恢复；未知/第三值不补偿写，失败只作固定诊断，不重试或等待Native销毁。

协议、Native Helper、PlaybackManager、Session身份链和依赖未更改。窗口仍不能可靠映射到Win32显示设备；既有固定DISPLAY1不代表目标选择已验证。技术合同见[范围](V038_SCOPE_AND_CONTRACT.md)、[归属设计](V038_DISPLAY_OWNERSHIP_REVIEW.md)和[N1/N2](V038_NARROW_DISPLAY_REVIEW.md)。

## 准确来源验证

| 层次 | 实际结果 |
| --- | --- |
| 公开离线集合 | 1095/1095，fail/cancelled/skipped均0 |
| 固定材料集合 | 210/210，fail/cancelled/skipped均0 |
| 静态检查 | JS322、PS28语法通过；373 tracked文本有限凭据模式扫描通过 |
| 构建及VerifyOnly | 同一冻结来源通过，2159 payload/2160完整runtime |
| 源码与材料来源 | 109产品/51输入/4notice，共164绑定行、160唯一Git blob、113项runtime字节直接比较通过 |
| 独立runtime审计 | 578/578，完整集合/逐SHA及baseline差异核对通过 |
| 隐藏实际组件 | 菜单9、OSD18、API17、PlaybackManager18，共62/62 |
| 候选入口 | 实际版本0.3.8；appData/userData/sessionData/logs/temp/crashDumps和argument profile全部落在候选专用目录 |
| 所属进程 | 两次root正常exit0，已观察子进程全部退出；无强制停止、残留或归属查询错误 |
| 候选与ZIP | 各2165文件；完整文件集合、每项大小/SHA与ZIP CRC回读通过 |

两次隐藏运行的实际窗口显示、Node/browser网络请求、Native子进程启动均0；bootstrap错误与原生对话框调用均0。组件层API/WebSocket、播放和Session输入为合成fixture，使用实际AMD模块与原生DOM组件；不代表真实服务器或媒体测试。file协议的Service Worker Cache.put不支持错误保留在私有结果中，62项断言及资源清理仍通过。

独立baseline比较为8个变化路径、0新增/0删除：`electronapp/main.js`、`electronapp/plugins/libmpv.js`、`electronapp/package.json`，另5项构建/来源元数据。Native Helper、libmpv及Electron二进制与夜间baseline逐字节相同，Native Helper为正常构建、testing=false。

## 产物身份

| 项目 | SHA-256或数量 |
| --- | --- |
| ZIP bytes | 233738938 |
| ZIP SHA-256 | `5aa4bcf59b70cbcddf15575f7440b5a77859dc4bb47ed35d96f70aad43724cc8` |
| build-manifest SHA-256 | `ec5422ef2909b4f50cd4a7d07037f12829baf3b07dca955126b3a5b293cec703` |
| payload-set canonical SHA-256 | `78f3a917c609edaf8b5486fe22470ca4a7f55c7c62820f37cedadbcbdd7a7f4e` |
| CANDIDATE-MANIFEST SHA-256 | `14f122684ba3aeb298d92db845aa740119a2d7f5dbcbd63929cc120ce8f7b08c` |
| VALIDATION SHA-256 | `f75cd9119aff0114fe1786d1155e56fd394bba3a1d1e977c0896c1540bdee59a` |

候选与ZIP仅含完整runtime和5项入口/说明/验证文件；profile、harness、日志不进入交付。完整清单和逐文件SHA在候选 `CANDIDATE-MANIFEST.json`，准确来源在runtime `build-manifest.json` 及各provenance文件。

## 未验证边界及历史

人工验收为 `USER_DEFERRED_NOT_TESTED`；真实播放、远控、显示硬件、前台、系统安装未执行。完整B2 lease/CAS、跨renderer同值接管、可靠显示目标映射及完整app-exit显示恢复仍为 `UNKNOWN` 或未实现。局部current观察不构成原子CAS，物理FIFO不构成逻辑lease；这类边界不从隐藏PASS推导为完成。

首次A的1121/1122保留唯一prepared preload缺失的require失败，固定生成后原夹具5/5；最终1095公开集合与210材料集合各自记录，不合并或改写旧集合结果。N1/N2修前与修后、错误事务断言及修正后的并发destroy用例、历史跨实例回执覆盖导致的原件损失、独立新目录复验和所属测试进程收口，均保留在[维护记录](DEVELOPMENT_LOG.md)。独立复验不称为恢复原件，未闭合的父私有补验不引用为PASS。

本轮仅有本地提交和候选构建，没有push、PR、merge、Tag、Release、部署、远端写入或系统安装。有限本地任务已收口；上述真实验收和条件缺口单列，不等待人工反馈继续扩大本轮范围。
