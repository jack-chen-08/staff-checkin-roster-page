import {
  CheckinRecord,
  CheckinRow,
  EventStats,
  MakeupDraft,
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  TabKey,
  applyCheckin,
  buildStats,
  emptyText,
  matchTab,
  mergePage,
  replaceRecord,
  statsAfterCheckin,
  toRows,
  validateMakeupDraft,
} from './checkin';
import { DebounceTimers, Debouncer } from './debounce';
import { IntervalTimers, AutoRefresh } from './refresh';
import {
  CheckinApi,
  ERR_ALREADY_CHECKED,
  ERR_FORBIDDEN,
  MakeupResult,
  errorMessage,
  isAlreadyChecked,
} from './api';

/** 页面级状态（页面 setData 直接使用该结构） */
export interface ControllerState {
  eventId: string;
  eventTitle: string;
  tab: TabKey;
  /** 输入框实时值 */
  inputValue: string;
  /** 已生效（防抖后）的关键词 */
  keyword: string;
  rows: CheckinRow[];
  stats: EventStats;
  total: number;
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  forbidden: boolean;
  empty: boolean;
  emptyText: string;
  errorText: string;
  toast: string;
  lastUpdated: string;
  dialogVisible: boolean;
  dialogTarget: CheckinRow | null;
  dialogError: string;
  submitting: boolean;
}

export type StaffRole = 'staff' | 'member' | 'guest' | string;

export interface ControllerDeps {
  api: CheckinApi;
  /** 当前登录人角色，仅 staff 可进入（真实环境由登录态/接口返回） */
  role: StaffRole;
  onChange?: (state: ControllerState) => void;
  debounceMs?: number;
  refreshMs?: number;
  debounceTimers?: DebounceTimers;
  intervalTimers?: IntervalTimers;
  pageSize?: number;
}

const EMPTY_STATS: EventStats = { expected: 0, arrived: 0, rate: 0 };

/**
 * 员工签到名单页控制器。
 * 页面 ts 只做「把事件转成调用 + 把 state 交给 setData」，所有业务规则都在这里，
 * 因此单元测试可以在没有微信环境的情况下验证完整状态迁移。
 */
export class CheckinListController {
  private records: CheckinRecord[] = [];
  private state: ControllerState;
  private readonly debouncer: Debouncer<[string]>;
  private readonly autoRefresh: AutoRefresh;
  private readonly pageSize: number;
  private requestSeq = 0;
  private mounted = false;

