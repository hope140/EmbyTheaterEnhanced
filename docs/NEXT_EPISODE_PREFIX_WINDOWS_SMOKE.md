# 下一集真实自动链短验准备

`tools/playback-prefix-windows-auto.cjs` 是显式派生runtime实验，不是普通应用或安装验收。当前仅Node准备/结构回归通过，**未运行Windows/native**。磁盘选项实验优先使用[独立探针](MPV_DISK_CACHE_PROBE.md)，不依赖此自动链。

## 身份与派生

输入仍是不可变原162候选ZIP及其原始runtime，由独立 `c9cd9bacf81445c9c10befd121951b1c63c86faa` checkout执行完整原包门禁。输出在输入repo/runtime之外的全新私有目录：完整复制原runtime，保留所有原清单，再只应用精确来源提交的六份维护JS和同包锁定loader新增。不是改写原包或将派生目录冒充原候选。

允许的JS为 `enhanced/playback-prefix-store.js`、`playback-range-store.js`、`playback-range-cache.js`、`playback-range-session.js`、`playback-range-renderer.js` 和 `native-helper/service.js`。每项记录来源Git blob、替换前hash、替换后hash、长度；driver自身也须与该来源提交一致。loader来源为原 `x64/electron/vulkan-1.dll`，目标 `electronapp/libmpv/x64/vulkan-1.dll`，939008字节，SHA256 `7611034fc1bc24fa103b4c6bf923974cdec46fa506952d6f82cfef836db99fd1`；保留原Electron许可材料。所有其余文件必须逐字节保持，完整派生集合/摘要在每次启动重验。

原构建的 PlaybackManager/queue/adapter 保持；本轮 adapter仅设置菜单标题变更不纳入这份overlay。因此本实验不证明新设置页、菜单标题、普通main启动或安装效果。固定helper和DLL不改，不编译新内核。

## 准备与显式执行

先取得精确来源提交、干净source checkout、独立c9工具checkout和已校验原候选输入。占位命令如下，由协调者安排，不自动dispatch：

```powershell
node tools/playback-prefix-windows-auto.cjs prepare --tools=C:\owned\c9-tools --source=C:\owned\source --source-commit=<exact-40-hex-commit> --runtime=C:\owned\original-runtime --zip=C:\owned\original.zip --out=C:\owned\fresh-auto
node tools/playback-prefix-windows-auto.cjs entry-smoke --plan=C:\owned\fresh-auto\auto-plan.json --execute-electron-entry
node tools/playback-prefix-windows-auto.cjs run --plan=C:\owned\fresh-auto\auto-plan.json --execute-native
```

prepare不启动进程。entry先证明真实Electron启动、独占profile及完整物理校验，20秒停止请求上限；native仅在entry真实成功后允许，保持120秒停止请求上限。超时或不明退出不得通过。所有profile环境变量隔离，子进程不继承GitHub token/Node或代理注入。基线artifact缺失、过期或校验失败时停止，不替换输入包。

## 必须真实执行的路径

真实Electron renderer中加载已构建的维护PlaybackManager、PlayQueueManager、events、adapter、下一集renderer和native client；main使用真实service/controller/helper。一次调用原 `manager.play({items:[A,B]})` 建立合成队列，此后禁止手工preload、tick、nextTrack、伪造属性或EOF。

实际helper时钟跨过70% → renderer原定时器 → 同源metadata → 预载B → A真实EOF → 原manager stopped/nextTrack → B新generation实际解码。固定320×180/24fps合成AVI约33 MB，小于实验所选100 MB；只能报告 `min(P, file size)`，不能宣称完成300 MB预载。以实际缓存命中观察、来源只有新鲜校验而不重复媒体范围、B真实time-pos和gpu-next输出共同证明命中。

外围替代明确列在plan：匿名loopback ApiClient facade、展示/OSD/CSS/navigation/loading、受控AMD装载和所属文档IPC relay。show/focus请求记录但抑制，窗口始终隐藏，媒体/代次/Range/自然EOF不替代。该显示边界不同于旧hidden harness，不能声称已验证真实可视界面、Emby鉴权/Session或NAS/302。

回执包括完整源/派生证明、阈值/预载/EOF/next/B事件顺序、B前缀实际读取、没有前台累计、总媒体占用≤P、退出清空。每个helper必须自然exit0且stdio关闭，Electron必须exit及close均确认；无法确认则保存PID和UNCERTAIN，不用kill请求冒充退出。
