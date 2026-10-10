# SEC-01 外链入口限制

日期：2026-10-10（UTC+8）。独立分支 `codex/sec01-external-links`，基线 `d875ba5b69ef75bcc6ba439182700f3fb865f70c`。本轮仅修复阶段一独立审核 SEC-01。

## 结果与实现

`main.js` 的 window-open、apphost openurl 与固定 shader 帮助链接共同使用 `enhanced/external-url.js`。helper 只向系统 shell 转交有效 HTTP/HTTPS URL，支持协议大小写、普通服务器链接和 GitHub 链接。校验后保留原字符串、query、fragment 与百分号编码；单层 `decodeURI` 仅检查编码有效性和控制字符，不使用其结果改写 URL，不二次解码。

非字符串、空值、无明确 authority 的格式、凭据、原始空白/控制字符、原始或编码后的反斜杠/控制字符及异常百分号编码被拒绝。shell 同步抛错与异步拒绝均收口为 false，不记录 URL 或异常文本。window-open 同步返回 `deny`，apphost 仍完成原协议 callback。

maintenance 保持既有更严格的 GitHub Releases URL 限制；apphost 命令识别和启动 windowstate canonicalization、播放/Session/Resolver、版本、依赖及 vendor 输入保持原 contract。

## RED / GREEN

新测试实际执行 `main.js` 的导入、window-open 注册回调、完整 registerAppHost 函数与 shader showMessage 帮助分支；Electron shell、protocol 和 dialog 使用离线 mock，未调用真实系统 shell。

- 基线 main 的两项协议边界测试均 RED：file/mailto/magnet/custom/javascript/data 原字符串进入 mock shell。`.work/sec01/red.log` 保存首次原始日志，`.work/sec01/red-final-fixture.log` 使用最终同一夹具对固定基线再次验证。
- 当前外链测试 12/12 GREEN。覆盖有效 HTTP/HTTPS（包括 IPv6）、GitHub、query/fragment、大小写、有效编码、单层编码保留、空值/类型/格式/凭据/控制字符/反斜杠/异常编码、shell throw/reject 与 shader 帮助入口。
- 外链、apphost canonicalization、Electron44 兼容、外置播放器残留边界和 maintenance/settings 定向测试共 39/39 PASS，0 fail/cancelled/skipped，原始日志 `.work/sec01/targeted.log`。
- main/helper/new test 语法检查及 `git diff --check` PASS，原始日志 `.work/sec01/static.log`。

基线复算仅替换测试读入的 main 文件，helper 仍由实际 main 导入声明决定是否加载；旧源码没有 helper 导入，测试不得注入一个虚构校验替换旧调用点。

```powershell
$env:ETE_EXTERNAL_URL_MAIN_SOURCE = '.work/sec01/baseline-main.js'
node --test --test-name-pattern='unapproved protocols' tests/external-url.test.cjs
Remove-Item Env:ETE_EXTERNAL_URL_MAIN_SOURCE
node --test tests/external-url.test.cjs tests/apphost-command.test.cjs tests/electron44-compatibility.test.cjs tests/external-player-process-chain.test.cjs tests/settings-visual-system.test.cjs
```

existing external-player 测试需要 ignored prepared preload。允许只读的固定 Carnival preload SHA256 与 `vendor/runtime-manifest.json` 逐项匹配后，由既有 `buildPreparedPreload()` 生成本工作树的 ignored 测试输入；base/prepared SHA256 保存于 `.work/sec01/preload-input.json`。未复制或修改 vendor，也未执行供应方安装/恢复脚本。

## 范围与未验证项

变更限于 main 三处调用及 require、新 helper、新测试、两处原 assertion 适配和本专项文档。主线程负责 PROJECT_STATUS/DEVELOPMENT_LOG 与总审核报告更新。

本轮为源码级离线验证。未构建 runtime、未启动真实客户端/helper/服务、未验证系统浏览器打开和真实远控，也未进行安装、发布、推送、PR 或合并。shell 返回成功仅表示调用已完成，不作为浏览器实际打开验收。

Model Tier: 1 implementation under explicit SEC-01 contract; Model: inherited GPT-6 agent; Reason: parent fixed scope, call sites and acceptance; Escalated: no. 原始 P1 外链发现的风险分析已在阶段一报告保留。
