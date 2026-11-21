# AC-2 补签交互证据（#2238 · 第二次交付）

> 针对验收意见：「还缺一项可以点开看的证据：手动补签成功后，页面本身把『该行已签到』和『顶部已到 +1』同时更新的演示（录屏或同一会话的连续帧）」。
> 本文件记录这段证据怎么来的、看什么、怎么自己复现。

## 一、结论（先看这个）

一次真实鼠标操作、同一次页面加载内完成，三个变化同时出现在一屏：

| 观测点 | 操作前 | 操作后 | 是否同一次页面加载 |
| --- | --- | --- | --- |
| 目标行（顾清和，第 4 行） | 未签到 + 「手动补签」按钮 | 「手动」+「16:41 已签到」，按钮消失 | 是（load ID 不变） |
| 顶部已到 | 25 | 26 | 同上 |
| 顶部未到 / 签到率 | 23 / 52% | 22 / 54% | 同上 |
| `list` 接口调用次数 | 1 | 1（未重新拉整页） | 同上 |
| 整页重载次数 | 0 | 0 | 同上 |

## 二、证据文件

| 文件 | 内容 |
| --- | --- |
| `demo/ac2-manual-checkin.mp4` | 13 秒演示视频，7 个关键时刻带字幕（页面截图与字幕之间画了蓝线，字幕在画面外，不遮挡页面） |
| `demo/ac2-manual-checkin.gif` | 同内容 GIF，便于在 IM / 网页里直接预览 |
| `demo/evidence/ac2/frame-01.png` … `frame-07.png` | 同一次会话连续截取的 7 帧原始图（780×1800，@2x），帧内 load ID 全为同一个值 |
| `demo/evidence/ac2/frames-contact-sheet.png` | 7 帧缩略拼图，一图看完整过程 |
| `demo/evidence/ac2/session-log.json` | 机读日志：`before` / `after` 的业务快照与接口计数（含 `loadId`、`loads`、`list`、`makeup`） |
| `preview/interactive.html` + `preview/demo-app.js` + `preview/demo-bundle.js` | 演示页本身：渲染的是 `miniprogram/logic/*.ts` 的同一份代码（由 `scripts/build-demo.js` 编译，未复制粘贴业务逻辑） |

帧与字幕对照：

| 帧 | 字幕 | 关键可见内容 |
| --- | --- | --- |
| 01 | ① 进入页面：应到 48 · 已到 25 · 未到 23 | 顾清和行仍为「未签到」，右侧有「手动补签」 |
| 02 | ② 光标移到该行「手动补签」按钮 | 同一次加载，未刷新 |
| 03 | ③ 点击后弹出「手动补签」，原因必选 | 弹窗遮罩、单选项、说明输入框 |
| 04 | ④ 选择「未带手机」后确认按钮可用 | 单选项选中态 |
| 05 | ⑤ 点「确认补签」：按钮进入「提交中…」 | makeup 接口已发出 |
| 06 | ⑥ 同一行变「手动 · 已签到」，已到 25→26 | 行状态与顶部计数在同一屏内同时变化 |
| 07 | ⑦ 整页没有刷新：load ID 不变、重载 0 次、list 仍 1 次 | 稳定态复核 |

## 三、怎么自己复现（三条命令，无需微信开发者工具）

```bash
# 1. 生成演示页（把 miniprogram/logic/*.ts 编译进浏览器包）
node scripts/build-demo.js

# 2. 用 headless Chrome + 真实鼠标事件跑一遍补签，产出 7 帧 + session-log.json
node scripts/record-demo.js

# 3. 帧序列 → 带字幕视频 / GIF / 缩略拼图
python3 scripts/compose-ac2-video.py     # 需要 ffmpeg（pip install imageio-ffmpeg 亦可）
```

前置：Node.js ≥ 18、`npm install`、Chrome/Chromium（默认读 `~/.local/chrome-for-testing/chrome-linux64/chrome`，可用 `CHROME_BIN` 覆盖）。
直接用浏览器打开 `preview/interactive.html` 也能手动点一遍——页面顶部深色条就是证据条：`load ID`、`整页重载次数`、`list` / `makeup` 接口调用次数、已运行秒数；手动补签前后 `load ID` 不变、`整页重载` 不增加，即说明「行 + 计数」是页面内局部更新，没有整页刷新。

## 四、为什么是这套做法（环境说明）

- 交付环境（WSL2）没有微信开发者工具，无法在小程序模拟器里录屏；这一点在首次交付时已说明（`docs/ACCEPTANCE.md` 一、验收环境）。
- 因此演示页的做法是：**业务逻辑一行不改**，用 `scripts/build-demo.js` 把 `miniprogram/logic/{controller,checkin,api,debounce,refresh}.ts` 与 `miniprogram/mock/checkin-list.ts` 原样编译成浏览器可执行包（`preview/demo-bundle.js`），再用与 `preview/*.html` 相同的 DOM 结构与 `checkin.css` 渲染；交互事件通过 CDP `Input.dispatchMouseEvent` 真实派发（不是调用内部函数伪造状态）。
- 与 Jest 单测的区别：单测断言的是状态迁移（`tests/controller.test.ts`），这段演示补的正是评审要看的**页面层可见结果**——行与计数在同一屏、同一次加载里一起变。

## 五、与既有测试的对应关系

| 本证据可见的现象 | 对应单测 |
| --- | --- |
| 行变已签到 + 顶部计数 +1 + 不整页刷新 | `tests/controller.test.ts`「手动补签成功：该行状态与顶部计数同时更新，且不整页刷新」 |
| 未选原因不可提交 | `tests/controller.test.ts`「未选补签原因时不能确认」 |
| 选「其他」未填说明不可提交 | `tests/checkin.test.ts` + `tests/api.test.ts`（AC-3） |
| 409 时只刷新该行 | `tests/controller.test.ts`「补签返回 409 时提示已签到并只刷新该行」 |
