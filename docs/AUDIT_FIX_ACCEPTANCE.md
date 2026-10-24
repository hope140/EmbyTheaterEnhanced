# 四项审查修复：独立验收清单

本候选从发布基线`88578c91ab19d44eecddcfae096d37dc917ef1f4`上的四项修复保全点`2570c3263bf2dc3fe43168edcf6b64c9f2eacda5`建立。原四提交分别为314e18ed（secrets）、c8eb8b51（helper owner）、ab51e464（有界历史）、2570c326（暂停意图），保持独立。额外构建提交693d5257只移植已复核来源6dc6c270的Framework来源预检、验证器清单及测试，合同见[Framework来源配置](FRAMEWORK_SERVICING_PROFILES.md)；没有Home、图片、播放缓存及其测试开关。

此清单是验收方法及证据边界。具体最终候选SHA、全套计数和Windows包/run结论以该准确来源交接为准。验收尚未完成时保持draft、不合main；不改已发布v0.4.0包或版本。本候选可先于新功能单独验收，无须等待功能分支。

## 原缺陷、最小复现与当前证据

四项均为原审查确认的P2，以下“复现”是执行真实生产JS的受控组件/文件系统测试，不是已经在真实Windows GUI复现。

| 项目 | 原缺陷及影响 | 最小受控复现与断言 | 本轮88578原生产源码上的同一测试文件 |
| --- | --- | --- | --- |
| helper创建/停止/再播放归属 | 首次create尚未完成时Stop并立即Play，新旧请求可能共享或清理错误endpoint；旧destroy还可能撤销替代owner。 | `native-helper-create-owner.test.cjs`的`pending create stop retires only its helper before a new Play`：挂起A的start，Stop后排队B，放行A；A应被退休、B独立load一次且不被旧清理kill。相邻矩阵含destroy、旧kill等待、第二Stop、最新C、Next与退出。真实adapter/Endpoint/service，窗口及helper对象为替身。 | 8项中3通过、5失败；0跳过/取消。 |
| 切率恢复覆盖用户暂停意图 | FPS工作在网络/稳定等待后无条件恢复播放，可能覆盖期间显式pause或native cycle。 | `refresh-rate-fps-work.test.cjs`的`user pause during FPS pending change prevents its automatic resume`：挂起切率回复，显式pause，再放行；不能出现旧任务的pause:false。还覆盖3000ms稳定期、失败、连续toggle、旧同值echo、Stop/Next。真实AMD播放器，时钟/bridge/XHR为替身。 | 30项中13通过、17失败；0跳过/取消。 |
| 空profile独立secrets未恢复 | 尚未保存普通config时单独保存Token，secrets文件已写入；重启因无config跳过恢复，功能表现为未配置。 | `strm-resolver-settings.test.cjs`的`a Token saved independently on a fresh profile survives restart and can be cleared`：新临时root只setToken，不save；确认config不存在，重新createStore后tokenConfigured仍true，clear后再重启false。只用合成值，公开快照不得暴露值。相邻无效文件、legacy与既有config优先级保持。 | 49项中44通过、5失败（含父/子测试）；0跳过/取消。 |
| controller诊断历史无界 | 每个有效time-pos和请求结算都长期保留，内存随播放/操作数增长。 | `native-helper-history.test.cjs`经真实dispatcher发送200000事件和20000请求；timeline只保留4096、requestHistory只保留1024，丢弃计数准确，事件仍全部交付且结算一次。ready和已注册sticky等待不依赖已淘汰历史。 | 6项中2通过、4失败；0跳过/取消。 |

基线复现方式：在88578的临时工作树中仅复制候选上述四个测试文件，生产src/native保持基线字节；使用同一锁定依赖运行。候选再运行同一文件，不能只改测试期望。最小筛选示例：

```sh
node --test --test-name-pattern='pending create stop retires only its helper before a new Play' tests/native-helper-create-owner.test.cjs
node --test --test-name-pattern='user pause during FPS pending change prevents its automatic resume' tests/refresh-rate-fps-work.test.cjs
node --test --test-name-pattern='a Token saved independently on a fresh profile survives restart and can be cleared' tests/strm-resolver-settings.test.cjs
node --test --test-name-pattern='200000 valid time-pos events retain only the latest bounded chronological timeline' tests/native-helper-history.test.cjs
```

