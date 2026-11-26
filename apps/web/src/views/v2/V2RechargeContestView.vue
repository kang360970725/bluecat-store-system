<template>
  <div class="contest-page">
    <section class="contest-hero">
      <div>
        <div class="eyebrow">RECHARGE BATTLE · 2026</div>
        <h1>{{ data?.contest.name || '门店充值比武活动' }}</h1>
        <p>逐笔充值实时计分，同一笔流水只命中一个档位。</p>
      </div>
      <div class="hero-actions">
        <n-button v-if="canSync" :loading="previewLoading" secondary @click="openPushPreview">预览推送图</n-button>
        <n-button v-if="canSync" :loading="syncing" secondary @click="syncNow">立即同步</n-button>
        <n-button :loading="loading" type="primary" @click="load()">刷新榜单</n-button>
      </div>
    </section>

    <n-alert v-if="data?.contest.lastSyncError" type="error" class="sync-alert">
      最近同步异常：{{ data.contest.lastSyncError }}
    </n-alert>

    <section class="status-strip">
      <div><span>活动时间</span><strong>{{ activityRange }}</strong></div>
      <div><span>更新频率</span><strong>数据 1 分钟 · 页面 30 秒</strong></div>
      <div><span>最近同步</span><strong>{{ formatTime(data?.contest.lastSyncedAt) }}</strong></div>
      <div><span>有效充值</span><strong>{{ totalCount }} 笔 · {{ money(totalPrincipal) }}</strong></div>
    </section>

    <section v-if="leaders.length" class="podium">
      <article v-for="item in podium" :key="item.id" class="podium-card" :class="`place-${item.rank}`">
        <div class="medal">{{ medal(item.rank) }}</div>
        <div class="rank-label">第 {{ item.rank }} 名</div>
        <h2>{{ item.shortName || item.name }}</h2>
        <div class="score"><strong>{{ item.score }}</strong><span>分</span></div>
        <p>{{ item.count }} 笔有效充值 · {{ money(item.principal) }}</p>
      </article>
    </section>

    <section v-if="salesLeaders.length" class="sales-section">
      <div class="sales-title"><span>⚡ 销售人员前三</span><small>按已关联充值流水实时排名</small></div>
      <div class="sales-podium">
        <article v-for="item in salesLeaders" :key="`${item.storeId}-${item.name}`" class="sales-card">
          <div class="sales-rank">{{ medal(item.rank) }}</div><div><h3>{{ item.name }}</h3><p>{{ item.storeName }}</p></div><strong>{{ item.score }} 分</strong><span>{{ item.count }} 笔</span>
        </article>
      </div>
    </section>

    <n-card :bordered="false" class="rules-card">
      <template #header>计分档位</template>
      <div class="rules-grid">
        <div v-for="rule in rules" :key="rule.score" class="rule-chip">
          <span>{{ rule.max === null ? `${rule.min}+` : `${rule.min}–${rule.max - 1}` }}</span>
          <strong>{{ rule.score }} 分</strong>
        </div>
      </div>
    </n-card>

    <n-card :bordered="false" class="ranking-card">
      <n-tabs type="line" animated>
        <n-tab-pane name="stores" tab="门店总榜">
          <div class="card-heading"><span>完整排行榜</span><small>按得分排名，同分时本金较高者在前</small></div>
          <n-data-table :columns="columns" :data="leaders" :loading="loading" :row-key="rowKey" :pagination="false" size="small" :single-line="false" />
        </n-tab-pane>
        <n-tab-pane name="people" tab="个人榜">
          <n-data-table :columns="peopleColumns" :data="people" :loading="loading" :pagination="false" />
          <n-empty v-if="!loading && !people.length" description="在充值明细中关联销售人员后生成个人榜" />
        </n-tab-pane>
        <n-tab-pane name="entries" tab="充值明细">
          <div class="detail-filters"><n-select v-model:value="entryStoreId" clearable :options="entryStoreOptions" placeholder="全部门店" /><n-select v-model:value="entryBound" :options="boundOptions" /><n-input v-model:value="entryCard" clearable placeholder="卡号模糊查询" @keyup.enter="loadEntries(1)" /><n-input v-model:value="entrySalesperson" clearable placeholder="销售人员模糊查询" @keyup.enter="loadEntries(1)" /><n-button type="primary" @click="loadEntries(1)">查询</n-button></div>
          <n-data-table :columns="entryColumns" :data="entryData?.items || []" :loading="entryLoading" :pagination="false" :scroll-x="1480" />
          <div class="pager"><n-pagination :page="entryPage" :page-size="20" :item-count="entryData?.total || 0" @update:page="loadEntries" /></div>
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <n-modal v-model:show="showPreview" preset="card" title="企微推送预览" class="push-preview-modal" style="width:min(920px,calc(100vw - 32px));max-width:920px" :bordered="false">
      <div class="preview-toolbar"><span>预览使用当前实时榜单数据，实际推送内容与此图一致。</span><n-button type="primary" :loading="pushing" @click="pushPreview">确认推送到企业微信群</n-button></div>
      <div class="preview-canvas"><n-spin v-if="previewLoading" size="large" /><img v-else-if="previewImage" :src="previewImage" alt="充值比武榜企微推送预览" /></div>
    </n-modal>
    <n-modal v-model:show="showChangeDetails" preset="card" title="修改明细" class="change-details-modal" style="width:min(760px,calc(100vw - 32px));max-width:760px" :bordered="false">
      <div class="change-entry-summary" v-if="changeDetailsEntry"><strong>{{ changeDetailsEntry.store.shortName || changeDetailsEntry.store.name }}</strong><span>卡号：{{ changeDetailsEntry.cardRef || '—' }}</span><span>{{ formatTime(changeDetailsEntry.occurredAt) }}</span></div>
      <n-empty v-if="!changeDetailsEntry?.changeDetails" description="暂无修改记录" />
      <pre v-else class="change-details-text">{{ changeDetailsEntry.changeDetails }}</pre>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  NTabPane,
  NTabs,
  NDataTable,
  NButton,
  NInput,
  NTag,
  type DataTableColumns,
  useMessage
} from 'naive-ui';
import { NSelect } from '@/components/Select';
import { bindRechargeSalesperson, getRechargeContestEntries, getRechargeContestLeaderboard, previewRechargeContestPush, pushRechargeContest, syncRechargeContest, updateRechargeContestEntry, type RechargeContestEntries, type RechargeContestLeaderboard } from '@/api/v2-recharge-contest';
import { useAuthStore } from '@/stores/auth';

