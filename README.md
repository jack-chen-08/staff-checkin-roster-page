# 员工签到名单页（S3-MINI-062 / #2238）

活动工作人员使用的微信小程序页面：从扫码页右上角进入 `pages/staff/checkin-list?event_id=`，查看本场活动的签到进度与员工名单，并对未签到会员执行「手动补签」。

- 技术栈：微信小程序原生 + TypeScript + TDesign 小程序组件（`tdesign-miniprogram`）
- 业务逻辑与 `wx` 运行时解耦：全部放在 `miniprogram/logic/*.ts`，页面只做事件转发与 `setData`
- 页面文案、空状态、错误提示全部为中文
- 列表**不展示、也不存储**任何联系方式字段（无手机号 / 邮箱 / 微信）
- 数据全部为虚构姓名与虚构企业名，不含任何真实个人信息

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 顶部进度卡 | 应到、已到、未到与签到率（`t-progress` 环形），附最近更新时间 |
| 自动刷新 | 每 30 秒静默拉取第一页并与已加载数据合并；`onHide` 立即暂停，`onShow` 恢复；补签弹窗打开期间也暂停 |
| 三段筛选 | `t-tabs`：全部 / 已签到 / 未签到，切换后重置分页重新请求 |
| 搜索 | `t-search`，输入防抖 300ms；支持姓名、企业、票号后 4 位；清空立即恢复 |
| 分页 | 每页 30 条，`onReachBottom` 触底加载，按 `id` 去重合并 |
| 手动补签 | 未签到行右侧「手动补签」，弹窗选择原因（未带手机 / 设备故障 / 其他），选「其他」必须填写说明 |
| 补签结果 | 成功：该行立即变已签到 + 顶部计数同步 +1，**不整页刷新**；409：提示「该会员已签到」并只刷新该行 |
| 权限 | 非员工账号（`role !== 'staff'`）或名单接口返回 403 时显示「暂无访问权限」，不渲染名单、不启动轮询 |
| 脱敏 | 数据模型中没有 `phone` / `mobile` / `email` 字段，列表只显示票号后 4 位 |

## 目录结构

```
2238/
├── miniprogram/                      # 小程序工程根目录（微信开发者工具直接导入此目录）
│   ├── app.json / app.ts / app.wxss
│   ├── project.config.json / sitemap.json
│   ├── pages/staff/checkin-list/
│   │   ├── index.wxml                # 进度卡、tabs、搜索、列表、无权限态
│   │   ├── index.wxss
│   │   ├── index.ts                  # 只做事件 -> controller 调用 -> setData
│   │   └── index.json                # 页面标题与 usingComponents
│   ├── components/makeup-dialog/     # 手动补签弹窗（t-dialog + 单选 + 说明）
│   │   ├── index.wxml / index.wxss / index.ts / index.json
│   ├── logic/
│   │   ├── checkin.ts                # 行视图派生、搜索匹配、筛选、分页合并、统计、补签校验、行状态迁移
│   │   ├── controller.ts             # 页面状态机：加载/筛选/搜索/分页/轮询/补签/409/无权限
│   │   ├── debounce.ts               # 通用防抖，setTimeout/clearTimeout 可注入
│   │   ├── refresh.ts                # 30s 轮询调度器，支持 pause/resume，可注入 setInterval
│   │   └── api.ts                    # mock 接口封装、ApiError、409/400/403/404 错误类型
│   └── mock/checkin-list.ts          # 48 条虚构签到记录（覆盖 2 页）
├── tests/                            # Jest 单元测试（5 个套件 / 36 个用例）
│   ├── debounce.test.ts / refresh.test.ts
│   ├── checkin.test.ts / api.test.ts / controller.test.ts
├── preview/                          # 截图用静态 HTML（独立可打开，相对引用 preview.css）
│   ├── all.html / checked.html / unchecked.html
│   ├── preview.css / checkin.css
├── screenshots/                      # 三个筛选的验收截图（780×3160，@2x）
│   ├── all.png / checked.png / unchecked.png
├── scripts/
│   ├── gen-preview.js                # 由 mock 数据生成 preview/*.html
│   └── shoot.sh                      # headless Chrome 截图
├── reports/jest.txt                  # npm run test:report 的完整输出
├── docs/ACCEPTANCE.md                # 需求 -> 实现 -> 证据 对照
├── README.md
└── DELIVERY.md                       # 验收标准逐条证据 + 自测结论
```

## 运行方法

### 1. 微信开发者工具

1. 打开微信开发者工具 → 导入项目，目录选择本仓库的 `miniprogram/`（`project.config.json` 的 `miniprogramRoot` 为 `./`）。
2. 在 `miniprogram/` 下安装 TDesign 并构建 npm：

   ```bash
   cd miniprogram
   npm init -y            # 若目录下没有 package.json
   npm i tdesign-miniprogram
   ```

   然后在开发者工具菜单执行「工具 → 构建 npm」，勾选「使用 npm 模块」。
3. 编译预览。`app.json` 中已注册页面 `pages/staff/checkin-list/index`；`project.config.json` 内置两个编译模式：
   - 员工签到名单（全部）：`event_id=EVT-2026-1121`
   - 员工签到名单（未签到）：`event_id=EVT-2026-1121&tab=unchecked`

> 本仓库的 `package.json` 只用于 Jest / TypeScript，未安装 `tdesign-miniprogram`（交付环境不运行开发者工具）。页面通过 `usingComponents` 引用组件，安装并构建 npm 后即可正常渲染。

