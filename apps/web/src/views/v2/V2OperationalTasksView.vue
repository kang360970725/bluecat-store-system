<script setup lang="ts">
import { NInputNumber } from 'naive-ui';
import { NSelect } from '@/components/Select';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { API_BASE_URL, request } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { browserUuid } from '@/utils/uuid';

interface Target {
  storeId: string;
  storeName: string;
  targetKey: string;
  targetName: string;
}

interface CcOption {
  username: string;
  displayName: string;
  allStores: boolean;
  stores: string[];
}

interface ExtensionHistory {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  reviewNote: string | null;
  previousDueAt: string;
  newDueAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface PendingExtension {
  id: string;
  reason: string;
  previousDueAt: string;
  createdAt: string;
  canReview: boolean;
  task: {
    title: string;
    targetName: string;
    store: { name: string; status: string };
  };
}

interface Task {
  id: string;
  title: string;
  description: string;
  targetName: string;
  store: { name: string };
  dueAt: string;
  status: 'PENDING' | 'CLAIMED' | 'SUBMITTED' | 'DONE';
  claimerName: string | null;
  submission: string | null;
  checklist: string[] | null;
  ccRecipients?: Array<{ username: string }> | null;
  checklistConfirmed: boolean;
  checklistIssues: Record<string, string> | null;
  sourceIssue: {
    index: number;
    label: string;
    reason: string;
    submittedAt: string;
  } | null;
  evidence: Array<{ id: string }>;
  extensions?: ExtensionHistory[];
  submittedAt: string | null;
  claimedAt: string | null;
  storeId: string;
  sourceTaskId: string | null;
  sourceTask?: { title: string } | null;
  _count?: { rectifications: number };
  reopenHistory: Array<{
    action: 'RETURN' | 'RELEASE';
    reason: string;
    createdAt: string;
    previousClaimerName?: string | null;
    previousSubmission?: string | null;
    checklistConfirmed?: boolean;
    checklistIssues?: Record<string, string>;
    evidence?: Array<{ id: string }>;
    previousSubmittedAt?: string | null;
  }>;
}

interface ManagementFilters {
  storeId: string | null;
  status: string | null;
  kind: string | null;
  keyword: string;
}

const emptyFilters = (): ManagementFilters => ({
  storeId: null,
  status: null,
  kind: null,
  keyword: ''
});
const managementFilters = ref(emptyFilters());
const appliedFilters = ref(emptyFilters());
const managementPage = ref(1);
const hasNextPage = ref(false);
const managementStores = ref<
  Array<{ id: string; name: string; status: string }>
>([]);
const managementStoreOptions = computed(() =>
  managementStores.value.map((store) => ({
    value: store.id,
    label: store.status === 'OPERATING' ? store.name : `${store.name}（非营业）`
  }))
);
const statusOptions = [
  { label: '待认领', value: 'PENDING' },
  { label: '执行中', value: 'CLAIMED' },
  { label: '待确认', value: 'SUBMITTED' },
  { label: '已完成', value: 'DONE' },
  { label: '已逾期', value: 'EXPIRED' }
];
const kindOptions = [
  { label: '普通任务', value: 'TASK' },
  { label: '整改任务', value: 'RECTIFICATION' }
];

type Cadence = 'DAILY' | 'WEEKLY' | 'MONTHLY';
interface Schedule {
  id: string;
  title: string;
  targetName: string;
  cadence: Cadence;
  dueHours: number;
  enabled: boolean;
  nextRunAt: string;
  pauseReason: string | null;
  store: { name: string };
}
type Reminder = Pick<Task, 'id' | 'title' | 'dueAt' | 'store'>;
const cadenceLabels: Record<Cadence, string> = {
  DAILY: '每天',
  WEEKLY: '每周',
  MONTHLY: '每月'
};
const cadenceOptions = [
  { value: 'ONCE', label: '一次性' },
  ...Object.entries(cadenceLabels).map(([value, label]) => ({ value, label }))
];

interface TaskInbox {
  unread: number;
  rows: Array<{
    id: string;
    kind: 'SUBMITTED' | 'COMPLETED' | 'RETURNED' | 'CC' | 'RELEASED';
    reason: string | null;
    readAt: string | null;
    createdAt: string;
    task: { title: string; store: { name: string } };
  }>;
}
const inbox = ref<TaskInbox>({ unread: 0, rows: [] });
const inboxOpen = ref(false);
const inboxLabels = {
  SUBMITTED: '任务已提交',
  CC: '任务结果抄送',
  COMPLETED: '任务已确认完成',
  RETURNED: '任务被打回',
  RELEASED: '任务认领已释放'
};

const base = '/v2/operational-tasks';
const canManage = ref(false);
const canReport = ref(false);
const canReviewExtensions = ref(false);
const pendingExtensions = ref<PendingExtension[]>([]);
const extensionDialog = ref<{ task: Task } | { request: PendingExtension }>();
const extensionNote = ref('');
const extensionDue = ref('');
const extensionStatus = {
  PENDING: '待总部审核',
  APPROVED: '已通过',
  REJECTED: '已驳回'
};
const assigned = ref<Task[]>([]);
const assignedMode = ref<'ACTIVE' | 'HISTORY'>('ACTIVE');
const assignedPage = ref(1);
const hasNextAssigned = ref(false);
const managed = ref<Task[]>([]);
const targets = ref<Target[]>([]);
const selected = ref<string[]>([]);
const title = ref('');
const description = ref('');
const checklistText = ref('');
const ccUsernames = ref<string[]>([]);
const ccCandidates = ref<CcOption[]>([]);
const ccLoading = ref(false);
const ccError = ref('');
const checkedItems = ref<Array<number | string>>([]);
const due = ref('');
const cadence = ref<'ONCE' | Cadence>('ONCE');
const dueHours = ref<number | null>(24);
const schedules = ref<Schedule[]>([]);
const reminders = ref<Reminder[]>([]);
const recurring = computed(() => cadence.value !== 'ONCE' && !sourceTask.value);
const dispatchAttempt = ref<{ id: string; signature: string }>();
const selectedTask = ref<Task>();
const sourceTask = ref<Task>();
const sourceItemIndex = ref<number>();
const issueNotes = ref<Record<string, string>>({});
const reopenTask = ref<Task>();
const reopenNote = ref('');
const reopenDue = ref('');
const visibleTargets = computed(() =>
  sourceTask.value
    ? targets.value.filter(
        (target) => target.storeId === sourceTask.value?.storeId
      )
    : targets.value
);
const submission = ref('');
const photos = ref<File[]>([]);
const photoError = ref('');
const previewUrl = ref('');
let previewRequest: AbortController | undefined;
const auth = useAuthStore();
const busy = ref(false);
const errorMessage = ref('');
const feedback = ref('');
const time = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'medium',
  timeStyle: 'short'
});
const targetValue = (target: Target) => `${target.storeId}/${target.targetKey}`;
const options = computed(() =>
  visibleTargets.value.map((target) => ({
    value: targetValue(target),
    label: `${target.storeName} · ${target.targetName}`
  }))
);
const selectedStoreKey = computed(() =>
  [
    ...new Set(
      visibleTargets.value
        .filter((target) => selected.value.includes(targetValue(target)))
        .map((target) => target.storeId)
    )
  ]
    .sort()
    .join(',')
);
const ccOptions = computed(() =>
  ccCandidates.value.map((account) => ({
    value: account.username,
    label: `${account.displayName} · ${account.username} · ${
      account.allStores ? '全部门店' : account.stores.join('、')
    }`,
    disabled:
      ccUsernames.value.length >= 5 &&
      !ccUsernames.value.includes(account.username)
  }))
);
let ccLoadSequence = 0;

