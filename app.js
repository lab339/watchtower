import DataLoader from './loader.js';
import { fetchDomainKey } from './loader.js';
import { DataChunks, series, facets } from '@adobe/rum-distiller';
import URLAutocomplete from './components/url-autocomplete.js';
import SourceFilter from './components/source-filter.js';
import DateRangePicker from './components/date-range-picker.js';
import ErrorDashboard from './dashboards/error-dashboard.js';
import LoadDashboard from './dashboards/performance-dashboard.js';
import EngagementDashboard from './dashboards/engagement-dashboard.js';
import ResourceDashboard from './dashboards/resource-dashboard.js';
import { errorDataChunks, performanceDataChunks, engagementDataChunks, resourceDataChunks } from './datachunks.js';



const dataLoader = new DataLoader();
const BUNDLER_ENDPOINT = 'https://bundles.aem.page';
dataLoader.apiEndpoint = BUNDLER_ENDPOINT;
const domain = 'applyonline.hdfcbank.com';
const domainKey = await fetchDomainKey(domain);
// updateURLParams({ domainKey });
dataLoader.domainKey = domainKey;
dataLoader.domain = domain;

// URL Parameter Management
function getURLParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    tab: params.get('tab') || undefined,
    url: params.get('url') || undefined,
    source: params.get('source') || undefined,
    startDate: params.get('startDate') || undefined,
    endDate: params.get('endDate') || undefined,
  };
}

function updateURLParams(params) {
  const currentParams = new URLSearchParams(window.location.search);

  // Update or set each parameter
  Object.keys(params).forEach(key => {
    if (params[key]) {
      currentParams.set(key, params[key]);
    } else {
      currentParams.delete(key);
    }
  });

  const newURL = `${window.location.pathname}?${currentParams.toString()}`;
  window.history.pushState({ ...params }, '', newURL);
}


