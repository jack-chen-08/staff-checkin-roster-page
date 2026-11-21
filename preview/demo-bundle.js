/* 自动生成，请勿手改 —— node scripts/build-demo.js
 * 内容来源：miniprogram/logic/*.ts + miniprogram/mock/checkin-list.ts（tsc 编译，CommonJS 包装）
 * 生成时间：2026-11-21T08:39:18.558Z
 */
(function (global) {
  var defs = {};
  var cache = {};
  function define(name, fn) { defs[name] = fn; }
  function normalize(base, spec) {
    if (spec.charAt(0) !== '.') return spec;
    var parts = base.split('/');
    parts.pop();
    spec.split('/').forEach(function (seg) {
      if (seg === '.' || seg === '') return;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    });
    var resolved = parts.join('/');
    return /\.js$/.test(resolved) ? resolved : resolved + '.js';
  }
  function requireModule(id) {
    if (cache[id]) return cache[id].exports;
    var fn = defs[id];
    if (!fn) throw new Error('module not found: ' + id);
    var mod = { exports: {} };
    cache[id] = mod;
    fn(mod, mod.exports, function (spec) { return requireModule(normalize(id, spec)); });
    return mod.exports;
  }
define("logic/api.js", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOCK_EVENT_ID = exports.ERR_NOT_FOUND = exports.ERR_FORBIDDEN = exports.ERR_NOTE_REQUIRED = exports.ERR_ALREADY_CHECKED = exports.ApiError = void 0;
exports.createMockApi = createMockApi;
exports.isAlreadyChecked = isAlreadyChecked;
exports.errorMessage = errorMessage;
const checkin_1 = require("./checkin");
const checkin_list_1 = require("../mock/checkin-list");
Object.defineProperty(exports, "MOCK_EVENT_ID", { enumerable: true, get: function () { return checkin_list_1.MOCK_EVENT_ID; } });
/** 业务错误：code 用于区分 409 / 400 / 403 等分支 */
class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
exports.ERR_ALREADY_CHECKED = 'ALREADY_CHECKED';
exports.ERR_NOTE_REQUIRED = 'MAKEUP_NOTE_REQUIRED';
exports.ERR_FORBIDDEN = 'FORBIDDEN';
exports.ERR_NOT_FOUND = 'NOT_FOUND';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function nowTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nowStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
/**
 * 创建 mock 接口实现。
 * 内部维护一份可变的数据副本，模拟服务端「补签后状态持久化」的行为。
 */
function createMockApi(options = {}) {
    const latency = Math.max(0, options.latency ?? 180);
    let store = (options.records || (0, checkin_list_1.createMockRecords)()).map((r) => ({ ...r }));
    const statsOf = () => {
        const expected = store.length;
        const arrived = store.filter((r) => r.checkedIn).length;
        return (0, checkin_1.buildStats)(expected, arrived);
    };
    const wait = async () => {
        if (latency > 0)
            await sleep(latency);
    };
    return {
        async list(query) {
            await wait();
            const page = Math.max(1, Math.floor(query.page || 1));
            const pageSize = Math.max(1, Math.floor(query.pageSize || checkin_1.PAGE_SIZE));
            const keyword = (query.keyword || '').trim();
            // 服务端筛选：先按 tab，再按关键词（姓名 / 企业 / 票号后 4 位）
            const filtered = store.filter((r) => (0, checkin_1.matchTab)(r, query.tab) && (0, checkin_1.matchKeyword)(r, keyword));
            const items = (0, checkin_1.slicePage)(filtered, page, pageSize);
            const total = filtered.length;
            return {
                items: items.map((r) => ({ ...r })),
                total,
                page,
                pageSize,
                hasMore: page * pageSize < total,
                stats: statsOf(),
                serverTime: nowStamp(),
            };
        },
        async getRecord(id) {
            await wait();
            const hit = store.find((r) => r.id === id);
            if (!hit)
                throw new ApiError(404, exports.ERR_NOT_FOUND, '签到记录不存在');
            return { ...hit };
        },
        async makeup(payload) {
            await wait();
            if (options.forceMakeupStatus === 409) {
                throw new ApiError(409, exports.ERR_ALREADY_CHECKED, '该会员已签到');
            }
            if (options.forceMakeupStatus === 403) {
                throw new ApiError(403, exports.ERR_FORBIDDEN, '无操作权限');
            }
            const note = (payload.note || '').trim();
            if (payload.reason === 'other' && !note) {
                throw new ApiError(400, exports.ERR_NOTE_REQUIRED, '请填写补签说明');
            }
            const hit = store.find((r) => r.id === payload.recordId);
            if (!hit)
                throw new ApiError(404, exports.ERR_NOT_FOUND, '签到记录不存在');
            if (hit.checkedIn) {
                throw new ApiError(409, exports.ERR_ALREADY_CHECKED, '该会员已签到');
            }
            const updated = {
                ...hit,
                checkedIn: true,
                checkinAt: nowTime(),
                checkinMethod: 'manual',
                makeupReason: payload.reason,
                makeupNote: note || null,
            };
            store = store.map((r) => (r.id === updated.id ? updated : r));
            return { record: { ...updated }, stats: statsOf() };
        },
    };
}
/** 是否为「已签到」冲突（409） */
function isAlreadyChecked(err) {
    return err instanceof ApiError && err.status === 409;
}
/** 统一提取错误文案，页面直接展示 */
function errorMessage(err, fallback = '网络异常，请稍后重试') {
    if (err instanceof ApiError)
        return err.message || fallback;
    if (err instanceof Error && err.message)
        return err.message;
    return fallback;
}

});

define("logic/checkin.js", function (module, exports, require) {
"use strict";
/**
 * 员工签到名单 —— 纯逻辑模块（不依赖 wx / 不依赖运行时）
 * 负责：行视图模型派生、关键词匹配、筛选、分页合并、考勤统计、补签参数校验、行状态迁移。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAKEUP_REASONS = exports.TAB_LABELS = exports.SEARCH_DEBOUNCE_MS = exports.PAGE_SIZE = void 0;
exports.ticketTail = ticketTail;
exports.avatarText = avatarText;
exports.formatTime = formatTime;
exports.toRow = toRow;
exports.toRows = toRows;
exports.matchKeyword = matchKeyword;
exports.matchTab = matchTab;
exports.filterRecords = filterRecords;
exports.computeRate = computeRate;
exports.buildStats = buildStats;
exports.statsAfterCheckin = statsAfterCheckin;
exports.slicePage = slicePage;
exports.hasMorePages = hasMorePages;
exports.mergePage = mergePage;
exports.applyCheckin = applyCheckin;
exports.replaceRecord = replaceRecord;
exports.validateMakeupDraft = validateMakeupDraft;
exports.reasonLabel = reasonLabel;
exports.emptyText = emptyText;
exports.PAGE_SIZE = 30;
exports.SEARCH_DEBOUNCE_MS = 300;
exports.TAB_LABELS = [
    { key: 'all', label: '全部' },
    { key: 'checked', label: '已签到' },
    { key: 'unchecked', label: '未签到' },
];
exports.MAKEUP_REASONS = [
    { key: 'no-phone', label: '未带手机' },
    { key: 'device', label: '设备故障' },
    { key: 'other', label: '其他' },
];
const METHOD_TEXT = {
    scan: '扫码',
    manual: '手动',
};
const REASON_TEXT = {
    'no-phone': '未带手机',
    device: '设备故障',
    other: '其他',
};
/** 取票号后 4 位，去掉空格与连字符干扰，统一大写 */
function ticketTail(ticketNo, len = 4) {
    if (!ticketNo)
        return '';
    const cleaned = String(ticketNo).replace(/[\s-]/g, '').toUpperCase();
    return cleaned.slice(-len);
}
function avatarText(name) {
    const trimmed = (name || '').trim();
    if (!trimmed)
        return '?';
    return trimmed.slice(-2);
}
function formatTime(raw) {
    if (!raw)
        return '';
    const text = String(raw).trim();
    // 兼容后端返回 "2026-11-21 09:12:30" / "09:12" 两种形态，列表只显示时分
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (!match)
        return text;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}
function toRow(record) {
    const methodKey = record.checkedIn
        ? record.checkinMethod || 'scan'
        : 'none';
    return {
        ...record,
        ticketTail: ticketTail(record.ticketNo),
        avatarText: avatarText(record.name),
        timeText: record.checkedIn ? formatTime(record.checkinAt) : '',
        methodText: methodKey === 'none' ? '' : METHOD_TEXT[methodKey],
        methodKey,
        statusText: record.checkedIn ? '已签到' : '未签到',
    };
}
function toRows(records) {
    return records.map(toRow);
}
/** 关键词匹配：姓名、企业、票号后 4 位；空关键词视为全匹配 */
function matchKeyword(record, keyword) {
    const k = (keyword || '').trim().toLowerCase();
    if (!k)
        return true;
    if ((record.name || '').toLowerCase().includes(k))
        return true;
    if ((record.company || '').toLowerCase().includes(k))
        return true;
    const tail = ticketTail(record.ticketNo).toLowerCase();
    if (tail && tail.includes(k))
        return true;
    return false;
}
function matchTab(record, tab) {
    if (tab === 'checked')
        return record.checkedIn;
    if (tab === 'unchecked')
        return !record.checkedIn;
    return true;
}
/** 内存侧筛选（用于本地兜底与测试），顺序与入参一致 */
function filterRecords(records, tab, keyword) {
    return records.filter((r) => matchTab(r, tab) && matchKeyword(r, keyword));
}
function computeRate(arrived, expected) {
    if (!expected || expected <= 0)
        return 0;
    const value = (arrived / expected) * 100;
    return Math.max(0, Math.min(100, Math.round(value)));
}
function buildStats(expected, arrived) {
    const safeExpected = Math.max(0, Math.floor(expected || 0));
    const safeArrived = Math.max(0, Math.min(safeExpected, Math.floor(arrived || 0)));
    return {
        expected: safeExpected,
        arrived: safeArrived,
        rate: computeRate(safeArrived, safeExpected),
    };
}
/** 已签到人数 +1 并重算签到率（补签成功后本地即时更新顶部卡片） */
function statsAfterCheckin(stats) {
    return buildStats(stats.expected, stats.arrived + 1);
}
/** 分页切片，page 从 1 开始 */
function slicePage(list, page, size = exports.PAGE_SIZE) {
    const p = Math.max(1, Math.floor(page || 1));
    const s = Math.max(1, Math.floor(size || exports.PAGE_SIZE));
    const start = (p - 1) * s;
    return list.slice(start, start + s);
}
/** 判断是否还有下一页 */
function hasMorePages(total, page, size = exports.PAGE_SIZE) {
    const loaded = Math.max(0, Math.floor(page || 0)) * Math.max(1, size);
    return loaded < Math.max(0, total);
}
/**
 * 合并分页数据：按 id 去重，后到的同 id 记录覆盖旧记录，保持首次出现顺序。
 * 用于「触底加载」与「自动刷新」时避免重复行。
 */
function mergePage(existing, incoming) {
    const index = new Map();
    const merged = [];
    for (const item of existing) {
        if (!item || !item.id)
            continue;
        if (index.has(item.id)) {
            merged[index.get(item.id)] = item;
            continue;
        }
        index.set(item.id, merged.length);
        merged.push(item);
    }
    for (const item of incoming) {
        if (!item || !item.id)
            continue;
        const at = index.get(item.id);
        if (typeof at === 'number') {
            merged[at] = item;
        }
        else {
            index.set(item.id, merged.length);
            merged.push(item);
        }
    }
    return merged;
}
/**
 * 行状态迁移：未签到 -> 已签到。
 * 返回新数组（不可变更新），并给出是否真正发生了变更与变更后的记录。
 */
function applyCheckin(records, id, patch) {
    let changed = false;
    let hit = null;
    const next = records.map((item) => {
        if (item.id !== id)
            return item;
        hit = {
            ...item,
            checkedIn: true,
            checkinAt: patch.checkinAt,
            checkinMethod: patch.checkinMethod,
            makeupReason: patch.makeupReason ?? null,
            makeupNote: patch.makeupNote ? patch.makeupNote.trim() : null,
        };
        changed = !item.checkedIn;
        return hit;
    });
    return { records: next, record: hit, changed };
}
/** 仅在已加载集合中替换单行（409 后刷新该行 / 补签成功回填） */
function replaceRecord(records, record) {
    let hit = false;
    const next = records.map((item) => {
        if (item.id === record.id) {
            hit = true;
            return record;
        }
        return item;
    });
    return hit ? next : records;
}
/**
 * 补签弹窗校验：
 * 1) 必须选择原因；
 * 2) 选择「其他」时必须填写说明（去掉首尾空格后非空）。
 */
function validateMakeupDraft(draft) {
    const note = (draft.note || '').trim();
    if (!draft.reason) {
        return { ok: false, message: '请选择补签原因', note };
    }
    if (!REASON_TEXT[draft.reason]) {
        return { ok: false, message: '补签原因不合法', note };
    }
    if (draft.reason === 'other' && note.length === 0) {
        return { ok: false, message: '选择「其他」时请填写补签说明', note };
    }
    if (note.length > 100) {
        return { ok: false, message: '补签说明不能超过 100 字', note };
    }
    return { ok: true, message: '', note };
}
function reasonLabel(reason) {
    if (!reason)
        return '';
    return REASON_TEXT[reason] || '';
}
/** 空状态文案：区分「无数据」与「搜索无结果」 */
function emptyText(tab, keyword) {
    if ((keyword || '').trim())
        return '没有找到匹配的会员';
    if (tab === 'checked')
        return '还没有会员签到';
    if (tab === 'unchecked')
        return '全部会员均已签到';
    return '暂无签到数据';
}

});

define("logic/controller.js", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckinListController = void 0;
const checkin_1 = require("./checkin");
const debounce_1 = require("./debounce");
const refresh_1 = require("./refresh");
const api_1 = require("./api");
const EMPTY_STATS = { expected: 0, arrived: 0, rate: 0 };
/**
 * 员工签到名单页控制器。
 * 页面 ts 只做「把事件转成调用 + 把 state 交给 setData」，所有业务规则都在这里，
 * 因此单元测试可以在没有微信环境的情况下验证完整状态迁移。
 */
class CheckinListController {
    constructor(deps) {
        this.deps = deps;
        this.records = [];
        this.requestSeq = 0;
        this.mounted = false;
        this.pageSize = deps.pageSize || checkin_1.PAGE_SIZE;
        this.state = {
            eventId: '',
            eventTitle: '',
            tab: 'all',
            inputValue: '',
            keyword: '',
            rows: [],
            stats: { ...EMPTY_STATS },
            total: 0,
            page: 0,
            hasMore: false,
            loading: false,
            loadingMore: false,
            refreshing: false,
            forbidden: false,
            empty: false,
            emptyText: (0, checkin_1.emptyText)('all', ''),
            errorText: '',
            toast: '',
            lastUpdated: '',
            dialogVisible: false,
            dialogTarget: null,
            dialogError: '',
            submitting: false,
        };
        this.debouncer = new debounce_1.Debouncer((value) => {
            void this.applySearch(value);
        }, deps.debounceMs ?? checkin_1.SEARCH_DEBOUNCE_MS, deps.debounceTimers);
        this.autoRefresh = new refresh_1.AutoRefresh({
            interval: deps.refreshMs,
            timers: deps.intervalTimers,
            onTick: () => this.silentRefresh(),
        });
    }
    get current() {
        return this.state;
    }
    /** 是否处于无权限态 */
    get forbidden() {
        return this.state.forbidden;
    }
    get isAutoRefreshing() {
        return this.autoRefresh.running;
    }
    snapshot() {
        return { ...this.state, rows: this.state.rows.slice() };
    }
    emit() {
        if (this.deps.onChange)
            this.deps.onChange(this.snapshot());
    }
    patch(partial) {
        this.state = { ...this.state, ...partial };
        this.emit();
    }
    /** 进入页面：先做权限判定，再拉第一页 */
    async mount(eventId, eventTitle = '2026 秋季合作伙伴大会') {
        this.mounted = true;
        if (this.deps.role !== 'staff') {
            this.patch({
                eventId: eventId || '',
                eventTitle,
                forbidden: true,
                loading: false,
                rows: [],
                errorText: '',
            });
            this.autoRefresh.stop();
            return;
        }
        if (!eventId) {
            this.patch({
                eventTitle,
                forbidden: false,
                loading: false,
                errorText: '缺少活动参数，请从扫码页重新进入',
            });
            return;
        }
        this.patch({ eventId, eventTitle, forbidden: false });
        await this.load(1, 'replace');
        if (!this.state.forbidden)
            this.autoRefresh.start();
    }
    onShow() {
        if (!this.mounted || this.state.forbidden)
            return;
        this.autoRefresh.resume();
    }
    /** 页面隐藏：30 秒轮询立即停止，不再发请求 */
    onHide() {
        this.debouncer.cancel();
        this.autoRefresh.pause();
    }
    destroy() {
        this.mounted = false;
        this.debouncer.cancel();
        this.autoRefresh.stop();
        this.requestSeq += 1;
    }
    /** 切换筛选：重置分页并重新请求 */
    async setTab(tab) {
        if (tab === this.state.tab)
            return;
        this.debouncer.cancel();
        this.patch({ tab, dialogVisible: false, dialogTarget: null, dialogError: '' });
        if (!this.state.eventId || this.state.forbidden) {
            this.patch({ rows: [], empty: true, emptyText: (0, checkin_1.emptyText)(tab, this.state.keyword) });
            return;
        }
        await this.load(1, 'replace');
    }
    /** 搜索框输入：300ms 防抖，连续输入只发最后一次请求 */
    onKeywordInput(value) {
        const next = value == null ? '' : String(value);
        this.patch({ inputValue: next });
        if (!next.trim()) {
            // 清空输入立即恢复全量列表，不必等待防抖
            this.debouncer.cancel();
            void this.applySearch('');
            return;
        }
        this.debouncer.schedule(next);
    }
    /** 点键盘「搜索」/ 搜索按钮：立即生效 */
    async onSubmitSearch() {
        if (this.debouncer.pending) {
            this.debouncer.flush();
            return;
        }
        if (this.state.keyword !== this.state.inputValue.trim()) {
            await this.applySearch(this.state.inputValue);
        }
    }
    /** 防抖结束后真正生效 */
    async applySearch(value) {
        const keyword = (value || '').trim();
        if (keyword === this.state.keyword)
            return;
        this.patch({ keyword, inputValue: value });
        if (!this.state.eventId || this.state.forbidden)
            return;
        await this.load(1, 'replace');
    }
    async clearKeyword() {
        this.debouncer.cancel();
        this.patch({ inputValue: '' });
        await this.applySearch('');
    }
    /** 触底加载下一页 */
    async loadMore() {
        if (this.state.forbidden || this.state.loading || this.state.loadingMore)
            return;
        if (!this.state.hasMore)
            return;
        await this.load(this.state.page + 1, 'merge');
    }
    /** 30 秒被动刷新：静默拉第一页并与已加载数据合并，不打断滚动 */
    async silentRefresh() {
        if (!this.mounted || this.state.forbidden || !this.state.eventId)
            return;
        if (this.state.loading)
            return;
        this.patch({ refreshing: true });
        try {
            const seq = ++this.requestSeq;
            const res = await this.deps.api.list({
                eventId: this.state.eventId,
                tab: this.state.tab,
                keyword: this.state.keyword,
                page: 1,
                pageSize: this.pageSize,
            });
            if (seq !== this.requestSeq)
                return;
            this.records = (0, checkin_1.mergePage)(this.records, res.items);
            const rows = this.buildRows();
            this.patch({
                rows,
                stats: res.stats,
                total: res.total,
                hasMore: rows.length < res.total,
                empty: rows.length === 0,
                emptyText: (0, checkin_1.emptyText)(this.state.tab, this.state.keyword),
                lastUpdated: res.serverTime,
                refreshing: false,
            });
        }
        catch (err) {
            this.patch({ refreshing: false });
            // 轮询失败不打扰用户，只在控制台留痕
            console.warn('[checkin-list] 自动刷新失败', (0, api_1.errorMessage)(err));
        }
    }
    buildRows() {
        return (0, checkin_1.toRows)(this.records.filter((r) => (0, checkin_1.matchTab)(r, this.state.tab)));
    }
    async load(page, mode) {
        const seq = ++this.requestSeq;
        if (mode === 'merge') {
            this.patch({ loadingMore: true });
        }
        else {
            this.patch({ loading: true, errorText: '' });
        }
        try {
            const res = await this.deps.api.list({
                eventId: this.state.eventId,
                tab: this.state.tab,
                keyword: this.state.keyword,
                page,
                pageSize: this.pageSize,
            });
            if (seq !== this.requestSeq)
                return; // 丢弃过期响应
            this.records = mode === 'merge' ? (0, checkin_1.mergePage)(this.records, res.items) : res.items.slice();
            const rows = this.buildRows();
            this.patch({
                rows,
                stats: res.stats,
                total: res.total,
                page,
                hasMore: rows.length < res.total,
                loading: false,
                loadingMore: false,
                refreshing: false,
                empty: rows.length === 0,
                emptyText: (0, checkin_1.emptyText)(this.state.tab, this.state.keyword),
                lastUpdated: res.serverTime,
            });
        }
        catch (err) {
            if (seq !== this.requestSeq)
                return;
            const status = err && err.status;
            const code = err && err.code;
            // 后端判定当前登录人不是工作人员：直接进入无权限态并停止轮询
            if (status === 403 || code === api_1.ERR_FORBIDDEN) {
                this.autoRefresh.stop();
                this.records = [];
                this.patch({
                    forbidden: true,
                    rows: [],
                    stats: { ...EMPTY_STATS },
                    total: 0,
                    page: 0,
                    hasMore: false,
                    loading: false,
                    loadingMore: false,
                    refreshing: false,
                    empty: false,
                    errorText: '',
                    dialogVisible: false,
                    dialogTarget: null,
                });
                return;
            }
            this.patch({
                loading: false,
                loadingMore: false,
                refreshing: false,
                errorText: (0, api_1.errorMessage)(err),
                empty: this.state.rows.length === 0,
            });
        }
    }
    /** 打开补签弹窗 */
    openMakeup(id) {
        const hit = this.state.rows.find((r) => r.id === id);
        if (!hit || hit.checkedIn)
            return;
        this.patch({ dialogVisible: true, dialogTarget: hit, dialogError: '' });
        // 弹窗期间暂停轮询，避免弹窗内容被后台刷新覆盖
        this.autoRefresh.pause();
    }
    closeMakeup() {
        this.patch({ dialogVisible: false, dialogTarget: null, dialogError: '', submitting: false });
        this.autoRefresh.resume();
    }
    /**
     * 提交手动补签。
     * 成功：该行立即变为已签到 + 顶部计数同步 +1，不重新拉整页；
     * 409：提示「该会员已签到」并只刷新该行。
     */
    async submitMakeup(draft) {
        const target = this.state.dialogTarget;
        if (!target)
            return { ok: false, message: '未选择补签对象' };
        if (this.state.submitting)
            return { ok: false, message: '正在提交' };
        const check = (0, checkin_1.validateMakeupDraft)(draft);
        if (!check.ok) {
            this.patch({ dialogError: check.message });
            return { ok: false, message: check.message };
        }
        this.patch({ submitting: true, dialogError: '' });
        try {
            const res = await this.deps.api.makeup({
                eventId: this.state.eventId,
                recordId: target.id,
                reason: draft.reason,
                note: check.note,
            });
            this.applyLocalCheckin(res.record, res.stats);
            this.patch({
                submitting: false,
                dialogVisible: false,
                dialogTarget: null,
                toast: '补签成功',
            });
            this.autoRefresh.resume();
            return { ok: true, message: '补签成功' };
        }
        catch (err) {
            if ((0, api_1.isAlreadyChecked)(err)) {
                this.patch({ submitting: false, dialogVisible: false, dialogTarget: null, toast: '该会员已签到' });
                this.autoRefresh.resume();
                await this.refreshRow(target.id);
                return { ok: false, message: api_1.ERR_ALREADY_CHECKED };
            }
            if (err && err.code === api_1.ERR_FORBIDDEN) {
                this.patch({ submitting: false, dialogError: '无操作权限，请联系活动管理员' });
                return { ok: false, message: '无操作权限' };
            }
            const message = (0, api_1.errorMessage)(err, '补签失败，请稍后重试');
            this.patch({ submitting: false, dialogError: message });
            return { ok: false, message };
        }
    }
    /** 本地回填（不整页刷新）：行状态 + 顶部统计同时更新 */
    applyLocalCheckin(record, serverStats) {
        const before = this.records.find((r) => r.id === record.id);
        const wasChecked = !!(before && before.checkedIn);
        this.records = (0, checkin_1.replaceRecord)(this.records, { ...record, checkedIn: true });
        const rows = this.buildRows();
        const stats = serverStats || (wasChecked ? this.state.stats : (0, checkin_1.statsAfterCheckin)(this.state.stats));
        this.patch({
            rows,
            stats,
            total: this.state.total,
            empty: rows.length === 0,
            emptyText: (0, checkin_1.emptyText)(this.state.tab, this.state.keyword),
            hasMore: rows.length < this.state.total,
        });
    }
    /** 409 后仅刷新单行 */
    async refreshRow(id) {
        try {
            const fresh = await this.deps.api.getRecord(id);
            const before = this.records.find((r) => r.id === id);
            const wasChecked = !!(before && before.checkedIn);
            this.records = (0, checkin_1.replaceRecord)(this.records, fresh);
            const rows = this.buildRows();
            const stats = !wasChecked && fresh.checkedIn
                ? (0, checkin_1.statsAfterCheckin)(this.state.stats)
                : this.state.stats;
            this.patch({
                rows,
                stats,
                empty: rows.length === 0,
                hasMore: rows.length < this.state.total,
            });
        }
        catch (err) {
            this.patch({ errorText: (0, api_1.errorMessage)(err, '该行刷新失败，请下拉重试') });
        }
    }
    clearToast() {
        if (this.state.toast)
            this.patch({ toast: '' });
    }
    setToast(text) {
        this.patch({ toast: text });
    }
    /** 下拉刷新 */
    async pullRefresh() {
        if (this.state.forbidden)
            return;
        await this.load(1, 'replace');
    }
    /** 顶部统计（供测试断言，避免依赖 rows） */
    statsSnapshot() {
        return { ...this.state.stats };
    }
    recordsSnapshot() {
        return this.records.map((r) => ({ ...r }));
    }
    /** 测试用：手动触发一次自动刷新（等价于等待 30s） */
    async forceAutoRefreshTick() {
        await this.autoRefresh.tick();
    }
    static emptyStats() {
        return (0, checkin_1.buildStats)(0, 0);
    }
    static applyCheckinLocally(records, id, time) {
        return (0, checkin_1.applyCheckin)(records, id, { checkinAt: time, checkinMethod: 'manual' }).records;
    }
}
exports.CheckinListController = CheckinListController;

});