type Leader = RechargeContestLeaderboard['items'][number];
const auth = useAuthStore();
const message = useMessage();
const data = ref<RechargeContestLeaderboard | null>(null);
const loading = ref(false);
const syncing = ref(false);
const previewLoading = ref(false);
const pushing = ref(false);
const showPreview = ref(false);
const previewImage = ref('');
const entryData = ref<RechargeContestEntries | null>(null);
const entryLoading = ref(false);
const entryPage = ref(1);
const entryStoreId = ref<string | null>(null);
const entryBound = ref('ALL');
const entryCard = ref('');
const entrySalesperson = ref('');
const salespersonDrafts = ref<Record<string, string>>({});
const noteDrafts = ref<Record<string, string>>({});
const showChangeDetails = ref(false);
const changeDetailsEntry = ref<RechargeContestEntries['items'][number] | null>(null);
let refreshTimer: number | undefined;

const leaders = computed(() => data.value?.items ?? []);
const podium = computed(() => leaders.value.filter(item => item.rank <= 3).slice(0, 3));
const people = computed(() => data.value?.salespersonRanking ?? []);
const salesLeaders = computed(() => people.value.slice(0, 3));
const entryStoreOptions = computed(() => (entryData.value?.stores ?? []).map(store => ({ label: store.shortName || store.name, value: store.id })));
const boundOptions = [{ label: '全部绑定状态', value: 'ALL' }, { label: '已绑定销售', value: 'BOUND' }, { label: '未绑定销售', value: 'UNBOUND' }];
const rules = computed(() => data.value?.contest.rules ?? []);
const totalCount = computed(() => leaders.value.reduce((sum, item) => sum + item.count, 0));
const totalPrincipal = computed(() => leaders.value.reduce((sum, item) => sum + item.principal, 0));
const canSync = computed(() => auth.user?.roles.includes('super_admin') || auth.user?.permissions.includes('performance:update'));
const activityRange = computed(() => data.value
  ? `${formatTime(data.value.contest.startsAt)} — ${formatTime(data.value.contest.endsAt)}`
  : '2026-09-28 20:00:00 — 2026-10-07 23:59:59');

