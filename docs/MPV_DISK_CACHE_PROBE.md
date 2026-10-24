# 固定 mpv 磁盘选项最小实验

本探针验证现成选项，不修改内核、生产白名单、正式 profile 或候选包。固定输入为 [manifest](../vendor/libmpv-input-manifest.json) 声明的 `v0.41.0-920-gdd5d17d32` / client API 2.5，DLL SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。静态源码说明与实际 Windows 观察分开记录；本次交付没有运行 Windows/native。

## 选项与待观察问题

| 选项 | 固定源码行为 | 探针实际记录 |
| --- | --- | --- |
| `cache=yes` | 启用网络缓存策略 | 实际属性回读，失败为 UNKNOWN |
| `cache-on-disk=yes/no` | 将 packet payload 写文件或留在 RAM；元数据仍在内存 | RAM 对照与磁盘模式的 fw-bytes、时间范围、文件增长 |
| `demuxer-cache-dir=<private directory>` | 指定本次临时 cache 目录 | 只枚举本次独占目录，文件名/长度/SHA |
| `demuxer-cache-unlink-files=immediate` | 默认值；创建后立即尝试 unlink | 是否可列出文件及失败差异，不凭目录为空认定没有磁盘缓存 |
| `...=whendone` | 关闭 cache 时删除 | Stop、helper退出后的目录 |
| `...=no` | 不主动 unlink | Stop后保留文件；同helper和新helper重开同URL时旧文件是否未变、新文件及来源读取 |
| `demuxer-max-bytes` / `demuxer-max-back-bytes` | RAM模式限制 packet 缓冲；disk模式只计元数据 | 统一采用 1 MiB / 512 KiB **实验值**；不改变现有300/600/900/3072 MiB用户选项 |