define("logic/debounce.js", function (module, exports, require) {
"use strict";
/**
 * 通用防抖器：定时器可注入，便于单元测试用假定时器验证「连续输入只触发一次」。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Debouncer = void 0;
const REAL_TIMERS = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
};
class Debouncer {
    constructor(fn, wait = 300, timers = REAL_TIMERS) {
        this.fn = fn;
        this.wait = wait;
        this.timers = timers;
        this.handle = null;
        this.pendingArgs = null;
    }
    /** 重新计时；只有最后一次调用会在 wait 毫秒后真正执行 */
    schedule(...args) {
        this.pendingArgs = args;
        if (this.handle !== null) {
            this.timers.clearTimeout(this.handle);
        }
        this.handle = this.timers.setTimeout(() => {
            this.handle = null;
            const args2 = this.pendingArgs;
            this.pendingArgs = null;
            if (args2)
                this.fn(...args2);
        }, this.wait);
    }
    /** 是否有等待中的调用 */
    get pending() {
        return this.handle !== null;
    }
    /** 取消等待中的调用（页面卸载 / 切换筛选时使用） */
    cancel() {
        if (this.handle !== null) {
            this.timers.clearTimeout(this.handle);
            this.handle = null;
        }
        this.pendingArgs = null;
    }
    /** 立即执行等待中的调用（点「搜索」按钮时使用） */
    flush() {
        if (this.handle === null)
            return;
        this.timers.clearTimeout(this.handle);
        this.handle = null;
        const args = this.pendingArgs;
        this.pendingArgs = null;
        if (args)
            this.fn(...args);
    }
}
exports.Debouncer = Debouncer;

});

