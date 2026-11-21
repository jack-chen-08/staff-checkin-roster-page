# 交付说明（#2238 / S3-MINI-062 员工签到名单页）

## 一、交付物清单

| 类别 | 文件 |
| --- | --- |
| 页面 | `miniprogram/pages/staff/checkin-list/index.{wxml,wxss,ts,json}` |
| 补签弹窗组件 | `miniprogram/components/makeup-dialog/index.{wxml,wxss,ts,json}` |
| 核心逻辑 | `miniprogram/logic/checkin.ts`、`controller.ts`、`debounce.ts`、`refresh.ts`、`api.ts` |
| mock 数据 | `miniprogram/mock/checkin-list.ts`（48 条，2 页） |
| 单元测试 | `tests/{debounce,refresh,checkin,api,controller}.test.ts`（36 个用例） |
| 截图 | `screenshots/all.png`、`screenshots/checked.png`、`screenshots/unchecked.png` |
| 截图 harness | `preview/*.html`、`preview/*.css`、`scripts/gen-preview.js`、`scripts/shoot.sh` |
| 交互演示（AC-2 证据） | `preview/interactive.html`、`preview/demo-app.js`、`preview/demo-bundle.js`、`scripts/build-demo.js`、`scripts/record-demo.js` |
| 演示视频 / 连续帧 | `demo/ac2-manual-checkin.mp4`、`demo/ac2-manual-checkin.gif`、`demo/evidence/ac2/`（7 帧 + `session-log.json` + 拼图） |
| 测试报告 | `reports/jest.txt` |
| 文档 | `README.md`、`DELIVERY.md`、`docs/ACCEPTANCE.md` |

## 二、验收标准逐条对照

### 1. 连续输入只触发一次请求（300ms 防抖）

- **实现**：`logic/debounce.ts` 的 `Debouncer`（默认 300ms，定时器可注入）；`logic/controller.ts` 的 `onKeywordInput()` 只 `schedule()`，防抖到期后执行一次 `applySearch()` → `list()`。
- **证据（测试）**：
  - `tests/controller.test.ts` →「连续输入只触发一次请求（300ms 防抖）」：连续输入 4 次，299ms 时 `list` 仍为 1 次，301ms 后为 2 次（仅新增 1 次），且最后一次参数为 `keyword: '云启科技', page: 1`。
  - `tests/debounce.test.ts` →「连续输入 5 次只触发 1 次调用，且使用最后一次的入参」。
- **结论**：通过。

### 2. 手动补签成功后行状态与顶部计数同时更新（不整页刷新）

- **实现**：`controller.submitMakeup()` → `applyLocalCheckin()`：用 `replaceRecord()` 不可变替换该行，`statsAfterCheckin()`（或接口返回 `stats`）同步顶部；全程不调用 `list()`。未签到筛选下该行会立即移出列表，但计数仍 +1。
- **证据（测试）**：
  - `tests/controller.test.ts` →「手动补签成功：该行状态与顶部计数同时更新，且不整页刷新」：断言 `list` 调用次数补签前后均为 1；该行 `checkedIn=true`、`methodText='手动'`、`checkinAt` 为 `HH:mm`；`stats.arrived = before + 1`；弹窗关闭且 `toast='补签成功'`。
  - `tests/controller.test.ts` →「补签后停留在「未签到」筛选时该行立即移出列表，计数仍同步」。
  - `tests/checkin.test.ts` →「行状态迁移：未签到 -> 已签到，重复迁移不再记变更」。
- **证据（页面级，返工补充）**：录屏 `demo/ac2-manual-checkin.mp4`（13 秒，7 个关键时刻带字幕）；同一次会话连续帧 `demo/evidence/ac2/frame-01..07.png`；机读日志 `demo/evidence/ac2/session-log.json`（`before.stats.arrived=25` → `after.stats.arrived=26`、`list=1`、`makeup=1`、`loads=1`、`loadId` 前后一致）。一次真实鼠标操作内，该行变「手动 · 已签到」与顶部已到 25→26 同屏出现，`load ID` 不变、整页重载 0 次。复现：`node scripts/build-demo.js && node scripts/record-demo.js && python3 scripts/compose-ac2-video.py`。说明见 `docs/AC-2_EVIDENCE.md`。
- **结论**：通过。

### 3. 选「其他」原因但未填说明时不能确认

- **实现**：`checkin.validateMakeupDraft()` 统一校验；弹窗 `makeup-dialog` 与页面 controller 共用该函数。选 `other` 且说明去空格后为空 → 返回「选择「其他」时请填写补签说明」，弹窗保持打开并展示错误，不触发 `confirm`；接口层同样以 400 拒绝。
- **证据（测试）**：
  - `tests/controller.test.ts` →「选「其他」原因但未填说明时不能确认，也不会调用补签接口」：`res.ok=false`、`makeup` 未被调用、`dialogVisible=true`、`dialogError` 正确；补充说明后提交成功。
  - `tests/checkin.test.ts` →「选「其他」原因未填写说明时校验不通过」。
  - `tests/api.test.ts` →「「其他」原因缺少说明时接口层同样拒绝（400）」。
- **结论**：通过。

### 4. 页面隐藏时 30 秒自动刷新停止

