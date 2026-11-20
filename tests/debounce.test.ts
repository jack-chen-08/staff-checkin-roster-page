import { Debouncer } from '../miniprogram/logic/debounce';

describe('Debouncer 防抖（搜索框 300ms）', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('连续输入 5 次只触发 1 次调用，且使用最后一次的入参', () => {
    const fn = jest.fn();
    const d = new Debouncer<[string]>(fn, 300);

    d.schedule('林');
    d.schedule('林一');
    d.schedule('林一舟');
    d.schedule('林一舟 ');
    d.schedule('林一舟1');

    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('林一舟1');
  });

  it('两次输入间隔超过 300ms 时各触发一次', () => {
    const fn = jest.fn();
    const d = new Debouncer<[string]>(fn, 300);
    d.schedule('云启');
    jest.advanceTimersByTime(300);
    d.schedule('星澜');
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, '云启');
    expect(fn).toHaveBeenNthCalledWith(2, '星澜');
  });

  it('cancel 之后不再触发，pending 状态可查询', () => {
    const fn = jest.fn();
    const d = new Debouncer<[string]>(fn, 300);
    d.schedule('木石');
    expect(d.pending).toBe(true);
    d.cancel();
    expect(d.pending).toBe(false);
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush 立即执行等待中的调用且只执行一次', () => {
    const fn = jest.fn();
    const d = new Debouncer<[string]>(fn, 300);
    d.schedule('北辰');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('北辰');
    jest.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