define("logic/refresh.js", function (module, exports, require) {
"use strict";
/**
 * 30 秒自动刷新调度器。
 * - setInterval 可注入，测试用 jest.useFakeTimers 直接推进时间；
 * - pause() 后不再触发（页面 onHide / 弹窗打开时使用），resume() 重新计时；
 * - 上一轮请求未结束时跳过本轮，避免请求堆积。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoRefresh = exports.AUTO_REFRESH_MS = void 0;
const REAL_TIMERS = {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (handle) => clearInterval(handle),
};
exports.AUTO_REFRESH_MS = 30000;
class AutoRefresh {
    constructor(options) {
        this.options = options;
        this.handle = null;
        this.paused = false;
        this.started = false;
        this.busy = false;
        this.tickCount = 0;
        this.errorCount = 0;
        this.interval = options.interval && options.interval > 0 ? options.interval : exports.AUTO_REFRESH_MS;
    }
    /** 当前是否处于运行（含暂停态：已启动但被暂停） */
    get running() {
        return this.started && !this.paused;
    }
    get isPaused() {
        return this.paused;
    }
    get ticks() {
        return this.tickCount;
    }
    get errors() {
        return this.errorCount;
    }
    start() {
        this.started = true;
        this.paused = false;
        this.arm();
    }
    /** 页面隐藏：停止计时，不再产生刷新请求 */
    pause() {
        if (!this.started)
            return;
        this.paused = true;
        this.disarm();
    }
    /** 页面重新显示：重新从 0 开始计时 */
    resume() {
        if (!this.started) {
            this.start();
            return;
        }
        this.paused = false;
        this.arm();
    }
    /** 页面卸载 / 无权限：彻底停止，重复 start 需要重新调用 start() */
    stop() {
        this.started = false;
        this.paused = false;
        this.disarm();
    }
    get timers() {
        return this.options.timers || REAL_TIMERS;
    }
    arm() {
        this.disarm();
        this.handle = this.timers.setInterval(() => {
            void this.tick();
        }, this.interval);
    }
    disarm() {
        if (this.handle !== null) {
            this.timers.clearInterval(this.handle);
            this.handle = null;
        }
    }
    /** 供测试或「下拉刷新」直接触发一次轮询 */
    async tick() {
        if (this.paused || !this.started)
            return;
        if (this.busy)
            return;
        this.busy = true;
        this.tickCount += 1;
        try {
            const result = this.options.onTick();
            // 同步回调不占用 busy，避免连续两次定时器触发被误判为「上一轮未结束」
            if (result && typeof result.then === 'function') {
                await result;
            }
        }
        catch (err) {
            this.errorCount += 1;
            if (this.options.onError)
                this.options.onError(err);
        }
        finally {
            this.busy = false;
        }
    }
}
exports.AutoRefresh = AutoRefresh;

});

