# v0.3.0 CEC / driver / RefreshRate / 补充字体

2026-10-12，main 基线 `72d4688821822860d20342ae8c784a279b06b4f5`。只读目标为 source `7827425e07024fcca3bf671aa4401bb3020291b0` 的原内部 RC；没有执行任何下载 EXE、修改 vendor 或运行安装测试。

## 新证据

固定官方 [libCEC 3dcc821c source tree](https://github.com/Pulse-Eight/libcec/tree/3dcc821c86576c94ac3b5b73fd764cc16dfe05b1) 的 `support/p8-usbcec-driver-installer.exe` 实际取得，SHA256 `6e4d5a091720cf5ad727896bbf3766e5529468e24849183439506130bde3546a`，619536 bytes，与目标 EXACT。这关闭 driver 二进制的官方获取入口未知，不能将整个 CEC/driver 组标成发行义务已完成。

同源 NSIS `project/p8-usbcec-driver.nsi` 和 INF `driver/p8usb-cec.inf` 已回读；脚本包含 Pulse-Eight 2011-2013 copyright、GPL `COPYING` 页面，并打入 `dpinst-amd64.exe` / `dpinst-x86.exe`、INF/CAT。实际对象的内含组件清单和 Microsoft DPInst 的适用再分发条款没有确认，GPL 页面不自动覆盖它们。官方 libCEC `COPYING` 明确 GPL-2.0-or-later / 商业备选，完整文本和 AUTHORS 已保存并整合到通知入口；没有选择商业路线。GPL 路线仍需要目标库的实际 preferred source、platform submodule 和修改/编译安装脚本。

目标 libCEC/client/driver/RefreshRate 大小和全部 SHA、官方获取路径、参考脚本 SHA 见 [CEC 回执](evidence/v030-cec-unblock.json)。旧参考 archive 的匹配身份保持原证据层，本轮不重复八项历史 readback。

## 排除与替代的实际边界

`src/electronapp/cec/cec.js` 缺 CEC 路径或 spawn 失败时有继续运行路径；enhanced bootstrap 创建 CEC cancel 防止旧提示。这支持 CEC 可选性分析，不能代替去组件包的真实运行验收。driver 可考虑独立 C 排除，但 Host driver 路径还需核验，当前未实施。

RefreshRate 不可直接删：`libmpv.js` 的播放入口无条件 await `displaySync()`，后者等待 list/current；main 的 RefreshRate spawn 没有 error 清理。缺 EXE 可能使正常播放失败/悬挂。官方 Host reference 有对应名称 C# 项目及 GPL 根文本；目标 PE 名为 DisplayChanger，实际 source/patch 关联仍未证明。A 补准确源/grant 优先，B 源构建仅静态建议；本轮没有改播放/显示链或更换 EXE。

## 另外一个实际随包字体

`external/Presets/fonts/Source Han Serif SC-Bold.ttf`（不属于原 23 Web 字体集合），26,821,400 bytes，SHA256 `8cc4d2cfccf84293ba0317bf77752dd453da79dc9ec5823d0792d8058bc1be0c`。只读 name table 显示 Adobe 2017-2022、Reserved Font Name `Source`、内嵌 SIL OFL 1.1；英文 family 为 `Source Han Serif SC X120% Y120%`，版本带 FontCreator 2023。这提供具体修改版迹象，不能仅凭附上 OFL 全文而忽略 RFN。

已取得 [官方固定 OFL 文本](https://raw.githubusercontent.com/adobe-fonts/source-han-serif/2.001R/LICENSE.txt)。OFL condition 3 对修改版的主要用户可见名字限制 RFN，允许权利人另行书面许可；[官方说明](https://openfontlicense.org/how-to-modify-ofl-fonts/)同时说明 OFL 不强制提供所有修改源。故剩余为 RFN 权限或合规命名修复，不是“字体无法重建”的泛化阻断。完整 metadata 与全文 SHA 见 [字体回执](evidence/v030-source-han-font-unblock.json)。

可独立的后续修复候选是保持 glyph/metrics/原文件引用、调整内部主名并保留版权/OFL，核对字体选择和预设后验证；也可由提供者给有效 RFN 书面依据。没有改字体或制作替代物。本轮补件进入根通知的准备身份，旧 RC 未重包。
