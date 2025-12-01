/**
 * Source Time Chart Web Component
 * Shows form block load time percentiles (p50/p75) by enter source
 */
import { Chart, registerables } from 'chartjs';
Chart.register(...registerables);

class SourceTimeChart extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.chart = null;
    this.chartData = null;
    this.selectedPercentile = 'p50';
    this.thresholdSec = 120; // ignore unrealistically long loads (align with main chart)
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
        .chart-container { position: relative; width: 100%; height: 400px; }
        .no-data { text-align: center; padding: 24px; color: #9ca3af; font-style: italic; }
      </style>
      <div class="chart-container">
        <canvas id="source-time-canvas"></canvas>
      </div>
    `;
  }

  reset() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  setData(sourceFacets) {
    const facets = (sourceFacets || []).filter(f => f && f.value);
    if (facets.length === 0) {
      const c = this.shadowRoot.querySelector('.chart-container');
      c.innerHTML = '<div class="no-data">No data available</div>';
      if (this.chart) this.chart.destroy();
      return;
    }

    // Sort by median time descending (slowest first) for readability
    const enriched = facets.map(f => ({
      source: f.value,
      p50: f.metrics.formBlockLoadTime?.percentile(50) || 0,
      p75: f.metrics.formBlockLoadTime?.percentile(75) || 0
    }))
    .sort((a, b) => b.p50 - a.p50);

    const labels = enriched.map(d => d.source);
    const p50Data = enriched.map(d => d.p50);
    const p75Data = enriched.map(d => d.p75);

    const ctx = this.shadowRoot.getElementById('source-time-canvas').getContext('2d');
    if (this.chart) this.chart.destroy();
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: this.getDatasets({ p50Data, p75Data })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          },
          title: {
            display: true,
            text: 'Form Visibility Time by Source'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${this.formatTime(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          y: {
            title: { display: true, text: 'Time (seconds)' },
            ticks: {
              callback: (v) => this.formatTime(v)
            }
          },
          x: {
            ticks: {
              autoSkip: false,   // show all labels
              maxRotation: 60,
              minRotation: 45
            }
          }
        }
      }
    });
    this.chartData = { labels, p50Data, p75Data };
  }

  // Alternative input: raw bundles (array of bundles with events)
  setFromBundles(bundles) {
    const list = Array.isArray(bundles) ? bundles : [];
    if (list.length === 0) {
      const c = this.shadowRoot.querySelector('.chart-container');
      c.innerHTML = '<div class="no-data">No data available</div>';
      if (this.chart) this.chart.destroy();
      return;
    }
    // Aggregate load time per normalized enter source (with weights)
    const sourceToPoints = new Map(); // source -> [{t,w}]
    for (const bundle of list) {
      const loadTime = this.computeFormBlockLoadTime(bundle);
      if (loadTime == null) continue;
      if (loadTime > this.thresholdSec) continue; // clamp like main series
      const w = Number(bundle.weight || 1);
      const sources = (bundle.events || [])
        .filter(e => e.checkpoint === 'enter' && e.source)
        .map(e => this.normalizeSource(e.source));
      const uniq = Array.from(new Set(sources));
      for (const s of uniq) {
        if (!sourceToPoints.has(s)) sourceToPoints.set(s, []);
        sourceToPoints.get(s).push({ t: loadTime, w });
      }
    }
    const enriched = Array.from(sourceToPoints.entries())
    .filter(([, pts]) => pts.length > 0)
    .map(([source, pts]) => {
      pts.sort((a,b)=>a.t-b.t);
      const p50 = this.weightedPercentile(pts, 0.5);
      const p75 = this.weightedPercentile(pts, 0.75);
      return { source, p50, p75 };
    }).sort((a,b)=> b.p50 - a.p50);

    const labels = enriched.map(d => d.source);
    const p50Data = enriched.map(d => d.p50);
    const p75Data = enriched.map(d => d.p75);

    const ctx = this.shadowRoot.getElementById('source-time-canvas').getContext('2d');
    if (this.chart) this.chart.destroy();
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: this.getDatasets({ p50Data, p75Data })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: 'Form Visibility Time by Source' },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${this.formatTime(ctx.parsed.y)}` } }
        },
        scales: {
          y: {
            title: { display: true, text: 'Time (seconds)' },
            ticks: { callback: (v) => this.formatTime(v) }
          },
          x: {
            ticks: { autoSkip: false, maxRotation: 60, minRotation: 45 }
          }
        }
      }
    });
    this.chartData = { labels, p50Data, p75Data };
  }

  normalizeSource(src) {
    try {
      if (src.startsWith('http://') || src.startsWith('https://')) {
        const u = new URL(src);
        let path = (u.pathname || '/').replace(/\/+$/, '');
        if (path === '') path = '';
        return `${u.origin}${path}`;
      }
      return src.replace(/\/?#$/, '');
    } catch (e) {
      return src;
    }
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

  percentile(arr, p) {
    if (!arr.length) return 0;
    const idx = (arr.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return arr[lo];
    const h = idx - lo;
    return arr[lo] + h * (arr[hi] - arr[lo]);
  }

  weightedPercentile(points, p) {
    // points: sorted [{t,w}]
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

  getDatasets({ p50Data, p75Data }) {
    if (this.selectedPercentile === 'p75') {
      return [{
        label: 'p75',
        data: p75Data,
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        borderColor: 'rgba(234, 179, 8, 0.8)',
        borderWidth: 2,
        fill: false,
        tension: 0.2,
        pointRadius: 3
      }];
    }
    return [{
      label: 'p50 (Median)',
      data: p50Data,
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 2,
      fill: false,
      tension: 0.2,
      pointRadius: 3
    }];
  }

  updateChartData() {
    if (!this.chart || !this.chartData) return;
    this.chart.data.datasets = this.getDatasets(this.chartData);
    const percentileLabel = this.selectedPercentile === 'p75' ? 'p75' : 'p50 (Median)';
    this.chart.options.plugins.title.text = `Form Visibility Time by Source - ${percentileLabel}`;
    this.chart.update();
  }
  formatTime(seconds) {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    return `${seconds.toFixed(2)}s`;
  }
}

customElements.define('source-time-chart', SourceTimeChart);
export default SourceTimeChart;