固定依据：[磁盘选项说明](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/DOCS/man/options.rst#L5513-L5537)、[unlink选项与文件生命周期](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/cache.c#L35-L130)、[前后向上限和淘汰](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c#L2395-L2465)。源码中的临时文件追加/淘汰规则不代替本机文件增长观察。小媒体未必触发元数据淘汰；没有观察到范围收缩时不能宣称已实证淘汰机制。

## 固定输入与执行边界

推荐由独立 GitHub Windows 短入口执行：`Public offline CI`（`public-ci.yml`），选择本分支，`range_smoke=disk-probe`、`release_package=false`。控制源码取本次精确workflow提交；基线工具仍固定c9，源候选仍固定162、artifact `12551020498`、原ZIP/installer哈希不变。下载前重新检查artifact未过期、成功来源run、源SHA及精确字节；缺失/过期/拒绝即停止，不取latest或重打包。

此路线在当前精确且干净的controls checkout下，通过原严格 `derive` 与 `prepare` API创建新的loader派生和source plan；不复用上次runner绝对路径，不更改旧manifest，不需要下面手动兼容流程的未跟踪工具复制。短入口实际app-ready/完整摘要通过后，按 RAM→whendone→no→immediate顺序运行，模式各用全新目录和原120秒停止请求上限。任何失败/不完整/退出不明即停止后续模式；汇总将未执行项明确标记NOT_STARTED。最后再次验证基线和派生完整性。

权限仍为该job的contents/actions只读，token仍仅进入下载步骤；现有并发组、cancel策略、Windows映像及15分钟job上限保持。预计正常3–6分钟，输入下载和hash速度会影响耗时。workflow成功只表示四组规定观察齐全，`restoreAssessment`始终NOT_ASSESSED；下一集自动链不在此范围。

上传仍使用既有一日留存的 `ete-range-smoke-*` artifact。`disk-*-observations.json`、`disk-*-run.json`、模式plan、entry和唯一loader关系等原始语义JSON仅做路径/URL/敏感字段脱敏，collection记录原件及上传件SHA；不截断JSON。媒体、`.dat`、profile、环境和worker原始stderr不上传，helper仅保留安全标签/数值退出诊断。超限/重定向回执拒绝完整采集，不静默当作通过。

手动单模式工具 `playback-buffer-disk-probe.cjs` 也可复用此前已验证的原 `162dc69` 加唯一锁定 Vulkan loader 的**独立派生** plan。原ZIP、manifest和完整原文件集合仍逐项校验，loader来源/哈希/唯一新增关系仍逐项校验。原包不包含该loader，不能省略派生校验直接把原包启动失败23解释为磁盘选项问题。

旧 plan 绑定绝对 driver 路径、工具SHA和 `controlsCommit`。须保留其原兼容 checkout，不将 plan 随意搬到新目录，也不放宽完整性检查。将本次已提交的独立探针文件按精确SHA物化为该 checkout 的新增未跟踪工具（不覆盖任何旧工具），核对文件SHA；原门禁对受跟踪文件和HEAD的要求保持。新增探针的实际文件SHA再绑定到自己的 `probe.json`。旧候选/plan不可用或artifact过期则先报告输入缺口，不能用另一个包假代。

每个模式使用一个全新输出目录。以下路径是占位，不表示已经执行：

```powershell
node C:\owned\controls\tools\playback-buffer-disk-probe.cjs prepare --plan=C:\owned\derived\plan.json --out=C:\owned\probe-ram --mode=ram
node C:\owned\controls\tools\playback-buffer-disk-probe.cjs run --probe=C:\owned\probe-ram\probe.json --execute
```

随后分别用 `--mode=whendone`、`--mode=no` 和各自新目录执行；`immediate`为额外默认行为对照。prepare只验证/准备文件，不启动播放器；run仅接受Windows x64和显式 `--execute`，固定Electron 44.4.2。由协调者串行安排，不自行dispatch或在用户桌面运行。

Electron appData/userData/sessionData及 APPDATA、LOCALAPPDATA、MPV_HOME、TEMP/TMP 全部指向本次目录；子进程不继承GitHub令牌或Node/代理注入。只使用隐藏所属窗口、实际固定 helper、同一 loopback URL和现有确定性AVI（单片约33 MB）。不读NAS、服务器凭据或正式设置，不将 `.dat` 当媒体打开。直接向所属测试 helper 设置和回读这组有限选项，不扩大生产IPC白名单。

## 每次模式的顺序与判定

1. 新helper加载A，记录选项回读、加载后/预读后/seek后缓存状态、文件及来源请求。
2. Stop后记录目录；同helper、同URL再次加载并记录同样数据。
3. 确认第一个helper实际退出且stdio关闭，启动不同PID的helper，再用相同URL/目录加载。
4. 记录第二个helper的实际正常退出、来源关闭和Electron exit/close。100秒内部停止请求、120秒外部停止请求保持有限；无法确认退出时保留PID和UNCERTAIN，不把发出kill当作退出成功。

输出 `observations.json`、`run.json`、`worker.log`。`observed`仅表示规定观察和正常资源收尾齐全；不等于恢复成功。协调器复核worker PID、mode、输入身份、选项回读、两个helper不同PID及正常退出/stdio关闭，不能只看Electron code0。

重点比较 `no` 模式：旧文件是否保留且hash不变；后续load是否新增.dat，是否仍请求已有媒体区间。只有保留文件不证明索引恢复；重新播放成功也不证明使用旧缓存。请求重新出现是本次来源回读证据，不能泛化成所有容器均无其他可能。支持未知、文件采样失败、退出异常或证据不全均为UNKNOWN。新进程指新Native helper，Electron宿主仍是同一个隔离隐藏窗口；本工具不声称已验证整个应用重启。

## 当前验证

已执行Node输入/选项投影、owned-child error/exit/close、helper退出诊断、回执防伪及隔离路径回归。它们不是实际固定Windows/libmpv结果。下一步先由协调者运行RAM、whendone和no三组并读取回执，再决定是否还有低成本复用路径；不因静态资料直接推进内核改造。