const columns: DataTableColumns<Leader> = [
  { title: '排名', key: 'rank', width: 58, render: row => h('span', { class: `table-rank rank-${row.rank}` }, row.rank <= 3 ? medal(row.rank) : `#${row.rank}`) },
  { title: '门店', key: 'name', width: 150, ellipsis: { tooltip: true }, render: row => h('div', { class: 'store-cell' }, [h('strong', row.shortName || row.name), h('small', row.code)]) },
  { title: '总分', key: 'score', width: 76, sorter: (a, b) => a.score - b.score, render: row => h('strong', { class: 'score-cell' }, `${row.score}`) },
  { title: '笔数', key: 'count', width: 64, sorter: (a, b) => a.count - b.count },
  { title: '有效本金', key: 'principal', width: 105, sorter: (a, b) => a.principal - b.principal, render: row => `¥${Math.round(row.principal).toLocaleString()}` },
  ...[1, 2, 3, 5, 8, 15, 25, 40].map(score => ({ title: `${score}分`, key: `band-${score}`, width: 54, align: 'center' as const, render: (row: Leader) => h(NTag, { size: 'small', bordered: false, type: row.bands[String(score)] ? 'success' : 'default' }, { default: () => row.bands[String(score)] ?? 0 }) })),
  { title: '最后入榜', key: 'latestAt', width: 136, render: row => compactTime(row.latestAt) }
];
const peopleColumns: DataTableColumns<(typeof people.value)[number]> = [
  { title: '排名', key: 'rank', width: 80, render: row => medal(row.rank) }, { title: '销售人员', key: 'name' }, { title: '所属门店', key: 'storeName' }, { title: '总分', key: 'score', render: row => `${row.score} 分` }, { title: '有效笔数', key: 'count' }, { title: '有效本金', key: 'principal', render: row => money(row.principal) }
];
type Entry = RechargeContestEntries['items'][number];
const entryColumns: DataTableColumns<Entry> = [
  { title: '时间', key: 'occurredAt', width: 170, render: row => formatTime(row.occurredAt) }, { title: '门店', key: 'store', width: 190, render: row => row.store.shortName || row.store.name }, { title: '卡号', key: 'cardRef', width: 130 }, { title: '本金', key: 'principal', width: 110, render: row => money(Number(row.principal)) }, { title: '得分', key: 'score', width: 80, render: row => `${row.score} 分` },
  { title: '关联销售人员', key: 'salespersonName', width: 280, render: row => h('div', { class: 'bind-cell' }, [h(NInput, { value: salespersonDrafts.value[row.id] ?? row.salespersonName ?? '', placeholder: '自行填写', clearable: true, onUpdateValue: value => { salespersonDrafts.value[row.id] = value; } }), h(NButton, { size: 'small', type: 'primary', onClick: () => saveSalesperson(row) }, { default: () => '保存' })]) },
  { title: '备注', key: 'note', width: 330, render: row => h('div', { class: 'bind-cell' }, [h(NInput, { value: noteDrafts.value[row.id] ?? row.note ?? '', placeholder: '填写备注', clearable: true, onUpdateValue: value => { noteDrafts.value[row.id] = value; } }), h(NButton, { size: 'small', type: 'primary', onClick: () => saveNote(row) }, { default: () => '保存' })]) },
  { title: '修改明细', key: 'changeDetails', width: 105, fixed: 'right', render: row => h(NButton, { size: 'small', tertiary: true, onClick: () => openChangeDetails(row) }, { default: () => '查看' }) }
];