- **实现**：`logic/refresh.ts` 的 `AutoRefresh.pause()` 执行 `clearInterval`；`controller.onHide()` 取消防抖并 `pause()`，`onShow()` `resume()` 重新计时；无权限时 `stop()`。
- **证据（测试）**：
  - `tests/controller.test.ts` →「每 30 秒自动刷新一次，页面隐藏后停止，重新显示后恢复」：用 `jest.useFakeTimers()`，推进 30s 触发第 2 次 `list`；`onHide()` 后推进 90s 仍为 2 次；`onShow()` 后再推进 30s 变为 3 次。
  - `tests/refresh.test.ts` →「页面隐藏 pause 后不再触发，resume 后恢复」「默认间隔为 30 秒，每 30 秒触发一次」。
- **结论**：通过。

### 5. 全部 / 已签到 / 未签到 三个筛选各一张截图

| 筛选 | 文件 | 内容 |
| --- | --- | --- |
| 全部 | `screenshots/all.png` | 「全部」高亮；进度 48 应到 / 25 已到 / 23 未到 / 52%；12 行混合状态；未签到行带「手动补签」；底部「共 48 人 · 上滑加载更多」 |
| 已签到 | `screenshots/checked.png` | 「已签到」高亮；12 行全部为已签到，均显示签到时间与方式（扫码 / 手动），无「手动补签」按钮；底部「已签到 25 人 · 上滑加载更多」 |
| 未签到 | `screenshots/unchecked.png` | 「未签到」高亮；12 行均无签到时间，只显示票号后 4 位，每行均有「手动补签」；底部「未签到 23 人 · 上滑加载更多」 |

- 三张均为 780×3160（390×1580 CSS px，DPR 2），已用 `vision_analyze` 逐张检查：中文正常无方块/乱码、无元素重叠、无 `undefined`/报错/占位符、列表底部与 footer 完整、进度卡 / tabs / 搜索框 / 列表卡片齐全。
- **结论**：通过。

## 三、需求中的其他条目

| 需求 | 实现 / 证据 |
| --- | --- |
| 顶部进度卡：应到、已到、签到率（t-progress 环形） | `index.wxml` `hero` + `<t-progress theme="circle">`；`checkin.buildStats/computeRate`；截图可见 52% |
| 每 30 秒自动刷新，隐藏暂停 | `refresh.ts` + `controller.onHide/onShow`；见验收 4 |
| t-tabs 三段筛选 | `TAB_LABELS`、`setTab()`；`tests/controller.test.ts`「搜索按票号后 4 位命中，切换筛选后按新条件重新拉取」；三张截图 |
| 搜索姓名 / 企业 / 票号后 4 位，300ms 防抖 | `matchKeyword()`、`ticketTail()`；`tests/checkin.test.ts`「搜索命中姓名 / 企业 / 票号后 4 位」「票号后 4 位：兼容空格/连字符/大小写」；见验收 1 |
| 每页 30 条，触底加载 | `PAGE_SIZE=30`、`loadMore()`；`tests/controller.test.ts`「触底加载第二页并去重合并」；`tests/checkin.test.ts`「分页合并：按 id 去重且后到数据覆盖旧数据」 |
| 每行姓名、企业、票号后 4 位、签到时间与方式 | `toRow()` 派生 `ticketTail/timeText/methodText`；截图三张 |
| 未签到行「手动补签」按钮 + 弹窗 | `makeup-dialog`（t-dialog + t-radio-group + t-textarea）；截图 `unchecked.png` |
| 409 提示「该会员已签到」并刷新该行 | `submitMakeup()` 捕获 `isAlreadyChecked` → toast + `refreshRow(id)`；`tests/controller.test.ts`「补签返回 409：提示「该会员已签到」并刷新该行（不动整页）」 |
| 非员工无权限 | `mount()` 判 `role !== 'staff'`，`forbidden` 视图，不请求、不轮询；接口返回 403 时 `load()` 同样切换到无权限态并 `stop()` 轮询；`tests/controller.test.ts`「非员工账号打开页面显示无权限且不发起任何请求」「接口返回 403 时同样进入无权限态，并停止后续轮询」 |
| 列表不展示联系方式 | `CheckinRecord` 无 phone/mobile/email 字段；`tests/checkin.test.ts`「列表数据不含任何联系方式字段（脱敏）」断言禁用字段与 11 位手机号；`tests/controller.test.ts` 亦断言行数据无 `phone` |

## 四、自测结论

| 项目 | 结果 |
| --- | --- |
| `npx jest` | **5 个套件全部通过，36 / 36 用例通过，0 失败**（输出见 `reports/jest.txt`） |
| `npx tsc --noEmit` | 通过，无类型错误（exit 0） |
| 截图 | 3 张存在，均 780×3160，已逐张目视检查合格 |
| 联系方式扫描 | `grep -rniE "手机号|联系电话|phone|mobile|email|1[3-9][0-9]{9}"` 仅命中「未带手机」原因 key `no-phone` 与测试中的脱敏断言，无真实号码 / 邮箱 / 联系方式字段 |
| 第三方 SDK | 无，仅 TDesign 小程序组件（UI，不上报数据） |
| 虚构数据 | 48 条姓名 / 企业均为虚构，无客户名称与真实个人信息 |

**总体结论：本单 5 条验收标准全部满足，可交付。**
