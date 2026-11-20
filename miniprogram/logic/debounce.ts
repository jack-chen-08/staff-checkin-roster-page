/**
 * 通用防抖器：定时器可注入，便于单元测试用假定时器验证「连续输入只触发一次」。
 */

export interface DebounceTimers {
  setTimeout: (fn: () => void, ms: number) => any;
  clearTimeout: (handle: any) => void;
}

const REAL_TIMERS: DebounceTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms) as any,
  clearTimeout: (handle) => clearTimeout(handle),
};

export class Debouncer<A extends any[]> {
  private handle: any = null;
  private pendingArgs: A | null = null;

  constructor(
    private readonly fn: (...args: A) => void,
    private readonly wait: number = 300,
    private readonly timers: DebounceTimers = REAL_TIMERS,
  ) {}

  /** 重新计时；只有最后一次调用会在 wait 毫秒后真正执行 */
  schedule(...args: A): void {
    this.pendingArgs = args;
    if (this.handle !== null) {
      this.timers.clearTimeout(this.handle);
    }
    this.handle = this.timers.setTimeout(() => {
      this.handle = null;
      const args2 = this.pendingArgs;
      this.pendingArgs = null;
      if (args2) this.fn(...args2);
    }, this.wait);
  }

  /** 是否有等待中的调用 */
  get pending(): boolean {
    return this.handle !== null;
  }

  /** 取消等待中的调用（页面卸载 / 切换筛选时使用） */
  cancel(): void {
    if (this.handle !== null) {
      this.timers.clearTimeout(this.handle);
      this.handle = null;
    }
    this.pendingArgs = null;
  }

  /** 立即执行等待中的调用（点「搜索」按钮时使用） */
  flush(): void {
    if (this.handle === null) return;
    this.timers.clearTimeout(this.handle);
    this.handle = null;
    const args = this.pendingArgs;
    this.pendingArgs = null;
    if (args) this.fn(...args);
  }
}