define("mock/checkin-list.js", function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOCK_RECORDS = exports.MOCK_EVENT = exports.MOCK_EVENT_ID = void 0;
exports.createMockRecords = createMockRecords;
const SEED = [
    ['r001', '林一舟', '云启科技', 'E26-1187', true, '08:41', 'scan'],
    ['r002', '苏晚棠', '星澜数据', 'E26-2043', true, '08:44', 'scan'],
    ['r003', '何知远', '木石设计', 'E26-3312', true, '08:47', 'scan'],
    ['r004', '顾清和', '澄海智造', 'E26-4489', false, null, null],
    ['r005', '沈书白', '白鹭文化', 'E26-5021', true, '08:52', 'manual', 'no-phone'],
    ['r006', '温故之', '光屿能源', 'E26-6734', true, '08:55', 'scan'],
    ['r007', '许砚秋', '沐野农业', 'E26-7190', false, null, null],
    ['r008', '程见山', '拾光传媒', 'E26-8265', true, '08:58', 'scan'],
    ['r009', '白鹿鸣', '北辰物流', 'E26-9341', true, '09:02', 'scan'],
    ['r010', '叶青禾', '静川医疗', 'E26-1046', false, null, null],
    ['r011', '宋知微', '千帆教育', 'E26-2158', true, '09:05', 'scan'],
    ['r012', '周砚白', '梵星电子', 'E26-3267', false, null, null],
    ['r013', '梁怡然', '桃渊食品', 'E26-4378', true, '09:08', 'scan'],
    ['r014', '沈叙白', '序言咨询', 'E26-5480', false, null, null],
    ['r015', '谢云归', '森木建筑', 'E26-6591', true, '09:11', 'manual', 'device'],
    ['r016', '钟灵均', '蓝湾生物', 'E26-7602', true, '09:14', 'scan'],
    ['r017', '柳青梧', '听风网络', 'E26-8713', false, null, null],
    ['r018', '江照野', '明月半导', 'E26-9824', true, '09:17', 'scan'],
    ['r019', '邵星阑', '归谷文旅', 'E26-1935', false, null, null],
    ['r020', '闻人澈', '木棉服饰', 'E26-2746', true, '09:20', 'scan'],
    ['r021', '骆方舟', '云启科技', 'E26-3857', false, null, null],
    ['r022', '严未迟', '星澜数据', 'E26-4968', true, '09:24', 'scan'],
    ['r023', '宁可意', '木石设计', 'E26-5079', false, null, null],
    ['r024', '关山月', '澄海智造', 'E26-6180', true, '09:27', 'manual', 'other', '现场闸机断电，人工核验票据入场'],
    ['r025', '段青野', '白鹭文化', 'E26-7291', false, null, null],
    ['r026', '于此间', '光屿能源', 'E26-8302', true, '09:30', 'scan'],
    ['r027', '孟长亭', '沐野农业', 'E26-9413', false, null, null],
    ['r028', '裴照雪', '拾光传媒', 'E26-1524', true, '09:33', 'scan'],
    ['r029', '安从简', '北辰物流', 'E26-2635', false, null, null],
    ['r030', '韩叙白', '静川医疗', 'E26-3746', true, '09:36', 'scan'],
    ['r031', '蒋听澜', '千帆教育', 'E26-4857', false, null, null],
    ['r032', '崔明远', '梵星电子', 'E26-5968', true, '09:39', 'scan'],
    ['r033', '卫南枝', '桃渊食品', 'E26-6079', false, null, null],
    ['r034', '卢长风', '序言咨询', 'E26-7180', true, '09:42', 'manual', 'no-phone'],
    ['r035', '章维夏', '森木建筑', 'E26-8291', false, null, null],
    ['r036', '史叙言', '蓝湾生物', 'E26-9302', true, '09:45', 'scan'],
    ['r037', '罗青阳', '听风网络', 'E26-1413', false, null, null],
    ['r038', '万景和', '明月半导', 'E26-2524', true, '09:48', 'scan'],
    ['r039', '莫怀山', '归谷文旅', 'E26-3635', false, null, null],
    ['r040', '傅青野', '木棉服饰', 'E26-4746', true, '09:51', 'scan'],
    ['r041', '霍云开', '云启科技', 'E26-5857', false, null, null],
    ['r042', '薛知言', '星澜数据', 'E26-6968', true, '09:54', 'scan'],
    ['r043', '屈兰亭', '木石设计', 'E26-7079', false, null, null],
    ['r044', '班书宁', '澄海智造', 'E26-8180', true, '09:57', 'manual', 'device'],
    ['r045', '常望舒', '白鹭文化', 'E26-9291', false, null, null],
    ['r046', '倪清昼', '光屿能源', 'E26-1302', false, null, null],
    ['r047', '池砚舟', '沐野农业', 'E26-2413', false, null, null],
    ['r048', '穆星野', '拾光传媒', 'E26-3524', false, null, null],
];
exports.MOCK_EVENT_ID = 'EVT-2026-1121';
exports.MOCK_EVENT = {
    id: exports.MOCK_EVENT_ID,
    title: '2026 秋季合作伙伴大会',
    date: '2026-11-21',
};
/** 每次调用返回新的深拷贝，避免 mock 状态被外部改写 */
function createMockRecords() {
    return SEED.map(([id, name, company, ticketNo, checkedIn, time, method, reason, note]) => ({
        id,
        name,
        company,
        ticketNo,
        checkedIn,
        checkinAt: checkedIn ? time : null,
        checkinMethod: checkedIn ? method : null,
        makeupReason: reason ?? null,
        makeupNote: note ?? null,
    }));
}
/** 默认数据集（只读参考，勿直接修改） */
exports.MOCK_RECORDS = createMockRecords();

});

  global.CheckinModules = { require: requireModule };
})(window);
