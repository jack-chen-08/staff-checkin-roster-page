import { MAKEUP_REASONS, MakeupReason, validateMakeupDraft } from '../../logic/checkin';

/**
 * 手动补签弹窗。
 * 校验规则与页面共用 logic/checkin.ts 的 validateMakeupDraft，避免两处规则不一致。
 * 选「其他」但未填写说明时，本地拦截、不触发 confirm。
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    /** 当前操作对象：{ id, name, company, ticketTail } */
    target: { type: Object, value: null },
    submitting: { type: Boolean, value: false },
    /** 服务端返回的错误文案（如无操作权限） */
    errorText: { type: String, value: '' },
  },

  data: {
    reasons: MAKEUP_REASONS,
    reason: '',
    note: '',
    localError: '',
  },

  observers: {
    visible(next: boolean) {
      if (next) {
        // 每次打开都重置为干净状态
        this.setData({ reason: '', note: '', localError: '' });
      }
    },
  },

  methods: {
    onReasonChange(e: any) {
      const reason = (e && e.detail && e.detail.value) || '';
      this.setData({ reason, localError: '' });
    },

    onNoteInput(e: any) {
      const note = (e && e.detail && e.detail.value) || '';
      this.setData({ note, localError: '' });
    },

    onCancel() {
      if (this.data.submitting) return;
      this.triggerEvent('cancel');
    },

    onConfirm() {
      if (this.data.submitting) return;
      const draft = {
        reason: (this.data.reason || null) as MakeupReason | null,
        note: this.data.note || '',
      };
      const result = validateMakeupDraft(draft);
      if (!result.ok) {
        this.setData({ localError: result.message });
        return;
      }
      this.triggerEvent('confirm', { reason: draft.reason, note: result.note });
    },
  },
});
