# v0.3.15 发行核验准备

## 当前身份

播放后退出修复候选基于已发布 0.3.14 产品 source `ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867`，尚未合并 main 或公开 0.3.15。见[发行合同](V0315_RELEASE_CONTRACT.md)。最终 main source、主线/Tag CI、安装器及五附件最终身份须在实际完成后填写。

## 修复对照

- 同一17项回归原发布源码13通过4失败；修复后17通过，失败/跳过/取消0。覆盖销毁getter、监听归属、取消重试、迟到IPC及重复/重入清理。
- 固定 Electron 44.4.2 的隔离 BrowserWindow，原源码 playing-close、paused-close、destroyed-before-dispose 三组抛出 `Object has been destroyed`；before-quit-then-close 通过。playing-close 与用户报告同为 `windows-media-controls.js:74:16` 和 `BrowserWindow.wrapper` / `BrowserWindow.emit` 栈。
- 修复后上述四组均退出0。夹具确认销毁后实际 WebContents getter 仍抛错，同时本模块清理不再访问该getter、自有监听全部退休、重复dispose安全。
- 完整公开离线集合1202/1202、六项材料文件及十九项显式材料自测212/212通过，失败/跳过/取消均0；345 JS、28 PowerShell语法及396文本有限模式检查通过。

以上是单元、材料与真实Electron窗口生命周期证据，播放状态由IPC注入。没有进行真实媒体、服务器、完整Host或系统安装验收。

## 其他门禁

完整公开集合、候选包来源/版本及完整解包门禁按仓库外原始回执据实记录。最终main重测重建、批准合并、annotated Tag、Tag CI、五附件公开与匿名完整回读仍待相应门禁完成。旧发行资产、现用安装及可选FFI打包边界保持。