async function loadCcOptions(storeIds: string) {
  const sequence = ++ccLoadSequence;
  ccCandidates.value = [];
  ccError.value = '';
  if (!storeIds) {
    ccUsernames.value = [];
    return;
  }
  ccLoading.value = true;
  try {
    const rows = await request<CcOption[]>(
      `${base}/cc-options?storeIds=${encodeURIComponent(storeIds)}`
    );
    if (sequence !== ccLoadSequence) return;
    ccCandidates.value = rows;
    const available = new Set(rows.map((item) => item.username));
    ccUsernames.value = ccUsernames.value.filter((username) =>
      available.has(username)
    );
  } catch (error) {
    if (sequence === ccLoadSequence)
      ccError.value = (error as Error).message;
  } finally {
    if (sequence === ccLoadSequence) ccLoading.value = false;
  }
}

watch(selectedStoreKey, (storeIds) => void loadCcOptions(storeIds));
const isExpired = (task: Task) => new Date(task.dueAt).getTime() <= Date.now();
const statusText = (task: Task) => {
  if (
    (task.status === 'PENDING' || task.status === 'CLAIMED') &&
    isExpired(task)
  )
    return '已逾期';
  return {
    PENDING: '待认领',
    CLAIMED: '执行中',
    SUBMITTED: '待确认',
    DONE: '已完成'
  }[task.status];
};

async function load(
  page = managementPage.value,
  filters = appliedFilters.value,
  refreshTargets = false,
  nextAssignedPage = assignedPage.value,
  nextAssignedMode = assignedMode.value
) {
  const query = new URLSearchParams({
    page: String(page),
    assignedPage: String(nextAssignedPage),
    assignedMode: nextAssignedMode
  });
  if (filters.storeId) query.set('storeId', filters.storeId);
  if (filters.status) query.set('status', filters.status);
  if (filters.kind) query.set('kind', filters.kind);
  if (filters.keyword.trim()) query.set('keyword', filters.keyword.trim());

  const data = await request<{
    canManage: boolean;
    canReport: boolean;
    canReviewExtensions: boolean;
    assigned: Task[];
    hasNextAssigned: boolean;
    reminders: Reminder[];
    managed: Task[];
    managementStores: Array<{ id: string; name: string; status: string }>;
    hasNext: boolean;
  }>(`${base}?${query}`);
  assigned.value = data.assigned;
  assignedPage.value = nextAssignedPage;
  assignedMode.value = nextAssignedMode;
  hasNextAssigned.value = data.hasNextAssigned;
  reminders.value = data.reminders;
  managed.value = data.managed;
  canManage.value = data.canManage;
  canReport.value = data.canReport;
  canReviewExtensions.value = data.canReviewExtensions;
  managementStores.value = data.managementStores;
  managementPage.value = page;
  hasNextPage.value = data.hasNext;
  appliedFilters.value = { ...filters };

  if (refreshTargets || !data.canReviewExtensions) await loadExtensions();

  if (refreshTargets || !data.canManage) {
    if (data.canManage) {
      const [nextTargets, nextSchedules] = await Promise.all([
        request<Target[]>(`${base}/targets`),
        request<Schedule[]>(`${base}/schedules`)
      ]);
      targets.value = nextTargets;
      schedules.value = nextSchedules;
    } else {
      targets.value = [];
      schedules.value = [];
    }
    const available = new Set(targets.value.map(targetValue));
    selected.value = selected.value.filter((value) => available.has(value));
  }
}

async function loadExtensions() {
  pendingExtensions.value = canReviewExtensions.value
    ? await request<PendingExtension[]>(`${base}/extensions`)
    : [];
}

