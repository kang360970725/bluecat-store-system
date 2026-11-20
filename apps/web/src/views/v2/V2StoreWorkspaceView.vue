<template>
  <div class="page-stack store-workspace">
    <div class="workspace-head">
      <n-button text @click="backToStoreCenter">← 返回门店中心</n-button>
      <div v-if="archive" class="workspace-title">
        <div>
          <h1 :title="archive.store.name">
            {{ storeDisplayName(archive.store) }}
          </h1>
          <p>
            {{ archive.store.code }} ·
            {{ archive.store.organization?.name || '未设置组织' }}
          </p>
        </div>
        <n-tag
          :type="archive.store.status === 'OPERATING' ? 'success' : 'default'"
          >{{ statusText }}</n-tag
        >
      </div>
    </div>
    <n-spin :show="loading">
      <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
      <template v-if="archive">
        <div class="metric-strip realtime-metrics">
          <div class="target-metric">
            <span>最近交班收入</span
            ><strong
              >¥{{
                money(realtimePerformance?.currentShiftIncome ?? 0)
              }}</strong
            ><small
              >{{ realtimePerformance?.currentShiftLabel || '暂无班次' }} · 目标
              ¥{{ money(currentShiftTarget) }}</small
            ><n-progress
              type="line"
              :percentage="progress(currentShiftIncome, currentShiftTarget)"
              :color="progressColor(currentShiftIncome, currentShiftTarget)"
              :rail-color="
                progressRailColor(currentShiftIncome, currentShiftTarget)
              "
              :show-indicator="false"
            /><b
              :class="performanceClass(currentShiftIncome, currentShiftTarget)"
              >{{
                currentShiftTarget
                  ? percent(currentShiftIncome / currentShiftTarget)
                  : '未设置目标'
              }}</b
            >
          </div>
          <div class="target-metric">
            <span>今日收入</span
            ><strong>¥{{ money(realtimePerformance?.todayIncome ?? 0) }}</strong
            ><small>目标 ¥{{ money(todayTarget) }} · 每 2 分钟同步</small
            ><n-progress
              type="line"
              :percentage="progress(todayIncome, todayTarget)"
              :color="progressColor(todayIncome, todayTarget)"
              :rail-color="progressRailColor(todayIncome, todayTarget)"
              :show-indicator="false"
            /><b :class="performanceClass(todayIncome, todayTarget)">{{
              todayTarget ? percent(todayIncome / todayTarget) : '未设置目标'
            }}</b>
          </div>
          <div>
            <span>本月总收入</span
            ><strong>¥{{ money(realtimePerformance?.monthTotal ?? 0) }}</strong
            ><small>{{ realtimeMonthLabel }}</small>
          </div>
          <div>
            <span>本月完成率</span
            ><strong>{{ percent(monthCompletionRate) }}</strong
            ><small>实际收入 ÷ 月目标</small>
          </div>
          <div>
            <span>预计完成率</span
            ><strong>{{
              estimatedCompletionRate === null
                ? '—'
                : percent(estimatedCompletionRate)
            }}</strong
            ><small>按截至昨日的日均收入推算</small>
          </div>
        </div>
        <n-card
          class="workspace-tabs-card"
          :bordered="false"
          content-style="padding-top: 8px"
        >
          <n-tabs
            v-model:value="activeTab"
            type="line"
            animated
            class="workspace-tabs"
          >
            <n-tab-pane name="overview" tab="经营概览">
              <div class="overview-grid">
                <div class="performance-head overview-head">
                  <div>
                    <strong>门店经营看板</strong
                    ><span>当月含实时营业数据，历史月份按已结算数据查询</span>
                  </div>
                  <n-space
                    ><n-button-group
                      ><n-button @click="moveMonth(-1)">‹</n-button
                      ><n-button
                        class="month-trigger"
                        @click="openMonthPanel"
                        >{{ currentMonthText }}</n-button
                      ><n-button @click="moveMonth(1)"
                        >›</n-button
                      ></n-button-group
                    ><n-button secondary @click="goCurrentMonth"
                      >本月</n-button
                    ></n-space
                  >
                </div>
                <n-alert
                  v-if="dashboardError"
                  type="warning"
                  :bordered="false"
                  >{{ dashboardError }}</n-alert
                >
                <n-spin :show="dashboardLoading">
                  <div class="metric-strip dashboard-metrics">
                    <div>
                      <span>{{
                        dashboard?.isCurrentMonth
                          ? '当月实时营业额'
                          : '月度总营业额'
                      }}</span
                      ><strong
                        >¥{{ money(dashboard?.actualRevenue ?? 0) }}</strong
                      ><small>含吧台实收与有效团购核销</small>
                    </div>
                    <div>
                      <span>预计月营业额</span
                      ><strong
                        >¥{{ money(dashboard?.forecastRevenue ?? 0) }}</strong
                      ><small>{{
                        dashboard?.isCurrentMonth
                          ? `按已经营 ${dashboard.elapsedDays} 天推算`
                          : '历史月份按实际值'
                      }}</small>
                    </div>
                    <div>
                      <span>预计月度开支</span
                      ><strong
                        >¥{{ money(dashboard?.operatingExpense ?? 0) }}</strong
                      ><small
                        >{{
                          dashboard?.costItems.length ?? 0
                        }}
                        项生效成本</small
                      >
                    </div>
                    <div class="profit-metric">
                      <span>预计经营利润</span
                      ><strong
                        :class="
                          (dashboard?.forecastProfit ?? 0) >= 0
                            ? 'positive'
                            : 'negative'
                        "
                        >¥{{ money(dashboard?.forecastProfit ?? 0) }}</strong
                      ><small
                        >预计利润率
                        {{ percent(dashboard?.forecastProfitRate ?? 0) }}</small
                      >
                    </div>
                  </div>
                </n-spin>
                <div class="dashboard-detail-grid">
                  <n-card size="small" title="月度开支构成" :bordered="true"
                    ><div
                      v-if="dashboard?.costItems.length"
                      class="cost-breakdown"
                    >
                      <div v-for="item in dashboard.costItems" :key="item.id">
                        <span
                          ><strong>{{ item.name }}</strong
                          ><small
                            >{{ item.category }} ·
                            {{ costMethodText(item) }}</small
                          ></span
                        ><b>¥{{ money(item.amount) }}</b>
                      </div>
                    </div>
                    <n-empty v-else description="暂无生效成本配置"
                  /></n-card>
                  <n-card size="small" title="资金开支" :bordered="true"
                    ><n-descriptions label-placement="left" :column="1"
                      ><n-descriptions-item label="经营成本"
                        >¥{{
                          money(dashboard?.operatingExpense ?? 0)
                        }}</n-descriptions-item
                      ><n-descriptions-item label="本月投入"
                        >¥{{
                          money(dashboard?.investmentOutflow ?? 0)
                        }}</n-descriptions-item
                      ><n-descriptions-item label="资金流出合计"
                        ><strong
                          >¥{{
                            money(dashboard?.totalCashOutflow ?? 0)
                          }}</strong
                        ></n-descriptions-item
                      ></n-descriptions
                    ><small class="dashboard-note"
                      >初始投入、追加投入与设备投入单独展示，不重复扣减经营利润。</small
                    ></n-card
                  >
                </div>
                <n-descriptions
                  label-placement="left"
                  bordered
                  :column="descriptionColumns"
                >
                  <n-descriptions-item label="营业日起点">{{
                    archive.store.businessDayStartsAt
                  }}</n-descriptions-item>
                  <n-descriptions-item label="机器数">{{
                    archive.store.machineCount
                  }}</n-descriptions-item>
                  <n-descriptions-item label="座位数">{{
                    archive.store.operatingProfile?.seatCount ?? 0
                  }}</n-descriptions-item>
                  <n-descriptions-item label="经营面积">{{
                    archive.store.operatingProfile?.usableAreaSqm ?? '未录入'
                  }}</n-descriptions-item>
                  <n-descriptions-item label="地址">{{
                    archive.store.address || '未录入'
                  }}</n-descriptions-item>
                  <n-descriptions-item label="联系电话">{{
                    archive.store.phone || '未录入'
                  }}</n-descriptions-item>
                </n-descriptions>
              </div>
            </n-tab-pane>
            <n-tab-pane name="monthly-report" tab="运营月报">
              <div class="monthly-report">
                <div class="performance-head overview-head">
                  <div>
                    <strong>运营月报汇总</strong>
                    <span>展示已生成的完整月份报表；本期与上期按月环比</span>
                  </div>
                  <n-space
                    ><n-button-group
                      ><n-button @click="moveMonth(-1)">‹</n-button
                      ><n-button
                        class="month-trigger"
                        @click="openMonthPanel"
                        >{{ currentMonthText }}</n-button
                      ><n-button @click="moveMonth(1)"
                        >›</n-button
                      ></n-button-group
                    ><n-button secondary @click="goCurrentMonth"
                      >本月</n-button
                    ></n-space
                  >
                </div>
                <n-alert
                  v-if="monthlyReportError"
                  type="warning"
                  :bordered="false"
                  >{{ monthlyReportError }}</n-alert
                >
                <n-spin :show="monthlyReportLoading">
                  <n-empty
                    v-if="monthlyReport && !monthlyReport.generated"
                    :description="monthlyReport.error || '该月份尚未生成报表'"
                  />
                  <div
                    v-else-if="monthlyReport?.generated"
                    class="monthly-report-groups"
                  >
                    <n-card
                      v-for="group in monthlyReport.groups"
                      :key="group.code"
                      size="small"
                      :title="group.label"
                      :bordered="true"
                    >
                      <div class="shift-table-wrap">
                        <table class="shift-table monthly-report-table">
                          <thead>
                            <tr>
                              <th>指标</th>
                              <th>上期</th>
                              <th>本期</th>
                              <th>环比</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="item in group.metrics" :key="item.code">
                              <td>
                                <strong>{{ item.label }}</strong>
                              </td>
                              <td>
                                {{
                                  monthlyMetricText(
                                    item.previous,
                                    item.unit,
                                    item.available
                                  )
                                }}
                              </td>
                              <td>
                                {{
                                  monthlyMetricText(
                                    item.current,
                                    item.unit,
                                    item.available
                                  )
                                }}
                              </td>
                              <td :class="changeClass(item.changeRate)">
                                {{
                                  monthlyChangeText(
                                    item.changeRate,
                                    item.available
                                  )
                                }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </n-card>
                    <n-card size="small" title="团购收入构成" :bordered="true">
                      <div
                        v-if="monthlyReport.groupPurchase?.length"
                        class="shift-table-wrap"
                      >
                        <table class="shift-table monthly-report-table">
                          <thead>
                            <tr>
                              <th>类型</th>
                              <th>上期</th>
                              <th>本期</th>
                              <th>环比</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr
                              v-for="item in monthlyReport.groupPurchase"
                              :key="item.code"
                            >
                              <td>
                                <strong>{{ item.label }}</strong>
                              </td>
                              <td>
                                {{ nullableCurrency(item.previousAmount) }}
                              </td>
                              <td>
                                {{ nullableCurrency(item.currentAmount) }}
                              </td>
                              <td :class="changeClass(item.changeRate)">
                                {{ monthlyChangeText(item.changeRate, true) }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <n-empty v-else description="本月暂无团购收入" />
                    </n-card>
                  </div>
                </n-spin>
              </div>
            </n-tab-pane>
            <n-tab-pane name="profile" tab="基础资料"
              ><tab-toolbar
                title="经营基础资料"
                @add="openEditor('profile')"
              /><n-descriptions bordered :column="descriptionColumns"
                ><n-descriptions-item label="门店简称">{{
                  archive.store.shortName || '未设置'
                }}</n-descriptions-item
                ><n-descriptions-item label="经营主体">{{
                  archive.store.operatingProfile?.legalEntityName || '未录入'
                }}</n-descriptions-item
                ><n-descriptions-item label="租约开始">{{
                  shortDate(archive.store.operatingProfile?.leaseStartsOn)
                }}</n-descriptions-item
                ><n-descriptions-item label="租约结束">{{
                  shortDate(archive.store.operatingProfile?.leaseEndsOn)
                }}</n-descriptions-item
                ><n-descriptions-item label="备注">{{
                  archive.store.operatingProfile?.notes || '无'
                }}</n-descriptions-item></n-descriptions
              ></n-tab-pane
            >
            <n-tab-pane name="costs" :tab="`成本费用 ${archive.costs.length}`"
              ><tab-toolbar title="成本配置" @add="openEditor('cost')">
                <template #extra>
                  <label class="cost-month-control"
                    >成本月份
                    <input
                      v-model="costMonth"
                      type="month"
                      :max="realtimeMonth"
                      @change="loadCostMonth"
                    />
                  </label>
                  <n-button
                    v-if="costMonth !== realtimeMonth"
                    size="small"
                    secondary
                    @click="resetCostMonth"
                    >返回本月</n-button
                  >
                </template>
              </tab-toolbar>
              <n-alert
                v-if="costMonth !== realtimeMonth"
                type="warning"
                :bordered="false"
                class="historical-cost-alert"
              >
                当前正在维护
                {{ costMonth }}
                历史成本。修改将仅覆盖该月份，不影响当前月及后续月份，并要求填写修正原因。
              </n-alert>
              <record-list
                :items="costDisplayItems"
                empty="尚未配置成本"
                :allow-remove="costMonth === realtimeMonth"
                @edit="openEditor('cost', $event)"
                @remove="removeRecord('cost', $event)"
            /></n-tab-pane>
            <n-tab-pane
              name="investments"
              :tab="`投入回本 ${archive.investments.length}`"
              ><tab-toolbar
                title="投入记录"
                @add="openEditor('investment')" /><record-list
                :items="archive.investments"
                empty="尚未录入投入"
                @edit="openEditor('investment', $event)"
                @remove="removeRecord('investment', $event)"
            /></n-tab-pane>
            <n-tab-pane
              name="assets"
              :tab="`区域设备 ${archive.areas.length}/${archive.assets.length}`"
              ><tab-toolbar title="门店区域与设备"
                ><template #extra
                  ><n-button size="small" secondary @click="openEditor('area')"
                    >新增区域</n-button
                  ><n-button
                    size="small"
                    type="primary"
                    @click="openEditor('asset')"
                    >新增设备</n-button
                  ></template
                ></tab-toolbar
              >
              <h3 class="subsection-title">区域</h3>
              <record-list
                :items="archive.areas"
                empty="尚未设置区域"
                @edit="openEditor('area', $event)"
                @remove="removeRecord('area', $event)" />
              <h3 class="subsection-title">设备</h3>
              <record-list
                :items="archive.assets"
                empty="尚未录入设备资产"
                @edit="openEditor('asset', $event)"
                @remove="removeRecord('asset', $event)"
            /></n-tab-pane>
            <n-tab-pane
              name="employees"
              :tab="`员工岗位 ${archive.employments.length}`"
              ><record-list
                :items="
                  archive.employments.map((item) => ({
                    name: item.employee.name,
                    category: item.position.name,
                    code: item.employee.employeeNo
                  }))
                "
                empty="尚无在岗员工"
            /></n-tab-pane>
            <n-tab-pane
              v-if="canViewSchedules"
              name="schedules"
              tab="排班与考勤"
            >
              <store-schedules :store-id="archive.store.id" />
              <v2-attendance-wifi-settings :store-id="archive.store.id" />
            </n-tab-pane>
            <n-tab-pane name="ota" tab="团购核销">
              <div class="performance-head">
                <div>
                  <strong>团购核销明细</strong
                  ><span
                    >按单日 00:00:00–23:59:59
                    同步，刷单商品不纳入实际营业额</span
                  >
                </div>
                <n-space
                  ><n-button
                    type="primary"
                    secondary
                    :loading="otaSyncing"
                    @click="syncOtaProducts"
                    >同步团购商品</n-button
                  ><n-button-group
                    ><n-button @click="moveMonth(-1)">‹</n-button
                    ><n-button class="month-trigger" @click="openMonthPanel">{{
                      currentMonthText
                    }}</n-button
                    ><n-button @click="moveMonth(1)"
                      >›</n-button
                    ></n-button-group
                  ><n-button secondary @click="goCurrentMonth"
                    >本月</n-button
                  ></n-space
                >
              </div>
              <n-alert v-if="otaError" type="warning" :bordered="false">{{
                otaError
              }}</n-alert>
              <div class="metric-strip ota-metrics">
                <div>
                  <span>核销毛额</span
                  ><strong>¥{{ money(otaCenter?.summary.gross ?? 0) }}</strong>
                </div>
                <div>
                  <span>刷单剔除</span
                  ><strong class="negative"
                    >-¥{{ money(otaCenter?.summary.excluded ?? 0) }}</strong
                  >
                </div>
                <div>
                  <span>比例及手续费差额</span
                  ><strong class="negative"
                    >-¥{{
                      money(otaCenter?.summary.feeAndSettlementDifference ?? 0)
                    }}</strong
                  >
                </div>
                <div class="total-actual-metric">
                  <span>实际团购营收</span
                  ><strong>¥{{ money(otaCenter?.summary.actual ?? 0) }}</strong>
                </div>
                <div>
                  <span>核销笔数</span
                  ><strong>{{ otaCenter?.summary.count ?? 0 }}</strong>
                </div>
              </div>
              <n-alert type="info" :bordered="false"
                >原“团购核销日汇总”仅作核对参考，月度与班次业绩现以下方核销明细扣除刷单商品后计算。</n-alert
              >
              <n-collapse class="product-collapse"
                ><n-collapse-item name="products"
                  ><template #header
                    ><div class="collapse-title">
                      <strong>团购商品</strong
                      ><n-tag round size="small"
                        >{{ otaCenter?.productPagination.total ?? 0 }} 个</n-tag
                      ><span>展开管理刷单产品</span>
                    </div></template
                  >
                  <div class="product-filter">
                    <span>上下架状态</span
                    ><n-radio-group
                      v-model:value="otaProductStatus"
                      size="small"
                      @update:value="changeOtaProductStatus"
                      ><n-radio-button value="ALL">全部</n-radio-button
                      ><n-radio-button value="ON_SALE">上架</n-radio-button
                      ><n-radio-button value="OFF_SALE"
                        >下架</n-radio-button
                      ></n-radio-group
                    >
                  </div>
                  <div class="shift-table-wrap">
                    <table class="shift-table ota-table">
                      <thead>
                        <tr>
                          <th>平台</th>
                          <th>商品</th>
                          <th>价格</th>
                          <th>商品状态</th>
                          <th>到账比例</th>
                          <th>手续费率</th>
                          <th>刷单产品</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="item in otaCenter?.products || []"
                          :key="item.id"
                        >
                          <td>
                            <n-tag size="small">{{
                              platformText(item.platform)
                            }}</n-tag>
                          </td>
                          <td>
                            <strong>{{ item.name }}</strong
                            ><small>{{ item.externalProductId }}</small>
                          </td>
                          <td>¥{{ money(item.amount) }}</td>
                          <td>
                            <n-tag
                              size="small"
                              :type="productStatus(item.status).type"
                              >{{ productStatus(item.status).text }}</n-tag
                            >
                          </td>
                          <td>
                            <n-input-number
                              :value="Number(item.settlementRate) * 100"
                              :min="0"
                              :max="100"
                              :precision="2"
                              size="small"
                              class="rate-input"
                              @update:value="
                                item.settlementRate = Number($event || 0) / 100
                              "
                              ><template #suffix>%</template></n-input-number
                            >
                          </td>
                          <td>
                            <n-input-number
                              :value="Number(item.feeRate) * 100"
                              :min="0"
                              :max="100"
                              :precision="2"
                              size="small"
                              class="rate-input"
                              @update:value="
                                item.feeRate = Number($event || 0) / 100
                              "
                              ><template #suffix>%</template></n-input-number
                            >
                          </td>
                          <td>
                            <n-switch
                              :value="item.isBrush"
                              :loading="brushUpdatingId === item.id"
                              @update:value="
                                confirmToggleBrush(item.id, item.name, $event)
                              "
                            />
                          </td>
                          <td>
                            <n-button
                              size="tiny"
                              type="primary"
                              secondary
                              :loading="settlementUpdatingId === item.id"
                              @click="saveOtaSettlement(item)"
                              >保存比例</n-button
                            >
                          </td>
                        </tr>
                        <tr v-if="!otaCenter?.products.length">
                          <td colspan="8">
                            <n-empty
                              description="当前上下架状态下暂无团购商品"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <n-pagination
                    v-if="otaCenter?.productPagination.total"
                    class="ota-pagination"
                    v-model:page="productPage"
                    :page-size="productPageSize"
                    :item-count="otaCenter.productPagination.total"
                    show-size-picker
                    :page-sizes="[10, 20, 50, 100]"
                    @update:page="loadOtaCenter"
                    @update:page-size="changeProductPageSize"
                  /> </n-collapse-item
              ></n-collapse>
              <div class="redemption-heading">
                <h3 class="subsection-title">{{ currentMonthText }}核销记录</h3>
                <n-space wrap
                  ><n-input
                    v-model:value="redemptionKeyword"
                    clearable
                    placeholder="模糊搜索团购商品名称"
                    class="redemption-search"
                    @keyup.enter="searchRedemptions"
                    @clear="searchRedemptions"
                  /><n-button secondary @click="searchRedemptions"
                    >搜索</n-button
                  ><n-radio-group
                    v-model:value="redemptionStatus"
                    size="small"
                    @update:value="changeRedemptionStatus"
                    ><n-radio-button value="ALL">全部</n-radio-button
                    ><n-radio-button value="VALID">有效</n-radio-button
                    ><n-radio-button value="EXCLUDED"
                      >已剔除</n-radio-button
                    ></n-radio-group
                  ></n-space
                >
              </div>
              <div class="shift-table-wrap">
                <table class="shift-table ota-table redemption-table">
                  <thead>
                    <tr>
                      <th>操作时间</th>
                      <th>班次</th>
                      <th>平台</th>
                      <th>团购商品</th>
                      <th>核销金额</th>
                      <th>实际营收</th>
                      <th>业绩状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in otaCenter?.redemptions || []"
                      :key="item.id"
                      :class="{ 'brush-row': item.product?.isBrush }"
                    >
                      <td>{{ dateTime(item.operatedAt) }}</td>
                      <td>
                        {{
                          item.storeShift?.name ||
                          item.operatorLabel ||
                          '未匹配'
                        }}
                      </td>
                      <td>{{ platformText(item.platform) }}</td>
                      <td>{{ item.productName }}</td>
                      <td>¥{{ money(item.amount) }}</td>
                      <td>
                        <strong>¥{{ money(item.actualAmount) }}</strong
                        ><small v-if="item.product"
                          >到账
                          {{ percent(Number(item.product.settlementRate)) }} ·
                          费率
                          {{ percent(Number(item.product.feeRate)) }}</small
                        >
                      </td>
                      <td>
                        <n-tag
                          :type="item.product?.isBrush ? 'error' : 'success'"
                          size="small"
                          >{{
                            item.product?.isBrush ? '已剔除' : '有效'
                          }}</n-tag
                        >
                      </td>
                      <td>
                        <n-button
                          v-if="!item.product?.isBrush"
                          size="tiny"
                          type="error"
                          secondary
                          :loading="brushUpdatingId === item.id"
                          @click="
                            confirmMarkRedemptionBrush(
                              item.id,
                              item.productName
                            )
                          "
                          >设为刷单商品</n-button
                        ><span v-else>已标记</span>
                      </td>
                    </tr>
                    <tr v-if="!otaCenter?.redemptions.length">
                      <td colspan="8">
                        <n-empty description="当前筛选下暂无核销记录" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <n-pagination
                v-if="otaCenter?.redemptionPagination.total"
                class="ota-pagination"
                v-model:page="redemptionPage"
                :page-size="redemptionPageSize"
                :item-count="otaCenter.redemptionPagination.total"
                show-size-picker
                :page-sizes="[10, 30, 50, 100]"
                @update:page="loadOtaCenter"
                @update:page-size="changeRedemptionPageSize"
              />
            </n-tab-pane>
            <n-tab-pane name="ratings" tab="业绩拆分">
              <div class="performance-head split-toolbar">
                <div>
                  <strong>月度业绩动态拆分</strong
                  ><span
                    >按前期实际营业额滚动分配剩余目标，保留日期权重和班次比例</span
                  >
                </div>
                <n-space wrap
                  ><n-button-group
                    ><n-button @click="moveMonth(-1)">‹</n-button
                    ><n-button class="month-trigger" @click="openMonthPanel">{{
                      currentMonthText
                    }}</n-button
                    ><n-button @click="moveMonth(1)"
                      >›</n-button
                    ></n-button-group
                  ><n-button secondary @click="goCurrentMonth">本月</n-button
                  ><n-date-picker
                    v-model:formatted-value="selectedDay"
                    value-format="yyyy-MM-dd"
                    type="date"
                    clearable
                    placeholder="日历筛选日期"
                    @update:formatted-value="loadSplit"
                  /><n-button v-if="selectedDay" secondary @click="backToMonth"
                    >返回整月</n-button
                  ></n-space
                >
              </div>
              <n-alert
                v-if="performanceError"
                type="warning"
                :bordered="false"
                >{{ performanceError }}</n-alert
              >
              <n-alert
                v-if="split?.configured"
                type="info"
                :bordered="false"
                class="rolling-rule-tip"
                >动态目标：每个营业日开始时，按“月目标 −
                前期实际营业额”滚动分配当日及剩余日期；已过日期的当日目标不会被后续数据改写。</n-alert
              >
              <div v-if="!split?.configured" class="split-config">
                <n-input-number
                  v-model:value="targetRevenue"
                  :min="0"
                  :precision="2"
                  placeholder="本月营收目标"
                  ><template #prefix>¥</template></n-input-number
                ><n-input-number
                  v-model:value="targetProfit"
                  :precision="2"
                  placeholder="本月利润目标"
                  ><template #prefix>¥</template></n-input-number
                ><n-button
                  type="primary"
                  :loading="generatingSplit"
                  @click="generateSplit"
                  >生成月度拆分</n-button
                ><span>默认：周末权重 +15%，同日各班次均分</span>
              </div>
              <n-collapse v-else class="split-adjust"
                ><n-collapse-item
                  title="调整月目标与拆分规则（谨慎操作）"
                  name="adjust"
                  ><div class="split-config">
                    <n-input-number
                      v-model:value="targetRevenue"
                      :min="0"
                      :precision="2"
                      placeholder="营收目标"
                      ><template #prefix>¥</template></n-input-number
                    ><n-input-number
                      v-model:value="targetProfit"
                      :precision="2"
                      placeholder="利润目标"
                      ><template #prefix>¥</template></n-input-number
                    ><n-button
                      type="warning"
                      secondary
                      :loading="generatingSplit"
                      @click="generateSplit"
                      >重新按比例拆分</n-button
                    ><span
                      >会覆盖当前月目标分配，但不会删除 X 管家实际班次数据</span
                    >
                  </div></n-collapse-item
                ></n-collapse
              >
              <div
                v-if="split?.configured"
                class="metric-strip performance-metrics"
              >
                <div>
                  <span>{{ selectedDay ? '当日网费' : '本月网费' }}</span
                  ><strong>¥{{ money(split.summary.netFeeActual) }}</strong>
                </div>
                <div>
                  <span>{{
                    selectedDay ? '当日有效商品' : '本月有效商品'
                  }}</span
                  ><strong>¥{{ money(split.summary.productActual) }}</strong
                  ><small
                    >毛额 ¥{{ money(split.summary.productGross) }}，剔除 ¥{{
                      money(split.summary.productExcluded)
                    }}</small
                  >
                </div>
                <div>
                  <span>{{
                    selectedDay ? '当日团购核销' : '本月团购核销'
                  }}</span
                  ><strong>¥{{ money(split.summary.otaActual) }}</strong
                  ><small>已剔除刷单商品</small>
                </div>
                <div>
                  <span>{{
                    selectedDay ? '当日租赁收入' : '本月租赁收入'
                  }}</span
                  ><strong>¥{{ money(split.summary.rentalActual) }}</strong
                  ><small>来源于X管家交班及经营汇总</small>
                </div>
                <div class="total-actual-metric">
                  <span>总实际营业额</span
                  ><strong>¥{{ money(split.summary.actual) }}</strong
                  ><small>网费 + 有效商品 + 租赁 + 有效团购核销</small>
                </div>
                <div>
                  <span>{{
                    selectedDay ? '当日营收目标' : '本月营收目标'
                  }}</span
                  ><strong>¥{{ money(split.summary.target) }}</strong>
                </div>
                <div>
                  <span>营收完成率</span
                  ><strong
                    :class="split.summary.completionRate >= 1 ? 'positive' : ''"
                    >{{ percent(split.summary.completionRate) }}</strong
                  >
                </div>
                <div class="profit-metric">
                  <span>{{
                    selectedDay ? '当日实际利润' : '本月实际利润'
                  }}</span
                  ><strong
                    :class="
                      split.summary.actualProfit >= 0 ? 'positive' : 'negative'
                    "
                    >¥{{ money(split.summary.actualProfit) }}</strong
                  ><small
                    >营业额 ¥{{ money(split.summary.actual) }} − 成本 ¥{{
                      money(split.summary.operatingCost)
                    }}</small
                  >
                </div>
                <div>
                  <span>{{
                    selectedDay ? '当日利润目标' : '本月利润目标'
                  }}</span
                  ><strong>¥{{ money(split.summary.profitTarget) }}</strong>
                </div>
                <div>
                  <span>利润完成率</span
                  ><strong
                    :class="
                      split.summary.profitCompletionRate >= 1 ? 'positive' : ''
                    "
                    >{{
                      split.summary.profitTarget
                        ? percent(split.summary.profitCompletionRate)
                        : '未设目标'
                    }}</strong
                  ><small
                    >利润差额
                    {{ split.summary.profitDifference >= 0 ? '+' : '' }}¥{{
                      money(split.summary.profitDifference)
                    }}</small
                  >
                </div>
              </div>
              <n-collapse class="product-collapse"
                ><n-collapse-item name="product-exclusions"
                  ><template #header
                    ><div class="collapse-title">
                      <strong>商品销售剔除分类</strong
                      ><n-tag round size="small" type="warning"
                        >{{ selectedProductCategoryIds.length }} 个待剔除</n-tag
                      ><span>勾选多个分类后统一提交，不会逐项触发重算</span>
                    </div></template
                  ><n-space justify="space-between" align="center" wrap
                    ><span
                      >选择完成后点击提交，系统只执行一次整月及班次重算；历史月份提交仅修正所选月份。</span
                    ><n-space
                      ><n-button
                        secondary
                        :loading="productExclusionSyncing"
                        @click="syncProductCategories"
                        >同步分类</n-button
                      ><n-button
                        type="primary"
                        :disabled="!productCategoriesDirty"
                        :loading="productExclusionSyncing"
                        @click="saveProductCategoryExclusions"
                        >提交剔除设置</n-button
                      ><n-button
                        secondary
                        :loading="productExclusionSyncing"
                        @click="recalculateProductExclusions"
                        >重算{{
                          currentMonth === realtimeMonth ? '本月' : '所选月份'
                        }}</n-button
                      ></n-space
                    ></n-space
                  ><n-checkbox-group v-model:value="selectedProductCategoryIds"
                    ><div class="category-check-grid">
                      <label
                        v-for="item in productExclusions?.categories || []"
                        :key="item.id"
                        ><n-checkbox :value="item.id">{{
                          item.name
                        }}</n-checkbox
                        ><n-tag
                          v-if="item.historical"
                          size="tiny"
                          type="default"
                          >本月历史分类</n-tag
                        ><small
                          >¥{{ money(item.monthSalesAmount) }}</small
                        ></label
                      >
                    </div></n-checkbox-group
                  ><n-empty
                    v-if="!productExclusions?.categories.length"
                    description="暂无分类，请点击同步分类" /></n-collapse-item
              ></n-collapse>
              <n-alert v-if="!split?.configured" type="info" :bordered="false"
                >输入本月营收目标并生成拆分后，系统会创建每天、每个班次的目标格；已同步班次会自动填入实际收入。</n-alert
              >
              <div v-else class="shift-table-wrap">
                <table class="shift-table split-table">
                  <thead>
                    <tr v-if="selectedDay">
                      <th>班次</th>
                      <th>目标</th>
                      <th>班次业绩</th>
                      <th>网费</th>
                      <th>有效商品</th>
                      <th>租赁收入</th>
                      <th>差额</th>
                      <th>完成率</th>
                    </tr>
                    <tr v-else>
                      <th>营业日</th>
                      <th>日目标</th>
                      <th class="shift-performance-column">班次表现</th>
                      <th>日结汇总</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-if="selectedDay"
                      ><tr
                        v-for="item in split.daily[0]?.shifts || []"
                        :key="item.id"
                      >
                        <td>{{ item.shift?.name || '未匹配班次' }}</td>
                        <td>¥{{ money(item.targetAmount) }}</td>
                        <td>¥{{ money(item.actualAmount || 0) }}</td>
                        <td>¥{{ money(item.actualNetFee) }}</td>
                        <td>
                          <strong>¥{{ money(item.actualProductSales) }}</strong
                          ><small
                            >毛额 ¥{{ money(item.actualProductGross) }} − 剔除
                            ¥{{ money(item.actualProductExcluded) }}</small
                          >
                        </td>
                        <td>¥{{ money(item.actualRental) }}</td>
                        <td
                          :class="
                            Number(item.actualAmount || 0) -
                              Number(item.targetAmount) >=
                            0
                              ? 'positive'
                              : 'negative'
                          "
                        >
                          {{
                            Number(item.actualAmount || 0) -
                              Number(item.targetAmount) >=
                            0
                              ? '+'
                              : ''
                          }}¥{{
                            money(
                              Number(item.actualAmount || 0) -
                                Number(item.targetAmount)
                            )
                          }}
                        </td>
                        <td>
                          <div class="progress-cell">
                            <n-progress
                              type="line"
                              :percentage="
                                progress(
                                  Number(item.actualAmount || 0),
                                  Number(item.targetAmount)
                                )
                              "
                              :color="
                                progressColor(
                                  Number(item.actualAmount || 0),
                                  Number(item.targetAmount)
                                )
                              "
                              :rail-color="
                                progressRailColor(
                                  Number(item.actualAmount || 0),
                                  Number(item.targetAmount)
                                )
                              "
                              :show-indicator="false"
                            /><span>{{
                              percent(
                                Number(item.actualAmount || 0) /
                                  Number(item.targetAmount || 1)
                              )
                            }}</span>
                          </div>
                        </td>
                      </tr>
                      <tr class="reconciliation-row">
                        <td colspan="2"><strong>日结校准</strong></td>
                        <td>
                          班次合计 ¥{{
                            money(split.daily[0]?.shiftActual || 0)
                          }}
                        </td>
                        <td colspan="3">
                          日结实际 ¥{{ money(split.daily[0]?.actual || 0) }}
                        </td>
                        <td
                          colspan="2"
                          :class="
                            Number(split.daily[0]?.reconciliation || 0) >= 0
                              ? 'positive'
                              : 'negative'
                          "
                        >
                          校准
                          {{
                            Number(split.daily[0]?.reconciliation || 0) >= 0
                              ? '+'
                              : ''
                          }}¥{{ money(split.daily[0]?.reconciliation || 0) }}
                        </td>
                      </tr></template
                    ><template v-else
                      ><tr v-for="item in split.daily" :key="item.date">
                        <td>
                          <strong>{{ item.date.slice(8, 10) }}日</strong
                          ><small>{{ weekday(item.date) }}</small>
                        </td>
                        <td>
                          <strong>¥{{ money(item.target) }}</strong>
                        </td>
                        <td>
                          <div class="shift-stack">
                            <div
                              v-for="bucket in ['day', 'night'] as const"
                              :key="bucket"
                              class="shift-row"
                            >
                              <span class="shift-name">{{
                                bucket === 'day' ? '白班' : '晚班'
                              }}</span>
                              <div class="shift-progress">
                                <div>
                                  <strong
                                    >¥{{
                                      money(
                                        shiftMetric(item.shifts, bucket).actual
                                      )
                                    }}</strong
                                  ><span
                                    >/ ¥{{
                                      money(
                                        shiftMetric(item.shifts, bucket).target
                                      )
                                    }}</span
                                  >
                                </div>
                                <n-progress
                                  type="line"
                                  :percentage="
                                    progress(
                                      shiftMetric(item.shifts, bucket).actual,
                                      shiftMetric(item.shifts, bucket).target
                                    )
                                  "
                                  :color="
                                    progressColor(
                                      shiftMetric(item.shifts, bucket).actual,
                                      shiftMetric(item.shifts, bucket).target
                                    )
                                  "
                                  :rail-color="
                                    progressRailColor(
                                      shiftMetric(item.shifts, bucket).actual,
                                      shiftMetric(item.shifts, bucket).target
                                    )
                                  "
                                  :show-indicator="false"
                                />
                              </div>
                              <strong
                                class="shift-rate"
                                :class="
                                  performanceClass(
                                    shiftMetric(item.shifts, bucket).actual,
                                    shiftMetric(item.shifts, bucket).target
                                  )
                                "
                                >{{
                                  percent(shiftMetric(item.shifts, bucket).rate)
                                }}</strong
                              >
                            </div>
                          </div>
                        </td>
                        <td>
                          <div class="daily-total">
                            <div class="daily-total-head">
                              <div>
                                <strong>¥{{ money(item.actual) }}</strong
                                ><span>/ ¥{{ money(item.target) }}</span>
                              </div>
                              <strong
                                :class="
                                  item.difference >= 0 ? 'positive' : 'negative'
                                "
                                >{{ item.difference >= 0 ? '+' : '' }}¥{{
                                  money(item.difference)
                                }}</strong
                              >
                            </div>
                            <n-progress
                              type="line"
                              :percentage="progress(item.actual, item.target)"
                              :color="progressColor(item.actual, item.target)"
                              :rail-color="
                                progressRailColor(item.actual, item.target)
                              "
                              :show-indicator="false"
                            />
                            <div class="daily-total-foot">
                              <strong
                                :class="
                                  performanceClass(item.actual, item.target)
                                "
                                >{{ percent(item.completionRate) }}</strong
                              ><span
                                :class="
                                  Math.abs(item.reconciliation) > 0.009
                                    ? 'calibration-value'
                                    : ''
                                "
                                >班次 ¥{{ money(item.shiftActual) }} · 校准
                                {{ item.reconciliation >= 0 ? '+' : '' }}¥{{
                                  money(item.reconciliation)
                                }}</span
                              >
                            </div>
                          </div>
                        </td>
                      </tr></template
                    >
                  </tbody>
                </table>
              </div>
            </n-tab-pane>
          </n-tabs>
        </n-card>
      </template>
    </n-spin>
    <n-modal
      v-model:show="editorOpen"
      preset="card"
      :title="editorTitle"
      class="edit-modal"
    >
      <n-form label-placement="top">
        <template v-if="editorKind === 'profile'">
          <n-grid :cols="2" :x-gap="12" responsive="screen"
            ><n-form-item-gi label="门店名称"
              ><n-input v-model:value="form.storeName" /></n-form-item-gi
            ><n-form-item-gi label="门店简称"
              ><n-input
                v-model:value="form.shortName"
                maxlength="30"
                show-count
                placeholder="用于企微图表等紧凑场景" /></n-form-item-gi
            ><n-form-item-gi label="经营状态"
              ><n-select
                v-model:value="form.storeStatus"
                :options="storeStatusOptions" /></n-form-item-gi
            ><n-form-item-gi label="营业日起点"
              ><n-input
                v-model:value="form.businessDayStartsAt"
                placeholder="09:00" /></n-form-item-gi
            ><n-form-item-gi label="机器数"
              ><n-input-number
                v-model:value="form.machineCount"
                :min="0"
                class="full" /></n-form-item-gi
          ></n-grid>
          <n-form-item label="门店地址"
            ><n-input v-model:value="form.address" /></n-form-item
          ><n-form-item label="联系电话"
            ><n-input v-model:value="form.phone"
          /></n-form-item>
          <n-form-item label="经营主体"
            ><n-input v-model:value="form.legalEntityName"
          /></n-form-item>
          <n-grid :cols="2" :x-gap="12" responsive="screen"
            ><n-form-item-gi label="经营面积（㎡）"
              ><n-input-number
                v-model:value="form.usableAreaSqm"
                :min="0"
                class="full" /></n-form-item-gi
            ><n-form-item-gi label="座位数"
              ><n-input-number
                v-model:value="form.seatCount"
                :min="0"
                class="full" /></n-form-item-gi
            ><n-form-item-gi label="租约开始"
              ><n-date-picker
                v-model:formatted-value="form.leaseStartsOn"
                value-format="yyyy-MM-dd"
                type="date"
                class="full"
                clearable /></n-form-item-gi
            ><n-form-item-gi label="租约结束"
              ><n-date-picker
                v-model:formatted-value="form.leaseEndsOn"
                value-format="yyyy-MM-dd"
                type="date"
                class="full"
                clearable /></n-form-item-gi
          ></n-grid>
          <n-form-item label="备注"
            ><n-input v-model:value="form.notes" type="textarea"
          /></n-form-item>
        </template>
        <template v-else-if="editorKind === 'cost'">
          <n-grid :cols="2" :x-gap="12" responsive="screen"
            ><n-form-item-gi label="成本名称"
              ><n-input v-model:value="form.name" /></n-form-item-gi
            ><n-form-item-gi label="编码"
              ><n-input v-model:value="form.code" /></n-form-item-gi
            ><n-form-item-gi label="类别"
              ><n-input v-model:value="form.category" /></n-form-item-gi
            ><n-form-item-gi label="计算方式"
              ><n-select
                v-model:value="form.method"
                :options="costMethodOptions" /></n-form-item-gi
            ><n-form-item-gi v-if="form.method === 'FIXED'" label="固定金额"
              ><n-input-number
                v-model:value="form.fixedAmount"
                :min="0"
                :precision="2"
                class="full"
                ><template #prefix>¥</template></n-input-number
              ></n-form-item-gi
            ><n-form-item-gi v-else label="营业额计提比例"
              ><n-input-number
                v-model:value="form.ratePercent"
                :min="0"
                :max="100"
                :precision="2"
                class="full"
                ><template #suffix>%</template></n-input-number
              ></n-form-item-gi
            ><n-form-item-gi label="频率"
              ><n-select
                v-model:value="form.frequency"
                :options="frequencyOptions"
                :disabled="form.method === 'RATE'" /></n-form-item-gi
          ></n-grid>
          <n-alert
            v-if="costMonth === realtimeMonth"
            type="success"
            :bordered="false"
            >成本保存后从本月开始永久延续；修改或删除仅影响本月及以后，历史月份不会重算。</n-alert
          >
          <n-alert v-if="form.method === 'RATE'" type="info" :bordered="false"
            >系统将按该月营业额实时计算；当月看板使用预计月营业额，历史月份使用实际月营业额。</n-alert
          >
          <n-form-item
            v-if="costMonth !== realtimeMonth"
            label="历史修正原因（必填）"
          >
            <n-input
              v-model:value="form.correctionReason"
              type="textarea"
              placeholder="例如：财务复核后更正9月实际水电费"
            />
          </n-form-item>
        </template>
        <template v-else-if="editorKind === 'investment'">
          <n-grid :cols="2" :x-gap="12" responsive="screen"
            ><n-form-item-gi label="投入名称"
              ><n-input v-model:value="form.name" /></n-form-item-gi
            ><n-form-item-gi label="类别"
              ><n-input v-model:value="form.category" /></n-form-item-gi
            ><n-form-item-gi label="投入类型"
              ><n-select
                v-model:value="form.type"
                :options="investmentOptions" /></n-form-item-gi
            ><n-form-item-gi label="金额"
              ><n-input-number
                v-model:value="form.amount"
                :min="0"
                class="full" /></n-form-item-gi
            ><n-form-item-gi label="发生日期"
              ><n-date-picker
                v-model:formatted-value="form.occurredOn"
                value-format="yyyy-MM-dd"
                type="date"
                class="full" /></n-form-item-gi></n-grid
          ><n-form-item label="说明"
            ><n-input v-model:value="form.description" type="textarea"
          /></n-form-item>
        </template>
        <template v-else-if="editorKind === 'area'">
          <n-form-item label="区域名称"
            ><n-input v-model:value="form.name" /></n-form-item
          ><n-form-item label="区域编码"
            ><n-input v-model:value="form.code" /></n-form-item
          ><n-form-item label="说明"
            ><n-input v-model:value="form.description" type="textarea"
          /></n-form-item>
        </template>
        <template v-else-if="editorKind === 'asset'">
          <n-grid :cols="2" :x-gap="12" responsive="screen"
            ><n-form-item-gi label="资产编号"
              ><n-input v-model:value="form.assetNo" /></n-form-item-gi
            ><n-form-item-gi label="设备名称"
              ><n-input v-model:value="form.name" /></n-form-item-gi
            ><n-form-item-gi label="设备类别"
              ><n-input v-model:value="form.category" /></n-form-item-gi
            ><n-form-item-gi label="所属区域"
              ><n-select
                v-model:value="form.areaId"
                :options="areaOptions"
                clearable /></n-form-item-gi
            ><n-form-item-gi label="数量"
              ><n-input-number
                v-model:value="form.quantity"
                :min="1"
                class="full" /></n-form-item-gi
            ><n-form-item-gi label="采购单价"
              ><n-input-number
                v-model:value="form.purchasePrice"
                :min="0"
                class="full" /></n-form-item-gi
            ><n-form-item-gi label="采购日期"
              ><n-date-picker
                v-model:formatted-value="form.purchasedOn"
                value-format="yyyy-MM-dd"
                type="date"
                class="full"
                clearable /></n-form-item-gi
            ><n-form-item-gi label="预计换汰（月）"
              ><n-input-number
                v-model:value="form.expectedReplacementMonths"
                :min="1"
                class="full" /></n-form-item-gi
          ></n-grid>
        </template>
      </n-form>
      <template #footer
        ><n-space justify="end"
          ><n-button @click="editorOpen = false">取消</n-button
          ><n-button type="primary" :loading="saving" @click="saveEditor"
            >保存</n-button
          ></n-space
        ></template
      >
    </n-modal>
    <n-modal
      v-model:show="collectorLoginOpen"
      preset="card"
      title="X 管家扫码登录"
      class="collector-login-modal"
      :mask-closable="false"
      @after-leave="stopCollectorLoginPolling"
    >
      <n-alert type="warning" :bordered="false"
        >X
        管家登录已失效。请使用微信扫码，登录成功后系统会自动继续同步。</n-alert
      >
      <div class="collector-login-body">
        <n-spin :show="collectorLoginLoading">
          <img
            v-if="collectorLoginQrImage"
            :src="collectorLoginQrImage"
            alt="X 管家登录二维码"
            class="collector-login-qr"
          />
          <n-empty v-else description="二维码生成中" />
        </n-spin>
        <strong>{{ collectorLoginStatus }}</strong>
        <n-button secondary @click="createCollectorQr">刷新二维码</n-button>
      </div>
    </n-modal>
    <n-modal
      v-model:show="monthPanelOpen"
      preset="card"
      title="选择月份"
      class="month-modal"
    >
      <div class="month-year-nav">
        <n-button secondary @click="monthPanelYear--">‹</n-button
        ><strong>{{ monthPanelYear }} 年</strong
        ><n-button secondary @click="monthPanelYear++">›</n-button>
      </div>
      <div class="month-grid">
        <n-button
          v-for="month in 12"
          :key="month"
          :type="
            currentMonth ===
            `${monthPanelYear}-${String(month).padStart(2, '0')}`
              ? 'primary'
              : 'default'
          "
          :secondary="
            currentMonth !==
            `${monthPanelYear}-${String(month).padStart(2, '0')}`
          "
          @click="chooseMonth(month)"
          >{{ month }} 月</n-button
        >
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref
} from 'vue';
import QRCode from 'qrcode';
import {
  NTabPane,
  NTabs,
  NInputNumber,
  NDatePicker,
  NButton,
  NEmpty,
  NList,
  NListItem,
  NSpace,
  useDialog,
  useMessage,
  NDescriptions,
  NDescriptionsItem
} from 'naive-ui';
import { NSelect } from '@/components/Select';
import { useRoute, useRouter } from 'vue-router';
import {
  createV2StoreArea,
  createV2StoreAsset,
  createV2StoreCost,
  correctV2StoreCost,
  createV2StoreInvestment,
  deleteV2StoreArea,
  deleteV2StoreAsset,
  deleteV2StoreCost,
  deleteV2StoreInvestment,
  getV2StoreArchive,
  saveV2OperatingProfile,
  updateV2Store,
  updateV2StoreArea,
  updateV2StoreAsset,
  updateV2StoreCost,
  updateV2StoreInvestment,
  type V2StoreArchive
} from '@/api/v2-master-data';
import {
  checkV2CollectorLoginQr,
  createV2CollectorLoginQr,
  generateV2PerformanceSplit,
  getV2OperatingDashboard,
  getV2OperationsMonthlyReport,
  getV2OtaCenter,
  getV2PerformanceSplit,
  getV2ProductExclusionCenter,
  getV2StorePerformance,
  markV2RedemptionProductBrush,
  syncV2OtaProducts,
  syncV2ProductCategories,
  syncV2ProductExclusions,
  updateV2OtaProductBrush,
  updateV2OtaProductSettlement,
  updateV2ProductCategoryExclusions,
  type V2OperatingDashboard,
  type V2OperationsMonthlyReport,
  type V2OtaCenter,
  type V2PerformanceSplit,
  type V2ProductExclusionCenter,
  type V2StorePerformance
} from '@/api/v2-operations';
import { storeDisplayName } from '@/utils/store-display';
import { useAuthStore } from '@/stores/auth';
import StoreSchedules from '@/components/store/StoreSchedules.vue';
import V2AttendanceWifiSettings from '@/components/v2/V2AttendanceWifiSettings.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const archive = ref<V2StoreArchive | null>(null);
const performance = ref<V2StorePerformance | null>(null);
const dashboard = ref<V2OperatingDashboard | null>(null);
const dashboardLoading = ref(false);
const dashboardError = ref('');
const monthlyReport = ref<V2OperationsMonthlyReport | null>(null);
const monthlyReportLoading = ref(false);
const monthlyReportError = ref('');
const realtimePerformance = ref<V2StorePerformance | null>(null);
const realtimeSplit = ref<V2PerformanceSplit | null>(null);
const performanceError = ref('');
const otaCenter = ref<V2OtaCenter | null>(null);
const otaError = ref('');
const brushUpdatingId = ref('');
const otaSyncing = ref(false);
const settlementUpdatingId = ref('');
const productPage = ref(1);
const productPageSize = ref(20);
const otaProductStatus = ref('ALL');
const redemptionPage = ref(1);
const redemptionPageSize = ref(30);
const redemptionStatus = ref('ALL');
const redemptionKeyword = ref('');
const actualCurrentMonth = new Date()
  .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  .slice(0, 7);
const routeMonth =
  typeof route.query.month === 'string' &&
  /^\d{4}-\d{2}$/.test(route.query.month)
    ? route.query.month
    : actualCurrentMonth;
const currentMonth = ref(routeMonth);
const costMonth = ref(currentMonth.value);
const realtimeMonth = actualCurrentMonth;
const monthPanelOpen = ref(false);
const monthPanelYear = ref(Number(currentMonth.value.slice(0, 4)));
const selectedDay = ref<string | null>(null);
const split = ref<V2PerformanceSplit | null>(null);
const targetRevenue = ref<number | null>(null);
const targetProfit = ref<number | null>(null);
const generatingSplit = ref(false);
const productExclusions = ref<V2ProductExclusionCenter | null>(null);
const selectedProductCategoryIds = ref<string[]>([]);
const savedProductCategoryIds = ref<string[]>([]);
const productExclusionSyncing = ref(false);
const collectorLoginOpen = ref(false);
const collectorLoginLoading = ref(false);
const collectorLoginQrImage = ref('');
const collectorLoginStatus = ref('正在生成二维码…');
const collectorLoginXmId = ref('');
const resumeProductCategorySync = ref(false);
let collectorLoginPollTimer: ReturnType<typeof setTimeout> | null = null;
const loading = ref(false);
const error = ref('');
const activeTab = ref(
  typeof route.query.tab === 'string' ? route.query.tab : 'overview'
);
const canViewSchedules = computed(
  () =>
    auth.user?.roles.includes('super_admin') ||
    auth.user?.permissions.includes('schedule:view')
);
const editorOpen = ref(false);
const editorKind = ref('');
const saving = ref(false);
const form = reactive<Record<string, any>>({});
const message = useMessage();
const dialog = useDialog();
const descriptionColumns = computed(() => (window.innerWidth < 768 ? 1 : 2));
const statusText = computed(() =>
  archive.value?.store.status === 'OPERATING'
    ? '营业中'
    : (archive.value?.store.status ?? '')
);
const costDisplayItems = computed(
  () =>
    archive.value?.costs.map((item) => ({
      ...item,
      summary: `${item.category} · ${item.method === 'RATE' ? `营业额 ${Number(item.rate ?? 0) * 100}%` : `固定 ¥${money(item.fixedAmount ?? 0)}`}${item.corrected ? ' · 已修正' : ''}`
    })) ?? []
);
const currentMonthText = computed(
  () =>
    `${currentMonth.value.slice(0, 4)}年${Number(currentMonth.value.slice(5, 7))}月`
);
const realtimeMonthLabel = computed(
  () => `${realtimeMonth.slice(0, 4)}年${Number(realtimeMonth.slice(5, 7))}月`
);
const monthCompletionRate = computed(() => {
  const target = Number(realtimeSplit.value?.target?.revenueTarget ?? 0);
  return target
    ? Number(realtimePerformance.value?.monthTotal ?? 0) / target
    : 0;
});
const realtimeToday = computed(() =>
  realtimeSplit.value?.daily.find(
    (item) =>
      item.date ===
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  )
);
const todayTarget = computed(() => Number(realtimeToday.value?.target ?? 0));
const todayIncome = computed(() =>
  Number(realtimePerformance.value?.todayIncome ?? 0)
);
const currentShiftIncome = computed(() =>
  Number(realtimePerformance.value?.currentShiftIncome ?? 0)
);
const currentShiftTarget = computed(() => {
  const label = realtimePerformance.value?.currentShiftLabel ?? '';
  const latestDay = realtimePerformance.value?.shifts[0]?.businessDate?.slice(
    0,
    10
  );
  const matched = realtimeSplit.value?.daily
    .find((item) => item.date === latestDay)
    ?.shifts.find(
      (item) =>
        item.shift?.name === label ||
        (label && item.shift?.name.includes(label))
    );
  return Number(matched?.targetAmount ?? 0);
});
const estimatedCompletionRate = computed(() => {
  const performance = realtimePerformance.value;
  const target = Number(realtimeSplit.value?.target?.revenueTarget ?? 0);
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Shanghai'
  });
  const completedDays = Number(today.slice(8, 10)) - 1;
  if (
    !performance?.settledDays ||
    target <= 0 ||
    completedDays <= 0 ||
    today.slice(0, 7) !== realtimeMonth
  )
    return null;
  const [year, month] = realtimeMonth.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const completedIncome = performance.monthTotal - performance.todayIncome;
  return ((completedIncome / completedDays) * days) / target;
});
const productCategoriesDirty = computed(
  () =>
    [...selectedProductCategoryIds.value].sort().join(',') !==
    [...savedProductCategoryIds.value].sort().join(',')
);
const editorTitle = computed(
  () =>
    ({
      profile: '编辑基础资料',
      cost: form.id ? '编辑成本配置' : '新增成本配置',
      investment: '新增投入记录',
      area: '新增门店区域',
      asset: '新增设备资产'
    })[editorKind.value] ?? '编辑'
);
const areaOptions = computed(
  () =>
    archive.value?.areas.map((item) => ({
      label: item.name,
      value: item.id
    })) ?? []
);
const frequencyOptions = [
  { label: '每月', value: 'MONTHLY' },
  { label: '每季度', value: 'QUARTERLY' },
  { label: '每年', value: 'YEARLY' },
  { label: '一次性', value: 'ONE_TIME' }
];
const costMethodOptions = [
  { label: '固定金额', value: 'FIXED' },
  { label: '按营业额比例实时计算', value: 'RATE' }
];
const investmentOptions = [
  { label: '初始投入', value: 'INITIAL' },
  { label: '追加投入', value: 'ADDITIONAL' },
  { label: '装修', value: 'RENOVATION' },
  { label: '设备', value: 'EQUIPMENT' },
  { label: '其他', value: 'OTHER' }
];
const storeStatusOptions = [
  { label: '筹备中', value: 'PREPARING' },
  { label: '营业中', value: 'OPERATING' },
  { label: '暂停营业', value: 'SUSPENDED' },
  { label: '已关闭', value: 'CLOSED' }
];

