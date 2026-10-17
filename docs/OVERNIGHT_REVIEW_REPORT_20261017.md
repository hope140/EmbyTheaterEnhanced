# 代码与文档有限复核

## 基线与状态

本次为2026-10-17晚开始、跨零点延续的一次维护任务。准确基线为规划main `31fdc576492b0803d2ceb1ec19d08d466df88aa5`，分支`codex/post-v039-night-review`。产品发行身份仍是v0.3.9/source `06d34a712e26e0d6d0b299b487cfd68625df71ed`；本轮文档或源码提交不重标该Tag，也不替换公开附件。

有限A-F本地复核及准确来源候选门禁通过，4项源码修正和2处文档更正已独立提交，待分支公共CI与累计审核集成。Native两构造函数按精确技术审核差异实施，实际源码合同3/3、相邻Native Node/fake集合78/78通过。风险中、不确定性中，覆盖当前维护源码、构建与验证、项目/GitHub文档、一致性隐私和后续安排；PlaybackManager/Session和Native协议/运行loop/关闭归属均未改。文档、资料和明确合成用例按Tier 1委派，主线程保留跨层异步、身份和信任边界及最终审核。

## 覆盖表

| 包 | 有限入口与范围 | 当前结果 | 未覆盖或停点 |
| --- | --- | --- | --- |
| A 源码 | main退出、电源owner、WebSocket生成器、诊断、Native service destroy；C++输入/写队列构造及wmain；discovery/WOL假socket/时钟 | 两UDP helper实际产品VM回归14/14；C++两构造器按批准差异修正，源码合同3/3、相邻Node/fake集合78/78 | Native只定向读构造/输入写队列和主循环，未遍历呈现/解码全部路径；没有真实网络/设备/播放验收，显示缺口保持 |
| B 构建与验证 | build/package、输入/provenance、固定工具链、CI选择/退出、installer guard及对应测试入口 | 静态未确认代码缺陷，14个generator均列入输入；另完成准确e41a050标准构建、VerifyOnly及ZIP全量回读 | 安装guard只审源码/接线，未运行；构建/ZIP不计作启动、系统安装或播放证据 |
| C 项目文档 | README、架构/状态/路线图当前段、已知问题、打包、许可、用户/贡献/CI指南 | 两处当前/历史表述纠正已局部实施 | 未通读全部历史和第三方材料；许可未决正文完整保留 |
| D GitHub文档 | 十份main文档、21条Release原对象、PR #43、039/038/031 tag身份 | 所选main blob一致；已核Release身份未发现必须改远端文字的问题，原对象快照保存 | 附件此轮只核元数据，不重下旧包；本任务PR及最终远端记录在集成阶段补齐 |
| E 一致性与隐私 | 所选文档链接/命令、诊断record/export与trusted sender边界 | 对象键已知格式遗漏修复；新回归7/7、相邻集合49/49 | 有限合成输入，不认证未知格式；未读个人日志或profile |
| F 后续安排 | 既有范围和本轮新问题 | [后续范围](NEXT_RELEASE_SCOPE.md)增量记录既有能力维护，已交付功能不重立项 | 系统集成、显示硬件、0.4.0和暂缓项保持原条件 |

## 问题台账

| ID | Observed / Expected | 允许文件与修正 | 验证、状态与回退 |
| --- | --- | --- | --- |
| N-E01 | sanitizer清洗值和标签，但动态对象键保留已知Token/URL/路径格式；相同已知格式应在键和嵌套导出中清洗 | `src/electronapp/enhanced/diagnostics.js`的safeKey复用sanitizeText；新增`tests/diagnostic-object-keys.test.cjs`，普通键/96字符边界/值脱敏保持 | 同test SHA修前1通过/6失败，修后7/7；诊断相邻4文件49/49，fail/cancelled/skipped均0。独立提交`8ace992`，待累计diff/CI；回退`git revert 8ace992` |
| N-C01 | PACKAGING首段无历史标记地突出037当前摘要；应明确当前039并保留旧证据 | `docs/PACKAGING.md`新增039准确source及核验入口，037全文置于历史小标题下 | 原037正文及后续记录完整保留；提交`dbf91ab`，回退`git revert dbf91ab` |
| N-C02 | LICENSING用“当前源码版本”引出030历史风险接受；应明确历史语境 | `docs/LICENSING.md`只改该标题，许可/来源/未决正文不改 | 标题之外正文相同；与N-C01同提交/回退，不改变许可结论 |
| N-A01 | discovery无socket error listener，合成error在listening前逃逸、没有响应/close；应沿既有JSON数组响应完成一次并清本次资源 | `serverdiscovery-native.js`共享终结guard、error入口、所属timer清理与迟到事件检查；新增假socket回归 | 同一正式14项修前3通过/11失败、候选及实际产品均14/14；提交`74855b0`，回退`git revert 74855b0`；真实网络NOT_EXECUTED |
| N-A02 | WOL独立error/send出口在合成交错中回调两次；应共享一次响应终态并保留原参数形状 | `wakeonlan-native.js`共享finish与callback finally的一次安全close，迟到listening不再广播；包/参数/协议保持 | 与N-A01共用14项VM回归及同提交/回退；原合成callback2/closeAttempts2，不声称真实网卡已复现同序 |
| N-A03 | WriterQueue/InputReader在线程成员初始化时启动run，而后声明的状态成员尚未初始化；工作线程应只访问已初始化状态 | 两构造器改在所有成员完成后于函数体创建并move赋线程；字段布局、run/close/dtor及协议不改 | 精确差异经技术审后按SHA应用；同源码合同修前1/3、候选和实际产品3/3，9文件Node/fake合同78/78；不代表真实race/Helper/播放验收，独立提交`e41a050`，回退`git revert e41a050`；新来源生产编译/包体通过 |

