import {
  ApiError,
  ERR_NOTE_REQUIRED,
  createMockApi,
  errorMessage,
  isAlreadyChecked,
} from '../miniprogram/logic/api';
import { MOCK_EVENT_ID } from '../miniprogram/mock/checkin-list';

describe('mock 接口层', () => {
  it('按 tab 与关键词分页返回，hasMore 正确', async () => {
    const api = createMockApi({ latency: 0 });
    const p1 = await api.list({ eventId: MOCK_EVENT_ID, tab: 'all', keyword: '', page: 1 });
    const p2 = await api.list({ eventId: MOCK_EVENT_ID, tab: 'all', keyword: '', page: 2 });
    expect(p1.items).toHaveLength(30);
    expect(p1.total).toBe(48);
    expect(p1.hasMore).toBe(true);
    expect(p2.items).toHaveLength(18);
    expect(p2.hasMore).toBe(false);
    expect(p1.stats).toEqual({ expected: 48, arrived: 25, rate: 52 });

    const checked = await api.list({ eventId: MOCK_EVENT_ID, tab: 'checked', keyword: '', page: 1 });
    expect(checked.total).toBe(25);
    const searched = await api.list({
      eventId: MOCK_EVENT_ID,
      tab: 'all',
      keyword: '云启',
      page: 1,
    });
    expect(searched.total).toBe(3);
  });

  it('补签成功后服务端状态持久化，再次补签返回 409', async () => {
    const api = createMockApi({ latency: 0 });
    const res = await api.makeup({
      eventId: MOCK_EVENT_ID,
      recordId: 'r004',
      reason: 'no-phone',
      operatorId: 'S-1024',
    });
    expect(res.record.checkedIn).toBe(true);
    expect(res.record.checkinMethod).toBe('manual');
    expect(res.stats.arrived).toBe(26);

    const fresh = await api.list({ eventId: MOCK_EVENT_ID, tab: 'all', keyword: '顾清和', page: 1 });
    expect(fresh.items[0].checkedIn).toBe(true);

    await expect(
      api.makeup({ eventId: MOCK_EVENT_ID, recordId: 'r004', reason: 'device' }),
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_CHECKED' });
  });

  it('「其他」原因缺少说明时接口层同样拒绝（400）', async () => {
    const api = createMockApi({ latency: 0 });
    try {
      await api.makeup({ eventId: MOCK_EVENT_ID, recordId: 'r007', reason: 'other', note: '  ' });
      throw new Error('should not reach');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).code).toBe(ERR_NOTE_REQUIRED);
    }
  });

  it('不存在的记录返回 404，错误文案可直接展示', async () => {
    const api = createMockApi({ latency: 0 });
    await expect(api.getRecord('nope')).rejects.toMatchObject({ status: 404 });
    const err = new ApiError(404, 'NOT_FOUND', '签到记录不存在');
    expect(errorMessage(err)).toBe('签到记录不存在');
    expect(errorMessage(new Error('timeout'))).toBe('timeout');
    expect(errorMessage(null)).toBe('网络异常，请稍后重试');
    expect(isAlreadyChecked(err)).toBe(false);
    expect(isAlreadyChecked(new ApiError(409, 'ALREADY_CHECKED', '该会员已签到'))).toBe(true);
  });
});
