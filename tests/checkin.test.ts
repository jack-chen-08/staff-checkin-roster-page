import {
  applyCheckin,
  buildStats,
  computeRate,
  emptyText,
  filterRecords,
  hasMorePages,
  matchKeyword,
  mergePage,
  replaceRecord,
  slicePage,
  statsAfterCheckin,
  ticketTail,
  toRow,
  validateMakeupDraft,
} from '../miniprogram/logic/checkin';
import { MOCK_RECORDS, createMockRecords } from '../miniprogram/mock/checkin-list';

describe('签到名单纯逻辑', () => {
  it('票号后 4 位：兼容空格/连字符/大小写', () => {
    expect(ticketTail('E26-1187')).toBe('1187');
    expect(ticketTail('e26 3524')).toBe('3524');
    expect(ticketTail('')).toBe('');
  });

  it('搜索命中姓名 / 企业 / 票号后 4 位', () => {
    const records = createMockRecords();
    const byName = records.filter((r) => matchKeyword(r, '林一舟'));
    const byCompany = records.filter((r) => matchKeyword(r, '云启科技'));
    const byTail = records.filter((r) => matchKeyword(r, '3524'));
    expect(byName).toHaveLength(1);
    expect(byName[0].id).toBe('r001');
    expect(byCompany.map((r) => r.name)).toEqual(['林一舟', '骆方舟', '霍云开']);
    expect(byTail.map((r) => r.name)).toEqual(['穆星野']);
    // 不支持用姓名之外的联系方式搜索：模型里也没有该字段
    expect(matchKeyword(records[0], '   ')).toBe(true);
  });

  it('三段筛选：全部 / 已签到 / 未签到 数量互补', () => {
    const records = createMockRecords();
    const all = filterRecords(records, 'all', '');
    const checked = filterRecords(records, 'checked', '');
    const unchecked = filterRecords(records, 'unchecked', '');
    expect(all).toHaveLength(48);
    expect(checked).toHaveLength(25);
    expect(unchecked).toHaveLength(23);
    expect(checked.every((r) => r.checkedIn)).toBe(true);
    expect(unchecked.every((r) => !r.checkedIn)).toBe(true);
  });

  it('分页合并：按 id 去重且后到数据覆盖旧数据', () => {
    const page1 = MOCK_RECORDS.slice(0, 30);
    const page2 = MOCK_RECORDS.slice(30, 48);
    const dup = { ...page1[0], company: '云启科技（已更新）' };
    const merged = mergePage(page1, [...page2, dup]);
    expect(merged).toHaveLength(48);
    expect(new Set(merged.map((r) => r.id)).size).toBe(48);
    expect(merged[0].company).toBe('云启科技（已更新）');
    expect(merged[0].id).toBe(page1[0].id);
  });

  it('分页切片与 hasMore 计算', () => {
    const list = new Array(48).fill(0).map((_, i) => i);
    expect(slicePage(list, 1, 30)).toHaveLength(30);
    expect(slicePage(list, 2, 30)).toEqual(list.slice(30));
    expect(hasMorePages(48, 1, 30)).toBe(true);
    expect(hasMorePages(48, 2, 30)).toBe(false);
  });

  it('签到率四舍五入并夹在 0-100', () => {
    expect(computeRate(25, 48)).toBe(52);
    expect(computeRate(0, 0)).toBe(0);
    expect(computeRate(60, 48)).toBe(100);
    expect(buildStats(48, 25)).toEqual({ expected: 48, arrived: 25, rate: 52 });
    expect(statsAfterCheckin({ expected: 48, arrived: 25, rate: 52 })).toEqual({
      expected: 48,
      arrived: 26,
      rate: 54,
    });
  });

  it('行状态迁移：未签到 -> 已签到，重复迁移不再记变更', () => {
    const records = createMockRecords();
    const first = applyCheckin(records, 'r004', {
      checkinAt: '10:02',
      checkinMethod: 'manual',
      makeupReason: 'no-phone',
      makeupNote: null,
    });
    expect(first.changed).toBe(true);
    expect(first.record).toMatchObject({
      id: 'r004',
      checkedIn: true,
      checkinAt: '10:02',
      checkinMethod: 'manual',
      makeupReason: 'no-phone',
    });
    // 原数组未被修改（不可变更新）
    expect(records.find((r) => r.id === 'r004')!.checkedIn).toBe(false);
    const row = toRow(first.record!);
    expect(row.ticketTail).toBe('4489');
    expect(row.methodText).toBe('手动');
    expect(row.statusText).toBe('已签到');
  });

  it('单行替换：命中才替换，未命中返回原数组引用', () => {
    const records = createMockRecords();
    const target = { ...records[0], company: '新企业名' };
    const next = replaceRecord(records, target);
    expect(next[0].company).toBe('新企业名');
    const untouched = replaceRecord(records, { ...records[0], id: 'not-exist' });
    expect(untouched).toBe(records);
  });

  it('选「其他」原因未填写说明时校验不通过', () => {
    expect(validateMakeupDraft({ reason: null, note: '' })).toEqual({
      ok: false,
      message: '请选择补签原因',
      note: '',
    });
    const other = validateMakeupDraft({ reason: 'other', note: '   ' });
    expect(other.ok).toBe(false);
    expect(other.message).toBe('选择「其他」时请填写补签说明');
    expect(validateMakeupDraft({ reason: 'other', note: '闸机断电' }).ok).toBe(true);
    // 非「其他」原因说明可留空
    expect(validateMakeupDraft({ reason: 'device', note: '' }).ok).toBe(true);
    expect(validateMakeupDraft({ reason: 'other', note: '啊'.repeat(101) }).ok).toBe(false);
  });

  it('列表数据不含任何联系方式字段（脱敏）', () => {
    const banned = ['phone', 'mobile', 'tel', 'email', 'contact', 'wechat'];
    for (const record of MOCK_RECORDS) {
      for (const key of Object.keys(record)) {
        expect(banned).not.toContain(key.toLowerCase());
      }
    }
    const serialized = JSON.stringify(MOCK_RECORDS);
    expect(serialized).not.toMatch(/\d{11}/); // 无 11 位手机号
    expect(serialized).not.toMatch(/@[\w-]+\.(com|cn|net)/); // 无邮箱
  });

  it('空状态文案区分搜索无结果与筛选为空', () => {
    expect(emptyText('all', '不存在的人')).toBe('没有找到匹配的会员');
    expect(emptyText('unchecked', '')).toBe('全部会员均已签到');
    expect(emptyText('checked', '')).toBe('还没有会员签到');
  });
});