网络初轮harness没有准确建模EventEmitter error且未触发一项send callback，原probe/log/RESULT保留并排除权威结论；采用修正模型的v2 trace。过程摘要REPORT曾事后补注，原字节未保存，不称为原件恢复。测试模型与实际生产网络分层，不将fake的close请求计为OS退出。未定义去重、WOL新timeout或包格式的新规格，不据这些线索扩大修正。

网络测试草稿首次把既有包长误设为102，原失败保留；按原字节合同核得138及其MAC重复后，草稿13/13通过。正式测试移除私有目录回退，将正常正对照与迟到事件分开，增加成功后迟到出口用例；对正常已到期timer检查无active timer，不强求冗余clear调用。正式同test SHA为14项，修前3/14、候选14/14、实际应用产品14/14；不把这些合同断言失败数当作生产故障数。

## 验证与恢复

已完成准确HEAD/分支/干净起点核对、限定源码和文档审查、纯假socket/时钟盘点及四项源码修正有效修前/修后回归。项目依赖按原lock本地`npm ci --ignore-scripts --no-audit --no-fund`准备，未升级。应用、产品UDP网络、硬件、系统安装与服务器业务均为NOT_EXECUTED。原039发行和规划门禁不重跑。

## 准确来源候选

最终本地候选源码固定`e41a050bcbe0987cc895e90c43c068203b240821`，独立构建树保持该HEAD。后续报告/状态文档HEAD与候选来源分开，不能重标runtime来源；分支文档提交只同步结果。此前dbf91ab的候选与原始回执保留，不作为本次Native修正的验证。公开v0.3.9仍是06d34a7，本轮不新建二进制Release。

| 项目 | 实际结果 |
| --- | --- |
| 材料门禁 | 新构建树24个固定文件、210/210，实际退出0，fail/cancelled/skipped均0 |
| 标准构建与VerifyOnly | 准确e41a050通过，2159声明payload / 2160完整文件 |
| 独立来源核对 | 109个普通产品源码逐Git blob/运行时SHA，Native CPP另核Git blob；51输入、4notice及固定prepared Electron完整树73文件 |
| Native源码 | blob `9cf5fc1d795cce1ea15fc7b8bf0dfebcb092cae0`；SHA-256 `8b0c79588390cc735639e4ea26beb9f0e10719c3ab52a14520cbb96d25966de3` |
| 生产Helper | version 1.0.0 / protocol 1，testing=false；SHA-256 `baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494` |
| Native验证边界 | Helper由新源码生产编译，默认libmpv身份保持；真实ready、加载映像SHA与播放仍NOT_EXECUTED/UNKNOWN |
| manifest SHA-256 | `1482a3ad64d3d07613a28dc554cb222208558c51bf669466e20896d0e28cabc1` |
| payload set SHA-256 | `b752c7126875950a0c33b1337d153f25912f61fb51918c0fc006c736eb91fed1` |
| 本地ZIP | `ETE-night-e41a050-win-x64.zip`，240470557 bytes |
| ZIP SHA-256 | `e1d524aaa175fc68f58abe82f9bc559b755b7eef6203409c3bf3554a9b94debe` |
| ZIP回读 | 全2160文件逐路径/长度/解压字节SHA与已核runtime一致，未包含私有harness/profile/备份 |

新树固定材料复制和独立重哈希通过。工具链/依赖没有升级，Electron按prepared完整树核对，本轮没有重新下载或回读原Electron ZIP归档；不能据此声称外部归档重取或公开仓库可完整重建。

系统安装、前台、真实Emby播放/远控、CEC/产品UDP设备及硬件仍NOT_EXECUTED/UNKNOWN。WOL同步create/send/setBroadcast异常、全局显示lease/目标映射/完整退出恢复未在本轮扩展修正；许可未决、签名与既有暂缓项保持。

## 集成记录

本地修正按表中独立提交恢复，公共CI、PR累计审核与最终主线回读将在实际完成后记录；GitHub旧Release正文/Tag/附件/标志不变。GitHub文本如需更正，按已保存对象ID/title/body原字段恢复。
