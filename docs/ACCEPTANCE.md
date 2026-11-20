# 验收记录（#2238 / S3-MINI-062）

验收对象：员工签到名单页 `pages/staff/checkin-list?event_id=`
验收时间：2026-11-21
验收方式：单元测试（Jest + 假定时器）+ TypeScript 类型检查 + 静态预览截图目视检查

## 一、验收环境

| 项目 | 说明 |
| --- | --- |
| 运行环境 | WSL2 / Node.js，无微信开发者工具 |
| 测试框架 | Jest 29 + ts-jest |
| 截图工具 | headless Chrome（`scripts/shoot.sh`，DPR 2） |
| 视觉核验 | 逐张 `vision_analyze` |
| 数据 | `miniprogram/mock/checkin-list.ts`，48 条虚构记录 |

## 二、验收项与证据

### AC-1 搜索防抖 300ms：连续输入只发一次请求

- 代码：`logic/debounce.ts`（`Debouncer`）、`logic/controller.ts#onKeywordInput / applySearch`
- 测试：`tests/controller.test.ts`「连续输入只触发一次请求（300ms 防抖）」；`tests/debounce.test.ts`「连续输入 5 次只触发 1 次调用，且使用最后一次的入参」
- 断言要点：
  - 输入 `云 / 云启 / 云启科 / 云启科技`，推进 299ms，`api.list` 调用次数仍为 1；
  - 再推进 2ms，调用次数为 2（相对进入页面只新增 1 次）；
  - 最后一次请求参数 `keyword='云启科技'`、`page=1`、`tab='all'`；
  - 结果只包含 3 位「云启科技」员工。
- 状态：**通过**

### AC-2 补签成功：行状态 + 顶部计数同时更新，不整页刷新

- 代码：`logic/controller.ts#submitMakeup / applyLocalCheckin`、`logic/checkin.ts#replaceRecord / statsAfterCheckin`
- 测试：`tests/controller.test.ts`「手动补签成功：该行状态与顶部计数同时更新，且不整页刷新」
- 断言要点（完整状态迁移）：
  1. 初始：`arrived=25`，目标行 `r004` 未签到，`list` 调用 1 次；
  2. `openMakeup('r004')` → `dialogVisible=true`，`dialogTarget.name='顾清和'`；
  3. `submitMakeup({reason:'no-phone'})` → `ok=true`，`makeup` 调用 1 次；
  4. `list` 调用次数仍为 1（证明未整页刷新）；
  5. 目标行 `checkedIn=true`、`methodText='手动'`、`checkinAt` 匹配 `HH:mm`；
  6. `stats.arrived = 26`、`rate` 上升；
  7. 弹窗关闭、`toast='补签成功'`。
- 补充：`tests/controller.test.ts`「补签后停留在「未签到」筛选时该行立即移出列表，计数仍同步」验证筛选态下的行为。
- 状态：**通过**（无录屏工具，用单测覆盖完整状态迁移）

### AC-3 选「其他」未填说明不能确认

- 代码：`logic/checkin.ts#validateMakeupDraft`（弹窗与 controller 共用）、`components/makeup-dialog/index.ts#onConfirm`
- 测试：
  - `tests/controller.test.ts`「选「其他」原因但未填说明时不能确认，也不会调用补签接口」
  - `tests/checkin.test.ts`「选「其他」原因未填写说明时校验不通过」
  - `tests/api.test.ts`「「其他」原因缺少说明时接口层同样拒绝（400）」
- 断言要点：`note='   '` 时 `ok=false`、`makeup` 未调用、弹窗保持打开、`dialogError='选择「其他」时请填写补签说明'`、该行仍为未签到；补填说明后提交成功。
- 状态：**通过**

### AC-4 页面隐藏时 30 秒自动刷新停止

- 代码：`logic/refresh.ts#pause / resume`、`logic/controller.ts#onHide / onShow / destroy`
- 测试：
  - `tests/controller.test.ts`「每 30 秒自动刷新一次，页面隐藏后停止，重新显示后恢复」（`jest.useFakeTimers()`）
  - `tests/refresh.test.ts`「页面隐藏 pause 后不再触发，resume 后恢复」「默认间隔为 30 秒，每 30 秒触发一次」「未 start 时 pause 不会启动计时；stop 后彻底停止」
