import { CheckinMethod, CheckinRecord, MakeupReason } from '../logic/checkin';

/**
 * 虚构签到名单数据（48 条，覆盖 2 页）。
 * 全部为虚构姓名与企业名，不含任何手机号 / 邮箱 / 客户信息，仅用于联调与验收演示。
 * 字段与真实接口 /api/staff/checkin/list 的 items 保持一致（见 README「mock 对接点」）。
 */
type Seed = [
  id: string,
  name: string,
  company: string,
  ticketNo: string,
  checkedIn: boolean,
  time: string | null,
  method: CheckinMethod | null,
  reason?: MakeupReason,
  note?: string,
];

const SEED: Seed[] = [
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

export const MOCK_EVENT_ID = 'EVT-2026-1121';

export const MOCK_EVENT = {
  id: MOCK_EVENT_ID,
  title: '2026 秋季合作伙伴大会',
  date: '2026-11-21',
};

/** 每次调用返回新的深拷贝，避免 mock 状态被外部改写 */
export function createMockRecords(): CheckinRecord[] {
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
export const MOCK_RECORDS: CheckinRecord[] = createMockRecords();
