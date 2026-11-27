<script setup lang="ts">
import { NBadge, NInputNumber, NTabPane, NTabs } from 'naive-ui';
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

interface ChecklistItem {
  id: string;
  label: string;
  mode: 'CONFIRM' | 'PHOTO_REQUIRED';
}

interface CcOption {
  value: string;
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
  category?: string | null;
  description: string;
  targetName: string;
  store: { name: string };
  dueAt: string;
  status: 'PENDING' | 'CLAIMED' | 'SUBMITTED' | 'DONE';
  claimerName: string | null;
  submission: string | null;
  checklist: Array<string | ChecklistItem> | null;
  reviewMode: 'REQUIRED' | 'AUTO_COMPLETE';
  ccRecipients?: Array<{ username: string }> | null;
  checklistConfirmed: boolean;
  checklistIssues: Record<string, string> | null;
  sourceIssue: {
    index: number;
    label: string;
    reason: string;
    submittedAt: string;
  } | null;
  evidence: Array<{
    id: string;
    checklistItemId: string | null;
    byteSize: number;
  }>;
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
  category?: string | null;
  targetName: string;
  cadence: Cadence;
  dueHours: number;
  enabled: boolean;
  nextRunAt: string;
  pauseReason: string | null;
  store: { name: string };
}
interface ManagementGroupStore {
  id: string;
  name: string;
  groupId: string | null;
  memberEmploymentIds: string[];
  employments: Array<{
    id: string;
    employee: { name: string; employeeNo: string };
    position: { name: string };
  }>;
}
interface EvidenceStorage {
  count: number;
  bytes: number;
  recentCount: number;
  recentBytes: number;
  draftCount: number;
  draftBytes: number;
  perImageLimitBytes: number;
  perSubmissionLimitBytes: number;
}
const managementGroups = ref<ManagementGroupStore[]>([]);
const storage = ref<EvidenceStorage>();
const formatStorage = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
type WorkspaceSection =
  'mine' | 'dispatch' | 'manage' | 'automation' | 'settings';
const activeSection = ref<WorkspaceSection>('mine');
const sectionInitialized = ref(false);
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
const category = ref('');
const suggestedCategories = ['巡店任务', '周任务', '月任务', '门店自查'];
const description = ref('');
const checklistDrafts = ref<ChecklistItem[]>([]);
const reviewMode = ref<'REQUIRED' | 'AUTO_COMPLETE'>('AUTO_COMPLETE');
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
const itemPhotos = ref<Record<string, File>>({});
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
const normalizedChecklist = (task?: Task): ChecklistItem[] =>
  (task?.checklist ?? []).map((item, index) =>
    typeof item === 'string'
      ? { id: String(index), label: item, mode: 'CONFIRM' }
      : item
  );
const structuredChecklist = (task?: Task) =>
  Boolean(task?.checklist?.some((item) => typeof item === 'object'));
const checklistLabel = (task: Task, id: string) =>
  normalizedChecklist(task).find((item) => item.id === id)?.label ??
  `检查项 ${id}`;
const addChecklistItem = () => {
  if (checklistDrafts.value.length >= 20) return;
  checklistDrafts.value.push({
    id: browserUuid(),
    label: '',
    mode: 'CONFIRM'
  });
};
const removeChecklistItem = (id: string) => {
  checklistDrafts.value = checklistDrafts.value.filter(
    (item) => item.id !== id
  );
};
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
    value: account.value,
    label: `${account.displayName} · ${
      account.allStores ? '全部门店' : account.stores.join('、')
    }`,
    disabled:
      ccUsernames.value.length >= 5 &&
      !ccUsernames.value.includes(account.value)
  }))
);
let ccLoadSequence = 0;

