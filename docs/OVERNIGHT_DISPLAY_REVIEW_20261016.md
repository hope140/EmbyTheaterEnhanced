# 显示链局部错误处理审查

## 审查状态

当前为 `PARENT_REVIEW_REQUIRED`，产品未修改。审核源码来自基线 main `45bea67`；合同文档提交 `ada52f6` 未改变相关产品字节。以下复现使用实际函数体、VM、合成 XMLHttpRequest 和 child EventEmitter，没有启动 RefreshRate 工具、窗口、Native Helper 或真实显示操作。

## 已复现问题

| ID | Observed / 代码位置 | Expected / 现有语义依据 | 复现证据 |
| --- | --- | --- | --- |
| B1 | `src/electronapp/main.js` 的 `registerFreshRate` 只监听 stdout/data 与 close，没有 child/error 或同步 spawn 异常收口 | 工具不可用时完成原协议空响应，不让未处理 child error 逃逸；现有非Windows分支与无输出分支已使用空结果 | 合成 child 的 error listener 数为0；emit(error)抛出，callback计数仍为0 |
| B2 | 同一函数对未知 action 仍 spawn 固定 RefreshRate 工具，args为空 | 未识别动作直接完成空响应；仅现有 list_possible/current/change 才调用原固定工具 | unknown action 确实产生一次合成 spawn，参数为空；不据此声称命令注入或真实硬件影响 |
| B3 | `src/electronapp/plugins/libmpv.js` 的 getRefreshRate/setRefreshRate 对非空响应直接访问 `match(...)[1]` | 无可解析数字时按已有空响应分支返回 undefined；保持有效响应的原字符串返回值 | 两函数对无数字响应均在 onload 抛 TypeError，Promise未settle；正常60 Hz响应仍正常返回60 |

私有复现入口 `.work/overnight/B_DISPLAY_REPRO.cjs` 与 JSON 回执保存源码SHA、调用结果和边界。当前源码定位为 main `485—529`、libmpv `2048—2084`；后续修改以函数锚点和实际行号为准。

## P1 建议允许的最小差异

建议仅在父审通过后修改下列文件与相邻定向测试，单独本地提交。

- `src/electronapp/main.js`：在原 registerFreshRate 中增加一次性完成函数；unknown action直接空回调；同步spawn异常和child/error均空回调，后续close不得重复调用。保留固定工具路径、三种既有动作、DISPLAY1参数、正常stdout结果和原协议入口。
- `src/electronapp/plugins/libmpv.js`：只给 getRefreshRate/setRefreshRate 的数字匹配增加null分支，无匹配按原空响应语义resolve(undefined)。保留XHR method/URL、onerror拒绝、合法响应值、设置字段及调用归属。
- 定向回归：三种正常协议参数、unknown不spawn、spawn同步异常、error后close只回调一次、合法/空/无数字响应settle。新增测试以实际函数体或既有完整AMD测试夹具执行，不能用重写算法替代生产逻辑。

P1不改PlaybackManager、Session/媒体身份、播放/暂停顺序、请求代次、全屏/窗口逻辑或Native协议，不增加新的持久配置、显示器映射、重试、超时预算或恢复状态机。

## 尚需单独审定的显示行为

- main list/current/change均硬编码 `\\.\DISPLAY1`。这是已确认静态事实；当前窗口与Win32显示设备如何可靠对应尚未闭合，不能仅用Electron显示列表顺序替代。
- renderer的displaySync与刷新率change没有XHR timeout；主进程工具存活但不close时的有界清理尚未实现。P1只处理已证实异常分支，不把未知长期挂起改写为已修。
- `_onEstimatedVfFpsChanged` 在change后等待再依据当前请求unpause；并发FPS事件、Stop/Next期间已发出的物理change与恢复的顺序需要明确owner/失败case后父审。
- orgRefreshRate的恢复位于destroyInternal且未await；stop(false)沿原Player停止链保留实例。终止播放、替换、退出各自实际销毁路径和恢复时限继续审查，不直接改变原Session或窗口归属。
- 真实多显示器、HDR、Mixed-DPI、刷新率切换/恢复和前台表现均为NOT_VERIFIED；不执行系统显示设置写入。

父审前暂停P1产品实现；菜单、安装与资源等独立工作可继续。
