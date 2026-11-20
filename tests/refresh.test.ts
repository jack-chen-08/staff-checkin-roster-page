import { AutoRefresh, AUTO_REFRESH_MS } from '../miniprogram/logic/refresh';

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('30 秒自动刷新调度器', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('默认间隔为 30 秒，每 30 秒触发一次', async () => {
    const onTick = jest.fn();
    const r = new AutoRefresh({ onTick });
    expect(AUTO_REFRESH_MS).toBe(30000);
    r.start();
    jest.advanceTimersByTime(29999);
    expect(onTick).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60000);
    expect(onTick).toHaveBeenCalledTimes(3);
    r.stop();
  });

  it('页面隐藏 pause 后不再触发，resume 后恢复', async () => {
    const onTick = jest.fn();
    const r = new AutoRefresh({ onTick, interval: 30000 });
    r.start();
    jest.advanceTimersByTime(30000);
    expect(onTick).toHaveBeenCalledTimes(1);

    r.pause();
    expect(r.isPaused).toBe(true);
    expect(r.running).toBe(false);
    jest.advanceTimersByTime(120000);
    expect(onTick).toHaveBeenCalledTimes(1);

    r.resume();
    expect(r.running).toBe(true);
    jest.advanceTimersByTime(30000);
    expect(onTick).toHaveBeenCalledTimes(2);
    r.stop();
  });

  it('未 start 时 pause 不会启动计时；stop 后彻底停止', () => {
    const onTick = jest.fn();
    const r = new AutoRefresh({ onTick });
    r.pause();
    jest.advanceTimersByTime(60000);
    expect(onTick).not.toHaveBeenCalled();

    r.start();
    r.stop();
    jest.advanceTimersByTime(60000);
    expect(onTick).not.toHaveBeenCalled();
    expect(r.running).toBe(false);
  });

  it('上一轮未结束时跳过本轮，避免请求堆积', async () => {
    let resolveTick: (() => void) | null = null;
    const onTick = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTick = resolve;
        }),
    );
    const r = new AutoRefresh({ onTick, interval: 30000 });
    r.start();
    jest.advanceTimersByTime(30000);
    expect(onTick).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30000);
    expect(onTick).toHaveBeenCalledTimes(1);
    resolveTick!();
    await flush();
    jest.advanceTimersByTime(30000);
    expect(onTick).toHaveBeenCalledTimes(2);
    r.stop();
  });

  it('回调异常被吞掉并计数，轮询不中断', async () => {
    const onTick = jest.fn(() => {
      throw new Error('network down');
    });
    const r = new AutoRefresh({ onTick, interval: 30000 });
    r.start();
    jest.advanceTimersByTime(30000);
    await flush();
    expect(r.errors).toBe(1);
    jest.advanceTimersByTime(30000);
    await flush();
    expect(onTick).toHaveBeenCalledTimes(2);
    r.stop();
  });
});
