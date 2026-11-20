import {
  CheckinRecord,
  EventStats,
  MakeupReason,
  PAGE_SIZE,
  TabKey,
  buildStats,
  filterRecords,
  matchKeyword,
  matchTab,
  slicePage,
} from './checkin';
import { MOCK_EVENT_ID, createMockRecords } from '../mock/checkin-list';

/**
 * 接口层（当前为 mock 实现）。
 * 真实环境只需把 createMockApi 换成 wx.request 封装，其余调用方不用改：
 *   GET  /api/staff/checkin/list?event_id=&tab=&keyword=&page=&page_size=
 *   GET  /api/staff/checkin/detail?id=
 *   POST /api/staff/checkin/makeup  { event_id, record_id, reason, note }
 */

export interface ListQuery {
  eventId: string;
  tab: TabKey;
  keyword: string;
  page: number;
  pageSize?: number;
}

export interface ListResult {
  items: CheckinRecord[];
  /** 当前筛选条件下的总条数 */
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  stats: EventStats;
  /** 服务端返回的服务器时间，用于「最近更新」展示 */
  serverTime: string;
}

export interface MakeupPayload {
  eventId: string;
  recordId: string;
  reason: MakeupReason;
  note?: string;
  /** 员工操作人标识（工号，非个人信息） */
  operatorId?: string;
}

export interface MakeupResult {
  record: CheckinRecord;
  stats: EventStats;
}

export interface CheckinApi {
  list(query: ListQuery): Promise<ListResult>;
  getRecord(id: string): Promise<CheckinRecord>;
  makeup(payload: MakeupPayload): Promise<MakeupResult>;
}

/** 业务错误：code 用于区分 409 / 400 / 403 等分支 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const ERR_ALREADY_CHECKED = 'ALREADY_CHECKED';
export const ERR_NOTE_REQUIRED = 'MAKEUP_NOTE_REQUIRED';
export const ERR_FORBIDDEN = 'FORBIDDEN';
export const ERR_NOT_FOUND = 'NOT_FOUND';

export interface MockApiOptions {
  latency?: number;
  records?: CheckinRecord[];
  /** 强制下一次补签返回指定状态码，用于联调 409 分支 */
  forceMakeupStatus?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function nowTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 创建 mock 接口实现。
 * 内部维护一份可变的数据副本，模拟服务端「补签后状态持久化」的行为。
 */
export function createMockApi(options: MockApiOptions = {}): CheckinApi {
  const latency = Math.max(0, options.latency ?? 180);
  let store: CheckinRecord[] = (options.records || createMockRecords()).map((r) => ({ ...r }));

  const statsOf = (): EventStats => {
    const expected = store.length;
    const arrived = store.filter((r) => r.checkedIn).length;
    return buildStats(expected, arrived);
  };

  const wait = async () => {
    if (latency > 0) await sleep(latency);
  };

  return {
    async list(query) {
      await wait();
      const page = Math.max(1, Math.floor(query.page || 1));
      const pageSize = Math.max(1, Math.floor(query.pageSize || PAGE_SIZE));
      const keyword = (query.keyword || '').trim();
      // 服务端筛选：先按 tab，再按关键词（姓名 / 企业 / 票号后 4 位）
      const filtered = store.filter(
        (r) => matchTab(r, query.tab) && matchKeyword(r, keyword),
      );
      const items = slicePage(filtered, page, pageSize);
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
      if (!hit) throw new ApiError(404, ERR_NOT_FOUND, '签到记录不存在');
      return { ...hit };
    },

    async makeup(payload) {
      await wait();
      if (options.forceMakeupStatus === 409) {
        throw new ApiError(409, ERR_ALREADY_CHECKED, '该会员已签到');
      }
      if (options.forceMakeupStatus === 403) {
        throw new ApiError(403, ERR_FORBIDDEN, '无操作权限');
      }
      const note = (payload.note || '').trim();
      if (payload.reason === 'other' && !note) {
        throw new ApiError(400, ERR_NOTE_REQUIRED, '请填写补签说明');
      }
      const hit = store.find((r) => r.id === payload.recordId);
      if (!hit) throw new ApiError(404, ERR_NOT_FOUND, '签到记录不存在');
      if (hit.checkedIn) {
        throw new ApiError(409, ERR_ALREADY_CHECKED, '该会员已签到');
      }
      const updated: CheckinRecord = {
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
export function isAlreadyChecked(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}

/** 统一提取错误文案，页面直接展示 */
export function errorMessage(err: unknown, fallback = '网络异常，请稍后重试'): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export { MOCK_EVENT_ID };