const RecordList = defineComponent({
  props: {
    items: {
      type: Array as () => Array<Record<string, unknown>>,
      required: true
    },
    empty: { type: String, required: true },
    allowRemove: { type: Boolean, default: true }
  },
  emits: ['edit', 'remove'],
  setup:
    (props, { emit }) =>
    () =>
      props.items.length
        ? h(
            NList,
            { bordered: true },
            {
              default: () =>
                props.items.map((item, index) =>
                  h(
                    NListItem,
                    { key: String(item.id ?? index) },
                    {
                      default: () =>
                        h('div', { class: 'record-row' }, [
                          h('div', [
                            h(
                              'strong',
                              String(item.name ?? item.assetNo ?? '记录')
                            ),
                            h(
                              'span',
                              String(
                                item.summary ??
                                  item.category ??
                                  item.type ??
                                  item.code ??
                                  ''
                              )
                            )
                          ]),
                          h(NSpace, null, {
                            default: () => [
                              h(
                                NButton,
                                {
                                  size: 'tiny',
                                  onClick: () => emit('edit', item)
                                },
                                { default: () => '编辑' }
                              ),
                              props.allowRemove
                                ? h(
                                    NButton,
                                    {
                                      size: 'tiny',
                                      type: 'error',
                                      secondary: true,
                                      onClick: () => emit('remove', item)
                                    },
                                    { default: () => '删除' }
                                  )
                                : null
                            ]
                          })
                        ])
                    }
                  )
                )
            }
          )
        : h(NEmpty, { description: props.empty, class: 'tab-empty' })
});
const TabToolbar = defineComponent({
  props: { title: { type: String, required: true } },
  emits: ['add'],
  setup:
    (props, { emit, slots }) =>
    () =>
      h('div', { class: 'tab-toolbar' }, [
        h('strong', props.title),
        slots.extra
          ? h(NSpace, null, { default: slots.extra })
          : h(
              NButton,
              { size: 'small', type: 'primary', onClick: () => emit('add') },
              { default: () => '新增 / 编辑' }
            )
      ])
});

