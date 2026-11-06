# FN Connect 独立实验接线（目标 0.4.18）

本分支包含默认关闭的 ETE 实验接线，尚未完成 Windows 或真实播放验收。工作分支名保留 `feature/fn-connect-v0417`，目标版本顺延至 0.4.18，不改产品版本或创建发行。原始产品基线为 main `09147a3f0c5b643596f79dc7e9fe9ec37c6fab5e`，现整合 main `ddaa6835dda5ec7fb587620c7448708e1d8dda02`；仅继承其已有 0.4.17 版本元数据，保留 0.4.16 更新、下载及播放修复，不加入预载或播放暂存。

## 来源与认证归属

恢复来源为 `3dbaee062cd9c2245741bd4b8b4452b4ea9e77e5`。导入提交 `9d5d4df2e8f5d368b4051f193bbb29c509c0df92` 保留恢复的 20 个核心文件原字节；来源和历史校验见 [恢复清单](../prototypes/fn-connect/source-recovery.json)。这不是遗失 Git 历史、完整原测试或原文档的恢复。

飞牛认证负责连接访问授权；Emby 账号和媒体权限仍由 Emby 管理。每个服务器／账号使用独立 profile 和 Electron Session，不从系统浏览器复制认证。历史独立原型保留随机 ID、入口集合绑定、持久 profile 互斥锁及“关闭保留／退出并忘记”语义。当前产品实验仅使用新建的隔离试用目录和进程内 FN Session，不读取、迁移或自动复用历史原型或正式客户端的登录态；目录退出后保留，其中原 Emby 流程可能保存 Emby 登录材料。不手工延长 Cookie、不存输入密码，也不承诺网页存储全部加密。

建议首次添加 FN 服务器时在官方页面由用户完成认证，然后走原 Emby 登录。仅明确认证挑战要求重新认证，网络失败与未分类 401／403 不自动当作会话过期。网页入口不是 API 基址：配置使用原 Emby ApiClient 的服务器基址，维持其 `/emby/` API 子路径合同；`.html`／`.htm` 页面路径会被拒绝，不从网页地址自动猜 API mount。公共信息核对服务器 ID，正常登录的服务器／用户／token 元组仍由原 ApiClient 管理；可读 User DTO 的核对不是新的账号映射或独立 token 主体鉴定。

## 媒体接线与边界

```text
原播放身份／生命周期 → 本机能力租约 → 共享 controller
  → 认证 Session → 既有 FN 入口 → 既有代理 → Emby
  → 经逐跳校验的媒体重定向 → 无认证请求器 → 精确批准的媒体 origin
```

现有服务端映射和代理保持原归属。回环桥只监听 `127.0.0.1`，租约绑定 profile 和 generation；取消、失效和关闭撤销相关请求。桥接器不向 Native 播放器发送外部 Location，避免后续跳转脱离门控。

匿名取流默认关闭，产品试用须在添加服务器表单明确配置精确媒体 origin 并选择正文读取；独立原型须明确启用 `--anonymous-media-relay`；合成 fixture 自动启用。它与旧的单次响应头实验互斥，开启取流不沿用旧实验的真实网络授权。

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

## 产品接线与验证范围

- 传输核心移到 `src/electronapp/enhanced/fn-connect/core/`，独立原型引用同一实现。默认启动不启用服务、认证窗口或 FN 表单；普通连接、下载和更新保持原流程。
- 仅经校验的独立打包 runtime 可用 `--fn-connect-experiment` 启动产品试用。启动前核源码／覆盖层／预加载／EXE 身份，新建独立目录并隔离应用和播放器配置；不安装、不复用现用 ETE profile。源代码目录加参数不能冒充已验证产品包。
- 手动添加服务器先开明确允许的官方认证窗口，再走原 ConnectionManager 和 Emby 登录页面。认证窗口禁止导航或取 Emby 子资源，Emby API、图片与 WebSocket 由所属 Session 的回环桥承载。未知认证跳转只显示 origin，须核实后明确配置，不自动信任。
- API 支持有界 1 MiB 写入；写请求不随重定向重放。认证值的各类头／查询载体须与所属账号一致。原 AuthenticateByName 返回的数据经过退休屏障后才交回原客户端；旧账号后台请求不因同地址新增 profile 而切换 Session。
- Native 只在原解析结果最终 source 上取得能力租约。Stop、账号切换、退出、导航、崩溃和迟到回复撤销所属能力；原 Item、MediaSource、PlaybackManager、播放进度、队列与 Session／远控归属不变。

固定 Node.js **24.18.1**，依赖保持锁定：

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/fn-connect-*.test.cjs tests/native-helper-create-owner.test.cjs tests/app-shutdown-drain.test.cjs tests/independent-apiclient-integration.test.cjs
node tools/ci-public-tests.cjs
```

本次测试结果随独立提交在项目状态及开发记录中更新。早期 197／197 只证明恢复原型与匿名媒体合同；后续账号切换、API POST、图片、WebSocket 与生产接线使用新增测试，不能沿用旧数量充当新验收。合成测试不加载真实 Native 解码器或用户服务。

Windows 回环 fixture 使用产品固定 Electron **44.5.0**，核 archive／EXE SHA，保留 sandbox、context isolation、webSecurity。干净准确提交的最小命令见 [原型说明](../prototypes/fn-connect/client/README.md)。它检验真实 Chromium CookieJar、API POST、WebSocket、媒体回环桥、跨源剥离与清理；尚未执行该修订的 Windows 测试，Node IO 替身不代替这层证据。若启动失败，只保存该次固定结果，不重试改变安全环境。

历史 `startup-check.ps1`、`run-startup-isolation.ps1`、`read-runtime-evidence.ps1` 使用 44.4.2，不是当前 runtime 验收入口。历史 `0x80000003` 的根因仍未知；缺少回执不证明入口没执行，不以版本对齐或源码修复宣称启动已恢复。

## 未验证与下一步

当前没有本轮真实 FN、CDN、Native 解码、seek、转码、字幕或远控验收，网页可打开不代表播放通过。历史真实认证和持久登录只是历史证据；旧媒体检查的实际外源请求数不完整，不能写为零。

当前仅接手动服务器及原 Emby AuthenticateByName 登录，未声明覆盖全部 Emby Connect／QuickConnect 路径。来自 JSON 的未经认证链路证明的外部直链、外部 HLS／DASH、外部 If-Range 均不支持。API 桥拒绝媒体路径和媒体响应，不作为任意媒体代理；按响应 MIME 拒绝不等于上游完全没读取正文。

先以干净提交运行无凭据 Windows 回环 fixture，再核隔离产品包启动和交互。真实认证由用户在正规窗口进行，不复制旧 Cookie/token；真实取流前另行确认准确目的地、正文消费、次数／逐跳预算和停止条件。一个播放器请求可含多次重定向，完整播放不具备单 GET 总预算；旧响应头检查批准不能代替完整播放批准。未批准的后续 origin 必须停止，禁止将 FN／Emby 认证转发给第三方。

隔离产品目录的材料、Host 绑定和分层验收顺序见 [产品验证准备](FN_PRODUCT_VALIDATION.md)。