function showLoading() {
  const urlResults = document.getElementById('url-results');
  urlResults.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Loading data...</p>
    </div>
  `;
}

function hideLoading() {
  const urlResults = document.getElementById('url-results');
  const loadingContainer = urlResults.querySelector('.loading-container');
  if (loadingContainer) {
    loadingContainer.remove();
  }
}

const dataChunksConfig = {
  error: errorDataChunks,
  performance: performanceDataChunks,
  engagement: engagementDataChunks,
  resource: resourceDataChunks
}

// Helper: compute unique 'enter' sources using DataChunks facets
function computeEnterSources(chunks) {
  try {
    const dc = new DataChunks();
    dc.load(chunks || []);
    dc.addFacet('enterSource', (bundle) => {
      return bundle.events
        ?.filter((e) => e.checkpoint === 'enter' && e.source)
        .map((e) => canonicalizeSource(e.source));
    }, 'every');
    const values = (dc.facets?.enterSource || []).map((f) => f.value);
    return Array.from(new Set(values)).sort();
  } catch (e) {
    return [];
  }
}

// Single function to read URL params, set state, and render
async function renderFromURLParams() {
  const params = getURLParams();
  const dateRangePicker = document.getElementById('date-range-picker');
  const urlAutocomplete = document.getElementById('url-autocomplete');
  const sourceFilter = document.getElementById('source-filter');

  const {
    startDate = dateRangePicker.getStartDate(),
    endDate = dateRangePicker.getEndDate(),
    url = urlAutocomplete.getValue(),
    source: sourceParam,
    tab = 'error'
  } = params;
  const sources = sourceParam ? sourceParam.split(',').filter(Boolean) : [];
  // Set active tab based on URL params
  const urlResults = document.getElementById('url-results');

  document.querySelectorAll('.dashboard-tabs .tab').forEach(tabElement => {
    tabElement.classList.remove('active');
  });

  const activeTab = document.getElementById(`tab-${tab}`);
  activeTab?.classList.add('active');

  // Only update dates if they're different to avoid circular event triggering
  const currentStartDate = dateRangePicker.getStartDate();
  const currentEndDate = dateRangePicker.getEndDate();
  if (currentStartDate !== startDate || currentEndDate !== endDate) {
    dateRangePicker.setDates(startDate, endDate);
  }

  // Only update URL if it's different
  const currentUrl = urlAutocomplete.getValue();
  if (currentUrl !== url) {
    urlAutocomplete.setValue(url);
  }
  // If URL is specified, filter data and render dashboard
  if (url) {
    try {
      // Ensure data is loaded before rendering
      if (!currentData || !Array.isArray(currentData)) {
        await loadData(startDate, endDate);
      }
      // Start with URL-only filter
      const urlOnlyData = currentData.map((chunk) => ({
        date: chunk.date,
        hour: chunk.hour,
        rumBundles: chunk.rumBundles.filter((bundle) => bundle.url.includes(url))
      })).filter((chunk) => chunk.rumBundles.length > 0);

      // Update source filter options for this URL
      if (sourceFilter) {
        sourceFilter.setSources(computeEnterSources(urlOnlyData));
        const currentSources = (sourceFilter.getValue() || []).join(',');
        const newSources = sources.join(',');
        if (currentSources !== newSources) sourceFilter.setValue(sources);
      }

      // Apply source selection if any (canonicalized)
      const filteredData = (sources.length === 0)
        ? urlOnlyData
        : urlOnlyData.map((chunk) => ({
            date: chunk.date,
            hour: chunk.hour,
            rumBundles: chunk.rumBundles.filter((bundle) =>
              bundle.events?.some((e) => e.checkpoint === 'enter' && e.source && sources.includes(canonicalizeSource(e.source)))
            )
          })).filter((chunk) => chunk.rumBundles.length > 0);

      if (filteredData.length > 0 && !filteredData.every(chunk => chunk.rumBundles.length === 0)) {
        // Render the dashboard based on the tab
        urlResults.innerHTML = '';

        let dataChunksForDashboard;
        let dashboardElement;
        dataChunksForDashboard = dataChunksConfig[tab](filteredData);
        dashboardElement = document.createElement(`${tab}-dashboard`);
        urlResults.appendChild(dashboardElement);
        // Pass filteredData as third arg so performance dashboard can aggregate sources fully
        dashboardElement.setData(dataChunksForDashboard, url, filteredData, sourceAliasMap);
      } else {
        urlResults.innerHTML = '<p>No data found for this URL</p>';
      }
    } catch (error) {
      console.error('Error rendering dashboard:', error);
      urlResults.innerHTML = '<p class="error">Error processing data. Please try again.</p>';
    }
  } else {
    urlResults.innerHTML = '<p>Please select a URL to view dashboard</p>';
  }
}

// Generic handler for updating URL params and re-rendering
function handleParamUpdate(paramUpdates) {
  updateURLParams(paramUpdates);
  renderFromURLParams();
}

let currentData;
let sourceAliasMap = null; // alias -> canonical

async function loadSourceAliasesOnce() {
  if (sourceAliasMap) return sourceAliasMap;
  try {
    const resp = await fetch('/forms/source-aliases.json');
    const json = await resp.json();
    const alias = {};
    Object.entries(json || {}).forEach(([canonical, list]) => {
      const arr = Array.isArray(list) ? list : [];
      arr.concat([canonical]).forEach((s) => alias[normalizeSourceValue(s)] = canonical);
    });
    sourceAliasMap = alias;
  } catch (e) {
    sourceAliasMap = {};
  }
  return sourceAliasMap;
}

function normalizeSourceValue(src) {
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

function canonicalizeSource(src) {
  const norm = normalizeSourceValue(src);
  if (sourceAliasMap && sourceAliasMap[norm]) return sourceAliasMap[norm];
  return norm;
}

async function loadData(startDate, endDate) {
  await loadSourceAliasesOnce();
  currentData = await dataLoader.fetchDateRange(startDate, endDate);
  // Update the URLs autocomplete with new data
  const newDataChunks = new DataChunks();
  newDataChunks.load(currentData);
  newDataChunks.addFacet('url', facets.url);
  const newUrls = newDataChunks.facets.url.map(url => url.value);
  const urlAutocomplete = document.getElementById('url-autocomplete');
  urlAutocomplete.setUrls(newUrls);
  const sourceFilter = document.getElementById('source-filter');
  if (sourceFilter) {
    sourceFilter.setSources(computeEnterSources(currentData));
  }
}


function setupEventListeners() {
  const urlForm = document.getElementById('url-form');
  const urlAutocomplete = document.getElementById('url-autocomplete');
  const dateRangePicker = document.getElementById('date-range-picker');
  const dashboardTabs = document.querySelector('.dashboard-tabs');
  const sourceFilter = document.getElementById('source-filter');

  // Handle tab clicks with event delegation on parent
  dashboardTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab && tab.id) {
      const tabName = tab.id.replace('tab-', '');
      handleParamUpdate({ tab: tabName });
    }
  });

  urlAutocomplete.addEventListener('url-selected', (event) => {
    const url = event.detail.url;
    handleParamUpdate({ url });
  });
  if (sourceFilter) {
    sourceFilter.addEventListener('source-selected', (event) => {
      const selected = event.detail.source || [];
      handleParamUpdate({ source: selected.join(',') });
    });
  }

  // Date range change handler
  dateRangePicker.addEventListener('date-range-changed', async (event) => {
    const { startDate, endDate } = event.detail;

    // Show loading state
    showLoading();

    try {
      // Fetch new data for the date range
      await loadData(startDate, endDate);
      // Update URL parameters and re-render
      handleParamUpdate({ startDate, endDate });
    } catch (error) {
      const urlResults = document.getElementById('url-results');
      urlResults.innerHTML = '<p class="error">Error loading data. Please try again.</p>';
      console.error('Error fetching data:', error);
    }
  });
}

// Handle browser back/forward buttons
window.addEventListener('popstate', () => {
  renderFromURLParams();
});

// Initialize event listeners FIRST
setupEventListeners();
const params = getURLParams();
const dateRangePicker = document.getElementById('date-range-picker');
const today = new Date().toISOString().split('T')[0];
const oneWeekAgo = new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0];
dateRangePicker.setDates(oneWeekAgo, today);
const urlAutocomplete = document.getElementById('url-autocomplete');
const sourceFilter = document.getElementById('source-filter');
const defaults = {
  tab: 'error',
  url: urlAutocomplete.getValue(),
  source: (sourceFilter?.getValue() || []).join(','),
  startDate: dateRangePicker.getStartDate(),
  endDate: dateRangePicker.getEndDate()
}

const merged = {
  ...defaults,
  ...JSON.parse(JSON.stringify(params))
}

const changedParams = Object.fromEntries(
    Object.entries(defaults).filter(
      ([key, value]) => merged[key] !== value
    ).map(([key, value]) => [key, merged[key]])
  )
// Load initial data
if (merged.startDate && merged.endDate) {
  await loadData(merged.startDate, merged.endDate);
}

handleParamUpdate(changedParams);