function shortDate(value?: string | null) {
  return value ? value.slice(0, 10) : '未录入';
}
function dateTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '—';
}
function money(value: string | number) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function nullableCurrency(value: number | null) {
  return value == null ? '—' : `¥${money(value)}`;
}
function percent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}
function monthlyMetricText(
  value: number | null,
  unit: V2OperationsMonthlyReport['groups'][number]['metrics'][number]['unit'],
  available: boolean
) {
  if (!available) return '待采集';
  if (value === null) return '—';
  if (unit === 'CURRENCY') return `¥${money(value)}`;
  if (unit === 'PERCENT') return percent(value);
  if (unit === 'HOURS') return `${Number(value).toLocaleString('zh-CN')} 小时`;
  return Number(value).toLocaleString('zh-CN');
}
function monthlyChangeText(value: number | null, available: boolean) {
  if (!available) return '待采集';
  return value === null ? '—' : `${value > 0 ? '+' : ''}${percent(value)}`;
}
function changeClass(value: number | null) {
  if (value === null || value === 0) return '';
  return value > 0 ? 'positive' : 'negative';
}
function progress(actual: number, target: number) {
  return Math.max(0, Math.min(100, target ? (actual / target) * 100 : 0));
}
function performanceClass(actual: number, target: number) {
  return target > 0 && actual >= target ? 'positive' : 'negative';
}
function progressColor(actual: number, target: number) {
  return target > 0 && actual >= target ? '#18a058' : '#d03050';
}
function progressRailColor(actual: number, target: number) {
  return target > 0 && actual >= target
    ? 'rgba(24, 160, 88, 0.16)'
    : 'rgba(208, 48, 80, 0.14)';
}
type SplitShift = V2PerformanceSplit['daily'][number]['shifts'][number];
function isShiftBucket(item: SplitShift, bucket: 'day' | 'night') {
  const name = item.shift?.name || '';
  return bucket === 'day'
    ? name.includes('白班')
    : name.includes('晚班') || name.includes('夜班');
}
function shiftMetric(items: SplitShift[], bucket: 'day' | 'night') {
  const value = items
    .filter((item) => isShiftBucket(item, bucket))
    .reduce(
      (sum, item) => ({
        target: sum.target + Number(item.targetAmount || 0),
        actual: sum.actual + Number(item.actualAmount || 0)
      }),
      { target: 0, actual: 0 }
    );
  return { ...value, rate: value.target ? value.actual / value.target : 0 };
}
function weekday(value: string) {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('zh-CN', {
    weekday: 'short'
  });
}
function platformText(value: string) {
  return (
    (
      { MEITUAN: '美团', DOUYIN: '抖音', GAODE: '高德' } as Record<
        string,
        string
      >
    )[value] || value
  );
}
function productStatus(value?: string | null) {
  const status = String(value || '').toLowerCase();
  if (status === 'historical')
    return { text: '历史补建', type: 'info' as const };
  if (
    status.includes('on_sale') ||
    status.includes('selling') ||
    status === '1'
  )
    return { text: '在售', type: 'success' as const };
  if (status.includes('expire'))
    return { text: '已过期', type: 'warning' as const };
  if (
    status.includes('end_sale') ||
    status.includes('off') ||
    status.includes('down')
  )
    return { text: '已下架', type: 'default' as const };
  if (status.includes('audit') || status.includes('review'))
    return { text: '审核中', type: 'info' as const };
  return { text: value || '未知', type: 'default' as const };
}
function costMethodText(item: V2OperatingDashboard['costItems'][number]) {
  if (item.method === 'RATE')
    return `营业额×${(item.rate * 100).toFixed(2).replace(/\.00$/, '')}%`;
  return (
    (
      {
        MONTHLY: '每月固定',
        QUARTERLY: '季度金额月均',
        YEARLY: '年度金额月均',
        ONE_TIME: '一次性'
      } as Record<string, string>
    )[item.frequency] || '固定金额'
  );
}
async function loadDashboard() {
  if (!route.params.storeId) return;
  dashboardLoading.value = true;
  dashboardError.value = '';
  try {
    dashboard.value = await getV2OperatingDashboard(
      String(route.params.storeId),
      currentMonth.value
    );
  } catch {
    dashboard.value = null;
    dashboardError.value = '经营看板数据暂不可用，请稍后重试。';
  } finally {
    dashboardLoading.value = false;
  }
}
async function loadMonthlyReport() {
  if (!route.params.storeId) return;
  monthlyReportLoading.value = true;
  monthlyReportError.value = '';
  try {
    monthlyReport.value = await getV2OperationsMonthlyReport(
      String(route.params.storeId),
      currentMonth.value
    );
  } catch {
    monthlyReport.value = null;
    monthlyReportError.value = '运营月报数据暂不可用，请稍后重试。';
  } finally {
    monthlyReportLoading.value = false;
  }
}
async function loadPerformance() {
  if (!route.params.storeId) return;
  performanceError.value = '';
  try {
    performance.value = await getV2StorePerformance(
      String(route.params.storeId),
      currentMonth.value
    );
  } catch {
    performance.value = null;
    performanceError.value = '业绩数据暂不可用，不影响门店基础资料。';
  }
}
async function loadRealtimeSummary() {
  if (!route.params.storeId) return;
  try {
    [realtimePerformance.value, realtimeSplit.value] = await Promise.all([
      getV2StorePerformance(String(route.params.storeId), realtimeMonth),
      getV2PerformanceSplit(String(route.params.storeId), realtimeMonth)
    ]);
  } catch {
    realtimePerformance.value = null;
    realtimeSplit.value = null;
  }
}
async function loadSplit() {
  if (!route.params.storeId) return;
  if (selectedDay.value && !selectedDay.value.startsWith(currentMonth.value))
    currentMonth.value = selectedDay.value.slice(0, 7);
  try {
    [split.value, productExclusions.value] = await Promise.all([
      getV2PerformanceSplit(
        String(route.params.storeId),
        currentMonth.value,
        selectedDay.value
      ),
      getV2ProductExclusionCenter(
        String(route.params.storeId),
        currentMonth.value
      )
    ]);
    if (split.value.target) {
      targetRevenue.value = Number(split.value.target.revenueTarget);
      targetProfit.value =
        split.value.target.profitTarget === null ||
        split.value.target.profitTarget === undefined
          ? null
          : Number(split.value.target.profitTarget);
    }
    const selectedExternalIds = new Set(
      productExclusions.value.selectedCategoryIds
    );
    const ids = productExclusions.value.categories
      .filter((item) => selectedExternalIds.has(item.externalCategoryId))
      .map((item) => item.id);
    selectedProductCategoryIds.value = [...ids];
    savedProductCategoryIds.value = [...ids];
  } catch {
    split.value = null;
    performanceError.value = '业绩拆分数据暂不可用。';
  }
}
async function syncProductCategories() {
  if (!route.params.storeId) return;
  productExclusionSyncing.value = true;
  try {
    const result = await syncV2ProductCategories(String(route.params.storeId));
    productExclusions.value = await getV2ProductExclusionCenter(
      String(route.params.storeId),
      currentMonth.value
    );
    const selectedExternalIds = new Set(
      productExclusions.value.selectedCategoryIds
    );
    const ids = productExclusions.value.categories
      .filter((item) => selectedExternalIds.has(item.externalCategoryId))
      .map((item) => item.id);
    selectedProductCategoryIds.value = [...ids];
    savedProductCategoryIds.value = [...ids];
    message.success(
      `商品分类同步完成，共 ${result.count} 个${
        result.deactivated ? `，停用 ${result.deactivated} 个旧分类` : ''
      }${result.historicalCount ? `，保留 ${result.historicalCount} 个本月历史分类` : ''}`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('X 管家登录已失效')) {
      message.warning('X 管家登录已失效，请扫码重新登录');
      resumeProductCategorySync.value = true;
      await openCollectorLogin();
      return;
    }
    message.error(
      error instanceof Error ? error.message : '商品分类同步失败，请稍后重试'
    );
  } finally {
    productExclusionSyncing.value = false;
  }
}
function stopCollectorLoginPolling() {
  if (collectorLoginPollTimer) clearTimeout(collectorLoginPollTimer);
  collectorLoginPollTimer = null;
}
async function renderCollectorQr(xmId: string, qrUrl: string) {
  collectorLoginXmId.value = xmId;
  collectorLoginQrImage.value = await QRCode.toDataURL(qrUrl, {
    width: 260,
    margin: 1
  });
}
function scheduleCollectorLoginCheck() {
  stopCollectorLoginPolling();
  if (!collectorLoginOpen.value || !collectorLoginXmId.value) return;
  collectorLoginPollTimer = setTimeout(() => void checkCollectorLogin(), 2500);
}
async function createCollectorQr() {
  collectorLoginLoading.value = true;
  collectorLoginStatus.value = '正在生成二维码…';
  stopCollectorLoginPolling();
  try {
    const qr = await createV2CollectorLoginQr();
    await renderCollectorQr(qr.xmId, qr.qrUrl);
    collectorLoginStatus.value = '请使用微信扫码';
    scheduleCollectorLoginCheck();
  } catch (error) {
    collectorLoginStatus.value =
      error instanceof Error ? error.message : '二维码生成失败';
  } finally {
    collectorLoginLoading.value = false;
  }
}
async function openCollectorLogin() {
  collectorLoginOpen.value = true;
  collectorLoginQrImage.value = '';
  await createCollectorQr();
}
async function checkCollectorLogin() {
  if (!collectorLoginXmId.value || !collectorLoginOpen.value) return;
  try {
    const result = await checkV2CollectorLoginQr(collectorLoginXmId.value);
    if (result.status === 'qr_refreshed' && result.next) {
      await renderCollectorQr(result.next.xmId, result.next.qrUrl);
      collectorLoginStatus.value = '二维码已刷新，请重新扫码';
      scheduleCollectorLoginCheck();
      return;
    }
    if (result.status === 'confirmed') {
      stopCollectorLoginPolling();
      collectorLoginStatus.value = '登录成功，正在继续同步…';
      const shouldResume = resumeProductCategorySync.value;
      resumeProductCategorySync.value = false;
      setTimeout(() => {
        collectorLoginOpen.value = false;
        if (shouldResume) void syncProductCategories();
      }, 600);
      return;
    }
    collectorLoginStatus.value =
      result.status === 'scanned' ? '已扫码，请在手机上确认' : '等待扫码…';
  } catch (error) {
    collectorLoginStatus.value =
      error instanceof Error ? error.message : '扫码状态检查失败';
  }
  scheduleCollectorLoginCheck();
}
async function recalculateProductExclusions() {
  if (!route.params.storeId) return;
  productExclusionSyncing.value = true;
  try {
    await syncV2ProductExclusions(
      String(route.params.storeId),
      currentMonth.value
    );
    await Promise.all([loadSplit(), loadPerformance(), loadRealtimeSummary()]);
    message.success(`${currentMonthText.value}商品剔除金额已重新计算`);
  } catch {
    message.error('商品剔除金额计算失败');
  } finally {
    productExclusionSyncing.value = false;
  }
}
async function saveProductCategoryExclusions() {
  if (!route.params.storeId || !productCategoriesDirty.value) return;
  if (currentMonth.value < realtimeMonth) {
    dialog.warning({
      title: '确认修正历史商品剔除',
      content: `将按当前勾选重算${currentMonthText.value}的每日及班次业绩，当前月份和后续月份配置不会改变。是否继续？`,
      positiveText: '确认提交',
      negativeText: '取消',
      onPositiveClick: () => submitProductCategoryExclusions()
    });
    return;
  }
  await submitProductCategoryExclusions();
}
async function submitProductCategoryExclusions() {
  if (!route.params.storeId || !productCategoriesDirty.value) return;
  productExclusionSyncing.value = true;
  try {
    const result = (await updateV2ProductCategoryExclusions(
      String(route.params.storeId),
      selectedProductCategoryIds.value,
      currentMonth.value
    )) as { excludedCount?: number };
    await Promise.all([loadSplit(), loadPerformance(), loadRealtimeSummary()]);
    message.success(
      `剔除设置已提交，共 ${result.excludedCount ?? selectedProductCategoryIds.value.length} 个分类，业绩已完成重算`
    );
  } catch {
    message.error('提交剔除分类失败，原设置未改变');
  } finally {
    productExclusionSyncing.value = false;
  }
}
async function loadOtaCenter() {
  if (!route.params.storeId) return;
  otaError.value = '';
  try {
    otaCenter.value = await getV2OtaCenter(
      String(route.params.storeId),
      currentMonth.value,
      productPage.value,
      productPageSize.value,
      redemptionPage.value,
      redemptionPageSize.value,
      redemptionStatus.value,
      redemptionKeyword.value,
      otaProductStatus.value
    );
  } catch {
    otaCenter.value = null;
    otaError.value = '团购商品与核销明细暂不可用。';
  }
}
function changeProductPageSize(value: number) {
  productPageSize.value = value;
  productPage.value = 1;
  void loadOtaCenter();
}
function changeOtaProductStatus() {
  productPage.value = 1;
  void loadOtaCenter();
}
function changeRedemptionPageSize(value: number) {
  redemptionPageSize.value = value;
  redemptionPage.value = 1;
  void loadOtaCenter();
}
function changeRedemptionStatus() {
  redemptionPage.value = 1;
  void loadOtaCenter();
}
function searchRedemptions() {
  redemptionPage.value = 1;
  void loadOtaCenter();
}
async function syncOtaProducts() {
  if (!route.params.storeId) return;
  otaSyncing.value = true;
  try {
    const result = (await syncV2OtaProducts(String(route.params.storeId))) as {
      upserted?: number;
    };
    productPage.value = 1;
    await loadOtaCenter();
    message.success(`团购商品同步完成，更新 ${result.upserted ?? 0} 条`);
  } catch {
    message.error('团购商品同步失败，请检查 X 管家登录状态');
  } finally {
    otaSyncing.value = false;
  }
}
async function saveOtaSettlement(item: V2OtaCenter['products'][number]) {
  settlementUpdatingId.value = item.id;
  try {
    await updateV2OtaProductSettlement(
      item.id,
      Number(item.settlementRate),
      Number(item.feeRate)
    );
    await Promise.all([
      loadOtaCenter(),
      loadPerformance(),
      loadSplit(),
      loadRealtimeSummary()
    ]);
    message.success('到账比例和手续费率已保存，相关业绩已实时重算');
  } catch {
    message.error('保存团购结算比例失败');
  } finally {
    settlementUpdatingId.value = '';
  }
}
async function markRedemptionBrush(id: string) {
  brushUpdatingId.value = id;
  try {
    const result = await markV2RedemptionProductBrush(id);
    productPage.value = 1;
    await Promise.all([
      loadOtaCenter(),
      loadPerformance(),
      loadSplit(),
      loadRealtimeSummary()
    ]);
    message.success(
      `已新增并标记刷单商品，共剔除 ${result.linked} 条同商品核销`
    );
  } catch {
    message.error('标记历史刷单商品失败');
  } finally {
    brushUpdatingId.value = '';
  }
}
function confirmMarkRedemptionBrush(id: string, productName: string) {
  dialog.warning({
    title: '确认设为刷单商品',
    content: `确定将“${productName}”设为刷单商品吗？本店该商品的历史核销都将从业绩中剔除。`,
    positiveText: '确认剔除',
    negativeText: '取消',
    onPositiveClick: () => markRedemptionBrush(id)
  });
}
async function toggleBrush(id: string, isBrush: boolean) {
  brushUpdatingId.value = id;
  try {
    await updateV2OtaProductBrush(id, isBrush);
    await Promise.all([
      loadOtaCenter(),
      loadPerformance(),
      loadSplit(),
      loadRealtimeSummary()
    ]);
    message.success(
      isBrush ? '已设为刷单产品，相关核销已从业绩剔除' : '已恢复计入业绩'
    );
  } catch {
    message.error('更新刷单标记失败');
  } finally {
    brushUpdatingId.value = '';
  }
}
function confirmToggleBrush(id: string, name: string, isBrush: boolean) {
  if (!isBrush) {
    void toggleBrush(id, false);
    return;
  }
  dialog.warning({
    title: '确认设为刷单商品',
    content: `确定将“${name}”设为刷单商品吗？本店该商品的历史核销都将从业绩中剔除。`,
    positiveText: '确认剔除',
    negativeText: '取消',
    onPositiveClick: () => toggleBrush(id, true)
  });
}
function applyMonth(value: string) {
  currentMonth.value = value;
  selectedDay.value = null;
  redemptionPage.value = 1;
  monthPanelYear.value = Number(value.slice(0, 4));
  void router.replace({
    name: 'v2-store-workspace',
    params: { storeId: String(route.params.storeId) },
    query: { ...route.query, month: value }
  });
  void Promise.all([
    loadDashboard(),
    loadMonthlyReport(),
    loadPerformance(),
    loadSplit(),
    loadOtaCenter()
  ]);
}
function backToStoreCenter() {
  void router.push({
    name: 'v2-store-center',
    query: { month: currentMonth.value }
  });
}
function moveMonth(delta: number) {
  const [year, month] = currentMonth.value.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  applyMonth(
    `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
  );
}
function goCurrentMonth() {
  applyMonth(realtimeMonth);
}
function openMonthPanel() {
  monthPanelYear.value = Number(currentMonth.value.slice(0, 4));
  monthPanelOpen.value = true;
}
function chooseMonth(month: number) {
  applyMonth(`${monthPanelYear.value}-${String(month).padStart(2, '0')}`);
  monthPanelOpen.value = false;
}
function backToMonth() {
  selectedDay.value = null;
  void loadSplit();
}
async function generateSplit() {
  if (!route.params.storeId || targetRevenue.value === null) {
    message.warning('请先输入本月营收目标');
    return;
  }
  generatingSplit.value = true;
  try {
    split.value = await generateV2PerformanceSplit(
      String(route.params.storeId),
      {
        targetMonth: currentMonth.value,
        revenueTarget: targetRevenue.value,
        profitTarget: targetProfit.value ?? undefined,
        weekendIncreaseRate: 0.15
      }
    );
    selectedDay.value = null;
    message.success('营收及利润目标已保存，营收目标已拆分到每天和班次');
  } catch {
    message.error('生成拆分失败，请确认本店已有 X 管家班次数据');
  } finally {
    generatingSplit.value = false;
  }
}
function openEditor(kind: string, item?: Record<string, unknown>) {
  editorKind.value = kind;
  Object.keys(form).forEach((key) => delete form[key]);
  const today = new Date().toISOString().slice(0, 10);
  if (kind === 'profile')
    Object.assign(form, archive.value?.store.operatingProfile ?? {}, {
      storeName: archive.value?.store.name,
      shortName: archive.value?.store.shortName,
      storeStatus: archive.value?.store.status,
      businessDayStartsAt: archive.value?.store.businessDayStartsAt,
      machineCount: archive.value?.store.machineCount,
      address: archive.value?.store.address,
      phone: archive.value?.store.phone
    });
  if (kind === 'cost')
    Object.assign(form, {
      method: 'FIXED',
      frequency: 'MONTHLY',
      fixedAmount: 0,
      correctionReason: ''
    });
  if (kind === 'investment')
    Object.assign(form, { type: 'INITIAL', occurredOn: today, amount: 0 });
  if (kind === 'asset') Object.assign(form, { quantity: 1, status: 'ACTIVE' });
  if (item) {
    Object.assign(form, item);
    if (kind === 'cost') {
      form.id = String(item.id);
      form.category = String(item.category ?? '');
      form.fixedAmount = Number(item.fixedAmount ?? 0);
      form.ratePercent = Number(item.rate ?? 0) * 100;
      form.correctionReason = String(item.reason ?? '');
      delete form.summary;
    }
    for (const key of [
      'effectiveFrom',
      'effectiveTo',
      'occurredOn',
      'purchasedOn'
    ])
      if (typeof form[key] === 'string') form[key] = form[key].slice(0, 10);
  }
  editorOpen.value = true;
}
async function saveEditor() {
  if (!archive.value) return;
  saving.value = true;
  try {
    const storeId = archive.value.store.id;
    if (editorKind.value === 'profile') {
      await updateV2Store(storeId, {
        name: form.storeName,
        shortName: form.shortName || null,
        status: form.storeStatus,
        businessDayStartsAt: form.businessDayStartsAt,
        machineCount: form.machineCount,
        address: form.address,
        phone: form.phone
      });
      await saveV2OperatingProfile(storeId, {
        legalEntityName: form.legalEntityName,
        usableAreaSqm: form.usableAreaSqm,
        seatCount: form.seatCount,
        leaseStartsOn: form.leaseStartsOn,
        leaseEndsOn: form.leaseEndsOn,
        notes: form.notes
      });
    }
    if (editorKind.value === 'cost') {
      if (
        !String(form.name ?? '').trim() ||
        !String(form.code ?? '').trim() ||
        !String(form.category ?? '').trim()
      ) {
        message.warning('请填写成本名称、编码和类别');
        return;
      }
      const payload: Record<string, any> = {
        ...form,
        frequency: form.method === 'RATE' ? 'MONTHLY' : form.frequency,
        fixedAmount: form.method === 'FIXED' ? form.fixedAmount : undefined,
        rate:
          form.method === 'RATE'
            ? Number(form.ratePercent ?? 0) / 100
            : undefined
      };
      delete payload.id;
      delete payload.summary;
      delete payload.ratePercent;
      delete payload.effectiveFrom;
      delete payload.effectiveTo;
      delete payload.historicalBaseline;
      delete payload.corrected;
      delete payload.correctionId;
      if (costMonth.value !== realtimeMonth) {
        if (!String(form.correctionReason ?? '').trim()) {
          message.warning('请填写历史成本修正原因');
          return;
        }
        await correctV2StoreCost(storeId, {
          ...payload,
          sourceConfigId: form.id ? String(form.id) : undefined,
          targetMonth: costMonth.value,
          reason: String(form.correctionReason).trim()
        });
      } else {
        delete payload.correctionReason;
        await (form.id
          ? updateV2StoreCost(String(form.id), payload)
          : createV2StoreCost(storeId, payload));
      }
    }
    if (editorKind.value === 'investment')
      await (form.id
        ? updateV2StoreInvestment(String(form.id), form)
        : createV2StoreInvestment(storeId, form));
    if (editorKind.value === 'area')
      await (form.id
        ? updateV2StoreArea(String(form.id), form)
        : createV2StoreArea(storeId, form));
    if (editorKind.value === 'asset')
      await (form.id
        ? updateV2StoreAsset(String(form.id), form)
        : createV2StoreAsset(storeId, form));
    editorOpen.value = false;
    await load();
    message.success('已保存');
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '保存失败，请稍后重试'
    );
  } finally {
    saving.value = false;
  }
}
function removeRecord(kind: string, item: Record<string, unknown>) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除“${String(item.name ?? item.assetNo ?? '该记录')}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const id = String(item.id);
      if (kind === 'cost') await deleteV2StoreCost(id);
      if (kind === 'investment') await deleteV2StoreInvestment(id);
      if (kind === 'area') await deleteV2StoreArea(id);
      if (kind === 'asset') await deleteV2StoreAsset(id);
      await load();
      message.success('已删除');
    }
  });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    archive.value = await getV2StoreArchive(
      String(route.params.storeId),
      costMonth.value
    );
    void Promise.all([
      loadRealtimeSummary(),
      loadDashboard(),
      loadMonthlyReport(),
      loadPerformance(),
      loadSplit(),
      loadOtaCenter()
    ]);
  } catch {
    error.value = '门店经营档案加载失败，请返回门店中心重试。';
  } finally {
    loading.value = false;
  }
}
async function loadCostMonth() {
  if (!/^\d{4}-\d{2}$/.test(costMonth.value)) return;
  loading.value = true;
  try {
    archive.value = await getV2StoreArchive(
      String(route.params.storeId),
      costMonth.value
    );
  } catch {
    message.error('成本月份加载失败');
  } finally {
    loading.value = false;
  }
}
function resetCostMonth() {
  costMonth.value = realtimeMonth;
  void loadCostMonth();
}
onMounted(() => void load());
onBeforeUnmount(stopCollectorLoginPolling);
</script>

<style scoped>
.monthly-report {
  display: grid;
  gap: 16px;
}
.monthly-report-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.monthly-report-table th:not(:first-child),
.monthly-report-table td:not(:first-child) {
  text-align: right;
  white-space: nowrap;
}
.monthly-report-table td:first-child strong,
.monthly-report-table td:first-child small {
  display: block;
}
.monthly-report-table td:first-child small {
  margin-top: 3px;
  color: var(--bc-muted);
  font-size: 11px;
}
@media (max-width: 960px) {
  .monthly-report-groups {
    grid-template-columns: 1fr;
  }
}
.cost-month-control {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bc-muted);
  font-size: 13px;
}
.cost-month-control input {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--bc-border);
  border-radius: 8px;
  background: var(--bc-surface);
  color: inherit;
}
.historical-cost-alert {
  margin-bottom: 14px;
}
.workspace-head {
  display: grid;
  gap: 12px;
}
.workspace-head > button {
  width: fit-content;
}
.workspace-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.workspace-title h1 {
  margin: 0;
  font-size: 24px;
}
.workspace-title p {
  margin: 5px 0 0;
  color: var(--bc-muted);
}
.overview-grid {
  display: grid;
  gap: 14px;
}
.overview-head {
  margin-top: 4px;
}
.dashboard-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.dashboard-metrics small {
  display: block;
  margin-top: 6px;
  color: var(--bc-muted);
  font-size: 11px;
}
.profit-metric {
  background: linear-gradient(
    135deg,
    rgba(24, 160, 88, 0.08),
    rgba(32, 128, 240, 0.07)
  );
}
.dashboard-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
  gap: 14px;
}
.cost-breakdown {
  display: grid;
  gap: 0;
}
.cost-breakdown > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--bc-border);
}
.cost-breakdown > div:last-child {
  border-bottom: 0;
}
.cost-breakdown span,
.cost-breakdown small {
  display: block;
}
.cost-breakdown small,
.dashboard-note {
  margin-top: 3px;
  color: var(--bc-muted);
  font-size: 11px;
}
.cost-breakdown b {
  white-space: nowrap;
}
.dashboard-note {
  display: block;
  margin-top: 12px;
  line-height: 1.6;
}
.realtime-metrics {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.realtime-metrics small {
  display: block;
  margin-top: 6px;
  color: var(--bc-muted);
  font-size: 12px;
}
.target-metric :deep(.n-progress) {
  margin-top: 9px;
}
.target-metric b {
  display: block;
  margin-top: 4px;
  font-size: 12px;
}
.workspace-tabs-card {
  margin-top: 22px;
}
.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 6px 0 14px;
}
.subsection-title {
  margin: 16px 0 8px;
  font-size: 14px;
}
.ota-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 14px 0;
}
.ota-table {
  min-width: 760px;
}
.ota-table td:nth-child(2) small {
  display: block;
  margin-top: 3px;
  color: var(--bc-muted);
}
.redemption-table {
  margin-top: 0;
}
.brush-row {
  opacity: 0.58;
  background: rgba(208, 48, 80, 0.035);
}
.rate-input {
  width: 112px;
}
.ota-pagination {
  display: flex;
  justify-content: flex-end;
  margin: 14px 0 20px;
}
.product-collapse {
  margin: 16px 0 20px;
  padding: 0 14px;
  border: 1px solid var(--bc-border);
  border-radius: 12px;
  background: var(--bc-surface-soft);
}
.collapse-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.collapse-title > span {
  color: var(--bc-muted);
  font-size: 12px;
  font-weight: 400;
}
.redemption-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
}
.redemption-heading .subsection-title {
  margin-top: 0;
}
.product-filter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin: 2px 0 12px;
}
.product-filter > span {
  color: var(--bc-muted);
  font-size: 12px;
}
.category-check-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 16px;
  margin: 16px 0 8px;
}
.category-check-grid label {
  padding: 9px 10px;
  border: 1px solid var(--bc-border);
  border-radius: 9px;
  background: var(--bc-surface);
}
.redemption-search {
  width: 240px;
}
.workspace-tabs :deep(.n-tabs-nav) {
  padding: 8px;
  border: 1px solid var(--bc-border);
  border-radius: 14px;
  background: var(--bc-surface-soft);
  box-shadow: 0 5px 18px rgba(15, 23, 42, 0.04);
}
.workspace-tabs :deep(.n-tabs-tab) {
  min-height: 38px;
  padding: 0 15px;
  border-radius: 9px;
  transition:
    background-color 0.2s,
    color 0.2s,
    box-shadow 0.2s;
}
.workspace-tabs :deep(.n-tabs-tab--active) {
  color: var(--bc-primary);
  background: var(--bc-surface);
  box-shadow: 0 4px 14px rgba(32, 128, 240, 0.13);
  font-weight: 700;
}
.workspace-tabs :deep(.n-tabs-bar) {
  display: none;
}
.tab-empty {
  padding: 42px 0;
}
.performance-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0 14px;
}
.performance-head strong,
.performance-head span {
  display: block;
}
.performance-head span {
  margin-top: 4px;
  color: var(--bc-muted);
}
.performance-metrics {
  margin-bottom: 14px;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.performance-metrics small {
  display: block;
  margin-top: 5px;
  color: var(--bc-muted);
  font-size: 11px;
}
.total-actual-metric {
  background: linear-gradient(
    135deg,
    rgba(32, 128, 240, 0.1),
    rgba(24, 160, 88, 0.08)
  );
}
.shift-table-wrap {
  overflow: auto;
  border: 1px solid var(--bc-border);
  border-radius: 12px;
}
.split-config {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 12px;
  border-radius: 12px;
  background: var(--bc-surface-soft);
}
.split-config > span {
  color: var(--bc-muted);
  font-size: 12px;
}
.split-config :deep(.n-input-number) {
  width: 220px;
}
.split-adjust {
  margin: 0 0 14px;
  padding: 0 12px;
  border: 1px dashed var(--bc-border);
  border-radius: 12px;
}
.split-adjust .split-config {
  margin-bottom: 4px;
}
.month-trigger {
  min-width: 112px;
}
.month-year-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.split-table {
  min-width: 900px;
}
.positive {
  color: #18a058;
}
.negative {
  color: #d03050;
}
.progress-cell {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 58px;
  align-items: center;
  gap: 8px;
}
.progress-cell span {
  font-size: 12px;
  color: var(--bc-muted);
  text-align: right;
}
.split-table td:first-child small {
  display: block;
  margin-top: 3px;
  color: var(--bc-muted);
}
.shift-performance-column {
  min-width: 390px;
}
.shift-stack {
  display: grid;
  gap: 10px;
  min-width: 390px;
}
.shift-row {
  display: grid;
  grid-template-columns: 38px minmax(240px, 1fr) 56px;
  align-items: center;
  gap: 10px;
}
.shift-row + .shift-row {
  padding-top: 10px;
  border-top: 1px dashed var(--bc-border);
}
.shift-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--bc-muted);
}
.shift-progress {
  display: grid;
  gap: 5px;
}
.shift-progress > div {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.shift-progress > div strong {
  font-size: 13px;
}
.shift-progress > div span {
  color: var(--bc-muted);
  font-size: 11px;
}
.shift-rate {
  font-size: 12px;
  text-align: right;
}
.daily-total {
  display: grid;
  gap: 9px;
  min-width: 250px;
}
.daily-total-head,
.daily-total-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.daily-total-head > div {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.daily-total-head > div > strong {
  color: var(--bc-primary);
  font-size: 15px;
}
.daily-total-head span,
.daily-total-foot span {
  color: var(--bc-muted);
  font-size: 11px;
}
.daily-total-foot > strong {
  font-size: 12px;
}
.calibration-value {
  color: #d97706 !important;
}
.reconciliation-row {
  background: rgba(32, 128, 240, 0.045);
}
.reconciliation-row td {
  font-size: 12px;
}
.split-table td small {
  display: block;
  margin-top: 3px;
  color: var(--bc-muted);
  font-size: 11px;
}
.shift-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}
.shift-table th,
.shift-table td {
  padding: 11px 12px;
  text-align: left;
  border-bottom: 1px solid var(--bc-border);
  white-space: nowrap;
}
.shift-table th {
  color: var(--bc-muted);
  font-size: 12px;
  background: var(--bc-surface-soft);
}
.shift-table tbody tr:last-child td {
  border-bottom: 0;
}
.collector-login-modal {
  width: min(460px, calc(100vw - 32px));
}
.collector-login-body {
  display: grid;
  justify-items: center;
  gap: 16px;
  padding: 20px 0 4px;
}
.collector-login-qr {
  display: block;
  width: 260px;
  height: 260px;
  max-width: 70vw;
  object-fit: contain;
}
:deep(.record-row) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
:deep(.record-row span) {
  display: block;
  margin-top: 3px;
  color: var(--bc-muted);
}
@media (max-width: 1100px) {
  .realtime-metrics,
  .performance-metrics,
  .ota-metrics,
  .dashboard-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  .workspace-title h1 {
    font-size: 21px;
  }
  .realtime-metrics,
  .performance-metrics,
  .ota-metrics,
  .dashboard-metrics,
  .dashboard-detail-grid,
  .category-check-grid {
    grid-template-columns: 1fr;
  }
  .performance-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .month-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  :deep(.n-tabs-nav-scroll-content) {
    min-width: max-content;
  }
}
</style>
