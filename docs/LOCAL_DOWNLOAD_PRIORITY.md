# 完整下载本地优先

本修复包保留提前下载，在有效当前登录上下文中优先使用已完成的本地副本。记录必须严格匹配 server、account、server address、item 和所选 MediaSource；未选定版本、其他账号／服务器／版本、未完成记录均不命中。renderer 在请求前及返回后检查当前账号和凭据，main 保留取消、导航、关闭及账号切换保护。

完成记录必须包含原下载生成的文件与目录身份、长度、修改时间和 SHA-256。本地 lookup 检查物理目录及文件身份，使用只读句柄逐段校验完整 SHA-256，再次检查身份及时间；每个新进程首次使用需要读完整文件，较大文件会有校验等待。内存使用 1 MiB 读取缓冲及最多 64 条验证记录；同进程后续读取仍检查文件身份、长度、mtime 和 ctime，变化后不沿用校验。移除旧的五秒网络检查预算，校验异步执行；取消／账号变化／关闭会丢弃结果并关闭句柄。

完整本地播放不会创建 source session，不重新读取在线权限、获取直链、解析 CD2 或探测远端资源。新下载、未完成下载的恢复及明确重新下载仍走原在线权限／来源／完整性校验。多份匹配记录按最近完成顺序逐个验证，跳过失效副本后可以使用另一份有效完整副本，严格归属及选中版本不变。

本地文件缺失、替换、修改、哈希不符或目录变化时，保留文件和记录。若存在另一份有效本地副本，提示后使用该副本；全部不可用时显示固定提示，随后沿原在线播放路径尝试来源。不会自动删除、重下或增加直链重试。原下载管理的显式删除确认、身份保护和默认保留文件不变。本功能不新增服务器离线时进入下载列表的入口，也不改变服务器会话／播放记录同步。

`playback/download-lookup` 新增枚举 `reason`、`stage` 和布尔值 `changedCopySkipped`。原因包括 `context-unavailable`、`context-changed`、`no-record`、`version-mismatch`、`not-complete`、`directory-changed`、`file-missing`、`file-unavailable`、`file-changed`、`record-changed`、`integrity-mismatch`、`cancelled` 和 `local-verified`；阶段为 `context`、`record`、`file-identity`、`file-hash`、`verified`，拿不到则 `unavailable`。不把路径、系统错误、凭据或来源 URL 加入诊断。

合成回归覆盖持久完成记录在远端失败时仍本地命中且零远端调用、错账号／服务器／媒体版本、缺失／非 complete、文件替换和同长度篡改、多份副本、校验缓存失效、超过五秒的异步校验、读取与关闭期间取消／换账号／退出、提示归属及 IPC 字段限制。原下载、恢复、普通网络播放和手动删除保护回归保留。真实用户下载及真实服务器未用于验收。
