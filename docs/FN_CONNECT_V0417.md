# FN Connect 独立传输原型

此原型为后续版本准备，未接入正式客户端或安装器。产品基线为 main `09147a3f0c5b643596f79dc7e9fe9ec37c6fab5e`；保留 0.4.16 更新、下载及播放修复，不加入预载或播放暂存。

## 来源与认证归属

恢复来源为 `3dbaee062cd9c2245741bd4b8b4452b4ea9e77e5`。导入提交 `9d5d4df2e8f5d368b4051f193bbb29c509c0df92` 保留恢复的 20 个核心文件原字节；来源和历史校验见 [恢复清单](../prototypes/fn-connect/source-recovery.json)。这不是遗失 Git 历史、完整原测试或原文档的恢复。

飞牛认证负责连接访问授权；Emby 账号和媒体权限仍由 Emby 管理。每个服务器／账号使用独立 profile 和 Electron Session，不从系统浏览器复制认证。持久 profile 保留现有随机 ID、入口集合绑定、互斥锁及“关闭保留／退出并忘记”语义；不手工延长 Cookie、不存输入密码，也不承诺网页存储全部加密。

建议首次添加 FN 服务器时在官方页面由用户完成认证，然后走原 Emby 登录。仅明确认证挑战要求重新认证，网络失败与未分类 401／403 不自动当作会话过期。网页入口不是 API 基址：配置必须明确已核实的 Emby API mount，`.html`／`.htm` 页面路径会被拒绝，不自动猜根路径。

## 媒体接线与边界

```text
原播放身份／生命周期 → 本机能力租约 → 原型 controller
  → 认证 Session → 既有 FN 入口 → 既有代理 → Emby
  → 经逐跳校验的媒体重定向 → 无认证请求器 → 精确批准的媒体 origin
```

现有服务端映射和代理保持原归属。回环桥只监听 `127.0.0.1`，租约绑定 profile 和 generation；取消、失效和关闭撤销相关请求。桥接器不向 Native 播放器发送外部 Location，避免后续跳转脱离门控。

匿名取流默认关闭，独立原型须明确启用 `--anonymous-media-relay`；合成 fixture 自动启用。它与旧的单次响应头实验互斥，开启取流不沿用旧实验的真实网络授权。

| 行为 | 当前合同 |
| --- | --- |
| 目的地 | HTTPS、逐跳精确 origin 白名单，不能与任何认证 origin 重叠；仅回环 fixture 可用 HTTP。 |
| 请求材料 | 仅经校验的实际 User-Agent、单段 byte Range 和 `Accept-Encoding: identity`；不猜或伪造 UA。 |
| 会话隔离 | 无 Cookie jar、Authorization、Emby 认证头、Referer、Origin；不保存或复用 CDN Set-Cookie。 |
| 重定向 | 仅 301／302／303／307／308，最多三跳；每跳检查已知秘密和禁止的认证参数，未知 origin 停止。 |
| 方法／次数 | GET／HEAD，HEAD 不转 GET；无自动重试、刷新签名、额外探测或缓存策略。一个播放器请求仍可能产生多跳 HTTP；没有全播放请求次数上限。 |
| 时限 | 所有请求头及代理解析共用十秒预算；正文流不受此请求头时限替代。 |
| 代理 | 仅明确 DIRECT；系统或环境代理未适配时拒绝，不另走直连。 |
| 清理 | 重定向、失败和正文结束等待有界请求 close；无法确认时保留 profile／锁，拒绝经过 ready 检查的新媒体操作和凭据清理。 |

临时媒体链接仅在内存传递。不会向第三方发送 FN／Emby Cookie 或认证头；也不会把含已知会话秘密的重定向视为普通签名链接。完整流式请求可能消费正文，因此与“单 GET、只看响应头”的旧实验范围不同。

## 可复现验证

固定 Node.js 24.18.1，无新增 npm 依赖：

```sh
node --test tests/fn-connect-*.test.cjs
```

本轮 197／197 通过，包括新增 18 项匿名媒体／清理回归和两项当前输入合同。用例覆盖：多跳凭据剥离、未知后续 origin 零请求、HEAD、206／416、取消、提前断流、延迟 close、失败 drain 不清 profile、不同 profile 能力互相隔离。归档首轮缺失 SPA 辅助模块；本轮按恢复测试合同重新实现两个只读脱敏 helper，未宣称恢复其原字节。合成服务最初不支持 Range，首次新集成断言得到 200；修正合成服务后得到预期 206，未降低产品守卫。

当前 Windows fixture 与产品固定 Electron **44.5.0** 输入一致，验证归档与 EXE SHA，保留 sandbox、context isolation、webSecurity。正常执行入口见 [原型说明](../prototypes/fn-connect/client/README.md)。本轮尚未运行 Windows／真实 Electron，Node IO 替身通过不能代替 Chromium Session 验收。

`startup-check.ps1`、`run-startup-isolation.ps1`、`read-runtime-evidence.ps1` 保留历史 44.4.2 诊断身份，不是当前 runtime 验收入口。历史 `0x80000003` 退出的根因仍未知；缺少入口回执不证明入口未执行，不以版本对齐宣称修好启动问题。

## 尚未接入与真实验收

- 正式 ETE 添加服务器、API 登录、Native 最终 source 替换尚未接入；不得作为完整功能打包验收。后续仅替换最终 source，PlaybackManager、Item／MediaSource、播放进度、队列和 Session／远控生命周期维持原归属。
- 两个 profile 隔离已有合成证据；同一网页登录退出／切换 Emby 账号与播放租约撤销尚未接线，不能声称全部账号切换已隔离。
- 外部 HLS／DASH 清单、If-Range 条件请求不支持；字幕、转码及 WebSocket 仅有既有合成合同，未通过真实 FN／代理链。
- 当前没有真实 FN、CDN、Native 解码或 seek 验收。旧真实认证、持久登录回执只保留历史证据；历史媒体检查的实际外源请求数不完整，不能写为零。

下一步先在允许的 Windows 执行入口，以干净准确提交运行回环 Electron fixture；失败即保留固定结果，不反复完整启动，不更改 sandbox／安全环境。通过后才接产品的最终 source 与账号退休入口。真实验证由使用者在正规窗口完成必要登录；不提取旧 profile 凭据。真实取流前须明确目标 origin、正文消费、请求／重定向预算和停止条件；未批准 origin 不跟随，不用旧响应头检查批准代替完整播放批准。
