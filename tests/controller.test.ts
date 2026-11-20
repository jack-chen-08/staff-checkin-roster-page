import { CheckinListController } from '../miniprogram/logic/controller';
import { ApiError, CheckinApi, ERR_ALREADY_CHECKED, createMockApi } from '../miniprogram/logic/api';
import { MOCK_EVENT_ID } from '../miniprogram/mock/checkin-list';
import { CheckinRecord } from '../miniprogram/logic/checkin';

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

const buildController = (api: CheckinApi = createMockApi({ latency: 0 }), role = 'staff') =>
  new CheckinListController({ api, role });

describe('员工签到名单页控制器', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('进入页面加载第一页 30 条并显示应到/已到/签到率', async () => {
    const ctrl = buildController();
    await ctrl.mount(MOCK_EVENT_ID);
    const state = ctrl.snapshot();
    expect(state.forbidden).toBe(false);
    expect(state.rows).toHaveLength(30);
    expect(state.total).toBe(48);
    expect(state.hasMore).toBe(true);
    expect(state.stats).toEqual({ expected: 48, arrived: 25, rate: 52 });
    expect(state.rows[0]).toMatchObject({ name: '林一舟', ticketTail: '1187', methodText: '扫码' });
    // 未签到的行不展示签到时间与方式
    const uncheckedRow = state.rows.find((r) => r.id === 'r004')!;
    expect(uncheckedRow.timeText).toBe('');
    expect(uncheckedRow.methodText).toBe('');
    ctrl.destroy();
  });

  it('连续输入只触发一次请求（300ms 防抖）', async () => {
    const api = createMockApi({ latency: 0 });
    const spy = jest.spyOn(api, 'list');
    const ctrl = buildController(api);
    await ctrl.mount(MOCK_EVENT_ID);
    expect(spy).toHaveBeenCalledTimes(1);

    ctrl.onKeywordInput('云');
    ctrl.onKeywordInput('云启');
    ctrl.onKeywordInput('云启科');
    ctrl.onKeywordInput('云启科技');
    jest.advanceTimersByTime(299);
    await flush();
    expect(spy).toHaveBeenCalledTimes(1); // 防抖窗口内不发请求

    jest.advanceTimersByTime(2);
    await flush();
    expect(spy).toHaveBeenCalledTimes(2); // 只发一次
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '云启科技', page: 1, tab: 'all' }),
    );
    expect(ctrl.snapshot().rows.map((r) => r.name)).toEqual(['林一舟', '骆方舟', '霍云开']);
    ctrl.destroy();
  });

  it('搜索按票号后 4 位命中，切换筛选后按新条件重新拉取', async () => {
    const api = createMockApi({ latency: 0 });
    const spy = jest.spyOn(api, 'list');
    const ctrl = buildController(api);
    await ctrl.mount(MOCK_EVENT_ID);

    ctrl.onKeywordInput('3524');
    jest.advanceTimersByTime(300);
    await flush();
    expect(ctrl.snapshot().rows).toHaveLength(1);
    expect(ctrl.snapshot().rows[0].name).toBe('穆星野');

    await ctrl.clearKeyword();
    await ctrl.setTab('unchecked');
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ tab: 'unchecked', keyword: '', page: 1 }),
    );
    const state = ctrl.snapshot();
    expect(state.total).toBe(23);
    expect(state.rows.every((r) => !r.checkedIn)).toBe(true);
    // 每行仍不含任何联系方式字段
    expect(Object.keys(state.rows[0])).not.toContain('phone');
    ctrl.destroy();
  });

  it('触底加载第二页并去重合并', async () => {
    const ctrl = buildController();
    await ctrl.mount(MOCK_EVENT_ID);
    await ctrl.loadMore();
    const state = ctrl.snapshot();
    expect(state.rows).toHaveLength(48);
    expect(state.page).toBe(2);
    expect(state.hasMore).toBe(false);
    expect(new Set(state.rows.map((r) => r.id)).size).toBe(48);
    // 已无更多时再触底不会重复请求
    const before = state.rows.length;
    await ctrl.loadMore();
    expect(ctrl.snapshot().rows).toHaveLength(before);
    ctrl.destroy();
  });

  it('手动补签成功：该行状态与顶部计数同时更新，且不整页刷新', async () => {
    const api = createMockApi({ latency: 0 });
    const listSpy = jest.spyOn(api, 'list');
    const makeupSpy = jest.spyOn(api, 'makeup');
    const ctrl = buildController(api);
    await ctrl.mount(MOCK_EVENT_ID);
    expect(listSpy).toHaveBeenCalledTimes(1);

    const before = ctrl.statsSnapshot();
    ctrl.openMakeup('r004');
    expect(ctrl.snapshot().dialogVisible).toBe(true);
    expect(ctrl.snapshot().dialogTarget!.name).toBe('顾清和');

    const res = await ctrl.submitMakeup({ reason: 'no-phone', note: '' });
    const state = ctrl.snapshot();
    expect(res.ok).toBe(true);
    expect(makeupSpy).toHaveBeenCalledTimes(1);
    // 不整页刷新：list 请求次数没有增加
    expect(listSpy).toHaveBeenCalledTimes(1);
    // 行状态迁移
    const row = state.rows.find((r) => r.id === 'r004')!;
    expect(row.checkedIn).toBe(true);
    expect(row.methodText).toBe('手动');
    expect(row.methodKey).toBe('manual');
    expect(row.checkinAt).toMatch(/^\d{2}:\d{2}$/);
    // 顶部计数同步
    expect(state.stats.arrived).toBe(before.arrived + 1);
    expect(state.stats.rate).toBeGreaterThan(before.rate);
    // 弹窗关闭并提示
    expect(state.dialogVisible).toBe(false);
    expect(state.toast).toBe('补签成功');
    ctrl.destroy();
  });

  it('补签后停留在「未签到」筛选时该行立即移出列表，计数仍同步', async () => {
    const ctrl = buildController();
    await ctrl.mount(MOCK_EVENT_ID);
    await ctrl.setTab('unchecked');
    const before = ctrl.statsSnapshot();
    const beforeRows = ctrl.snapshot().rows.length;

    ctrl.openMakeup('r004');
    await ctrl.submitMakeup({ reason: 'device', note: '' });
    const state = ctrl.snapshot();
    expect(state.rows.find((r) => r.id === 'r004')).toBeUndefined();
    expect(state.rows).toHaveLength(beforeRows - 1);
    expect(state.stats.arrived).toBe(before.arrived + 1);
    ctrl.destroy();
  });

  it('选「其他」原因但未填说明时不能确认，也不会调用补签接口', async () => {
    const api = createMockApi({ latency: 0 });
    const makeupSpy = jest.spyOn(api, 'makeup');
    const ctrl = buildController(api);
    await ctrl.mount(MOCK_EVENT_ID);
    ctrl.openMakeup('r007');

    const res = await ctrl.submitMakeup({ reason: 'other', note: '   ' });
    const state = ctrl.snapshot();
    expect(res.ok).toBe(false);
    expect(res.message).toBe('选择「其他」时请填写补签说明');
    expect(makeupSpy).not.toHaveBeenCalled();
    expect(state.dialogVisible).toBe(true); // 弹窗保持打开，等待补充说明
    expect(state.dialogError).toBe('选择「其他」时请填写补签说明');
    expect(state.rows.find((r) => r.id === 'r007')!.checkedIn).toBe(false);

    // 补上说明后可正常提交
    const ok = await ctrl.submitMakeup({ reason: 'other', note: '闸机临时断电' });
    expect(ok.ok).toBe(true);
    expect(ctrl.snapshot().rows.find((r) => r.id === 'r007')!.checkedIn).toBe(true);
    ctrl.destroy();
  });

  it('补签返回 409：提示「该会员已签到」并刷新该行（不动整页）', async () => {
    const base = createMockApi({ latency: 0 });
    const listSpy = jest.fn();
    const getSpy = jest.fn(async (id: string): Promise<CheckinRecord> => {
      const rec = await base.getRecord(id);
      // 模拟另一台设备刚刚完成了签到
      return { ...rec, checkedIn: true, checkinAt: '10:08', checkinMethod: 'scan' };
    });
    const api: CheckinApi = {
      list: (q) => {
        listSpy(q);
        return base.list(q);
      },
      getRecord: getSpy,
      makeup: async () => {
        throw new ApiError(409, ERR_ALREADY_CHECKED, '该会员已签到');
      },
    };
    const ctrl = buildController(api);
    await ctrl.mount(MOCK_EVENT_ID);
    expect(listSpy).toHaveBeenCalledTimes(1);
    const before = ctrl.statsSnapshot();

    ctrl.openMakeup('r010');
    const res = await ctrl.submitMakeup({ reason: 'no-phone', note: '' });
    const state = ctrl.snapshot();

    expect(res.ok).toBe(false);
    expect(state.toast).toBe('该会员已签到');
    expect(state.dialogVisible).toBe(false);
    // 只刷新了这一行
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith('r010');
    expect(listSpy).toHaveBeenCalledTimes(1);
    const row = state.rows.find((r) => r.id === 'r010')!;
    expect(row.checkedIn).toBe(true);
    expect(row.methodText).toBe('扫码');
    expect(state.stats.arrived).toBe(before.arrived + 1);
    ctrl.destroy();
  });

  it('每 30 秒自动刷新一次，页面隐藏后停止，重新显示后恢复', async () => {
    const api = createMockApi({ latency: 0 });
    const spy = jest.spyOn(api, 'list');
    const ctrl = buildController(api);
    await ctrl.mount(MOCK_EVENT_ID);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ctrl.isAutoRefreshing).toBe(true);

    jest.advanceTimersByTime(30000);
    await flush();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(ctrl.snapshot().refreshing).toBe(false);

    // 页面隐藏（如切到扫码页）：暂停
    ctrl.onHide();
    expect(ctrl.isAutoRefreshing).toBe(false);
    jest.advanceTimersByTime(90000);
    await flush();
    expect(spy).toHaveBeenCalledTimes(2); // 没有新的刷新请求

    // 回到页面：恢复
    ctrl.onShow();
    expect(ctrl.isAutoRefreshing).toBe(true);
    jest.advanceTimersByTime(30000);
    await flush();
    expect(spy).toHaveBeenCalledTimes(3);
    ctrl.destroy();
  });

  it('非员工账号打开页面显示无权限且不发起任何请求', async () => {
    const api = createMockApi({ latency: 0 });
    const spy = jest.spyOn(api, 'list');
    const ctrl = buildController(api, 'member');
    await ctrl.mount(MOCK_EVENT_ID);
    const state = ctrl.snapshot();
    expect(state.forbidden).toBe(true);
    expect(state.rows).toHaveLength(0);
    expect(state.loading).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(ctrl.isAutoRefreshing).toBe(false);
    // 隐藏/显示不会误启动轮询
    ctrl.onShow();
    jest.advanceTimersByTime(60000);
    await flush();
    expect(spy).not.toHaveBeenCalled();
    ctrl.destroy();
  });

  it('接口返回 403 时同样进入无权限态，并停止后续轮询', async () => {
    const base = createMockApi({ latency: 0 });
    const api: CheckinApi = {
      list: async () => {
        throw new ApiError(403, 'FORBIDDEN', '无访问权限');
      },
      getRecord: (id) => base.getRecord(id),
      makeup: (payload) => base.makeup(payload),
    };
    const ctrl = buildController(api);
    await ctrl.mount(MOCK_EVENT_ID);
    const state = ctrl.snapshot();
    expect(state.forbidden).toBe(true);
    expect(state.rows).toHaveLength(0);
    expect(state.loading).toBe(false);
    expect(state.errorText).toBe('');
    expect(ctrl.isAutoRefreshing).toBe(false);

    // 无权限态下 onShow 不会误启动轮询
    ctrl.onShow();
    jest.advanceTimersByTime(60000);
    await flush();
    expect(ctrl.isAutoRefreshing).toBe(false);
    ctrl.destroy();
  });

  it('缺少 event_id 时给出可恢复的提示，不进入无权限态', async () => {
    const ctrl = buildController();
    await ctrl.mount('');
    const state = ctrl.snapshot();
    expect(state.forbidden).toBe(false);
    expect(state.errorText).toBe('缺少活动参数，请从扫码页重新进入');
    ctrl.destroy();
  });
});