async function load(silent = false) {
  if (!silent) loading.value = true;
  try { data.value = await getRechargeContestLeaderboard(); }
  catch (error) { if (!silent) message.error(error instanceof Error ? error.message : '榜单加载失败'); }
  finally { loading.value = false; }
}
async function syncNow() {
  syncing.value = true;
  try {
    const result = await syncRechargeContest();
    message.success(result.skipped ? '本分钟同步任务已执行' : `同步完成，计入 ${result.accepted ?? 0} 条有效流水`);
    await load(true);
  } catch (error) { message.error(error instanceof Error ? error.message : '同步失败'); }
  finally { syncing.value = false; }
}
async function openPushPreview() {
  showPreview.value = true; previewLoading.value = true;
  try { previewImage.value = (await previewRechargeContestPush()).image; }
  catch (error) { showPreview.value = false; message.error(error instanceof Error ? error.message : '预览生成失败'); }
  finally { previewLoading.value = false; }
}
async function pushPreview() {
  pushing.value = true;
  try {
    const result = await pushRechargeContest();
    const success = result.results.filter(item => item.status === 'SUCCESS').length;
    const failed = result.results.length - success;
    if (!result.results.length) message.warning('暂无启用的企业微信群机器人');
    else if (failed) message.warning(`已推送 ${success} 个群，${failed} 个群失败`);
    else { message.success(`推送成功，共 ${success} 个企业微信群`); showPreview.value = false; }
  } catch (error) { message.error(error instanceof Error ? error.message : '推送失败'); }
  finally { pushing.value = false; }
}
async function loadEntries(page = entryPage.value) { entryLoading.value = true; try { entryPage.value = page; entryData.value = await getRechargeContestEntries(page, entryStoreId.value || '', entryBound.value, entryCard.value, entrySalesperson.value); } finally { entryLoading.value = false; } }
async function saveSalesperson(row: Entry) { try { await bindRechargeSalesperson(row.id, salespersonDrafts.value[row.id] ?? row.salespersonName ?? ''); message.success('销售人员关联已保存'); await Promise.all([load(true), loadEntries(entryPage.value)]); } catch (error) { message.error(error instanceof Error ? error.message : '保存失败'); } }
async function saveNote(row: Entry) { try { await updateRechargeContestEntry(row.id, { note: noteDrafts.value[row.id] ?? row.note ?? '' }); message.success('备注已保存'); await loadEntries(entryPage.value); } catch (error) { message.error(error instanceof Error ? error.message : '保存失败'); } }
function openChangeDetails(row: Entry) { changeDetailsEntry.value = row; showChangeDetails.value = true; }
function money(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value); }
function formatTime(value?: string | null) { return value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)).replaceAll('/', '-') : '尚未同步'; }
function compactTime(value?: string | null) { return value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replaceAll('/', '-') : '—'; }
function medal(rank: number) { return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`; }
function rowKey(row: Leader) { return row.id; }

onMounted(() => { void Promise.all([load(), loadEntries(1)]); refreshTimer = window.setInterval(() => void load(true), 30_000); });
onBeforeUnmount(() => { if (refreshTimer) window.clearInterval(refreshTimer); });
</script>

<style scoped>
.contest-page { display: grid; gap: 18px; max-width: 1480px; margin: 0 auto; }
.contest-hero { position: relative; overflow: hidden; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 34px; border-radius: 24px; color: white; background: radial-gradient(circle at 80% 0%, rgba(250,204,21,.38), transparent 34%), linear-gradient(135deg, #111827, #1e3a8a 72%, #2563eb); box-shadow: 0 20px 50px rgba(30,58,138,.22); }
.contest-hero::after { content: 'VS'; position: absolute; right: 24%; top: -32px; font-size: 150px; font-weight: 900; font-style: italic; color: rgba(255,255,255,.055); transform: rotate(-8deg); }
.contest-hero h1 { margin: 8px 0 6px; font-size: clamp(28px, 4vw, 48px); line-height: 1.1; }
.contest-hero p { margin: 0; color: rgba(255,255,255,.72); }
.eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .2em; color: #fde68a; }
.hero-actions { position: relative; z-index: 1; display: flex; gap: 10px; flex: none; }
.status-strip { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 1px; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 18px; background: #e5e7eb; }
.status-strip div { display: grid; gap: 5px; padding: 18px 20px; background: white; }
.status-strip span { color: #64748b; font-size: 12px; }
.status-strip strong { color: #0f172a; font-size: 14px; }
.podium { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.sales-section { padding: 22px; border-radius: 20px; color: white; background: linear-gradient(125deg,#082f49,#0c4a6e 55%,#164e63); box-shadow: 0 16px 38px rgba(8,47,73,.22); }
.sales-title { display:flex; align-items:baseline; gap:12px; margin-bottom:14px; font-size:22px; font-weight:900; }.sales-title small{font-size:12px;color:#bae6fd;font-weight:500}.sales-podium{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.sales-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:16px;border:1px solid rgba(125,211,252,.3);border-radius:16px;background:rgba(255,255,255,.08)}.sales-card h3,.sales-card p{margin:0}.sales-card p{color:#bae6fd;font-size:12px}.sales-card strong{font-size:24px;color:#fde047}.sales-card>span{grid-column:3;color:#bae6fd;font-size:12px}.sales-rank{font-size:30px}
.podium-card { position: relative; padding: 24px; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 20px; background: white; box-shadow: 0 10px 30px rgba(15,23,42,.06); }
.podium-card.place-1 { border-color: #facc15; background: linear-gradient(145deg, #fffbeb, white 60%); }
.podium-card.place-2 { background: linear-gradient(145deg, #f8fafc, white 60%); }
.podium-card.place-3 { background: linear-gradient(145deg, #fff7ed, white 60%); }
.medal { position: absolute; right: 18px; top: 12px; font-size: 42px; }
.rank-label { color: #64748b; font-size: 12px; font-weight: 700; letter-spacing: .08em; }
.podium-card h2 { max-width: 75%; margin: 10px 0 18px; font-size: 20px; }
.podium-card p { margin: 10px 0 0; color: #64748b; font-size: 13px; }
.score { display: flex; align-items: baseline; gap: 6px; color: #1d4ed8; }
.score strong { font-size: 42px; line-height: 1; }
.score span { font-weight: 700; }
.rules-card, .ranking-card { border-radius: 20px; box-shadow: 0 10px 30px rgba(15,23,42,.045); }
.rules-grid { display: grid; grid-template-columns: repeat(8, minmax(90px, 1fr)); gap: 10px; }
.rule-chip { display: grid; gap: 6px; padding: 14px; border-radius: 14px; background: #f8fafc; text-align: center; }
.rule-chip span { color: #64748b; font-size: 12px; }
.rule-chip strong { color: #1d4ed8; }
.card-heading { display: flex; align-items: baseline; gap: 12px; }
.detail-filters{display:flex;gap:10px;margin:12px 0 18px}.detail-filters .n-select{width:210px}.detail-filters .n-input{width:240px}.pager{display:flex;justify-content:flex-end;margin-top:18px}:deep(.bind-cell){display:flex;gap:8px}:deep(.ranking-card .n-data-table-th),:deep(.ranking-card .n-data-table-td){padding-left:8px!important;padding-right:8px!important}
.card-heading small { color: #94a3b8; font-weight: 400; }
:deep(.table-rank) { font-weight: 800; }
:deep(.store-cell) { display: grid; gap: 2px; }
:deep(.store-cell small) { color: #94a3b8; }
:deep(.score-cell) { color: #1d4ed8; }
.sync-alert { border-radius: 14px; }
:global(.push-preview-modal) { width: min(920px, calc(100vw - 32px)) !important; max-width: 920px !important; }
:global(.change-details-modal) { width: min(760px, calc(100vw - 32px)) !important; max-width: 760px !important; }
.change-entry-summary { display:flex;flex-wrap:wrap;gap:10px 22px;margin-bottom:16px;padding:14px 16px;border-radius:12px;background:#f8fafc;color:#64748b; }.change-entry-summary strong{color:#0f172a}.change-details-text{max-height:55vh;margin:0;padding:16px;overflow:auto;border-radius:12px;background:#0f172a;color:#e2e8f0;white-space:pre-wrap;word-break:break-word;font:13px/1.8 ui-monospace,SFMono-Regular,Menlo,monospace}
.preview-toolbar { display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:16px;color:#64748b; }
.preview-canvas { display:flex;min-height:280px;align-items:center;justify-content:center;padding:14px;border-radius:16px;background:#0b1220;overflow:auto; }
.preview-canvas img { display:block;width:min(100%,720px);height:auto;border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,.35); }
@media (max-width: 900px) { .contest-hero { align-items: stretch; flex-direction: column; padding: 24px; } .hero-actions > * { flex: 1; } .status-strip { grid-template-columns: 1fr 1fr; } .podium,.sales-podium { grid-template-columns: 1fr; } .rules-grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 560px) { .status-strip { grid-template-columns: 1fr; } .rules-grid { grid-template-columns: repeat(2, 1fr); } .card-heading { align-items: flex-start; flex-direction: column; gap: 4px; } }
</style>
