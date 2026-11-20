const { apiBase } = require('../../config');

function loginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) =>
        code ? resolve(code) : reject(new Error('微信登录失败')),
      fail: () => reject(new Error('微信登录失败'))
    });
  });
}

function post(path, data, token) {
  if (!apiBase.startsWith('https://'))
    throw new Error('请先配置试点 HTTPS API 域名');
  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBase + path,
      method: 'POST',
      data,
      header: token ? { Authorization: 'Bearer ' + token } : {},
      success: ({ statusCode, data: response }) => {
        if (statusCode >= 200 && statusCode < 300) {
          resolve(response.data);
        } else {
          reject(
            new Error(
              typeof response?.message === 'string'
                ? response.message
                : '请求失败'
            )
          );
        }
      },
      fail: () => reject(new Error('网络连接失败'))
    });
  });
}

Page({
  data: {
    busy: false,
    assignments: [],
    showBind: false,
    workDate: '',
    correction: null
  },

  onLoad() {
    this.refresh();
  },

  async run(action) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await action();
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  async loadAssignments() {
    const assignments = await post('/v2/attendance/wechat/assignments', {
      wechatCode: await loginCode(),
      ...(this.data.workDate ? { workDate: this.data.workDate } : {})
    });
    this.setData({
      assignments: assignments.map((item) => {
        const state = (kind) => {
          const punch = item.attendancePunches.find(
            (entry) => entry.kind === kind
          );
          const correction = item.attendanceCorrections.find(
            (entry) => entry.kind === kind
          );
          return {
            kind,
            label: kind === 'IN' ? '上班' : '下班',
            punched: Boolean(punch),
            pending: correction?.status === 'PENDING',
            note: punch
              ? punch.wifiNetworkId
                ? 'Wi-Fi 已打卡'
                : punch.terminalId
                  ? '已打卡（历史扫码）'
                : '已补卡'
              : correction?.status === 'REJECTED'
                ? correction.reviewNote
                : ''
          };
        };
        return {
          ...item,
          workDate: item.workDate.slice(0, 10),
          states: [state('IN'), state('OUT')]
        };
      }),
      showBind: false
    });
  },

  refresh() {
    return this.run(() => this.loadAssignments());
  },

  chooseDate(event) {
    this.setData({ workDate: event.detail.value });
    return this.refresh();
  },

  resetDate() {
    this.setData({ workDate: '' });
    return this.refresh();
  },

  openCorrection(event) {
    const { id, kind, date } = event.currentTarget.dataset;
    this.setData({ correction: { id, kind, date, time: '' } });
  },

  setCorrectionDate(event) {
    this.setData({ 'correction.date': event.detail.value });
  },

  setCorrectionTime(event) {
    this.setData({ 'correction.time': event.detail.value });
  },

  closeCorrection() {
    this.setData({ correction: null });
  },

  submitCorrection(event) {
    const { id, kind, date, time } = this.data.correction;
    const { reason } = event.detail.value;
    return this.run(async () => {
      if (!date || !time || !reason.trim())
        throw new Error('请选择时间并填写原因');
      await post('/v2/attendance/wechat/corrections', {
        assignmentId: id,
        kind,
        requestedTime: date + 'T' + time + ':00+08:00',
        reason,
        wechatCode: await loginCode()
      });
      this.closeCorrection();
      wx.showToast({ title: '补卡已提交' });
      await this.loadAssignments();
    });
  },

  openBinding() {
    this.setData({ showBind: true });
  },

  bind(event) {
    const { username, password } = event.detail.value;
    return this.run(async () => {
      const session = await post('/auth/login', { username, password });
      await post(
        '/v2/attendance/wechat/bind',
        { password, wechatCode: await loginCode() },
        session.accessToken
      );
      await this.loadAssignments();
    });
  },

  punch(event) {
    const { id: assignmentId, kind } = event.currentTarget.dataset;
    return this.run(async () => {
      await new Promise((resolve, reject) =>
        wx.startWifi({ success: resolve, fail: reject })
      );
      let bssid;
      try {
        bssid = await new Promise((resolve, reject) =>
          wx.getConnectedWifi({
            success: ({ wifi }) => resolve(wifi.BSSID),
            fail: reject
          })
        );
      } finally {
        wx.stopWifi();
      }
      if (!bssid) throw new Error('请先连接门店指定 Wi-Fi');
      await post('/v2/attendance/wechat/wifi-punch', {
        assignmentId,
        kind,
        bssid,
        wechatCode: await loginCode()
      });
      wx.showToast({ title: '打卡成功' });
      await this.loadAssignments();
    });
  }
});