function openExtension(target: { task: Task } | { request: PendingExtension }) {
  extensionDialog.value = target;
  extensionNote.value = '';
  extensionDue.value = '';
  errorMessage.value = '';
}

function submitExtension(approved?: boolean) {
  const dialog = extensionDialog.value;
  if (!dialog || !extensionNote.value.trim()) return;
  void run(async () => {
    if ('task' in dialog) {
      await request(
        `${base}/${encodeURIComponent(dialog.task.id)}/extensions`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: extensionNote.value.trim() })
        }
      );
      feedback.value = '补交申请已提交';
    } else {
      await request(
        `${base}/extensions/${encodeURIComponent(dialog.request.id)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            approved,
            note: extensionNote.value.trim(),
            dueAt: approved
              ? new Date(extensionDue.value + '+08:00').toISOString()
              : undefined
          })
        }
      );
      feedback.value = approved ? '任务已开放补交' : '补交申请已驳回';
    }
    extensionDialog.value = undefined;
    await load();
    await loadExtensions();
  });
}

function applyManagementFilters() {
  const filters = { ...managementFilters.value };
  void run(() => load(1, filters));
}

function clearManagementFilters() {
  if (busy.value) return;
  managementFilters.value = emptyFilters();
  applyManagementFilters();
}

function browseAssigned(page: number, mode = assignedMode.value) {
  void run(() =>
    load(managementPage.value, appliedFilters.value, false, page, mode)
  );
}

function refresh() {
  return run(async () => {
    await load(managementPage.value, appliedFilters.value, true);
    inbox.value = await request<TaskInbox>(`${base}/inbox`);
  });
}

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  reminderRequest?.abort();
  busy.value = true;
  errorMessage.value = '';
  feedback.value = '';
  try {
    await action();
  } catch (error) {
    errorMessage.value = (error as Error).message;
  } finally {
    busy.value = false;
  }
}

function dispatch() {
  if (
    !title.value.trim() ||
    !description.value.trim() ||
    !due.value ||
    !selected.value.length
  )
    return;
  void run(async () => {
    const formTargets = visibleTargets.value
      .filter((target) => selected.value.includes(targetValue(target)))
      .map(({ storeId, targetKey }) => ({ storeId, targetKey }));
    const formTitle = title.value.trim();
    const formCcUsernames = [...new Set(ccUsernames.value)];
    const formDescription = description.value.trim();
    const checklist = checklistText.value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (
      checklist.length > 20 ||
      checklist.some((item) => item.length > 120) ||
      new Set(checklist).size !== checklist.length
    ) {
      throw new Error('最多 20 个检查项，每项不超过 120 字，且不能重复');
    }
    const time = new Date(due.value + '+08:00').toISOString();
    const cadenceValue = cadence.value;
    const isRecurring = cadenceValue !== 'ONCE' && !sourceTask.value;
    if (isRecurring && (formTargets.length !== 1 || !dueHours.value)) {
      throw new Error('循环模板需要一个门店岗位和完成时限');
    }
    const payload = isRecurring
      ? {
          title: formTitle,
          description: formDescription,
          checklist,
          ccUsernames: formCcUsernames,
          cadence: cadenceValue,
          firstRunAt: time,
          dueHours: dueHours.value,
          target: formTargets[0]
        }
      : {
          title: formTitle,
          description: formDescription,
          checklist,
          ccUsernames: formCcUsernames,
          dueAt: time,
          sourceTaskId: sourceTask.value?.id,
          sourceItemIndex: sourceTask.value ? sourceItemIndex.value : undefined,
          sourceSubmittedAt:
            sourceTask.value && sourceItemIndex.value !== undefined
              ? sourceTask.value.submittedAt
              : undefined,
          targets: formTargets
        };
    const signature = JSON.stringify(payload);
    if (dispatchAttempt.value?.signature !== signature) {
      dispatchAttempt.value = { signature, id: browserUuid() };
    }
    const id = dispatchAttempt.value.id;
    if (isRecurring) {
      await request(`${base}/schedules`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, requestId: id })
      });
      feedback.value = '已创建循环模板';
    } else {
      const result = await request<{ count: number }>(`${base}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, batchId: id })
      });
      feedback.value = `已派发 ${result.count} 项门店岗位任务`;
    }
    dispatchAttempt.value = undefined;
    title.value = '';
    description.value = '';
    checklistText.value = '';
    ccUsernames.value = [];
    due.value = '';
    selected.value = [];
    sourceTask.value = undefined;
    await load(1, appliedFilters.value, isRecurring);
  });
}

function toggleSchedule(schedule: Schedule) {
  void run(async () => {
    await request(
      `${base}/schedules/${encodeURIComponent(schedule.id)}/enabled`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled: !schedule.enabled })
      }
    );
    schedules.value = await request<Schedule[]>(`${base}/schedules`);
    feedback.value = schedule.enabled ? '已暂停循环派发' : '已恢复循环派发';
  });
}

function openSubmission(task: Task) {
  issueNotes.value = {};
  checkedItems.value = [];
  submission.value = '';
  photos.value = [];
  photoError.value = '';
  errorMessage.value = '';
  selectedTask.value = task;
}

function choosePhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  photoError.value = '';
  if (files.length > 3 || files.some((file) => file.size > 5 * 1024 * 1024)) {
    input.value = '';
    photos.value = [];
    photoError.value = '最多选择 3 张照片，每张不超过 5 MB';
    return;
  }
  photos.value = files;
}

