<template>
  <div class="page-stack">
    <div class="section-head">
      <div>
        <h1>运营配置</h1>
        <p>确认外部门店映射，并配置班次、排班周期、经营目标和消息推送。</p>
      </div>
      <n-button :loading="loading" @click="load">刷新</n-button>
    </div>
    <n-alert type="info" :bordered="false">
      X
      管家门店资料与经营数据通过独立采集系统接入；新环境首次使用时需先同步门店资料。
      <template v-if="isSuperAdmin" #action>
        <n-space>
          <n-button
            size="small"
            secondary
            :loading="syncingMachineCounts"
            @click="syncMachineCounts"
            >同步全部门店机器数量</n-button
          >
          <n-button
            size="small"
            secondary
            :loading="discoveringStores"
            @click="discoverStores"
            >同步门店资料</n-button
          >
        </n-space>
      </template>
    </n-alert>
    <n-tabs v-model:value="tab" type="segment" animated>
      <n-tab-pane
        name="store-matching"
        :tab="`门店匹配 (${pendingCandidates.length})`"
      >
        <n-card :bordered="false" title="外部门店待匹配">
          <template #header-extra
            ><n-button
              size="small"
              type="primary"
              :loading="discoveringStores"
              @click="discoverStores"
              >重新发现门店</n-button
            ></template
          >
          <n-alert type="info" :bordered="false" class="candidate-tip"
            >新发现的门店不会自动创建正式门店。请先在门店中心完成正式建店，再回到此处核对并绑定。</n-alert
          >
          <n-empty
            v-if="!pendingCandidates.length"
            description="暂无待匹配门店"
          />
          <div v-else class="candidate-list">
            <div
              v-for="item in pendingCandidates"
              :key="item.id"
              class="candidate-item"
            >
              <div>
                <strong>{{
                  item.externalStoreName || item.externalStoreId
                }}</strong
                ><span>外部编号：{{ item.externalStoreId }}</span
                ><small
                  >最近发现：{{
                    new Date(item.lastSeenAt).toLocaleString('zh-CN', {
                      hour12: false
                    })
                  }}</small
                >
              </div>
              <n-button
                size="small"
                type="primary"
                :disabled="!stores.length"
                @click="openCandidate(item)"
                >绑定已有门店</n-button
              >
            </div>
          </div>
        </n-card>
      </n-tab-pane>
      <n-tab-pane name="workforce" tab="班次排班">
        <n-card :bordered="false" title="默认班次"
          ><template #header-extra
            ><n-button size="small" type="primary" @click="open('shift')"
              >新增班次</n-button
            ></template
          ><record-table
            :rows="overview?.shiftTemplates ?? []"
            empty="尚无默认班次"
        /></n-card>
        <n-card :bordered="false" title="排班周期"
          ><template #header-extra
            ><n-button size="small" type="primary" @click="open('schedule')"
              >新建排班周期</n-button
            ></template
          ><n-empty
            v-if="!overview?.schedules.length"
            description="尚无排班周期"
          /><n-list v-else bordered
            ><n-list-item v-for="item in overview.schedules" :key="item.id"
              ><div class="simple-record">
                <div>
                  <strong>{{ storeDisplayName(item.store) }}</strong
                  ><span
                    >{{ item.startsOn.slice(0, 10) }} 至
                    {{ item.endsOn.slice(0, 10) }} ·
                    {{ item._count.assignments }} 条排岗</span
                  >
                </div>
                <n-button
                  size="small"
                  @click="router.push(`/v2/schedules/${item.id}`)"
                  >编辑排班</n-button
                >
              </div></n-list-item
            ></n-list
          ></n-card
        >
      </n-tab-pane>
      <n-tab-pane name="targets" tab="目标评分">
        <n-card :bordered="false" title="经营目标"
          ><template #header-extra
            ><n-button size="small" type="primary" @click="openTarget()"
              >设置月目标</n-button
            ></template
          ><n-empty
            v-if="!overview?.targets.length"
            description="尚无经营目标"
          />
          <div v-else class="target-list">
            <div
              v-for="item in overview.targets"
              :key="item.id"
              class="target-item"
            >
              <div>
                <strong>{{ storeDisplayName(item.store) }}</strong
                ><span>{{ targetMonthText(item.targetMonth) }}</span>
              </div>
              <div class="target-values">
                <span
                  >营收目标<strong
                    >¥{{ money(item.revenueTarget) }}</strong
                  ></span
                ><span
                  >利润目标<strong>{{
                    item.profitTarget == null
                      ? '未设置'
                      : `¥${money(item.profitTarget)}`
                  }}</strong></span
                >
              </div>
              <n-button size="small" secondary @click="openTarget(item)"
                >编辑目标</n-button
              >
            </div>
          </div></n-card
        >
        <n-card :bordered="false" title="评分方案"
          ><template #header-extra
            ><n-button size="small" type="primary" @click="open('score')"
              >新增评分方案</n-button
            ></template
          ><record-table
            :rows="overview?.scorePlans ?? []"
            empty="尚无评分方案"
        /></n-card>
      </n-tab-pane>
      <n-tab-pane v-if="isSuperAdmin" name="wecom" tab="企微推送">
        <n-card :bordered="false" title="企微群机器人"
          ><template #header-extra
            ><n-button size="small" type="primary" @click="openWecom()"
              >新增推送配置</n-button
            ></template
          >
          <n-alert type="info" :bordered="false" class="wecom-tip"
            >Webhook
            将加密保存，页面只显示脱敏地址。测试连接会向对应企微群发送一条测试消息。</n-alert
          >
          <n-empty
            v-if="!wecomConfigs.length"
            description="尚未配置企微群机器人"
          />
          <div v-else class="wecom-list">
            <div v-for="item in wecomConfigs" :key="item.id" class="wecom-item">
              <div>
                <div class="wecom-name">
                  <strong>{{ item.name }}</strong
                  ><n-tag
                    size="small"
                    :type="item.enabled ? 'success' : 'default'"
                    >{{ item.enabled ? '已启用' : '已停用' }}</n-tag
                  ><n-tag size="small">{{
                    reportTypeText(item.reportType)
                  }}</n-tag>
                </div>
                <span>{{ item.webhookMasked }}</span
                ><small>{{ wecomStoreText(item) }}</small
                ><small :class="item.scheduleEnabled ? 'push-success' : ''"
                  >定时推送：{{ scheduleText(item) }}</small
                ><small
                  v-if="item.lastScheduledAt"
                  :class="
                    item.lastScheduleStatus === 'FAILED'
                      ? 'push-failed'
                      : 'push-success'
                  "
                  >最近定时执行：{{
                    item.lastScheduleStatus === 'SUCCESS'
                      ? '成功'
                      : item.lastScheduleStatus === 'FAILED'
                        ? '失败'
                        : '执行中'
                  }}
                  ·
                  {{
                    new Date(item.lastScheduledAt).toLocaleString('zh-CN', {
                      hour12: false
                    })
                  }}<template v-if="item.lastScheduleError">
                    · {{ item.lastScheduleError }}</template
                  ></small
                ><small v-if="item.lastTestedAt"
                  >最近测试：{{
                    item.lastTestStatus === 'SUCCESS' ? '成功' : '失败'
                  }}
                  ·
                  {{
                    new Date(item.lastTestedAt).toLocaleString('zh-CN', {
                      hour12: false
                    })
                  }}</small
                ><small
                  v-if="item.pushLogs[0]"
                  :class="
                    item.pushLogs[0].status === 'SUCCESS'
                      ? 'push-success'
                      : 'push-failed'
                  "
                  >最近推送：{{
                    item.pushLogs[0].status === 'SUCCESS' ? '成功' : '失败'
                  }}
                  ·
                  {{
                    new Date(item.pushLogs[0].createdAt).toLocaleString(
                      'zh-CN',
                      { hour12: false }
                    )
                  }}<template v-if="item.pushLogs[0].errorMessage">
                    · {{ item.pushLogs[0].errorMessage }}</template
                  ></small
                >
              </div>
              <n-space
                ><n-button
                  size="small"
                  type="primary"
                  :disabled="!item.enabled"
                  :loading="pushingWecomId === item.id"
                  @click="pushWecom(item.id)"
                  >立即推送</n-button
                ><n-button
                  size="small"
                  :loading="testingWecomId === item.id"
                  @click="testWecom(item.id)"
                  >测试连接</n-button
                ><n-button size="small" secondary @click="openWecom(item)"
                  >编辑</n-button
                ></n-space
              >
            </div>
          </div>
        </n-card>
      </n-tab-pane>
    </n-tabs>
    <n-modal
      v-model:show="modalOpen"
      preset="card"
      :title="modalTitle"
      class="edit-modal"
      ><n-form label-placement="top">
        <template v-if="kind === 'shift'"
          ><n-form-item label="班次名称"
            ><n-input v-model:value="form.name" /></n-form-item
          ><n-form-item label="编码"
            ><n-input v-model:value="form.code" /></n-form-item
          ><n-grid :cols="2" :x-gap="12"
            ><n-form-item-gi label="开始"
              ><n-input
                v-model:value="form.startsAt"
                placeholder="09:00" /></n-form-item-gi
            ><n-form-item-gi label="结束"
              ><n-input
                v-model:value="form.endsAt"
                placeholder="21:00" /></n-form-item-gi></n-grid
          ><n-checkbox v-model:checked="form.spansNextDay"
            >跨自然日</n-checkbox
          ></template
        >
        <template v-else-if="kind === 'schedule'"
          ><store-select v-model="form.storeId" :stores="stores" /><n-grid
            :cols="2"
            :x-gap="12"
            ><n-form-item-gi label="开始日期"
              ><n-date-picker
                v-model:formatted-value="form.startsOn"
                value-format="yyyy-MM-dd"
                type="date"
                class="full" /></n-form-item-gi
            ><n-form-item-gi label="结束日期"
              ><n-date-picker
                v-model:formatted-value="form.endsOn"
                value-format="yyyy-MM-dd"
                type="date"
                class="full" /></n-form-item-gi></n-grid
        ></template>
        <template v-else-if="kind === 'target'"
          ><store-select
            v-model="form.storeId"
            :stores="stores"
            @update:model-value="selectTargetStore"
          /><n-form-item label="目标月份"
            ><n-date-picker
              v-model:formatted-value="form.targetMonth"
              value-format="yyyy-MM"
              type="month"
              class="full"
              @update:formatted-value="selectTargetMonth" /></n-form-item
          ><n-alert
            :type="existingTargetId ? 'success' : 'info'"
            :bordered="false"
            class="target-feedback"
            >{{
              existingTargetId
                ? '已加载该门店本月现有目标，保存后会同步更新业绩拆分。'
                : '该门店本月尚未设置目标，保存后将创建并同步到业绩拆分。'
            }}</n-alert
          ><n-form-item label="营业收入目标"
            ><n-input-number
              v-model:value="form.revenueTarget"
              :min="0"
              :precision="2"
              class="full"
              ><template #prefix>¥</template></n-input-number
            ></n-form-item
          ><n-form-item label="利润目标"
            ><n-input-number
              v-model:value="form.profitTarget"
              :precision="2"
              class="full"
              ><template #prefix>¥</template></n-input-number
            ></n-form-item
          ></template
        >
        <template v-else-if="kind === 'score'"
          ><n-form-item label="方案名称"
            ><n-input v-model:value="form.name" /></n-form-item
          ><n-form-item label="方案编码"
            ><n-input v-model:value="form.code" /></n-form-item
          ><n-form-item label="说明"
            ><n-input
              v-model:value="form.description"
              type="textarea" /></n-form-item
        ></template>
        <template v-else-if="kind === 'candidate-match'"
          ><n-alert type="info" :bordered="false" class="candidate-tip"
            >{{
              selectedCandidate?.externalStoreName ||
              selectedCandidate?.externalStoreId
            }}（{{ selectedCandidate?.externalStoreId }}）</n-alert
          ><n-form-item label="绑定到正式门店"
            ><n-select
              v-model:value="form.storeId"
              :options="activeStoreOptions"
              filterable /></n-form-item
        ></template>
        <template v-else-if="kind === 'wecom'"
          ><n-form-item label="配置名称"
            ><n-input
              v-model:value="form.name"
              placeholder="例如：运营日报群" /></n-form-item
          ><n-form-item label="群机器人 Webhook"
            ><n-input
              v-model:value="form.webhookUrl"
              type="password"
              show-password-on="click"
              :placeholder="
                editingWecomId
                  ? '留空则保持原地址'
                  : 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...'
              " /></n-form-item
          ><n-form-item label="报表范围"
            ><n-radio-group v-model:value="form.reportType"
              ><n-radio-button value="SINGLE">单店</n-radio-button
              ><n-radio-button value="MULTI">多店对比</n-radio-button
              ><n-radio-button value="ALL"
                >全部门店</n-radio-button
              ></n-radio-group
            ></n-form-item
          ><n-form-item v-if="form.reportType !== 'ALL'" label="选择门店"
            ><n-select
              v-model:value="form.storeIds"
              :options="storeOptions"
              multiple
              filterable
              :max-tag-count="3" /></n-form-item
          ><n-checkbox v-model:checked="form.enabled">启用此推送配置</n-checkbox
          ><n-divider />
          <n-checkbox v-model:checked="form.scheduleEnabled"
            >启用定时推送</n-checkbox
          >
          <n-grid
            v-if="form.scheduleEnabled"
            :cols="2"
            :x-gap="12"
            responsive="screen"
            class="schedule-fields"
          >
            <n-form-item-gi label="推送周期"
              ><n-select
                v-model:value="form.scheduleFrequency"
                :options="scheduleFrequencyOptions"
            /></n-form-item-gi>
            <n-form-item-gi label="固定时间"
              ><n-time-picker
                v-model:formatted-value="form.scheduleTime"
                value-format="HH:mm"
                format="HH:mm"
                class="full"
            /></n-form-item-gi>
            <n-form-item-gi
              v-if="form.scheduleFrequency === 'WEEKLY'"
              label="每周星期几"
              ><n-select
                v-model:value="form.scheduleWeekday"
                :options="weekdayOptions"
            /></n-form-item-gi>
            <n-form-item-gi
              v-if="form.scheduleFrequency === 'MONTHLY'"
              label="每月几号"
              ><n-input-number
                v-model:value="form.scheduleMonthDay"
                :min="1"
                :max="31"
                class="full"
            /></n-form-item-gi>
          </n-grid>
          <n-alert
            v-if="form.scheduleEnabled"
            type="info"
            :bordered="false"
            class="schedule-tip"
            >按北京时间执行；每月 29-31
            日遇到短月份时，将在该月最后一天推送。</n-alert
          >
        </template> </n-form
      ><template #footer
        ><n-space justify="end"
          ><n-button @click="modalOpen = false">取消</n-button
          ><n-button
            type="primary"
            :loading="saving"
            :disabled="saveDisabled"
            @click="save"
            >保存</n-button
          ></n-space
        ></template
      ></n-modal
    >
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue';
import {
  NTabPane,
  NTabs,
  NInputNumber,
  NDatePicker,
  NTimePicker,
  NEmpty,
  NFormItem,
  NSelect,
  useMessage
} from 'naive-ui';
import { useRouter } from 'vue-router';
import {
  getV2MasterDataOverview,
  type V2MasterDataOverview
} from '@/api/v2-master-data';
import {
  createV2Schedule,
  createV2ScorePlan,
  createV2ShiftTemplate,
  createV2Target,
  createV2WecomWebhook,
  discoverV2Stores,
  getV2OperationsOverview,
  getV2WecomWebhooks,
  pushV2WecomReport,
  matchV2ExternalStoreCandidate,
  testV2WecomWebhook,
  syncV2StoreMachineCounts,
  updateV2WecomWebhook,
  type V2OperationsOverview,
  type V2WecomWebhookConfig
} from '@/api/v2-operations';
import { useAuthStore } from '@/stores/auth';
import { storeDisplayName } from '@/utils/store-display';
const message = useMessage();
const router = useRouter();
const auth = useAuthStore();
const isSuperAdmin = computed(
  () => auth.user?.roles.includes('super_admin') === true
);
const tab = ref('store-matching');
const loading = ref(false);
const discoveringStores = ref(false);
const syncingMachineCounts = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const kind = ref('');
const overview = ref<V2OperationsOverview | null>(null);
const master = ref<V2MasterDataOverview | null>(null);
const wecomConfigs = ref<V2WecomWebhookConfig[]>([]);
const testingWecomId = ref('');
const pushingWecomId = ref('');
const editingWecomId = ref('');
const selectedCandidate = ref<
  V2OperationsOverview['externalStoreCandidates'][number] | null
