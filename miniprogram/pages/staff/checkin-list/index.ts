import { CheckinListController, ControllerState } from '../../../logic/controller';
import { createMockApi } from '../../../logic/api';
import { MAKEUP_REASONS, TAB_LABELS } from '../../../logic/checkin';
import { MOCK_EVENT } from '../../../mock/checkin-list';

/**
 * mock 接口实例：真实环境请替换为 wx.request 封装（见 README「mock 接口对接点」）。
 * latency 用于模拟网络往返，方便观察 loading 态。
 */
const api = createMockApi({ latency: 260 });

const INITIAL_DATA: ControllerState & Record<string, any> = {
  eventId: '',
  eventTitle: MOCK_EVENT.title,
  tab: 'all',
  inputValue: '',
  keyword: '',
  rows: [],
  stats: { expected: 0, arrived: 0, rate: 0 },
  total: 0,
  page: 0,
  hasMore: false,
  loading: true,
  loadingMore: false,
  refreshing: false,
  forbidden: false,
  empty: false,
  emptyText: '',
  errorText: '',
  toast: '',
  lastUpdated: '',
  dialogVisible: false,
  dialogTarget: null,
  dialogError: '',
  submitting: false,
  // 视图辅助字段
  tabs: TAB_LABELS,
  reasons: MAKEUP_REASONS,
  eventDate: MOCK_EVENT.date,
};

Page({
  data: { ...INITIAL_DATA },

  /** @type {CheckinListController | null} */
  ctrl: null as CheckinListController | null,
  toastTimer: 0 as any,

  onLoad(query: Record<string, string>) {
    const role = this.readRole();
    const eventId = (query && query.event_id) || '';
    const ctrl = new CheckinListController({
      api,
      role,
      onChange: (state: ControllerState) => {
        this.setData(state, () => this.flushToast(state.toast));
      },
    });
    this.ctrl = ctrl;

    ctrl.mount(eventId, MOCK_EVENT.title).then(() => {
      const tab = (query && query.tab) as any;
      if (tab && ['all', 'checked', 'unchecked'].includes(tab)) {
        ctrl.setTab(tab);
      }
    });
  },

  /** 角色来源：登录态 -> 本地缓存 -> 默认员工（演示） */
  readRole(): string {
    let role = 'staff';
    try {
      const app = getApp<any>();
      role = (app && app.globalData && app.globalData.role) || wx.getStorageSync('demoUserRole') || 'staff';
    } catch (err) {
      role = 'staff';
    }
    return role;
  },

  flushToast(text: string) {
    if (!text) return;
    const toast = this.selectComponent('#t-toast');
    if (toast && typeof toast.show === 'function') {
      toast.show({
        message: text,
        theme: text === '补签成功' ? 'success' : 'warning',
        duration: 1800,
      });
    } else {
      wx.showToast({ title: text, icon: 'none' });
    }
    if (this.ctrl) this.ctrl.clearToast();
  },

  onTabChange(e: any) {
    const value = (e && e.detail && (e.detail.value || (e.detail.item && e.detail.item.value))) || 'all';
    if (this.ctrl) void this.ctrl.setTab(value);
  },

  onSearchChange(e: any) {
    const value = e && e.detail ? e.detail.value : '';
    if (this.ctrl) this.ctrl.onKeywordInput(value);
  },

  onSearchSubmit(e: any) {
    const value = e && e.detail ? e.detail.value : '';
    if (!this.ctrl) return;
    this.ctrl.onKeywordInput(value);
    void this.ctrl.onSubmitSearch();
  },

  onSearchClear() {
    if (this.ctrl) void this.ctrl.clearKeyword();
  },

  onMakeupTap(e: any) {
    const id = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : '';
    if (this.ctrl && id) this.ctrl.openMakeup(id);
  },

  onDialogCancel() {
    if (this.ctrl) this.ctrl.closeMakeup();
  },

  onDialogConfirm(e: any) {
    const detail = (e && e.detail) || {};
    if (this.ctrl) void this.ctrl.submitMakeup({ reason: detail.reason || null, note: detail.note || '' });
  },

  onRetry() {
    if (this.ctrl) void this.ctrl.pullRefresh();
  },

  onBackHome() {
    wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: '/pages/staff/scan/index' }) });
  },

  onReachBottom() {
    if (this.ctrl) void this.ctrl.loadMore();
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh();
    if (!this.ctrl) {
      done();
      return;
    }
    this.ctrl.pullRefresh().then(done).catch(done);
  },

  onShow() {
    if (this.ctrl) this.ctrl.onShow();
  },

  /** 页面隐藏（跳转扫码页 / 切后台）：30 秒轮询暂停 */
  onHide() {
    if (this.ctrl) this.ctrl.onHide();
  },

  onUnload() {
    if (this.ctrl) {
      this.ctrl.destroy();
      this.ctrl = null;
    }
    if (this.toastTimer) clearTimeout(this.toastTimer);
  },
});