async function loadCcOptions(storeIds: string) {
  const sequence = ++ccLoadSequence;
  ccCandidates.value = [];
  ccError.value = '';
  if (!storeIds) {
    ccLoading.value = false;
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
    const available = new Set(rows.map((item) => item.value));
    ccUsernames.value = ccUsernames.value.filter((username) =>
      available.has(username)
    );
  } catch (error) {
    if (sequence === ccLoadSequence) ccError.value = (error as Error).message;
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
    PENDING: '待处理',
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
  if (!sectionInitialized.value) {
    if (data.canManage && activeSection.value === 'mine')
      activeSection.value = 'manage';
    sectionInitialized.value = true;
  } else if (
    !data.canManage &&
    ['manage', 'settings'].includes(activeSection.value)
  ) {
    activeSection.value = 'mine';
  }
  managementStores.value = data.managementStores;
  managementPage.value = page;
  hasNextPage.value = data.hasNext;
  appliedFilters.value = { ...filters };

  if (refreshTargets) {
    const [nextTargets, nextSchedules] = await Promise.all([
      request<Target[]>(`${base}/targets`),
      request<Schedule[]>(`${base}/schedules`)
    ]);
    targets.value = nextTargets;
    schedules.value = nextSchedules;
    const available = new Set(targets.value.map(targetValue));
    selected.value = selected.value.filter((value) => available.has(value));
    if (data.canManage) {
      const [nextGroups, nextStorage] = await Promise.all([
        request<ManagementGroupStore[]>(`${base}/management-groups`),
        request<EvidenceStorage>(`${base}/evidence-storage`)
      ]);
      managementGroups.value = nextGroups;
      storage.value = nextStorage;
    } else {
      managementGroups.value = [];
      storage.value = undefined;
    }
  }
  if (refreshTargets || !data.canReviewExtensions) await loadExtensions();
}

function saveManagementGroup(store: ManagementGroupStore) {
  void run(async () => {
    await request(`${base}/management-groups/${encodeURIComponent(store.id)}`, {
      method: 'POST',
      body: JSON.stringify({ employmentIds: store.memberEmploymentIds })
    });
    feedback.value = `${store.name}门店管理组已保存`;
    await load(managementPage.value, appliedFilters.value, true);
  });
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
    const formCategory = category.value.trim() || undefined;
    const formCcUsernames = [...new Set(ccUsernames.value)];
    const formDescription = description.value.trim();
    const checklist = checklistDrafts.value
      .map((item) => ({ ...item, label: item.label.trim() }))
      .filter((item) => item.label);
    if (
      checklist.length > 20 ||
      checklist.some((item) => item.label.length > 120) ||
      new Set(checklist.map((item) => item.label)).size !== checklist.length ||
      checklist.filter((item) => item.mode === 'PHOTO_REQUIRED').length > 12
    ) {
      throw new Error(
        '最多 20 个检查项、其中拍照项最多 12 个，名称不能重复且不超过 120 字'
      );
    }
    const time = new Date(due.value + '+08:00').toISOString();
    const cadenceValue = cadence.value;
    const isRecurring = cadenceValue !== 'ONCE' && !sourceTask.value;
    if (isRecurring && (!formTargets.length || !dueHours.value)) {
      throw new Error('循环模板需要至少一个执行目标和完成时限');
    }
    const payload = isRecurring
      ? {
          title: formTitle,
          category: formCategory,
          description: formDescription,
          checklist,
          reviewMode: reviewMode.value,
          ccUsernames: formCcUsernames,
          cadence: cadenceValue,
          firstRunAt: time,
          dueHours: dueHours.value,
          targets: formTargets
        }
      : {
          title: formTitle,
          category: formCategory,
          description: formDescription,
          checklist,
          reviewMode: reviewMode.value,
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
      const result = await request<{ count: number }>(`${base}/schedules`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, requestId: id })
      });
      feedback.value = `已创建 ${result.count} 个循环任务模板`;
    } else {
      const result = await request<{ count: number }>(`${base}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, batchId: id })
      });
      feedback.value = `已发布 ${result.count} 项任务`;
    }
    dispatchAttempt.value = undefined;
    title.value = '';
    category.value = '';
    description.value = '';
    checklistDrafts.value = [];
    reviewMode.value = 'AUTO_COMPLETE';
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

function archiveSchedule(schedule: Schedule) {
  return run(async () => {
    await request(
      `${base}/schedules/${encodeURIComponent(schedule.id)}/archive`,
      {
        method: 'POST'
      }
    );
    schedules.value = schedules.value.filter(({ id }) => id !== schedule.id);
    feedback.value = '已移除循环模板，已发布的任务仍保留';
  });
}

function openSubmission(task: Task) {
  issueNotes.value = {};
  checkedItems.value = [];
  submission.value = '';
  photos.value = [];
  itemPhotos.value = {};
  photoError.value = '';
  errorMessage.value = '';
  selectedTask.value = task;
}

function chooseItemPhoto(itemId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  photoError.value = '';
  if (!file) {
    const next = { ...itemPhotos.value };
    delete next[itemId];
    itemPhotos.value = next;
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    input.value = '';
    photoError.value = '单张照片不能超过 5 MB';
    return;
  }
  itemPhotos.value = { ...itemPhotos.value, [itemId]: file };
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
      const items = normalizedChecklist(task);
      const structured = structuredChecklist(task);
      const requiredIds = items
        .filter((item) => item.mode === 'PHOTO_REQUIRED')
        .map((item) => item.id);
      if (
        task.sourceTaskId &&
        !photos.value.length &&
        !Object.keys(itemPhotos.value).length
      )
        throw new Error('请至少上传一张整改照片');
      if (requiredIds.some((id) => !itemPhotos.value[id]))
        throw new Error('请为每个拍照检查项上传一张照片');
      body = new FormData();
      body.set('submission', submission.value);
      if (structured) {
        body.set(
          'confirmedItems',
          JSON.stringify(checkedItems.value.map(String))
        );
      } else if (checkedItems.value.length) {
        body.set(
          'checkedItems',
          [...checkedItems.value]
            .sort((a, b) => Number(a) - Number(b))
            .join(',')
        );
      }
      const issues = Object.fromEntries(
        Object.entries(issueNotes.value)
          .filter(([, value]) => value.trim())
          .map(([key, value]) => [key, value.trim()])
      );
      if (Object.keys(issues).length)
        body.set('checklistIssues', JSON.stringify(issues));
      const photoItemIds: Array<string | null> = [];
      for (const itemId of requiredIds) {
        body.append('photos', itemPhotos.value[itemId]);
        photoItemIds.push(itemId);
      }
      for (const photo of photos.value) {
        body.append('photos', photo);
        photoItemIds.push(null);
      }
      if (photoItemIds.length)
        body.set('photoItemIds', JSON.stringify(photoItemIds));
    } else if (action === 'complete') {
      body = JSON.stringify({ submittedAt: task.submittedAt });
    }
    await request(`${base}/${encodeURIComponent(task.id)}/${action}`, {
      method: 'POST',
      body
    });
    selectedTask.value = undefined;
    photos.value = [];
    itemPhotos.value = {};
    await load();
  });
}

function startRectification(task: Task, index?: number) {
  sourceItemIndex.value = index;
  sourceTask.value = task;
  cadence.value = 'ONCE';
  reviewMode.value = 'REQUIRED';
  checklistDrafts.value = [];
  ccUsernames.value = [];
  title.value = `整改 · ${task.title}`.slice(0, 120);
  category.value = task.category ?? '';
  description.value =
    index === undefined
      ? ''
      : `${normalizedChecklist(task)[index]?.label}：${
          task.checklistIssues?.[normalizedChecklist(task)[index]?.id]
        }`;
  due.value = '';
  selected.value = [];
  errorMessage.value = '';
  activeSection.value = 'dispatch';
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
  <section class="task-workspace space-y-4">
    <header class="workspace-header">
      <div>
        <p class="workspace-kicker">OPERATIONS WORKSPACE</p>
        <h1 class="workspace-title">运营任务</h1>
        <p class="workspace-subtitle">
          集中处理派发、执行、复核与循环任务，配置项按需进入。
        </p>
      </div>
      <n-space align="center">
        <n-button type="primary" @click="activeSection = 'dispatch'">
          发布任务
        </n-button>
        <n-badge :value="inbox.unread" :max="99">
          <n-button @click="inboxOpen = true">任务消息</n-button>
        </n-badge>
        <RouterLink v-if="canReport" to="/v2/operational-tasks/report">
          <n-button>统计与导出</n-button>
        </RouterLink>
        <n-button :loading="busy" :disabled="busy" @click="refresh">
          刷新数据
        </n-button>
      </n-space>
    </header>

    <div class="workspace-overview">
      <button
        class="overview-item"
        type="button"
        @click="activeSection = 'mine'"
      >
        <span>我的待办</span>
        <strong>{{
          assigned.filter(
            (task) => task.status === 'PENDING' || task.status === 'CLAIMED'
          ).length
        }}</strong>
        <small>当前页待处理任务</small>
      </button>
      <button
        v-if="canManage"
        class="overview-item"
        type="button"
        @click="activeSection = 'manage'"
      >
        <span>待复核</span>
        <strong>{{
          managed.filter((task) => task.status === 'SUBMITTED').length
        }}</strong>
        <small>当前页已提交任务</small>
      </button>
      <button
        v-if="canManage"
        class="overview-item"
        type="button"
        @click="activeSection = 'automation'"
      >
        <span>循环任务</span>
        <strong>{{
          schedules.filter((schedule) => schedule.enabled).length
        }}</strong>
        <small>正在运行的模板</small>
      </button>
      <button class="overview-item" type="button" @click="inboxOpen = true">
        <span>未读消息</span>
        <strong>{{ inbox.unread }}</strong>
        <small>任务状态与结果提醒</small>
      </button>
    </div>

    <n-card size="small" class="workspace-nav">
      <n-tabs v-model:value="activeSection" type="segment" animated>
        <n-tab-pane name="mine" tab="我的任务" />
        <n-tab-pane name="dispatch" tab="任务发布" />
        <n-tab-pane v-if="canManage" name="manage" tab="任务管理" />
        <n-tab-pane name="automation" tab="循环任务" />
        <n-tab-pane v-if="canManage" name="settings" tab="任务配置" />
      </n-tabs>
    </n-card>
    <n-alert
      v-if="errorMessage && !selectedTask && !reopenTask && !extensionDialog"
      type="error"
      >{{ errorMessage }}</n-alert
    >
    <n-alert v-if="feedback" type="success">{{ feedback }}</n-alert>

    <n-modal :show="inboxOpen" @update:show="inboxOpen = $event">
      <n-card
        size="small"
        title="任务消息"
        class="message-dialog"
        closable
        @close="inboxOpen = false"
      >
        <template #header-extra>
          <span class="message-count">{{ inbox.unread }} 条未读</span>
        </template>
        <div class="message-list">
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
    </n-modal>

    <n-card
      v-if="canManage"
      v-show="activeSection === 'settings'"
      title="门店任务执行组"
    >
      <n-alert type="info" :bordered="false" class="mb-3">
        门店管理组只决定谁能共同处理本店任务，不会改变员工岗位、薪资或账号权限；组内任意一人提交后，本店任务即不再需要其他成员重复完成。
      </n-alert>
      <div
        v-for="store in managementGroups"
        :key="store.id"
        class="border-b py-3"
      >
        <strong>{{ store.name }} · 门店管理组</strong>
        <n-select
          v-model:value="store.memberEmploymentIds"
          multiple
          filterable
          :options="
            store.employments.map((employment) => ({
              value: employment.id,
              label: `${employment.employee.name} · ${employment.position.name} · ${employment.employee.employeeNo}`
            }))
          "
          placeholder="选择店长、副店长、店助等执行成员"
          :disabled="busy"
        />
        <n-button
          class="mt-2"
          size="small"
          :disabled="busy"
          @click="saveManagementGroup(store)"
        >
          保存本店执行组
        </n-button>
      </div>
    </n-card>

    <n-card
      v-if="canManage && storage"
      v-show="activeSection === 'settings'"
      title="任务图片存储"
    >
      <p>
        当前 {{ storage.count }} 张，共 {{ formatStorage(storage.bytes) }}；最近
        30 天 {{ storage.recentCount }} 张，共
        {{ formatStorage(storage.recentBytes) }}。
      </p>
      <p v-if="storage.draftCount">
        另有 {{ storage.draftCount }} 张未提交暂存图片，共
        {{ formatStorage(storage.draftBytes) }}，24 小时后失效，后台每小时清理。
      </p>
      <p>
        上传原图单张不超过 5 MB，服务端压缩后单张不超过
        {{
          formatStorage(storage.perImageLimitBytes)
        }}，单次提交压缩后总量不超过
        {{
          formatStorage(storage.perSubmissionLimitBytes)
        }}。历史证据用于审计，不自动删除。
      </p>
    </n-card>

    <n-card
      v-show="activeSection === 'dispatch'"
      id="task-dispatch"
      :title="sourceTask ? '派发整改' : '发布任务'"
    >
      <n-space v-if="sourceTask" class="mb-3" align="center">
        <span
          >来源：{{ sourceTask.title }} · {{ sourceTask.store.name
          }}<template v-if="sourceItemIndex !== undefined">
            ·
            {{
              normalizedChecklist(sourceTask)[sourceItemIndex]?.label
            }}</template
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
        <label class="block">
          任务类型（选填）
          <input
            v-model="category"
            list="task-category-suggestions"
            maxlength="40"
            class="task-category-input"
            placeholder="选择或输入任务类型"
            :disabled="busy"
          />
          <datalist id="task-category-suggestions">
            <option
              v-for="suggestion in suggestedCategories"
              :key="suggestion"
              :value="suggestion"
            />
          </datalist>
        </label>
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
        <strong>检查清单（选填）</strong>
        <div
          v-for="(item, index) in checklistDrafts"
          :key="item.id"
          class="grid gap-2 rounded border p-2 md:grid-cols-[1fr_180px_auto]"
        >
          <n-input
            v-model:value="item.label"
            :placeholder="`检查项 ${index + 1}`"
            maxlength="120"
            :disabled="busy"
          />
          <n-select
            v-model:value="item.mode"
            :options="[
              { label: '直接确认', value: 'CONFIRM' },
              { label: '必须拍照', value: 'PHOTO_REQUIRED' }
            ]"
            :disabled="busy"
          />
          <n-button :disabled="busy" @click="removeChecklistItem(item.id)"
            >删除</n-button
          >
        </div>
        <n-button
          size="small"
          :disabled="busy || checklistDrafts.length >= 20"
          @click="addChecklistItem"
          >添加检查项</n-button
        >
        <n-select
          v-model:value="reviewMode"
          :options="[
            { label: '提交即完成', value: 'AUTO_COMPLETE' },
            { label: '提交后需要审核', value: 'REQUIRED' }
          ]"
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
        <p>
          可选择门店岗位或门店管理组；同一执行组只需一人提交，系统自动记录实际完成人。
        </p>
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
        <n-alert v-if="ccError" type="error" :bordered="false">{{
          ccError
        }}</n-alert>
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
          每个所选目标生成一个循环模板。每月日期不足时，安排在当月最后一天。
        </p>
        <p v-else-if="selected.length > 50">每批最多派发 50 项任务</p>
        <p v-if="selected.length" aria-live="polite">
          已选 {{ selectedStoreKey.split(',').length }} 家门店、{{
            selected.length
          }}
          个执行组， 将{{ recurring ? '创建' : '发布' }} {{ selected.length }}
          {{ recurring ? '个循环模板' : '项任务' }}。
          <template v-if="ccUsernames.length"
            >提交结果时将抄送 {{ ccUsernames.length }} 人。</template
          >
        </p>
        <n-button
          attr-type="submit"
          type="primary"
          :disabled="
            busy ||
            ccLoading ||
            !title.trim() ||
            !description.trim() ||
            !due ||
            !selected.length ||
            selected.length > 50 ||
            (recurring && !dueHours)
          "
        >
          {{
            recurring ? '创建循环任务' : sourceTask ? '发布整改' : '立即发布'
          }}
        </n-button>
      </form>
    </n-card>

    <n-card
      v-show="activeSection === 'automation'"
      title="循环模板（最近 100 项）"
    >
      <p v-if="!schedules.length">暂无循环模板</p>
      <div
        v-for="schedule in schedules"
        :key="schedule.id"
        class="border-b py-3"
      >
        <p class="font-semibold">
          {{ schedule.title }} ·
          <template v-if="schedule.category"
            >{{ schedule.category }} · </template
          >{{ cadenceLabels[schedule.cadence] }} ·
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
        <n-popconfirm @positive-click="archiveSchedule(schedule)">
          <template #trigger>
            <n-button class="ml-2" size="small" :disabled="busy">移除</n-button>
          </template>
          移除后停止后续派发，已发布的任务会保留。
        </n-popconfirm>
      </div>
    </n-card>

    <n-alert
      v-if="reminders.length"
      v-show="activeSection === 'mine'"
      type="warning"
      title="未来 2 小时内截止"
    >
      <ul>
        <li v-for="reminder in reminders" :key="reminder.id">
          {{ reminder.title }} · {{ reminder.store.name }} ·
          {{ time.format(new Date(reminder.dueAt)) }}
        </li>
      </ul>
    </n-alert>

    <n-card v-show="activeSection === 'mine'" title="我的任务">
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
          {{ task.title }} ·
          <template v-if="task.category">{{ task.category }} · </template
          >{{ task.sourceTaskId ? '整改 · ' : '' }}{{ statusText(task) }}
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
            <li
              v-for="(item, index) in normalizedChecklist(task)"
              :key="item.id"
            >
              {{ item.label
              }}{{ item.mode === 'PHOTO_REQUIRED' ? '（需拍照）' : '' }}
              <p
                v-if="task.checklistIssues?.[item.id]"
                class="whitespace-pre-wrap break-words"
              >
                异常：{{ task.checklistIssues[item.id] }}
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
            {{
              photo.checklistItemId
                ? checklistLabel(task, photo.checklistItemId)
                : `照片 ${index + 1}`
            }}
          </n-button>
        </n-space>
        <p v-if="task.reopenHistory[0]" class="whitespace-pre-wrap">
          最近{{
            task.reopenHistory[0].action === 'RELEASE' ? '释放认领' : '打回'
          }}原因：{{ task.reopenHistory[0].reason }}
        </p>
        <n-button
          v-if="
            (task.status === 'PENDING' || task.status === 'CLAIMED') &&
            !isExpired(task)
          "
          :disabled="busy"
          @click="openSubmission(task)"
          >填写并提交</n-button
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

    <n-card
      v-if="canReviewExtensions"
      v-show="activeSection === 'manage'"
      title="总部补交审批（最早 50 项）"
    >
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

    <n-card
      v-if="canManage"
      v-show="activeSection === 'manage'"
      title="派发进度"
    >
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
          {{ task.title }} ·
          <template v-if="task.category">{{ task.category }} · </template
          >{{ task.sourceTaskId ? '整改 · ' : '' }}{{ statusText(task) }}
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
            <li
              v-for="(item, index) in normalizedChecklist(task)"
              :key="item.id"
            >
              {{ item.label
              }}{{ item.mode === 'PHOTO_REQUIRED' ? '（需拍照）' : '' }}
              <p
                v-if="task.checklistIssues?.[item.id]"
                class="whitespace-pre-wrap break-words"
              >
                异常：{{ task.checklistIssues[item.id] }}
              </p>
              <n-button
                v-if="
                  task.checklistIssues?.[item.id] &&
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
            {{
              photo.checklistItemId
                ? checklistLabel(task, photo.checklistItemId)
                : `照片 ${index + 1}`
            }}
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
                {{ checklistLabel(task, index) }}：{{ note }}
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
        <div v-if="normalizedChecklist(selectedTask).length" class="mt-3">
          <p>提交前请逐项确认</p>
          <n-checkbox-group v-model:value="checkedItems" :disabled="busy">
            <n-space vertical>
              <div
                v-for="item in normalizedChecklist(selectedTask)"
                :key="item.id"
                class="space-y-1"
              >
                <n-checkbox :value="item.id" :label="item.label" />
                <label v-if="item.mode === 'PHOTO_REQUIRED'" class="block">
                  现场照片（必传 1 张）
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    :disabled="busy"
                    @change="chooseItemPhoto(item.id, $event)"
                  />
                </label>
                <n-input
                  v-model:value="issueNotes[item.id]"
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
        <div v-if="!structuredChecklist(selectedTask)" class="mt-3">
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
              checkedItems.length !==
                normalizedChecklist(selectedTask).length ||
              normalizedChecklist(selectedTask).some(
                (item) => item.mode === 'PHOTO_REQUIRED' && !itemPhotos[item.id]
              ) ||
              (Boolean(selectedTask?.sourceTaskId) &&
                !photos.length &&
                !Object.keys(itemPhotos).length)
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

<style scoped>
.task-category-input {
  display: block;
  width: min(100%, 320px);
  margin-top: 4px;
  padding: 6px 10px;
  border: 1px solid var(--task-border);
  border-radius: 4px;
}

.task-workspace {
  --task-border: #e3e9f1;
  --task-muted: #64748b;
  --task-ink: #172033;
}

.workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 26px;
  border: 1px solid #dce7f4;
  border-radius: 18px;
  background:
    radial-gradient(circle at 90% 10%, rgb(41 121 255 / 10%), transparent 35%),
    linear-gradient(135deg, #f8fbff, #ffffff 58%);
  box-shadow: 0 12px 34px rgb(30 64 175 / 7%);
}

.workspace-kicker {
  margin: 0 0 4px;
  color: #4372b7;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.workspace-title {
  margin: 0;
  color: var(--task-ink);
  font-size: 26px;
  font-weight: 750;
  line-height: 1.25;
}

.workspace-subtitle {
  margin: 7px 0 0;
  color: var(--task-muted);
}

.workspace-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.overview-item {
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--task-border);
  border-radius: 14px;
  background: #fff;
  color: var(--task-muted);
  text-align: left;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.overview-item:hover {
  border-color: #9cc0ee;
  box-shadow: 0 8px 22px rgb(37 99 235 / 9%);
  transform: translateY(-1px);
}

.overview-item span,
.overview-item small {
  display: block;
}

.overview-item strong {
  display: block;
  margin: 3px 0 1px;
  color: var(--task-ink);
  font-size: 25px;
  line-height: 1.2;
}

.overview-item small {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-nav :deep(.n-tabs-nav) {
  margin-bottom: 0;
}

.workspace-nav :deep(.n-tab-pane) {
  display: none;
}

.message-dialog {
  width: min(680px, 92vw);
  max-height: 82vh;
}

.message-list {
  max-height: 66vh;
  overflow-y: auto;
  padding-right: 6px;
}

.message-count {
  color: var(--task-muted);
  font-size: 13px;
}

@media (max-width: 900px) {
  .workspace-header {
    flex-direction: column;
    padding: 20px;
  }

  .workspace-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .workspace-overview {
    grid-template-columns: 1fr;
  }

  .workspace-header :deep(.n-space) {
    width: 100%;
  }
}
</style>