- 断言要点：30s 时 `list` 由 1 → 2；`onHide()` 后推进 90s 仍为 2；`onShow()` 后再推进 30s → 3；`isAutoRefreshing` 随隐藏/显示为 `false/true`。
- 状态：**通过**

### AC-5 三个筛选各一张截图

| 文件 | 尺寸 | 核验内容 | 状态 |
| --- | --- | --- | --- |
| `screenshots/all.png` | 780×3160 | 「全部」高亮；进度卡 48/25/23、52%；12 行混合；未签到行有「手动补签」；footer「共 48 人 · 上滑加载更多」 | 通过 |
| `screenshots/checked.png` | 780×3160 | 「已签到」高亮；12 行均显示时间 + 扫码/手动；无补签按钮；footer「已签到 25 人 · 上滑加载更多」 | 通过 |
| `screenshots/unchecked.png` | 780×3160 | 「未签到」高亮；12 行均无签到时间、仅票号后 4 位；每行有「手动补签」；footer「未签到 23 人 · 上滑加载更多」 | 通过 |

目视检查项：中文渲染正常（非方块/乱码）、无元素重叠、无 `undefined` / 报错 / 意外占位符、底部无裁切。

## 三、其他需求核对

| 编号 | 需求 | 实现位置 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| R-01 | 页面路径与 `event_id` 入参 | `app.json`、`index.ts#onLoad` | `project.config.json` 编译模式 | 通过 |
| R-02 | 顶部应到 / 已到 / 签到率环形 | `index.wxml` `hero`、`t-progress` | 三张截图 | 通过 |
| R-03 | 30 秒自动刷新 | `refresh.ts` | AC-4 | 通过 |
| R-04 | 全部 / 已签到 / 未签到 | `checkin.ts#matchTab`、`controller#setTab` | AC-5、`checkin.test.ts`「三段筛选：全部 / 已签到 / 未签到 数量互补」 | 通过 |
| R-05 | 搜索姓名 / 企业 / 票号后 4 位 | `checkin.ts#matchKeyword / ticketTail` | `checkin.test.ts` 搜索与票号用例 | 通过 |
| R-06 | 每页 30 条、触底加载 | `PAGE_SIZE`、`loadMore` | `controller.test.ts`「触底加载第二页并去重合并」 | 通过 |
| R-07 | 行内姓名 / 企业 / 票号后 4 位 / 时间 / 方式 | `toRow` | 截图 | 通过 |
| R-08 | 手动补签弹窗与原因 | `makeup-dialog` | 截图、AC-2/AC-3 | 通过 |
| R-09 | 409 提示并刷新该行 | `submitMakeup`、`refreshRow` | `controller.test.ts` 409 用例 | 通过 |
| R-10 | 非员工无权限 | `controller#mount`、`load` 403 分支、`index.wxml` `forbidden` | `controller.test.ts` 无权限与 403 用例 | 通过 |
| R-11 | 不展示联系方式 | `CheckinRecord` 模型 | `checkin.test.ts` 脱敏用例 | 通过 |
| R-12 | 全中文文案 | 页面 / 组件 / 错误提示 | 代码与截图 | 通过 |
| R-13 | 无境外数据 SDK | 依赖仅 TDesign UI | `package.json` | 通过 |
| R-14 | 虚构数据 | `mock/checkin-list.ts` | 文件头声明 | 通过 |

## 四、复现步骤（开发者工具）

1. 导入 `miniprogram/`，安装并构建 `tdesign-miniprogram`；
2. 选择编译模式「员工签到名单（全部）」，进入页面；
3. 顶部应显示 48 应到 / 25 已到 / 52%，等待 30 秒可见「刷新中」并更新「最近更新」；
4. 输入「云启」观察 300ms 后只请求一次，列表剩 3 人；
5. 切到「未签到」，点任意行「手动补签」：
   - 选「其他」不填说明 → 确认被拦截；
   - 选「未带手机」确认 → 该行变已签到、顶部已到 +1，列表不闪烁重载；
6. 返回上一页或切后台，观察网络面板：30 秒内无新的 `list` 请求；
7. 控制台设置 `wx.setStorageSync('demoUserRole','member')` 后重进页面 → 显示「暂无访问权限」。

## 五、结论

5 条验收标准全部通过；36 个单元测试全部通过；TypeScript 类型检查通过；三张截图经目视核验合格。无阻塞问题。
