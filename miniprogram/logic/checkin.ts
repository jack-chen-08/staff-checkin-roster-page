/**
 * 员工签到名单 —— 纯逻辑模块（不依赖 wx / 不依赖运行时）
 * 负责：行视图模型派生、关键词匹配、筛选、分页合并、考勤统计、补签参数校验、行状态迁移。
 */

export type TabKey = 'all' | 'checked' | 'unchecked';

/** 签到方式：扫码入场 / 员工手动补签 */
export type CheckinMethod = 'scan' | 'manual';

/** 手动补签原因：未带手机 / 设备故障 / 其他 */
export type MakeupReason = 'no-phone' | 'device' | 'other';

/**
 * 签到记录数据模型。
 * 注意：按需求「列表不展示任何联系方式」，模型里刻意不存在 phone / mobile / email 字段。
 */
export interface CheckinRecord {
  id: string;
  /** 姓名 */
  name: string;
  /** 企业名称 */
  company: string;
  /** 票号全号，列表只展示后 4 位 */
  ticketNo: string;
  /** 是否已签到 */
  checkedIn: boolean;
  /** 签到时间，格式 HH:mm；未签到时为 null */
  checkinAt: string | null;
  /** 签到方式；未签到时为 null */
  checkinMethod: CheckinMethod | null;
  /** 手动补签原因（仅手动补签的记录有值） */
  makeupReason?: MakeupReason | null;
  /** 手动补签「其他」原因的说明 */
  makeupNote?: string | null;
}

/** 列表行视图模型 */
export interface CheckinRow extends CheckinRecord {
  ticketTail: string;
  avatarText: string;
  timeText: string;
  methodText: string;
  methodKey: 'scan' | 'manual' | 'none';
  statusText: string;
}

export interface EventStats {
  /** 应到人数 */
  expected: number;
  /** 已到人数 */
  arrived: number;
  /** 签到率，0-100 的整数 */
  rate: number;
}

export const PAGE_SIZE = 30;
export const SEARCH_DEBOUNCE_MS = 300;

export const TAB_LABELS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'checked', label: '已签到' },
  { key: 'unchecked', label: '未签到' },
];

export const MAKEUP_REASONS: Array<{ key: MakeupReason; label: string }> = [
  { key: 'no-phone', label: '未带手机' },
  { key: 'device', label: '设备故障' },
  { key: 'other', label: '其他' },
];

const METHOD_TEXT: Record<CheckinMethod, string> = {
  scan: '扫码',
  manual: '手动',
};

const REASON_TEXT: Record<MakeupReason, string> = {
  'no-phone': '未带手机',
  device: '设备故障',
  other: '其他',
};

/** 取票号后 4 位，去掉空格与连字符干扰，统一大写 */
export function ticketTail(ticketNo: string, len = 4): string {
  if (!ticketNo) return '';
  const cleaned = String(ticketNo).replace(/[\s-]/g, '').toUpperCase();
  return cleaned.slice(-len);
}

export function avatarText(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  return trimmed.slice(-2);
}