function closePreview() {
  previewRequest?.abort();
  previewRequest = undefined;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

async function openPhoto(taskId: string, evidenceId: string) {
  closePreview();
  errorMessage.value = '';
  const controller = new AbortController();
  previewRequest = controller;
  try {
    const response = await fetch(
      `${API_BASE_URL}${base}/${encodeURIComponent(taskId)}/evidence/${encodeURIComponent(evidenceId)}`,
      {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        cache: 'no-store',
        signal: controller.signal
      }
    );
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('image/jpeg')
    ) {
      throw new Error('无法查看照片，请刷新任务或重新登录');
    }
    const blob = await response.blob();
    if (!controller.signal.aborted)
      previewUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    if (!controller.signal.aborted)
      errorMessage.value = (error as Error).message;
  }
}

function act(task: Task, action: 'claim' | 'submit' | 'complete') {
  void run(async () => {
    let body: FormData | string | undefined;
    if (action === 'submit') {
      if (task.sourceTaskId && !photos.value.length)
        throw new Error('请至少上传一张整改照片');
      body = new FormData();
      body.set('submission', submission.value);
      if (checkedItems.value.length)
        body.set(
          'checkedItems',
          [...checkedItems.value]
            .sort((a, b) => Number(a) - Number(b))
            .join(',')
        );
      const issues = Object.fromEntries(
        Object.entries(issueNotes.value)
          .filter(([, value]) => value.trim())
          .map(([key, value]) => [key, value.trim()])
      );
      if (Object.keys(issues).length)
        body.set('checklistIssues', JSON.stringify(issues));
      for (const photo of photos.value) body.append('photos', photo);
    } else if (action === 'complete') {
      body = JSON.stringify({ submittedAt: task.submittedAt });
    }
    await request(`${base}/${encodeURIComponent(task.id)}/${action}`, {
      method: 'POST',
      body
    });
    selectedTask.value = undefined;
    photos.value = [];
    await load();
  });
}

function startRectification(task: Task, index?: number) {
  sourceItemIndex.value = index;
  sourceTask.value = task;
  cadence.value = 'ONCE';
  checklistText.value = '';
  ccUsernames.value = [];
  title.value = `整改 · ${task.title}`.slice(0, 120);
  description.value =
    index === undefined
      ? ''
      : `${task.checklist?.[index]}：${task.checklistIssues?.[index]}`;
  due.value = '';
  selected.value = [];
  errorMessage.value = '';
  document.getElementById('task-dispatch')?.scrollIntoView({ block: 'start' });
}

function openReopen(task: Task) {
  reopenTask.value = task;
  reopenNote.value = '';
  reopenDue.value = '';
  errorMessage.value = '';
}

function confirmReopen() {
  const task = reopenTask.value;
  if (!task || !reopenNote.value.trim()) return;
  const release = task.status === 'CLAIMED';
  if (release ? !task.claimedAt : !reopenDue.value) return;
  void run(async () => {
    const reason = reopenNote.value.trim();
    await request(
      `${base}/${encodeURIComponent(task.id)}/${release ? 'release' : 'reopen'}`,
      {
        method: 'POST',
        body: JSON.stringify(
          release
            ? { reason, claimedAt: task.claimedAt }
            : {
                reason,
                dueAt: new Date(reopenDue.value + '+08:00').toISOString(),
                submittedAt: task.submittedAt
              }
        )
      }
    );
    feedback.value = release
      ? '已释放认领，任务回到待认领'
      : '已打回并重新开放认领';
    reopenTask.value = undefined;
    await load();
  });
}

let reminderTimer: ReturnType<typeof setInterval> | undefined;
let reminderRequest: AbortController | undefined;

function readMessage(id: string) {
  void run(async () => {
    await request(`${base}/inbox/${encodeURIComponent(id)}/read`, {
      method: 'POST'
    });
    inbox.value = await request<TaskInbox>(`${base}/inbox`);
  });
}

async function refreshReminders() {
  if (busy.value || reminderRequest || document.hidden) return;
  const controller = new AbortController();
  reminderRequest = controller;
  try {
    const [items, messages] = await Promise.all([
      request<Reminder[]>(`${base}/reminders`, { signal: controller.signal }),
      request<TaskInbox>(`${base}/inbox`, { signal: controller.signal })
    ]);
    if (!controller.signal.aborted && !busy.value) {
      reminders.value = items;
      inbox.value = messages;
    }
  } catch {
    // A later refresh can retry without interrupting task editing.
  } finally {
    if (reminderRequest === controller) reminderRequest = undefined;
  }
}

onMounted(() => {
  void refresh();
  reminderTimer = setInterval(() => void refreshReminders(), 60_000);
});
onUnmounted(() => {
  clearInterval(reminderTimer);
  reminderRequest?.abort();
  closePreview();
});
</script>