### 2. 角色与无权限演示

页面角色读取顺序：`getApp().globalData.role` → 本地缓存 `demoUserRole` → 默认 `staff`。演示无权限时可在控制台执行：

```js
wx.setStorageSync('demoUserRole', 'member')   // 重新进入页面
wx.removeStorageSync('demoUserRole')          // 恢复员工演示
```

### 3. 测试与类型检查

```bash
cd <项目根目录>
npx jest                 # 5 个套件 / 36 个用例
npx tsc --noEmit         # TypeScript 类型检查
npm run test:report      # 生成 reports/jest.txt
```

### 4. 重新生成截图

```bash
node scripts/gen-preview.js
bash scripts/shoot.sh preview/all.html screenshots/all.png 390 1580
bash scripts/shoot.sh preview/checked.html screenshots/checked.png 390 1580
bash scripts/shoot.sh preview/unchecked.html screenshots/unchecked.png 390 1580
```

`gen-preview.js` 直接编译并读取 `miniprogram/mock/checkin-list.ts`，因此截图数据与代码中的 mock 数据始终一致。截图使用 headless Chrome，`--force-device-scale-factor=2`，输出 780×3160 PNG。

## mock 接口对接点

`miniprogram/logic/api.ts` 中的 `createMockApi()` 是唯一需要替换的地方。真实环境用 `wx.request` 封装实现同一个 `CheckinApi` 接口，`controller.ts` 与页面代码无需改动。

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/staff/checkin/list` | GET | 参数：`event_id`、`tab`（`all`/`checked`/`unchecked`）、`keyword`、`page`（从 1 开始）、`page_size`（默认 30） |
| `/api/staff/checkin/detail` | GET | 参数：`id`；用于 409 后只刷新单行 |
| `/api/staff/checkin/makeup` | POST | `{ event_id, record_id, reason, note }`；`reason` 取 `no-phone` / `device` / `other`，选 `other` 时 `note` 必填 |

`list` 响应字段（与 `ListResult` 对应）：

```jsonc
{
  "items": [
    {
      "id": "r001",
      "name": "林一舟",
      "company": "云启科技",
      "ticketNo": "E26-1187",
      "checkedIn": true,
      "checkinAt": "08:41",
      "checkinMethod": "scan",        // scan | manual
      "makeupReason": null,
      "makeupNote": null
    }
  ],
  "total": 48,
  "page": 1,
  "pageSize": 30,
  "hasMore": true,
  "stats": { "expected": 48, "arrived": 25, "rate": 52 },
  "serverTime": "10:12:30"
}
```

替换步骤：

1. 新建 `request.ts` 封装 `wx.request`，统一处理 token、超时与 HTTP 状态码；
2. 在 `api.ts` 中实现 `createRequestApi()`，把 409 映射为 `new ApiError(409, ERR_ALREADY_CHECKED, '该会员已签到')`，400/403/404 同理；
3. 将 `pages/staff/checkin-list/index.ts` 第 10 行的 `createMockApi(...)` 改为真实实现；
4. 真实后端需保证 `items` 中**不返回**联系方式字段，前端不展示也不缓存。

## 关键实现说明

- **防抖**：`Debouncer` 默认 300ms，页面输入 `onKeywordInput` 只更新输入框并 `schedule`；清空输入走 `cancel + 立即搜索`。
- **自动刷新**：`AutoRefresh` 默认 30000ms，`pause()` 会 `clearInterval`；`controller.onHide()` 同时取消防抖和轮询，`onShow()` 恢复并重新计时。
- **不整页刷新**：补签成功后用接口返回的 `record` 调 `replaceRecord` 做不可变替换，并用 `statsAfterCheckin` 或服务端 `stats` 更新顶部；测试中断言 `list` 调用次数不变。
- **409**：关闭弹窗、提示「该会员已签到」，再 `getRecord(id)` 只刷新该行，必要时本地补一次计数。
- **筛选与搜索**：服务端按 `tab + keyword` 过滤并分页，客户端 `buildRows` 再做一次 tab 兜底，避免补签后残留不符合当前筛选的行。

## 已知限制

1. 交付环境没有微信开发者工具，无法在真机 / 模拟器中截图；`screenshots/` 由 `preview/` 下的静态 harness 渲染，页面结构、文案、色值与 WXSS 保持一致，但并非开发者工具真实渲染。
2. TDesign 组件未在本仓库安装，首次用开发者工具打开需按上文执行 `npm i tdesign-miniprogram` 与「构建 npm」。
3. mock 数据保存在内存中，重启小程序后补签结果会重置；真实接口需自行持久化。
4. 登录态 / 员工身份由宿主小程序提供，本页只做 `role === 'staff'` 的入口校验；真正的接口鉴权仍需后端配合。
5. 自动刷新固定 30 秒，未做指数退避；弱网下失败只写 `console.warn`，不打断用户操作。

## 虚构数据声明

`miniprogram/mock/checkin-list.ts` 中 48 条记录（姓名、企业、票号、时间）及 `MOCK_EVENT`（「2026 秋季合作伙伴大会」）均为演示用虚构数据，与任何真实个人、企业、活动无关。数据模型不含手机号、邮箱、微信号等联系方式；测试中亦有断言防止联系方式字段回流。项目中未引入任何向境外发送数据的第三方 SDK。
