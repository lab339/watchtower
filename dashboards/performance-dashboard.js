/**
 * Load Time Dashboard Web Component
 * Displays form block load time statistics with hour-by-hour breakdown
 */
import '../charts/load-time-chart.js';
import '../charts/load-time-histogram.js';
import '../charts/source-time-series-chart.js';
import '../charts/resource-time-table.js';

class PerformanceDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.dataChunks = null;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    // Cleanup handled by child components
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
        }

        .dashboard-container {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          padding: 24px;
          margin-bottom: 20px;
        }

        .dashboard-header {
          margin-bottom: 24px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 16px;
        }

        .dashboard-header h2 {
          margin: 0 0 12px 0;
          color: #1e40af;
          font-size: 1.5rem;
          font-weight: 700;
        }

        .summary-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
          margin-top: 12px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          background: #f9fafb;
          padding: 16px;
          border-radius: 8px;
          border-left: 4px solid #3b82f6;
        }

        .stat-item.highlight {
          background: #eff6ff;
          border-left-color: #2563eb;
          border-left-width: 5px;
        }

        .stat-item.clickable {
          cursor: pointer;
          transition: all 0.2s;
        }

        .stat-item.clickable:hover {
          background: #dbeafe;
          transform: translateY(-2px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .stat-item.clickable.active {
          background: #2563eb;
          border-left-color: #1e40af;
        }

        .stat-item.clickable.active .stat-label,
        .stat-item.clickable.active .stat-value,
        .stat-item.clickable.active .stat-subtext {
          color: white !important;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
        }

        .stat-value.fast {
          color: #059669;
        }

        .stat-value.moderate {
          color: #d97706;
        }

        .stat-value.slow {
          color: #dc2626;
        }

        .stat-subtext {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 4px;
        }

        load-time-chart {
          margin-bottom: 24px;
        }

        load-time-histogram {
          margin-top: 32px;
        }

        resource-time-table {
          margin-top: 32px;
        }

        .performance-insights {
          margin-top: 24px;
          padding: 16px;
          background: #eff6ff;
          border-left: 4px solid #3b82f6;
          border-radius: 4px;
        }

        .performance-insights h3 {
          margin: 0 0 12px 0;
          color: #1e40af;
          font-size: 1rem;
          font-weight: 600;
        }

        .performance-insights p {
          margin: 0;
          color: #374151;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .no-data {
          text-align: center;
          padding: 40px 20px;
          color: #9ca3af;
          font-style: italic;
        }

        .loading {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
        }

        @media (max-width: 768px) {
          .summary-stats {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
      </style>

      <div class="dashboard-container">
        <div class="dashboard-header">
          <h2>Performance</h2>
          <h3>Engagement Readiness Time (Form Visibility)</h3>
          <p class="description">
            How long does it take for the form to be visible on the screen?
          </p>
          <div class="summary-stats" id="summary-stats">
            <div class="stat-item">
              <span class="stat-label">Fastest (Min)</span>
              <span class="stat-value fast" id="min-load-time">-</span>
            </div>
            <div class="stat-item highlight clickable active" id="stat-p50" data-percentile="p50">
              <span class="stat-label">p50 (Median)</span>
              <span class="stat-value" id="p50-load-time">-</span>
              <span class="stat-subtext">50% of loads are faster</span>
            </div>
            <div class="stat-item highlight clickable" id="stat-p75" data-percentile="p75">
              <span class="stat-label">p75</span>
              <span class="stat-value" id="p75-load-time">-</span>
              <span class="stat-subtext">75% of loads are faster</span>
            </div>
          </div>
        </div>

        <load-time-chart id="load-time-chart"></load-time-chart>

        <load-time-histogram id="load-time-histogram"></load-time-histogram>

        <div class="dashboard-header" style="margin-top:24px;">
          <h3>By Source Over Time</h3>
          <p class="description">Hourly trend per selected source(s)</p>
        </div>
        <source-time-series-chart id="source-time-series-chart"></source-time-series-chart>

        <resource-time-table id="resource-time-table"></resource-time-table>
      </div>
    `;
  }

  setupEventListeners() {
    const statP50 = this.shadowRoot.getElementById('stat-p50');
    const statP75 = this.shadowRoot.getElementById('stat-p75');
    const chart = this.shadowRoot.getElementById('load-time-chart');
    const sourceSeriesChart = this.shadowRoot.getElementById('source-time-series-chart');

    statP50.addEventListener('click', () => {
      statP50.classList.add('active');
      statP75.classList.remove('active');
      chart.setAttribute('percentile', 'p50');
      sourceSeriesChart.setAttribute('percentile', 'p50');
    });

    statP75.addEventListener('click', () => {
      statP75.classList.add('active');
      statP50.classList.remove('active');
      chart.setAttribute('percentile', 'p75');
      sourceSeriesChart.setAttribute('percentile', 'p75');
    });
  }

  setData(dataChunks, url, rawChunks, aliasMap) {
    this.dataChunks = dataChunks;
    this.url = url;
    this.rawChunks = rawChunks;
    this.aliasMap = aliasMap || null;
    this.updateSummaryStats();
    this.updateChart();
    this.updateHistogram();
    this.updateResourceTable();
  }

  updateChart() {
    if (!this.dataChunks || !this.dataChunks.facets.hour) return;

    const chart = this.shadowRoot.getElementById('load-time-chart');
    chart.setData(this.dataChunks.facets.hour);

    const bundles = Array.isArray(this.rawChunks)
      ? this.rawChunks.flatMap((c) => c.rumBundles || [])
      : [];

    const sourceSeriesChart = this.shadowRoot.getElementById('source-time-series-chart');
    if (bundles.length) {
      if (this.aliasMap && sourceSeriesChart.setAliasMap) {
        sourceSeriesChart.setAliasMap(this.aliasMap);
      }
      sourceSeriesChart.setFromBundles(bundles);
    } else {
      sourceSeriesChart.reset();
    }
  }

  updateHistogram() {
    if (!this.dataChunks || !this.dataChunks.facets.formBlockLoadTime) return;

    const histogram = this.shadowRoot.getElementById('load-time-histogram');

    // Option 1: Use dynamic buckets (default behavior)
    // histogram.setData(this.dataChunks.facets.formBlockLoadTime);

    // Option 2: Use custom bucket thresholds
    // Example: Create 5 buckets with custom ranges
    const bucketThresholds = [0, 10, 20, 60, Infinity];
    histogram.setData(this.dataChunks.facets.formBlockLoadTime, bucketThresholds);

    // Option 3: Use different number of buckets with custom ranges
    // const bucketThresholds = [0, 1, 2, 5, 10, Infinity];
    // histogram.setData(this.dataChunks.facets.formBlockLoadTime, bucketThresholds);
  }

  updateResourceTable() {
    if (!this.dataChunks) return;

    const resourceTable = this.shadowRoot.getElementById('resource-time-table');
    resourceTable.setData(this.dataChunks);
  }

  updateSummaryStats() {
    if (!this.dataChunks) return;

    const totals = this.dataChunks.totals;
    const minLoadTime = totals.formBlockLoadTime?.min || 0;
    const p50LoadTime = totals.formBlockLoadTime?.percentile(50) || 0;
    const p75LoadTime = totals.formBlockLoadTime?.percentile(75) || 0;
    const lcpP75 = totals.lcp?.percentile(75) || 0;

    const minElement = this.shadowRoot.getElementById('min-load-time');
    minElement.textContent = this.formatTime(minLoadTime);
    minElement.className = 'stat-value ' + this.getPerformanceClass(minLoadTime);

    const p50Element = this.shadowRoot.getElementById('p50-load-time');
    p50Element.textContent = this.formatTime(p50LoadTime);
    p50Element.className = 'stat-value ' + this.getPerformanceClass(p50LoadTime);

    const p75Element = this.shadowRoot.getElementById('p75-load-time');
    p75Element.textContent = this.formatTime(p75LoadTime);
    p75Element.className = 'stat-value ' + this.getPerformanceClass(p75LoadTime);
  }

  getPerformanceClass(loadTime) {
    if (loadTime <= 1) return 'fast';
    if (loadTime <= 2) return 'moderate';
    return 'slow';
  }

  getLCPPerformanceClass(lcpTime) {
    // LCP thresholds based on Core Web Vitals
    if (lcpTime <= 2.5) return 'fast';
    if (lcpTime <= 4) return 'moderate';
    return 'slow';
  }

  getPerformanceLabel(loadTime) {
    if (loadTime <= 1) return 'Excellent';
    if (loadTime <= 2) return 'Good';
    if (loadTime <= 3) return 'Needs Improvement';
    return 'Poor';
  }

  formatTime(seconds) {
    if (seconds < 1) {
      return `${(seconds * 1000).toFixed(0)}ms`;
    }
    return `${seconds.toFixed(2)}s`;
  }

  reset() {
    const chart = this.shadowRoot.getElementById('load-time-chart');
    if (chart) {
      chart.reset();
    }
    const histogram = this.shadowRoot.getElementById('load-time-histogram');
    if (histogram) {
      histogram.reset();
    }
    const resourceTable = this.shadowRoot.getElementById('resource-time-table');
    if (resourceTable) {
      resourceTable.reset();
    }
    this.dataChunks = null;
    this.url = '';
  }
}

// Define the custom element
customElements.define('performance-dashboard', PerformanceDashboard);

export default PerformanceDashboard;