  constructor(private readonly deps: ControllerDeps) {
    this.pageSize = deps.pageSize || PAGE_SIZE;
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
      emptyText: emptyText('all', ''),
      errorText: '',
      toast: '',
      lastUpdated: '',
      dialogVisible: false,
      dialogTarget: null,
      dialogError: '',
      submitting: false,
    };
    this.debouncer = new Debouncer<[string]>(
      (value: string) => {
        void this.applySearch(value);
      },
      deps.debounceMs ?? SEARCH_DEBOUNCE_MS,
      deps.debounceTimers,
    );
    this.autoRefresh = new AutoRefresh({
      interval: deps.refreshMs,
      timers: deps.intervalTimers,
      onTick: () => this.silentRefresh(),
    });
  }

  get current(): ControllerState {
    return this.state;
  }

  /** 是否处于无权限态 */
  get forbidden(): boolean {
    return this.state.forbidden;
  }

  get isAutoRefreshing(): boolean {
    return this.autoRefresh.running;
  }

  snapshot(): ControllerState {
    return { ...this.state, rows: this.state.rows.slice() };
  }

  private emit(): void {
    if (this.deps.onChange) this.deps.onChange(this.snapshot());
  }

  private patch(partial: Partial<ControllerState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  /** 进入页面：先做权限判定，再拉第一页 */
  async mount(eventId: string, eventTitle = '2026 秋季合作伙伴大会'): Promise<void> {
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
    if (!this.state.forbidden) this.autoRefresh.start();
  }

  onShow(): void {
    if (!this.mounted || this.state.forbidden) return;
    this.autoRefresh.resume();
  }

  /** 页面隐藏：30 秒轮询立即停止，不再发请求 */
  onHide(): void {
    this.debouncer.cancel();
    this.autoRefresh.pause();
  }

  destroy(): void {
    this.mounted = false;
    this.debouncer.cancel();
    this.autoRefresh.stop();
    this.requestSeq += 1;
  }

  /** 切换筛选：重置分页并重新请求 */
  async setTab(tab: TabKey): Promise<void> {
    if (tab === this.state.tab) return;
    this.debouncer.cancel();
    this.patch({ tab, dialogVisible: false, dialogTarget: null, dialogError: '' });
    if (!this.state.eventId || this.state.forbidden) {
      this.patch({ rows: [], empty: true, emptyText: emptyText(tab, this.state.keyword) });
      return;
    }
    await this.load(1, 'replace');
  }

  /** 搜索框输入：300ms 防抖，连续输入只发最后一次请求 */
  onKeywordInput(value: string): void {
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
  async onSubmitSearch(): Promise<void> {
    if (this.debouncer.pending) {
      this.debouncer.flush();
      return;
    }
    if (this.state.keyword !== this.state.inputValue.trim()) {
      await this.applySearch(this.state.inputValue);
    }
  }

  /** 防抖结束后真正生效 */
  async applySearch(value: string): Promise<void> {
    const keyword = (value || '').trim();
    if (keyword === this.state.keyword) return;
    this.patch({ keyword, inputValue: value });
    if (!this.state.eventId || this.state.forbidden) return;
    await this.load(1, 'replace');
  }

  async clearKeyword(): Promise<void> {
    this.debouncer.cancel();
    this.patch({ inputValue: '' });
    await this.applySearch('');
  }

  /** 触底加载下一页 */
  async loadMore(): Promise<void> {
    if (this.state.forbidden || this.state.loading || this.state.loadingMore) return;
    if (!this.state.hasMore) return;
    await this.load(this.state.page + 1, 'merge');
  }

  /** 30 秒被动刷新：静默拉第一页并与已加载数据合并，不打断滚动 */
  private async silentRefresh(): Promise<void> {
    if (!this.mounted || this.state.forbidden || !this.state.eventId) return;
    if (this.state.loading) return;
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
      if (seq !== this.requestSeq) return;
      this.records = mergePage(this.records, res.items);
      const rows = this.buildRows();
      this.patch({
        rows,
        stats: res.stats,
        total: res.total,
        hasMore: rows.length < res.total,
        empty: rows.length === 0,
        emptyText: emptyText(this.state.tab, this.state.keyword),
        lastUpdated: res.serverTime,
        refreshing: false,
      });
    } catch (err) {
      this.patch({ refreshing: false });
      // 轮询失败不打扰用户，只在控制台留痕
      console.warn('[checkin-list] 自动刷新失败', errorMessage(err));
    }
  }

  private buildRows(): CheckinRow[] {
    return toRows(this.records.filter((r) => matchTab(r, this.state.tab)));
  }

  private async load(page: number, mode: 'replace' | 'merge'): Promise<void> {
    const seq = ++this.requestSeq;
    if (mode === 'merge') {
      this.patch({ loadingMore: true });
    } else {
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
      if (seq !== this.requestSeq) return; // 丢弃过期响应
      this.records = mode === 'merge' ? mergePage(this.records, res.items) : res.items.slice();
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
        emptyText: emptyText(this.state.tab, this.state.keyword),
        lastUpdated: res.serverTime,
      });
    } catch (err) {
      if (seq !== this.requestSeq) return;
      const status = (err as any) && (err as any).status;
      const code = (err as any) && (err as any).code;
      // 后端判定当前登录人不是工作人员：直接进入无权限态并停止轮询
      if (status === 403 || code === ERR_FORBIDDEN) {
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
        errorText: errorMessage(err),
        empty: this.state.rows.length === 0,
      });
    }
  }

  /** 打开补签弹窗 */
  openMakeup(id: string): void {
    const hit = this.state.rows.find((r) => r.id === id);
    if (!hit || hit.checkedIn) return;
    this.patch({ dialogVisible: true, dialogTarget: hit, dialogError: '' });
    // 弹窗期间暂停轮询，避免弹窗内容被后台刷新覆盖
    this.autoRefresh.pause();
  }

  closeMakeup(): void {
    this.patch({ dialogVisible: false, dialogTarget: null, dialogError: '', submitting: false });
    this.autoRefresh.resume();
  }

  /**
   * 提交手动补签。
   * 成功：该行立即变为已签到 + 顶部计数同步 +1，不重新拉整页；
   * 409：提示「该会员已签到」并只刷新该行。
   */
  async submitMakeup(draft: MakeupDraft): Promise<{ ok: boolean; message: string }> {
    const target = this.state.dialogTarget;
    if (!target) return { ok: false, message: '未选择补签对象' };
    if (this.state.submitting) return { ok: false, message: '正在提交' };

    const check = validateMakeupDraft(draft);
    if (!check.ok) {
      this.patch({ dialogError: check.message });
      return { ok: false, message: check.message };
    }

    this.patch({ submitting: true, dialogError: '' });
    try {
      const res: MakeupResult = await this.deps.api.makeup({
        eventId: this.state.eventId,
        recordId: target.id,
        reason: draft.reason as any,
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
    } catch (err) {
      if (isAlreadyChecked(err)) {
        this.patch({ submitting: false, dialogVisible: false, dialogTarget: null, toast: '该会员已签到' });
        this.autoRefresh.resume();
        await this.refreshRow(target.id);
        return { ok: false, message: ERR_ALREADY_CHECKED };
      }
      if (err && (err as any).code === ERR_FORBIDDEN) {
        this.patch({ submitting: false, dialogError: '无操作权限，请联系活动管理员' });
        return { ok: false, message: '无操作权限' };
      }
      const message = errorMessage(err, '补签失败，请稍后重试');
      this.patch({ submitting: false, dialogError: message });
      return { ok: false, message };
    }
  }

  /** 本地回填（不整页刷新）：行状态 + 顶部统计同时更新 */
  private applyLocalCheckin(record: CheckinRecord, serverStats?: EventStats): void {
    const before = this.records.find((r) => r.id === record.id);
    const wasChecked = !!(before && before.checkedIn);
    this.records = replaceRecord(this.records, { ...record, checkedIn: true });
    const rows = this.buildRows();
    const stats = serverStats || (wasChecked ? this.state.stats : statsAfterCheckin(this.state.stats));
    this.patch({
      rows,
      stats,
      total: this.state.total,
      empty: rows.length === 0,
      emptyText: emptyText(this.state.tab, this.state.keyword),
      hasMore: rows.length < this.state.total,
    });
  }

  /** 409 后仅刷新单行 */
  async refreshRow(id: string): Promise<void> {
    try {
      const fresh = await this.deps.api.getRecord(id);
      const before = this.records.find((r) => r.id === id);
      const wasChecked = !!(before && before.checkedIn);
      this.records = replaceRecord(this.records, fresh);
      const rows = this.buildRows();
      const stats = !wasChecked && fresh.checkedIn
        ? statsAfterCheckin(this.state.stats)
        : this.state.stats;
      this.patch({
        rows,
        stats,
        empty: rows.length === 0,
        hasMore: rows.length < this.state.total,
      });
    } catch (err) {
      this.patch({ errorText: errorMessage(err, '该行刷新失败，请下拉重试') });
    }
  }

  clearToast(): void {
    if (this.state.toast) this.patch({ toast: '' });
  }

  setToast(text: string): void {
    this.patch({ toast: text });
  }

  /** 下拉刷新 */
  async pullRefresh(): Promise<void> {
    if (this.state.forbidden) return;
    await this.load(1, 'replace');
  }

  /** 顶部统计（供测试断言，避免依赖 rows） */
  statsSnapshot(): EventStats {
    return { ...this.state.stats };
  }

  recordsSnapshot(): CheckinRecord[] {
    return this.records.map((r) => ({ ...r }));
  }

  /** 测试用：手动触发一次自动刷新（等价于等待 30s） */
  async forceAutoRefreshTick(): Promise<void> {
    await this.autoRefresh.tick();
  }

  static emptyStats(): EventStats {
    return buildStats(0, 0);
  }

  static applyCheckinLocally(
    records: CheckinRecord[],
    id: string,
    time: string,
  ): CheckinRecord[] {
    return applyCheckin(records, id, { checkinAt: time, checkinMethod: 'manual' }).records;
  }
}
