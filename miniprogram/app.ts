/**
 * 小程序入口。仅初始化全局配置，业务逻辑都在 pages / logic 中。
 * 说明：员工身份由登录态接口返回，演示环境用本地缓存里的角色字段模拟。
 */
App({
  globalData: {
    /** 演示用当前角色：staff=员工；member=普通会员（无权限） */
    role: 'staff',
    apiBaseUrl: 'https://example.internal/api',
  },

  onLaunch() {
    const cached = wx.getStorageSync('demoUserRole');
    if (cached) {
      this.globalData.role = cached;
    }
  },
});
