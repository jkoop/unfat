import { layout, escHtml } from "./layout.ts";
import { NUTRIENT_FIELDS, NUTRIENT_LABELS, type User } from "../db.ts";

type ChartData = {
  foodDates: string[];
  nutrients: Record<string, (number | null)[]>;
  sleepDates: string[];
  sleepStart: (number | null)[];
  sleepEnd: (number | null)[];
  sleepScore: (number | null)[];
  weightDates: string[];
  weightValues: (number | null)[];
};

export function chartsPage(opts: {
  user: User;
  data: ChartData;
  days: number;
  from: string;
  to: string;
}): string {
  const { user, data, days, from, to } = opts;

  const presets = [7, 15, 30, 90];

  const nutrientOptions = NUTRIENT_FIELDS.map(f =>
    `<button type="button" class="nutrient-toggle active" data-nutrient="${f}">${escHtml(NUTRIENT_LABELS[f])}</button>`
  ).join("");

  return layout({
    title: "Charts",
    user,
    activeTab: "charts",
    body: `
<div class="page-header"><h1>Charts</h1></div>

<div class="range-bar">
  ${presets.map(d => `
  <form method="GET" action="/charts" style="display:inline">
    <input type="hidden" name="days" value="${d}"/>
    <button type="submit" class="range-btn${days === d ? " active" : ""}">${d}d</button>
  </form>`).join("")}
  <form method="GET" action="/charts" id="custom-range-form" style="display:inline-flex;gap:6px;align-items:center">
    <input type="date" name="from" value="${escHtml(from)}"
           style="width:130px;font-size:12px;padding:5px 8px"/>
    <span class="text-muted text-sm">to</span>
    <input type="date" name="to" value="${escHtml(to)}"
           style="width:130px;font-size:12px;padding:5px 8px"/>
    <button type="submit" class="range-btn">Go</button>
  </form>
</div>

<div class="chart-wrap">
  <h2>Food — Nutrients</h2>
  <div class="nutrient-toggles">${nutrientOptions}</div>
  <canvas id="food-chart" height="220"></canvas>
</div>

<div class="chart-wrap">
  <h2>Sleep</h2>
  <canvas id="sleep-chart" height="200"></canvas>
</div>

<div class="chart-wrap">
  <h2>Weight (${escHtml(user.unit_user_weight)})</h2>
  <canvas id="weight-chart" height="180"></canvas>
</div>`,
    scripts: `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script>
const CHART_DATA = ${JSON.stringify(data)};
const NUTRIENT_LABELS = ${JSON.stringify(Object.fromEntries(NUTRIENT_FIELDS.map(f => [f, NUTRIENT_LABELS[f]])))};

const PALETTE = [
  '#f97316','#3b82f6','#22c55e','#eab308','#a855f7',
  '#ec4899','#14b8a6','#f43f5e','#84cc16','#0ea5e9',
  '#fb923c','#6366f1','#10b981','#fbbf24','#e879f9',
];

Chart.defaults.color = '#888';
Chart.defaults.borderColor = '#2a2a2a';
Chart.defaults.font.family = 'system-ui, sans-serif';
Chart.defaults.font.size = 12;

function nullToUndefined(arr) {
  return arr.map(v => v === null ? undefined : v);
}

function localLabel(sql) {
  const d = new Date(String(sql).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return sql;
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// Food chart
const foodKeys = Object.keys(CHART_DATA.nutrients);
const foodDatasets = foodKeys.map((key, i) => ({
  label: NUTRIENT_LABELS[key] || key,
  data: nullToUndefined(CHART_DATA.nutrients[key]),
  borderColor: PALETTE[i % PALETTE.length],
  backgroundColor: PALETTE[i % PALETTE.length] + '22',
  tension: 0.3,
  pointRadius: 3,
  spanGaps: true,
}));

const foodChart = new Chart(document.getElementById('food-chart'), {
  type: 'line',
  data: { labels: CHART_DATA.foodDates.map(localLabel), datasets: foodDatasets },
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#1f1f1f' } },
      y: { grid: { color: '#1f1f1f' }, beginAtZero: false },
    },
  },
});

// Nutrient toggles
document.querySelectorAll('.nutrient-toggle').forEach((btn, i) => {
  btn.addEventListener('click', function() {
    this.classList.toggle('active');
    const ds = foodChart.data.datasets[i];
    ds.hidden = !this.classList.contains('active');
    foodChart.update();
  });
});

// Sleep chart
function timeToHours(dt) {
  if (!dt) return undefined;
  const d = new Date(String(dt).replace(' ', 'T') + 'Z');
  return d.getHours() + d.getMinutes() / 60;
}

const sleepChart = new Chart(document.getElementById('sleep-chart'), {
  type: 'line',
  data: {
    labels: CHART_DATA.sleepDates.map(localLabel),
    datasets: [
      {
        label: 'Score (1-10)',
        data: nullToUndefined(CHART_DATA.sleepScore),
        borderColor: '#f97316',
        tension: 0.3,
        pointRadius: 4,
        spanGaps: true,
        yAxisID: 'y',
      },
      {
        label: 'Bed time (hr)',
        data: CHART_DATA.sleepStart.map(timeToHours),
        borderColor: '#3b82f6',
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true,
        yAxisID: 'y2',
      },
      {
        label: 'Wake time (hr)',
        data: CHART_DATA.sleepEnd.map(timeToHours),
        borderColor: '#22c55e',
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true,
        yAxisID: 'y2',
      },
    ],
  },
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#888' } } },
    scales: {
      x: { grid: { color: '#1f1f1f' } },
      y: {
        type: 'linear', position: 'left',
        min: 0, max: 10,
        title: { display: true, text: 'Score', color: '#888' },
        grid: { color: '#1f1f1f' },
      },
      y2: {
        type: 'linear', position: 'right',
        min: 0, max: 24,
        title: { display: true, text: 'Time (24h)', color: '#888' },
        grid: { drawOnChartArea: false },
      },
    },
  },
});

// Weight chart
new Chart(document.getElementById('weight-chart'), {
  type: 'line',
  data: {
    labels: CHART_DATA.weightDates.map(localLabel),
    datasets: [{
      label: 'Weight',
      data: nullToUndefined(CHART_DATA.weightValues),
      borderColor: '#f97316',
      backgroundColor: '#f9731622',
      tension: 0.3,
      pointRadius: 4,
      fill: true,
      spanGaps: true,
    }],
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#1f1f1f' } },
      y: { grid: { color: '#1f1f1f' }, beginAtZero: false },
    },
  },
});
</script>`,
  });
}
