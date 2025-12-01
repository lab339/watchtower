/**
 * Source Time Series Chart
 * Displays per-hour form visibility time (p50/p75) for one or more sources.
 * Input API:
 *   - setFromBundles(bundles: Bundle[])
 *     Bundles must include: timeSlot (UTC hour), weight, events[] with
 *     - checkpoint 'viewblock' (form block visible) with timeDelta
 *     - checkpoint 'enter' with source
 * Attributes:
 *   - percentile: 'p50' | 'p75'
 */
import { Chart, registerables } from 'chartjs';
import { dayNightPlugin } from './day-night-plugin.js';
Chart.register(...registerables);

class SourceTimeSeriesChart extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.chart = null;
    this.selectedPercentile = 'p50';
    this.thresholdSec = 120; // align with main chart threshold
    this.aliasMap = null; // alias -> canonical
    this._hoursUTC = [];
    this._seriesSources = [];
    this._sourceHourToPoints = new Map();
    this._sourceAllPoints = new Map();
  }

  static get observedAttributes() {
    return ['percentile'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'percentile' && oldValue !== newValue) {
      this.selectedPercentile = newValue || 'p50';
      this.updateChartData();
    }
  }

  connectedCallback() {
    this.selectedPercentile = this.getAttribute('percentile') || 'p50';
    this.render();
  }

  disconnectedCallback() {
    if (this.chart) this.chart.destroy();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; }
        .layout { display: flex; gap: 16px; align-items: stretch; }
        .list {
          width: 240px;
          min-width: 200px;
          max-height: 360px;
          overflow: auto;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 8px;
          background: #fff;
        }
        .list h4 {
          margin: 0 0 8px 0;
          font-size: 0.9rem;
          color: #374151;
        }
        .list-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.82rem;
          padding: 6px 4px;
          border-bottom: 1px dashed #f1f5f9;
          color: #111827;
          word-break: break-all;
        }
        .list-item.disabled { opacity: 0.5; }
        .swatch {
          width: 10px;
          height: 10px;
          border-radius: 9999px;
          flex: 0 0 10px;
        }
        .chart-container { position: relative; width: 100%; height: 360px; flex: 1; }
        .no-data { text-align: center; padding: 24px; color: #9ca3af; font-style: italic; }
      </style>
      <div class="layout">
        <div class="list" id="source-list">
          <h4>Top Sources</h4>
          <div id="list-body"></div>
        </div>
        <div class="chart-container">
          <canvas id="canvas"></canvas>
        </div>
      </div>
    `;
  }

  reset() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  setAliasMap(map) {
    this.aliasMap = map || null;
  }

  // Public API
  setFromBundles(bundles) {
    const list = Array.isArray(bundles) ? bundles : [];
    if (list.length === 0) {
      const c = this.shadowRoot.querySelector('.chart-container');
      c.innerHTML = '<div class="no-data">No data available</div>';
      if (this.chart) this.chart.destroy();
      return;
    }

    // Aggregate: source -> hour(ISO string UTC) -> [{t,w}]
    const sourceHourToPoints = new Map();
    const sourceAllPoints = new Map(); // flattened for ranking by percentile
    for (const b of list) {
      const tSec = this.computeFormBlockLoadTime(b);
      if (tSec == null || tSec > this.thresholdSec) continue;
      const w = Number(b.weight || 1);
      const hourUTC = (b.timeSlot || '').slice(0, 13) + ':00:00Z'; // normalize
      const sources = (b.events || [])
        .filter(e => e.checkpoint === 'enter' && e.source)
        .map(e => this.normalizeSource(e.source));
      const uniqSources = Array.from(new Set(sources));
      for (const s of uniqSources) {
        if (!sourceAllPoints.has(s)) sourceAllPoints.set(s, []);
        sourceAllPoints.get(s).push({ t: tSec, w });
        const key = `${s}|${hourUTC}`;
        if (!sourceHourToPoints.has(key)) sourceHourToPoints.set(key, []);
        sourceHourToPoints.get(key).push({ t: tSec, w });
      }
    }

    const sources = Array.from(sourceAllPoints.entries())
      .filter(([, pts]) => pts.length > 0)
      .map(([s, pts]) => {
        pts.sort((a,b)=>a.t-b.t);
        const metric = this.selectedPercentile === 'p75'
          ? this.weightedPercentile(pts, 0.75)
          : this.weightedPercentile(pts, 0.5);
        return { s, metric };
      })
      .sort((a,b)=> b.metric - a.metric)
      .map(({ s }) => s);

    if (sources.length === 0) {
      this.reset();
      const c = this.shadowRoot.querySelector('.chart-container');
      c.innerHTML = '<div class="no-data">No data available</div>';
      return;
    }

    // Build sorted unique hours
    const hoursUTC = Array.from(new Set(Array.from(sourceHourToPoints.keys()).map(k => k.split('|')[1])))
      .sort((a,b)=> new Date(a) - new Date(b));
    const labels = hoursUTC.map(h => this.formatHour(h));
    const rawHourData = hoursUTC.slice();

    // Prepare datasets (cap to top 10 sources by default) - sorted by selected percentile desc
    const maxSeries = 10;
    const seriesSources = sources.slice(0, Math.max(1, Math.min(maxSeries, sources.length)));

    // Persist for later percentile toggles
    this._hoursUTC = hoursUTC;
    this._seriesSources = seriesSources;
    this._sourceHourToPoints = sourceHourToPoints;
    this._sourceAllPoints = sourceAllPoints;

    const ctx = this.shadowRoot.getElementById('canvas').getContext('2d');
    if (this.chart) this.chart.destroy();
    this.chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: this.buildDatasets() },
      plugins: [dayNightPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          dayNightBackground: {
            enabled: true,
            dayStart: 6,
            dayEnd: 20,
            nightColor: 'rgba(30, 41, 59, 0.08)',
            showLegend: true,
            rawHourData
          },
          legend: { display: false },
          title: {
            display: true,
            text: `Form Visibility Time by Source over Time - ${this.selectedPercentile.toUpperCase()}`
          },
          tooltip: {
            intersect: false,
            mode: 'index',
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${this.formatTime(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Time (seconds)' },
            ticks: { callback: (v) => this.formatTime(v) }
          },
          x: {
            title: { display: true, text: 'Hour' }
          }
        }
      }
    });
    this._rawHourData = rawHourData;
    this.updateList();
  }

  updateChartData() {
    if (!this.chart) return;
    // Re-rank sources by selected percentile and rebuild datasets
    if (this._sourceAllPoints && this._sourceAllPoints.size) {
      const ranked = Array.from(this._sourceAllPoints.entries())
        .filter(([, pts]) => pts.length > 0)
        .map(([s, pts]) => {
          const sorted = pts.slice().sort((a,b)=>a.t-b.t);
          const metric = this.selectedPercentile === 'p75'
            ? this.weightedPercentile(sorted, 0.75)
            : this.weightedPercentile(sorted, 0.5);
          return { s, metric };
        })
        .sort((a,b)=> b.metric - a.metric)
        .map(({ s }) => s);
      const maxSeries = 10;
      this._seriesSources = ranked.slice(0, Math.max(1, Math.min(maxSeries, ranked.length)));
    }

    this.chart.data.datasets = this.buildDatasets();
    const ttl = this.selectedPercentile === 'p75' ? 'p75' : 'p50 (Median)';
    this.chart.options.plugins.title.text = `Form Visibility Time by Source over Time - ${ttl}`;
    this.chart.update();
    this.updateList();
  }

  // Helpers
  buildDatasets() {
    if (!this._hoursUTC || !this._seriesSources || !this._sourceHourToPoints) return [];
    return this._seriesSources.map((s, idx) => {
      const color = this.pickColor(idx);
      const data = this._hoursUTC.map(h => {
        const pts = this._sourceHourToPoints.get(`${s}|${h}`) || [];
        if (!pts.length) return null;
        const val = this.selectedPercentile === 'p75'
          ? this.weightedPercentile(pts, 0.75)
          : this.weightedPercentile(pts, 0.5);
        return val;
      });
      return {
        label: s,
        data,
        borderColor: color,
        backgroundColor: color.replace('1)', '0.1)').replace('rgb', 'rgba'),
        borderWidth: 2,
        spanGaps: true,
        tension: 0.2,
        pointRadius: 2
      };
    });
  }

  updateList() {
    const body = this.shadowRoot.getElementById('list-body');
    if (!body) return;
    const items = this._seriesSources || [];
    const suffix = this.selectedPercentile === 'p75' ? 'p75' : 'p50';
    const fragments = [];
    items.forEach((s, idx) => {
      // compute metric for display from flattened points
      const pts = (this._sourceAllPoints && this._sourceAllPoints.get(s)) || [];
      let metric = 0;
      if (pts.length) {
        const sorted = pts.slice().sort((a,b)=>a.t-b.t);
        metric = this.selectedPercentile === 'p75'
          ? this.weightedPercentile(sorted, 0.75)
          : this.weightedPercentile(sorted, 0.5);
      }
      const color = this.pickColor(idx);
      const ds = (this.chart?.data?.datasets || [])[idx];
      const disabled = !!(ds && ds.hidden);
      fragments.push(`
        <div class="list-item ${disabled ? 'disabled' : ''}" data-idx="${idx}">
          <span class="swatch" style="background:${color}"></span>
          <span>${this.escapeHtml(s)} (${suffix}: ${this.formatTime(metric)})</span>
        </div>
      `);
    });
    body.innerHTML = fragments.join('');
    // Toggle dataset visibility on click
    body.querySelectorAll('.list-item').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = Number(row.getAttribute('data-idx'));
        const ds = this.chart.data.datasets[idx];
        ds.hidden = !ds.hidden;
        row.classList.toggle('disabled', !!ds.hidden);
        this.chart.update();
      });
    });
  }

  normalizeSource(src) {
    try {
      if (src.startsWith('http://') || src.startsWith('https://')) {
        const u = new URL(src);
        let path = (u.pathname || '/').replace(/\/+$/, '');
        if (path === '') path = '';
        const norm = `${u.origin}${path}`;
        if (this.aliasMap && this.aliasMap[norm]) return this.aliasMap[norm];
        return norm;
      }
      const norm = src.replace(/\/?#$/, '');
      if (this.aliasMap && this.aliasMap[norm]) return this.aliasMap[norm];
      return norm;
    } catch (e) {
      const norm = src;
      if (this.aliasMap && this.aliasMap[norm]) return this.aliasMap[norm];
      return norm;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  computeFormBlockLoadTime(bundle) {
    try {
      const events = (bundle.events || []).slice().sort((a,b)=>a.timeDelta-b.timeDelta);
      const formLoad = events.find(e => e.checkpoint === 'viewblock' && e.source && /form/.test(e.source));
      if (formLoad && formLoad.timeDelta > 0) return formLoad.timeDelta / 1000;
      return null;
    } catch (e) {
      return null;
    }
  }

  weightedPercentile(points, p) {
    let total = 0;
    for (const pt of points) total += (pt.w || 1);
    if (total <= 0) return 0;
    const target = total * p;
    let acc = 0;
    for (const pt of points) {
      acc += (pt.w || 1);
      if (acc >= target) return pt.t;
    }
    return points[points.length - 1].t;
  }

  formatTime(seconds) {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    return `${seconds.toFixed(2)}s`;
  }

  formatHour(utcISOHour) {
    const d = new Date(utcISOHour);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    return `${month}/${day} ${hour}:00`;
  }

  pickColor(index) {
    const palette = [
      'rgba(59, 130, 246, 1)',   // blue
      'rgba(234, 179, 8, 1)',    // amber
      'rgba(16, 185, 129, 1)',   // emerald
      'rgba(244, 63, 94, 1)',    // rose
      'rgba(99, 102, 241, 1)',   // indigo
      'rgba(245, 158, 11, 1)',   // orange
      'rgba(168, 85, 247, 1)',   // purple
      'rgba(13, 148, 136, 1)',   // teal
      'rgba(236, 72, 153, 1)',   // pink
      'rgba(100, 116, 139, 1)'   // slate
    ];
    return palette[index % palette.length];
  }
}

customElements.define('source-time-series-chart', SourceTimeSeriesChart);
export default SourceTimeSeriesChart;