>(null);
const existingTargetId = ref('');
const form = reactive<Record<string, any>>({});
const stores = computed(() => master.value?.stores ?? []);
const storeOptions = computed(() =>
  stores.value.map((item) => ({
    label: storeDisplayName(item),
    value: item.id
  }))
);
const activeStoreOptions = computed(() =>
  stores.value
    .filter((item) => item.status !== 'CLOSED')
    .map((item) => ({ label: storeDisplayName(item), value: item.id }))
);
const pendingCandidates = computed(() =>
  (overview.value?.externalStoreCandidates ?? []).filter(
    (item) => item.status === 'PENDING'
  )
);
const saveDisabled = computed(() => {
  if (kind.value === 'candidate-match') return !form.storeId;
  return false;
});
const modalTitle = computed(
  () =>
    ({
      shift: '新增默认班次',
      schedule: '新建排班周期',
      target: '设置月度经营目标',
      score: '新增评分方案',
      wecom: editingWecomId.value ? '编辑企微推送配置' : '新增企微推送配置',
      'candidate-match': '绑定已有正式门店'
    })[kind.value] ?? ''
);
const RecordTable = defineComponent({
  props: {
    rows: { type: Array as () => Array<Record<string, any>>, required: true },
    empty: { type: String, required: true }
  },
  setup: (p) => () =>
    p.rows.length
      ? h(
          'div',
          { class: 'simple-records' },
          p.rows.map((row, i) =>
            h('div', { class: 'simple-record', key: String(row.id ?? i) }, [
              h('strong', String(row.name ?? row.store?.name ?? '记录')),
              h('span', String(row.code ?? row.status ?? row.targetMonth ?? ''))
            ])
          )
        )
      : h(NEmpty, { description: p.empty })
});
const StoreSelect = defineComponent({
  props: {
    modelValue: String,
    stores: {
      type: Array as () => V2MasterDataOverview['stores'],
      required: true
    }
  },
  emits: ['update:modelValue'],
  setup:
    (p, { emit }) =>
    () =>
      h(
        NFormItem,
        { label: '门店' },
        {
          default: () =>
            h(NSelect, {
              value: p.modelValue,
              options: p.stores.map((s) => ({
                label: storeDisplayName(s),
                value: s.id
              })),
              onUpdateValue: (v: string) => emit('update:modelValue', v)
            })
        }
      )
});
async function load() {
  loading.value = true;
  try {
    const [operations, masterData, wecom] = await Promise.all([
      getV2OperationsOverview(),
      getV2MasterDataOverview(),
      isSuperAdmin.value ? getV2WecomWebhooks() : Promise.resolve([])
    ]);
    overview.value = operations;
    master.value = masterData;
    wecomConfigs.value = wecom;
  } finally {
    loading.value = false;
  }
}
async function discoverStores() {
  discoveringStores.value = true;
  try {
    const result = await discoverV2Stores();
    message.success(
      `已读取 ${result.discovered} 家门店；待匹配 ${result.pending} 家，已关联 ${result.mapped} 家`
    );
    await load();
  } finally {
    discoveringStores.value = false;
  }
}
async function syncMachineCounts() {
  syncingMachineCounts.value = true;
  try {
    const result = await syncV2StoreMachineCounts();
    await load();
    if (result.skippedStoreCount)
      message.warning(
        `已更新 ${result.updatedStoreCount}/${result.mappedStoreCount} 家门店，${result.skippedStoreCount} 家未取得有效机器清单并保留原值`
      );
    else
      message.success(`已同步全部 ${result.updatedStoreCount} 家门店机器数量`);
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : '机器数量同步失败，请检查X管家登录态'
    );
  } finally {
    syncingMachineCounts.value = false;
  }
}
function open(next: string) {
  kind.value = next;
  Object.keys(form).forEach((k) => delete form[k]);
  const today = new Date().toISOString().slice(0, 10);
  if (next === 'shift')
    Object.assign(form, {
      startsAt: '09:00',
      endsAt: '21:00',
      spansNextDay: false
    });
  if (next === 'schedule')
    Object.assign(form, { startsOn: today, endsOn: today });
  modalOpen.value = true;
}
function openCandidate(
  item: V2OperationsOverview['externalStoreCandidates'][number]
) {
  selectedCandidate.value = item;
  kind.value = 'candidate-match';
  Object.keys(form).forEach((key) => delete form[key]);
  form.storeId = activeStoreOptions.value[0]?.value;
  modalOpen.value = true;
}
function targetMonthText(value: string) {
  const month = value.slice(0, 7);
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}
function money(value: string | number) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function matchingTarget() {
  return overview.value?.targets.find(
    (item) =>
      item.store.id === form.storeId &&
      item.targetMonth.slice(0, 7) === form.targetMonth
  );
}
function hydrateTarget() {
  const item = matchingTarget();
  existingTargetId.value = item?.id ?? '';
  form.revenueTarget = item ? Number(item.revenueTarget) : 0;
  form.profitTarget =
    item?.profitTarget == null ? null : Number(item.profitTarget);
}
function selectTargetStore(value: string) {
  form.storeId = value;
  hydrateTarget();
}
function selectTargetMonth(value: string | null) {
  if (value) form.targetMonth = value;
  hydrateTarget();
}
function openTarget(item?: V2OperationsOverview['targets'][number]) {
  kind.value = 'target';
  Object.keys(form).forEach((k) => delete form[k]);
  const today = new Date().toISOString().slice(0, 10);
  Object.assign(form, {
    storeId: item?.store.id ?? stores.value[0]?.id,
    targetMonth: item?.targetMonth.slice(0, 7) ?? today.slice(0, 7)
  });
  hydrateTarget();
  modalOpen.value = true;
}
function openWecom(item?: V2WecomWebhookConfig) {
  kind.value = 'wecom';
  editingWecomId.value = item?.id ?? '';
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, {
    name: item?.name ?? '',
    webhookUrl: '',
    reportType: item?.reportType ?? 'ALL',
    storeIds: [...(item?.storeIds ?? [])],
    enabled: item?.enabled ?? true,
    scheduleEnabled: item?.scheduleEnabled ?? false,
    scheduleFrequency: item?.scheduleFrequency ?? 'DAILY',
    scheduleTime: item?.scheduleTime ?? '09:00',
    scheduleWeekday: item?.scheduleWeekday ?? 1,
    scheduleMonthDay: item?.scheduleMonthDay ?? 1
  });
  modalOpen.value = true;
}
function reportTypeText(value: string) {
  return (
    (
      { SINGLE: '单店报表', MULTI: '多店对比', ALL: '全部门店' } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}
const scheduleFrequencyOptions = [
  { label: '每日', value: 'DAILY' },
  { label: '每周', value: 'WEEKLY' },
  { label: '每月', value: 'MONTHLY' }
];
const weekdayOptions = [
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
  '周日'
].map((label, index) => ({ label, value: index + 1 }));
function scheduleText(item: V2WecomWebhookConfig) {
  if (!item.scheduleEnabled) return '未启用';
  const time = item.scheduleTime ?? '--:--';
  if (item.scheduleFrequency === 'WEEKLY')
    return `每周${weekdayOptions[(item.scheduleWeekday ?? 1) - 1]?.label ?? ''} ${time}`;
  if (item.scheduleFrequency === 'MONTHLY')
    return `每月 ${item.scheduleMonthDay ?? 1} 日 ${time}`;
  return `每日 ${time}`;
}
function wecomStoreText(item: V2WecomWebhookConfig) {
  if (item.reportType === 'ALL') return '范围：全部门店';
  const names = item.storeIds
    .map((id) =>
      storeDisplayName(stores.value.find((store) => store.id === id))
    )
    .filter(Boolean);
  return `范围：${names.join('、') || '未选择门店'}`;
}
async function testWecom(id: string) {
  testingWecomId.value = id;
  try {
    await testV2WecomWebhook(id);
    await load();
    message.success('连接成功，测试消息已发送到企微群');
  } catch {
    message.error('连接测试失败，请检查 Webhook 是否有效');
  } finally {
    testingWecomId.value = '';
  }
}
async function pushWecom(id: string) {
  pushingWecomId.value = id;
  try {
    const result = await pushV2WecomReport(id);
    await load();
    message.success(
      `${result.reportMonth} 经营图表已推送，共 ${result.storeCount} 家门店`
    );
  } catch {
    await load();
    message.error('经营图表推送失败，请查看最近推送结果');
  } finally {
    pushingWecomId.value = '';
  }
}
async function save() {
  saving.value = true;
  try {
    if (kind.value === 'shift') await createV2ShiftTemplate(form);
    if (kind.value === 'schedule') await createV2Schedule(form);
    if (kind.value === 'target') await createV2Target(form);
    if (kind.value === 'score') await createV2ScorePlan(form);
    if (kind.value === 'candidate-match' && selectedCandidate.value)
      await matchV2ExternalStoreCandidate(
        selectedCandidate.value.id,
        form.storeId
      );
    if (kind.value === 'wecom') {
      const payload = { ...form, webhookUrl: form.webhookUrl || undefined };
      if (editingWecomId.value)
        await updateV2WecomWebhook(editingWecomId.value, payload);
      else await createV2WecomWebhook(payload);
    }
    modalOpen.value = false;
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
onMounted(() => void load());
</script>

<style scoped>
.n-tab-pane {
  display: grid;
  gap: 14px;
}
.simple-records {
  display: grid;
  gap: 8px;
}
.simple-record {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border: 1px solid var(--bc-border);
  border-radius: 10px;
}
.simple-record span {
  color: var(--bc-muted);
}
.target-feedback {
  margin-bottom: 16px;
}
.candidate-tip {
  margin-bottom: 14px;
}
.candidate-list {
  display: grid;
  gap: 10px;
}
.candidate-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--bc-border);
  border-radius: 12px;
}
.candidate-item span,
.candidate-item small {
  display: block;
  margin-top: 5px;
  color: var(--bc-muted);
}
.target-list {
  display: grid;
  gap: 10px;
}
.target-item {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(280px, 1.5fr) auto;
  align-items: center;
  gap: 18px;
  padding: 14px;
  border: 1px solid var(--bc-border);
  border-radius: 12px;
}
.target-item > div:first-child span {
  display: block;
  margin-top: 4px;
  color: var(--bc-muted);
}
.target-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 12px;
}
.target-values span {
  color: var(--bc-muted);
  font-size: 12px;
}
.target-values strong {
  display: block;
  margin-top: 4px;
  color: var(--bc-text);
  font-size: 16px;
}
.wecom-tip {
  margin-bottom: 14px;
}
.wecom-list {
  display: grid;
  gap: 10px;
}
.wecom-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--bc-border);
  border-radius: 12px;
}
.wecom-item span,
.wecom-item small {
  display: block;
  margin-top: 5px;
  color: var(--bc-muted);
}
.wecom-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wecom-name strong {
  font-size: 16px;
}
.wecom-item .push-success {
  color: #18a058;
}
.wecom-item .push-failed {
  color: #d03050;
}
@media (max-width: 640px) {
  .wecom-item {
    align-items: flex-start;
    flex-direction: column;
  }
  .target-item {
    grid-template-columns: 1fr;
  }
  .target-values {
    grid-template-columns: 1fr 1fr;
  }
  .candidate-item {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