完整四文件矩阵共93项；正式验收仍运行完整相关文件和默认发现集合，不把筛选造成的skip当作通过。旧阶段RED/GREEN与独立迟到echo复核保留，新结果按候选准确提交另记。修复的最小合同为：所属create/destroy屏障并复核新请求；FPS只恢复自己仍拥有的临时pause；无config且无legacy时独立读secrets；固定容量环并保留ready/等待语义。没有改原认证保存策略或疑似generation范围。

## 云端可完成的验证

1. 四文件93项及全部`tests/*.test.cjs`，覆盖Stop/Next/退出、错误、取消、clear/legacy、重复结算/历史淘汰。Windows专属skip如实列出。
2. 同一生产dispatcher的0/10万/20万事件保留数及GC后heap观测。要求旧版保留20万、新版4096、丢弃195904；heap数受进程与GC影响，只作趋势证据，不承诺固定节省字节。
3. 实际Node helper子进程的启动、延迟退出、terminal join/cleanup回归；它验证真实进程等待而非Windows HWND、libmpv或画面。
4. 来源范围：全部src/native与2570逐字相同；基线以上只有四项原修复、独立构建移植与本验收说明。版本/依赖/installer/CI工作流保持基线，无缓存生产文件、缓存fixture或试验参数。
5. HEAD构建输入与33份验证器清单，JS/PS语法、有限凭据模式、文档链接及空白检查。Framework候选真实微软签名/系统GAC/Host验证仍须新Windowsrun，合成分类器不能代替。

## 仍须Windows运行及哪些需要GUI

| 项目 | 剩余验证 | 是否需要用户前台/GUI |
| --- | --- | --- |
| 包与构建身份 | 父协调一次准确候选的独立Windows测试包，release_package=false；来源预检、真实Host完整验证、build/VerifyOnly/解包逐文件对照与来源回读。失败保留，不绕过门禁。 | 可云端自动完成，不需占用用户桌面。 |
| helper归属R1 | 在隔离Windows实际Electron/helper下播放合成本地媒体，快速Play→Stop→Play、连续Next、Stop后退出；新播放不被旧kill、退出无残留helper、无挂起。受控pending handshake时点仍以组件矩阵覆盖。 | 需要实际Windows进程；可先自动操作，若要确认可见画面/无闪断则安排短GUI检查。Linux Node结果不能冒充该层。 |
| 暂停意图R2 | 实际播放器启用既有自动切率，在切率及稳定等待中pause、toggle、显式resume，确认UI/实际暂停状态一致，等候后不误恢复。记录真实工具是否支持目标模式；没有实际变更就不能写成硬件切率已通过。 | 需要有显示能力的Windows GUI/显示设备验证，父安排实机时间，本任务不占当前前台。 |
| secrets恢复R3 | 使用全新临时config root和合成值验证保存/重启/clear/文件字节与路径；不调用真实CD2、NAS或账户。 | 无必需人工GUI；文件系统/IPC自动验证足够覆盖原缺陷。 |
| 有界历史R4 | 固定容量、丢弃数、事件交付/结算以及ready/sticky兼容已可云端自动验证；新Windows包可自动采样作相邻检查。 | 无必需人工GUI或长时间手动播放；不把数十万合成事件外推为完整长时实播。 |

最短人工清单只聚焦实际helper正常重播/退出，以及切率等待期间暂停不会被自动恢复。没有要求用户提供真实账号或配置；真实服务、安装升级、硬件收益及所有新功能均不在本候选已验范围。

## 独立验收隔离及合并条件

不借用页面缓存试验CLI。使用全新Windows VM/独立OS用户及新解包目录，不运行普通安装器、不覆盖正式安装。由测试启动器仅为该子进程设置新APPDATA、LOCALAPPDATA、MPV_HOME、TMP、TEMP，MPV_HOME为空或仅有合成配置；Electron harness在产品bootstrap前设置appData及userData/session路径。仅改userData不足以隔离preload或mpv；不复制已登录profile或个人mpv配置，不写系统环境。已有harness使用前必须核对实际路径与正式配置sentinel未变。

包、实际进程与R2 GUI结果按准确source/artifact/run分别记录；未执行项标NOT EXECUTED，不由单元测试或PREPARED/来源预检回执推断。保持draft直到父协调检查所有约定验收结果并确认可合；本任务不开自动合并、不修改main或发布包。