export function formatTime(raw: string | null): string {
  if (!raw) return '';
  const text = String(raw).trim();
  // 兼容后端返回 "2026-11-21 09:12:30" / "09:12" 两种形态，列表只显示时分
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function toRow(record: CheckinRecord): CheckinRow {
  const methodKey: CheckinRow['methodKey'] = record.checkedIn
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

export function toRows(records: CheckinRecord[]): CheckinRow[] {
  return records.map(toRow);
}

/** 关键词匹配：姓名、企业、票号后 4 位；空关键词视为全匹配 */
export function matchKeyword(record: CheckinRecord, keyword: string): boolean {
  const k = (keyword || '').trim().toLowerCase();
  if (!k) return true;
  if ((record.name || '').toLowerCase().includes(k)) return true;
  if ((record.company || '').toLowerCase().includes(k)) return true;
  const tail = ticketTail(record.ticketNo).toLowerCase();
  if (tail && tail.includes(k)) return true;
  return false;
}

export function matchTab(record: CheckinRecord, tab: TabKey): boolean {
  if (tab === 'checked') return record.checkedIn;
  if (tab === 'unchecked') return !record.checkedIn;
  return true;
}

/** 内存侧筛选（用于本地兜底与测试），顺序与入参一致 */
export function filterRecords(
  records: CheckinRecord[],
  tab: TabKey,
  keyword: string,
): CheckinRecord[] {
  return records.filter((r) => matchTab(r, tab) && matchKeyword(r, keyword));
}

export function computeRate(arrived: number, expected: number): number {
  if (!expected || expected <= 0) return 0;
  const value = (arrived / expected) * 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildStats(expected: number, arrived: number): EventStats {
  const safeExpected = Math.max(0, Math.floor(expected || 0));
  const safeArrived = Math.max(0, Math.min(safeExpected, Math.floor(arrived || 0)));
  return {
    expected: safeExpected,
    arrived: safeArrived,
    rate: computeRate(safeArrived, safeExpected),
  };
}

/** 已签到人数 +1 并重算签到率（补签成功后本地即时更新顶部卡片） */
export function statsAfterCheckin(stats: EventStats): EventStats {
  return buildStats(stats.expected, stats.arrived + 1);
}

/** 分页切片，page 从 1 开始 */
export function slicePage<T>(list: T[], page: number, size: number = PAGE_SIZE): T[] {
  const p = Math.max(1, Math.floor(page || 1));
  const s = Math.max(1, Math.floor(size || PAGE_SIZE));
  const start = (p - 1) * s;
  return list.slice(start, start + s);
}

/** 判断是否还有下一页 */
export function hasMorePages(total: number, page: number, size: number = PAGE_SIZE): boolean {
  const loaded = Math.max(0, Math.floor(page || 0)) * Math.max(1, size);
  return loaded < Math.max(0, total);
}

/**
 * 合并分页数据：按 id 去重，后到的同 id 记录覆盖旧记录，保持首次出现顺序。
 * 用于「触底加载」与「自动刷新」时避免重复行。
 */
export function mergePage(
  existing: CheckinRecord[],
  incoming: CheckinRecord[],
): CheckinRecord[] {
  const index = new Map<string, number>();
  const merged: CheckinRecord[] = [];
  for (const item of existing) {
    if (!item || !item.id) continue;
    if (index.has(item.id)) {
      merged[index.get(item.id) as number] = item;
      continue;
    }
    index.set(item.id, merged.length);
    merged.push(item);
  }
  for (const item of incoming) {
    if (!item || !item.id) continue;
    const at = index.get(item.id);
    if (typeof at === 'number') {
      merged[at] = item;
    } else {
      index.set(item.id, merged.length);
      merged.push(item);
    }
  }
  return merged;
}

export interface CheckinPatch {
  checkinAt: string;
  checkinMethod: CheckinMethod;
  makeupReason?: MakeupReason | null;
  makeupNote?: string | null;
}

/**
 * 行状态迁移：未签到 -> 已签到。
 * 返回新数组（不可变更新），并给出是否真正发生了变更与变更后的记录。
 */
export function applyCheckin(
  records: CheckinRecord[],
  id: string,
  patch: CheckinPatch,
): { records: CheckinRecord[]; record: CheckinRecord | null; changed: boolean } {
  let changed = false;
  let hit: CheckinRecord | null = null;
  const next = records.map((item) => {
    if (item.id !== id) return item;
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
export function replaceRecord(
  records: CheckinRecord[],
  record: CheckinRecord,
): CheckinRecord[] {
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

export interface MakeupDraft {
  reason: MakeupReason | null;
  note: string;
}

export interface ValidateResult {
  ok: boolean;
  message: string;
  /** 归一化后的说明，选「其他」时必填 */
  note: string;
}

/**
 * 补签弹窗校验：
 * 1) 必须选择原因；
 * 2) 选择「其他」时必须填写说明（去掉首尾空格后非空）。
 */
export function validateMakeupDraft(draft: MakeupDraft): ValidateResult {
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

export function reasonLabel(reason: MakeupReason | null | undefined): string {
  if (!reason) return '';
  return REASON_TEXT[reason] || '';
}

/** 空状态文案：区分「无数据」与「搜索无结果」 */
export function emptyText(tab: TabKey, keyword: string): string {
  if ((keyword || '').trim()) return '没有找到匹配的会员';
  if (tab === 'checked') return '还没有会员签到';
  if (tab === 'unchecked') return '全部会员均已签到';
  return '暂无签到数据';
}
