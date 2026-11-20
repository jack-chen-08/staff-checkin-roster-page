/**
 * 30 秒自动刷新调度器。
 * - setInterval 可注入，测试用 jest.useFakeTimers 直接推进时间；
 * - pause() 后不再触发（页面 onHide / 弹窗打开时使用），resume() 重新计时；
 * - 上一轮请求未结束时跳过本轮，避免请求堆积。
 */

export interface IntervalTimers {
  setInterval: (fn: () => void, ms: number) => any;
  clearInterval: (handle: any) => void;
}

const REAL_TIMERS: IntervalTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms) as any,
  clearInterval: (handle) => clearInterval(handle),
};

export const AUTO_REFRESH_MS = 30000;

export interface AutoRefreshOptions {
  /** 刷新回调，允许返回 Promise */
  onTick: () => void | Promise<void>;
  interval?: number;
  timers?: IntervalTimers;
  /** 回调异常时的兜底处理，默认静默（不打断轮询） */
  onError?: (err: unknown) => void;
}

export class AutoRefresh {
  private handle: any = null;
  private paused = false;
  private started = false;
  private busy = false;
  private tickCount = 0;
  private errorCount = 0;
  private readonly interval: number;

  constructor(private readonly options: AutoRefreshOptions) {
    this.interval = options.interval && options.interval > 0 ? options.interval : AUTO_REFRESH_MS;
  }

  /** 当前是否处于运行（含暂停态：已启动但被暂停） */
  get running(): boolean {
    return this.started && !this.paused;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get ticks(): number {
    return this.tickCount;
  }

  get errors(): number {
    return this.errorCount;
  }

  start(): void {
    this.started = true;
    this.paused = false;
    this.arm();
  }

  /** 页面隐藏：停止计时，不再产生刷新请求 */
  pause(): void {
    if (!this.started) return;
    this.paused = true;
    this.disarm();
  }

  /** 页面重新显示：重新从 0 开始计时 */
  resume(): void {
    if (!this.started) {
      this.start();
      return;
    }
    this.paused = false;
    this.arm();
  }

  /** 页面卸载 / 无权限：彻底停止，重复 start 需要重新调用 start() */
  stop(): void {
    this.started = false;
    this.paused = false;
    this.disarm();
  }

  private get timers(): IntervalTimers {
    return this.options.timers || REAL_TIMERS;
  }

  private arm(): void {
    this.disarm();
    this.handle = this.timers.setInterval(() => {
      void this.tick();
    }, this.interval);
  }

  private disarm(): void {
    if (this.handle !== null) {
      this.timers.clearInterval(this.handle);
      this.handle = null;
    }
  }

  /** 供测试或「下拉刷新」直接触发一次轮询 */
  async tick(): Promise<void> {
    if (this.paused || !this.started) return;
    if (this.busy) return;
    this.busy = true;
    this.tickCount += 1;
    try {
      const result = this.options.onTick();
      // 同步回调不占用 busy，避免连续两次定时器触发被误判为「上一轮未结束」
      if (result && typeof (result as Promise<void>).then === 'function') {
        await (result as Promise<void>);
      }
    } catch (err) {
      this.errorCount += 1;
      if (this.options.onError) this.options.onError(err);
    } finally {
      this.busy = false;
    }
  }
}