<template>
  <section class="space-y-4">
    <n-space align="center" justify="space-between">
      <h1 class="text-xl font-semibold">运营任务</h1>
      <RouterLink v-if="canReport" to="/v2/operational-tasks/report"
        >任务统计与导出</RouterLink
      >
    </n-space>
    <n-button :disabled="busy" @click="refresh">刷新</n-button>
    <n-alert
      v-if="errorMessage && !selectedTask && !reopenTask && !extensionDialog"
      type="error"
      >{{ errorMessage }}</n-alert
    >
    <n-alert v-if="feedback" type="success">{{ feedback }}</n-alert>

    <n-card size="small" title="任务消息">
      <template #header-extra>
        <n-badge :value="inbox.unread" :max="99">
          <n-button size="small" @click="inboxOpen = !inboxOpen">{{
            inboxOpen ? '收起' : '查看消息'
          }}</n-button>
        </n-badge>
      </template>
      <div v-if="inboxOpen">
        <p v-if="!inbox.rows.length">暂无任务消息</p>
        <p v-else>最多显示 30 条，未读优先。</p>
        <div
          v-for="message in inbox.rows"
          :key="message.id"
          class="border-b py-2"
        >
          <p class="font-semibold">
            {{ inboxLabels[message.kind] }} · {{ message.task.title }}
          </p>
          <p>
            {{ message.task.store.name }} ·
            {{ time.format(new Date(message.createdAt)) }}
          </p>
          <p v-if="message.reason" class="whitespace-pre-wrap break-words">
            {{ message.reason }}
          </p>
          <n-button
            v-if="!message.readAt"
            size="tiny"
            :disabled="busy"
            @click="readMessage(message.id)"
            >标为已读</n-button
          >
        </div>
      </div>
    </n-card>

    <n-card
      v-if="canManage"
      id="task-dispatch"
      :title="sourceTask ? '派发整改' : '派发任务'"
    >
      <n-space v-if="sourceTask" class="mb-3" align="center">
        <span
          >来源：{{ sourceTask.title }} · {{ sourceTask.store.name
          }}<template v-if="sourceItemIndex !== undefined">
            · {{ sourceTask.checklist?.[sourceItemIndex] }}</template
          ></span
        >
        <n-button
          size="small"
          :disabled="busy"
          @click="
            sourceTask = undefined;
            selected = [];
          "
          >取消整改派发</n-button
        >
      </n-space>
      <form class="space-y-3" @submit.prevent="dispatch">
        <n-input
          v-model:value="title"
          maxlength="120"
          placeholder="任务名称"
          :disabled="busy"
        />
        <n-input
          v-model:value="description"
          type="textarea"
          maxlength="3000"
          placeholder="任务说明"
          :disabled="busy"
        />
        <n-input
          v-model:value="checklistText"
          type="textarea"
          maxlength="2420"
          placeholder="检查清单（选填，每行一项）"
          :disabled="busy"
        />
        <n-select
          v-if="!sourceTask"
          v-model:value="cadence"
          :options="cadenceOptions"
          :disabled="busy"
        />
        <strong>任务执行门店与岗位</strong>
        <n-select
          v-model:value="selected"
          :options="options"
          multiple
          filterable
          :max-tag-count="4"
          placeholder="任务执行门店与岗位（每组生成一项任务）"
          :disabled="busy"
        />
        <p>仅显示当前有在岗员工的岗位；同岗位员工均可看到任务，由其中一人认领执行。</p>
        <strong>结果抄送账号（选填）</strong>
        <n-select
          v-model:value="ccUsernames"
          :options="ccOptions"
          multiple
          filterable
          :max-tag-count="3"
          :loading="ccLoading"
          :disabled="busy || !selectedStoreKey"
          placeholder="结果抄送账号（选填，最多 5 个）"
        />
        <p v-if="selectedStoreKey && !ccLoading && !ccOptions.length">
          当前没有同时具备全部已选门店任务管理权限的可用账号。
        </p>
        <n-alert type="info" :bordered="false">
          抄送人只在员工提交任务结果后收到通知，不会获得任务认领或执行权限；系统仅列出拥有全部已选门店任务管理权限的账号。
        </n-alert>
        <n-alert v-if="ccError" type="error" :bordered="false">{{ ccError }}</n-alert>
        <label>
          {{ recurring ? '首次派发时间' : '截止时间' }}（北京时间）
          <input
            v-model="due"
            type="datetime-local"
            required
            :disabled="busy"
          />
        </label>
        <label v-if="recurring">
          每次任务的完成时限（小时）
          <n-input-number
            v-model:value="dueHours"
            :min="1"
            :max="168"
            :precision="0"
            :disabled="busy"
          />
        </label>
        <p v-if="recurring">
          每个模板选择一个门店岗位。每月日期不足时，安排在当月最后一天。
        </p>
        <p v-else-if="selected.length > 50">每批最多派发 50 项任务</p>
        <n-button
          attr-type="submit"
          type="primary"
          :disabled="
            busy ||
            (recurring
              ? selected.length !== 1 || !dueHours
              : selected.length > 50)
          "
        >
          {{ recurring ? '创建循环模板' : '派发' }}
        </n-button>
      </form>
    </n-card>

    <n-card v-if="canManage" title="循环模板（最近 100 项）">
      <p v-if="!schedules.length">暂无循环模板</p>
      <div
        v-for="schedule in schedules"
        :key="schedule.id"
        class="border-b py-3"
      >
        <p class="font-semibold">
          {{ schedule.title }} · {{ cadenceLabels[schedule.cadence] }} ·
          {{ schedule.enabled ? '启用' : '已暂停' }}
        </p>
        <p>
          {{ schedule.store.name }} · {{ schedule.targetName }} · 完成时限
          {{ schedule.dueHours }} 小时
        </p>
        <p v-if="schedule.enabled">
          下次派发：{{ time.format(new Date(schedule.nextRunAt)) }}
        </p>
        <p v-else-if="schedule.pauseReason">{{ schedule.pauseReason }}</p>
        <n-button
          :disabled="busy"
          size="small"
          @click="toggleSchedule(schedule)"
        >
          {{ schedule.enabled ? '暂停' : '恢复' }}
        </n-button>
      </div>
    </n-card>

    <n-alert v-if="reminders.length" type="warning" title="未来 2 小时内截止">
      <ul>
        <li v-for="reminder in reminders" :key="reminder.id">
          {{ reminder.title }} · {{ reminder.store.name }} ·
          {{ time.format(new Date(reminder.dueAt)) }}
        </li>
      </ul>
    </n-alert>

    <n-card title="我的任务">
      <n-space class="mb-3">
        <n-button
          :type="assignedMode === 'ACTIVE' ? 'primary' : 'default'"
          :disabled="busy"
          @click="browseAssigned(1, 'ACTIVE')"
          >待处理</n-button
        >
        <n-button
          :type="assignedMode === 'HISTORY' ? 'primary' : 'default'"
          :disabled="busy"
          @click="browseAssigned(1, 'HISTORY')"
          >历史任务</n-button
        >
      </n-space>
      <p v-if="!assigned.length">当前页暂无任务</p>
      <div v-for="task in assigned" :key="task.id" class="border-b py-3">
        <p class="font-semibold">
          {{ task.title }} · {{ task.sourceTaskId ? '整改 · ' : ''
          }}{{ statusText(task) }}
        </p>
        <p>
          {{ task.store.name }} · {{ task.targetName }} · 截止
          {{ time.format(new Date(task.dueAt)) }}
        </p>
        <p class="whitespace-pre-wrap break-words">{{ task.description }}</p>
        <details v-if="task.checklist?.length">
          <summary>
            检查清单 · {{ task.checklistConfirmed ? '已逐项确认' : '待确认' }}
          </summary>
          <ol class="list-decimal pl-6">
            <li v-for="(item, index) in task.checklist" :key="item">
              {{ item }}
              <p
                v-if="task.checklistIssues?.[index]"
                class="whitespace-pre-wrap break-words"
              >
                异常：{{ task.checklistIssues[index] }}
              </p>
            </li>
          </ol>
        </details>
        <p v-if="task.submission" class="whitespace-pre-wrap break-words">
          完成说明：{{ task.submission }}
        </p>
        <n-space v-if="task.evidence.length" class="my-2">
          <n-button
            v-for="(photo, index) in task.evidence"
            :key="photo.id"
            size="small"
            @click="openPhoto(task.id, photo.id)"
          >
            照片 {{ index + 1 }}
          </n-button>
        </n-space>
        <p v-if="task.reopenHistory[0]" class="whitespace-pre-wrap">
          最近{{
            task.reopenHistory[0].action === 'RELEASE' ? '释放认领' : '打回'
          }}原因：{{ task.reopenHistory[0].reason }}
        </p>
        <n-button
          v-if="task.status === 'PENDING' && !isExpired(task)"
          :disabled="busy"
          @click="act(task, 'claim')"
          >认领</n-button
        >
        <n-button
          v-if="task.status === 'CLAIMED' && !isExpired(task)"
          :disabled="busy"
          @click="openSubmission(task)"
          >提交结果</n-button
        >
      </div>
      <n-space align="center" class="mt-4">
        <n-button
          :disabled="busy || assignedPage <= 1"
          @click="browseAssigned(assignedPage - 1)"
          >上一页</n-button
        >
        <span>第 {{ assignedPage }} 页</span>
        <n-button
          :disabled="busy || !hasNextAssigned"
          @click="browseAssigned(assignedPage + 1)"
          >下一页</n-button
        >
      </n-space>
    </n-card>

    <n-card v-if="canReviewExtensions" title="总部补交审批（最早 50 项）">
      <p v-if="!pendingExtensions.length">暂无待审批申请</p>
      <div
        v-for="extension in pendingExtensions"
        :key="extension.id"
        class="border-b py-3"
      >
        <p class="font-semibold">
          {{ extension.task.title }} · {{ extension.task.store.name }} ·
          {{ extension.task.targetName }}
        </p>
        <p>原截止：{{ time.format(new Date(extension.previousDueAt)) }}</p>
        <p class="whitespace-pre-wrap break-words">{{ extension.reason }}</p>
        <n-button
          v-if="extension.canReview"
          size="small"
          :disabled="busy"
          @click="openExtension({ request: extension })"
          >审核补交</n-button
        >
        <p v-else>需由其他总部管理员审核</p>
      </div>
    </n-card>

    <n-card v-if="canManage" title="派发进度">
      <form class="mb-4" @submit.prevent="applyManagementFilters">
        <n-space align="center">
          <n-select
            v-model:value="managementFilters.storeId"
            :options="managementStoreOptions"
            clearable
            placeholder="全部授权门店"
            style="width: 200px"
            :disabled="busy"
          />
          <n-select
            v-model:value="managementFilters.status"
            :options="statusOptions"
            clearable
            placeholder="全部状态"
            style="width: 140px"
            :disabled="busy"
          />
          <n-select
            v-model:value="managementFilters.kind"
            :options="kindOptions"
            clearable
            placeholder="全部类型"
            style="width: 140px"
            :disabled="busy"
          />
          <n-input
            v-model:value="managementFilters.keyword"
            maxlength="120"
            placeholder="搜索任务名称"
            :disabled="busy"
          />
          <n-button attr-type="submit" type="primary" :disabled="busy"
            >查询</n-button
          >
          <n-button :disabled="busy" @click="clearManagementFilters"
            >重置</n-button
          >
        </n-space>
      </form>
      <p v-if="!managed.length && !busy">当前页暂无符合条件的任务</p>
      <div v-for="task in managed" :key="task.id" class="border-b py-3">
        <p class="font-semibold">
          {{ task.title }} · {{ task.sourceTaskId ? '整改 · ' : ''
          }}{{ statusText(task) }}
        </p>
        <p>
          {{ task.store.name }} · {{ task.targetName }} · 截止
          {{ time.format(new Date(task.dueAt)) }}
        </p>
        <p v-if="task.claimerName">认领人：{{ task.claimerName }}</p>
        <details v-if="task.checklist?.length">
          <summary>
            检查清单 · {{ task.checklistConfirmed ? '已逐项确认' : '待确认' }}
          </summary>
          <ol class="list-decimal pl-6">
            <li v-for="(item, index) in task.checklist" :key="item">
              {{ item }}
              <p
                v-if="task.checklistIssues?.[index]"
                class="whitespace-pre-wrap break-words"
              >
                异常：{{ task.checklistIssues[index] }}
              </p>
              <n-button
                v-if="
                  task.checklistIssues?.[index] &&
                  !task.sourceTaskId &&
                  (task.status === 'SUBMITTED' || task.status === 'DONE')
                "
                size="tiny"
                :disabled="busy"
                @click="startRectification(task, index)"
                >从此项发起整改</n-button
              >
            </li>
          </ol>
        </details>
        <p v-if="task.submission" class="whitespace-pre-wrap break-words">
          完成说明：{{ task.submission }}
        </p>
        <n-space v-if="task.evidence.length" class="my-2">
          <n-button
            v-for="(photo, index) in task.evidence"
            :key="photo.id"
            size="small"
            @click="openPhoto(task.id, photo.id)"
          >
            照片 {{ index + 1 }}
          </n-button>
        </n-space>
        <details v-if="task.extensions?.length" class="my-2">
          <summary>
            补交申请（{{ extensionStatus[task.extensions[0].status] }}）
          </summary>
          <div v-for="entry in task.extensions" :key="entry.id" class="py-2">
            <p>
              {{ time.format(new Date(entry.createdAt)) }} ·
              {{ extensionStatus[entry.status] }}
            </p>
            <p class="whitespace-pre-wrap break-words">
              申请原因：{{ entry.reason }}
            </p>
            <p v-if="entry.reviewNote" class="whitespace-pre-wrap break-words">
              审核说明：{{ entry.reviewNote }}
            </p>
            <p v-if="entry.newDueAt">
              新截止：{{ time.format(new Date(entry.newDueAt)) }}
            </p>
          </div>
        </details>
        <n-button
          v-if="
            (task.status === 'PENDING' || task.status === 'CLAIMED') &&
            isExpired(task) &&
            task.extensions?.[0]?.status !== 'PENDING'
          "
          size="small"
          :disabled="busy"
          @click="openExtension({ task })"
          >申请补交</n-button
        >
        <p v-if="task.ccRecipients?.length">
          抄送：{{ task.ccRecipients.map((item) => item.username).join('、') }}
        </p>
        <p v-if="task.sourceIssue" class="whitespace-pre-wrap break-words">
          原检查项：{{ task.sourceIssue.label }} ·
          {{ time.format(new Date(task.sourceIssue.submittedAt)) }}<br />
          原异常：{{ task.sourceIssue.reason }}
        </p>
        <p v-if="task.sourceTask">来源任务：{{ task.sourceTask.title }}</p>
        <p v-if="task._count?.rectifications">
          关联整改：{{ task._count.rectifications }} 项
        </p>
        <details v-if="task.reopenHistory.length" class="my-2">
          <summary>处理历史（{{ task.reopenHistory.length }} 次）</summary>
          <div
            v-for="(entry, index) in task.reopenHistory"
            :key="index"
            class="py-2"
          >
            <p>
              {{ time.format(new Date(entry.createdAt)) }} ·
              {{ entry.previousClaimerName || '员工' }}
            </p>
            <p class="whitespace-pre-wrap break-words">
              {{ entry.action === 'RELEASE' ? '释放原因' : '打回原因' }}：{{
                entry.reason
              }}
            </p>
            <p
              v-if="entry.previousSubmission"
              class="whitespace-pre-wrap break-words"
            >
              原提交：{{ entry.previousSubmission }}
            </p>
            <p v-if="entry.checklistConfirmed">该轮检查清单已逐项确认</p>
            <ul v-if="entry.checklistIssues">
              <li
                v-for="(note, index) in entry.checklistIssues"
                :key="index"
                class="whitespace-pre-wrap break-words"
              >
                {{ task.checklist?.[Number(index)] }}：{{ note }}
              </li>
            </ul>
            <n-space v-if="entry.evidence?.length">
              <n-button
                v-for="(photo, photoIndex) in entry.evidence"
                :key="photo.id"
                size="small"
                @click="openPhoto(task.id, photo.id)"
              >
                历史照片 {{ photoIndex + 1 }}
              </n-button>
            </n-space>
          </div>
        </details>
        <n-button
          v-if="task.status === 'CLAIMED' && task.claimedAt && !isExpired(task)"
          :disabled="busy"
          @click="openReopen(task)"
          >释放认领</n-button
        >
        <n-button
          v-if="task.status === 'SUBMITTED'"
          :disabled="busy"
          @click="openReopen(task)"
          >打回重开</n-button
        >
        <n-button
          v-if="
            !task.sourceTaskId &&
            (task.status === 'SUBMITTED' || task.status === 'DONE')
          "
          :disabled="busy"
          @click="startRectification(task)"
          >发起整改</n-button
        >
        <n-button
          v-if="task.status === 'SUBMITTED'"
          :disabled="busy"
          @click="act(task, 'complete')"
          >确认完成</n-button
        >
      </div>
      <n-space align="center" class="mt-4">
        <n-button
          :disabled="busy || managementPage <= 1"
          @click="run(() => load(managementPage - 1))"
          >上一页</n-button
        >
        <span>第 {{ managementPage }} 页</span>
        <n-button
          :disabled="busy || !hasNextPage"
          @click="run(() => load(managementPage + 1))"
          >下一页</n-button
        >
      </n-space>
    </n-card>

    <n-modal
      :show="Boolean(extensionDialog)"
      :mask-closable="false"
      @update:show="extensionDialog = undefined"
    >
      <n-card
        :title="
          extensionDialog && 'request' in extensionDialog
            ? '审核补交'
            : '申请补交'
        "
        style="width: min(480px, 92vw)"
      >
        <div v-if="extensionDialog" class="space-y-3">
          <p>
            {{
              'task' in extensionDialog
                ? extensionDialog.task.title
                : extensionDialog.request.task.title
            }}
          </p>
          <n-input
            v-model:value="extensionNote"
            type="textarea"
            maxlength="1000"
            :placeholder="'task' in extensionDialog ? '补交原因' : '审核说明'"
            :disabled="busy"
          />
          <label v-if="'request' in extensionDialog">
            通过后的截止时间（北京时间）
            <input
              v-model="extensionDue"
              type="datetime-local"
              :disabled="busy"
            />
          </label>
          <n-alert v-if="errorMessage" type="error">{{ errorMessage }}</n-alert>
          <n-space>
            <n-button :disabled="busy" @click="extensionDialog = undefined"
              >取消</n-button
            >
            <n-button
              v-if="'task' in extensionDialog"
              type="primary"
              :disabled="busy || !extensionNote.trim()"
              @click="submitExtension()"
              >提交申请</n-button
            >
            <template v-else>
              <n-button
                :disabled="busy || !extensionNote.trim()"
                @click="submitExtension(false)"
                >驳回</n-button
              >
              <n-button
                type="primary"
                :disabled="
                  busy ||
                  !extensionNote.trim() ||
                  !extensionDue ||
                  extensionDialog.request.task.store.status !== 'OPERATING'
                "
                @click="submitExtension(true)"
                >通过并开放补交</n-button
              >
            </template>
          </n-space>
        </div>
      </n-card>
    </n-modal>

    <n-modal
      :show="Boolean(reopenTask)"
      :mask-closable="false"
      @update:show="reopenTask = undefined"
    >
      <n-card
        :title="
          reopenTask?.status === 'CLAIMED' ? '释放认领' : '打回并重新开放认领'
        "
        style="width: min(480px, 92vw)"
      >
        <form class="space-y-3" @submit.prevent="confirmReopen">
          <p>{{ reopenTask?.title }}</p>
          <n-input
            v-model:value="reopenNote"
            type="textarea"
            maxlength="1000"
            :placeholder="
              reopenTask?.status === 'CLAIMED' ? '填写释放原因' : '填写打回原因'
            "
          />
          <label v-if="reopenTask?.status !== 'CLAIMED'"
            >新截止时间（北京时间）
            <input v-model="reopenDue" type="datetime-local" required
          /></label>
          <n-alert v-if="errorMessage" type="error">{{ errorMessage }}</n-alert>
          <n-space>
            <n-button :disabled="busy" @click="reopenTask = undefined"
              >取消</n-button
            >
            <n-button
              attr-type="submit"
              type="primary"
              :disabled="
                busy ||
                !reopenNote.trim() ||
                (reopenTask?.status !== 'CLAIMED' && !reopenDue)
              "
              >{{
                reopenTask?.status === 'CLAIMED' ? '确认释放' : '确认打回'
              }}</n-button
            >
          </n-space>
        </form>
      </n-card>
    </n-modal>

    <n-modal
      :show="Boolean(selectedTask)"
      :mask-closable="false"
      @update:show="selectedTask = undefined"
    >
      <n-card
        title="提交任务结果"
        style="width: min(540px, 92vw); max-height: 90vh; overflow: auto"
      >
        <p>{{ selectedTask?.title }}</p>
        <n-input
          v-model:value="submission"
          type="textarea"
          maxlength="3000"
          placeholder="填写完成说明"
        />
        <div v-if="selectedTask?.checklist?.length" class="mt-3">
          <p>提交前请逐项确认</p>
          <n-checkbox-group v-model:value="checkedItems" :disabled="busy">
            <n-space vertical>
              <div
                v-for="(item, index) in selectedTask.checklist"
                :key="item"
                class="space-y-1"
              >
                <n-checkbox :value="index" :label="item" />
                <n-input
                  v-model:value="issueNotes[index]"
                  type="textarea"
                  :autosize="{ minRows: 1, maxRows: 3 }"
                  maxlength="500"
                  placeholder="异常说明（无异常可留空）"
                  :disabled="busy"
                />
              </div>
            </n-space>
          </n-checkbox-group>
        </div>
        <div class="mt-3">
          <label>
            {{
              selectedTask?.sourceTaskId
                ? '整改照片（至少一张）'
                : '任务照片（选填）'
            }}
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              :disabled="busy"
              @change="choosePhotos"
            />
          </label>
          <p>最多 3 张，每张不超过 5 MB。</p>
          <p v-if="photoError" role="alert">{{ photoError }}</p>
        </div>
        <n-alert v-if="errorMessage" type="error">{{ errorMessage }}</n-alert>
        <n-space class="mt-4">
          <n-button :disabled="busy" @click="selectedTask = undefined"
            >取消</n-button
          >
          <n-button
            type="primary"
            :disabled="
              busy ||
              !submission.trim() ||
              Boolean(photoError) ||
              checkedItems.length !== (selectedTask?.checklist?.length ?? 0) ||
              (Boolean(selectedTask?.sourceTaskId) && !photos.length)
            "
            @click="selectedTask && act(selectedTask, 'submit')"
            >提交</n-button
          >
        </n-space>
      </n-card>
    </n-modal>
    <n-modal :show="Boolean(previewUrl)" @update:show="closePreview">
      <n-card
        title="任务照片"
        style="width: min(760px, 94vw)"
        closable
        @close="closePreview"
      >
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt="任务提交照片"
          class="mx-auto max-w-full max-h-[75vh] object-contain"
        />
      </n-card>
    </n-modal>
  </section>
</template>
