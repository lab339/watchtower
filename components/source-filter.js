/**
 * Source Filter Web Component (Multi-select with search)
 * Filters bundles by 'enter' checkpoint source(s)
 */
class SourceFilter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.sources = [];
    this.filteredSources = [];
    this.selected = [];
    this.isOpen = false;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  render() {
    const label = this.getAttribute('label') || 'Source (enter)';
    const selected = this.selected || [];
    const displaySelected = selected.length ? selected : [];
    const filtered = this.filteredSources.length ? this.filteredSources : this.sources;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; }
        .source-container { display: flex; flex-direction: column; gap: 6px; }
        label { font-size: 0.875rem; color: #374151; font-weight: 500; }
        .control { position: relative; }
        .input {
          width: 100%; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 6px;
          font-size: 0.875rem; background: #fff;
        }
        .input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.1); }
        .dropdown {
          position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
          max-height: 260px; overflow: auto; background: #fff; border: 1px solid #e5e7eb;
          border-top: none; border-radius: 0 0 6px 6px; box-shadow: 0 4px 10px rgba(0,0,0,.07);
          display: ${this.isOpen ? 'block' : 'none'};
        }
        .option { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; }
        .option:hover { background: #f9fafb; }
        .chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .chip {
          display: inline-flex; align-items: center; gap: 6px; background: #eef2ff; color: #1e40af;
          border: 1px solid #c7d2fe; padding: 2px 8px; border-radius: 9999px; font-size: 12px;
        }
        .chip button {
          background: transparent; border: none; color: inherit; cursor: pointer; padding: 0; font-size: 12px;
        }
        .actions { display: flex; gap: 8px; }
        .btn {
          appearance: none; border: 1px solid #e5e7eb; background: #fff; color: #111827;
          border-radius: 6px; padding: 6px 10px; font-size: 12px; cursor: pointer;
        }
        .btn:hover { background: #f9fafb; }
      </style>
      <div class="source-container">
        <label>${label}</label>
        <div class="chips" id="chips">
          ${displaySelected.map((s) => `
            <span class="chip" data-chip="${this.escapeHtml(s)}">
              ${this.escapeHtml(s)} <button type="button" data-remove="${this.escapeHtml(s)}">✕</button>
            </span>`).join('')}
        </div>
        <div class="control">
          <input class="input" id="search" type="text" placeholder="${selected.length ? 'Filter sources' : 'Select sources'}">
          <div class="dropdown" id="dropdown" role="listbox">
            <div class="option">
              <input type="checkbox" id="all-toggle" ${selected.length === 0 ? 'checked' : ''}/>
              <label for="all-toggle"><em>All sources</em></label>
            </div>
            ${filtered.map((s,i) => `
              <div class="option" data-source="${this.escapeHtml(s)}">
                <input type="checkbox" ${selected.includes(s) ? 'checked' : ''}/>
                <span>${this.escapeHtml(s)}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn" id="clear">Clear</button>
          <span style="font-size:12px;color:#6b7280;">${selected.length ? `${selected.length} selected` : 'No filter applied'}</span>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    const search = this.shadowRoot.getElementById('search');
    const dropdown = this.shadowRoot.getElementById('dropdown');
    const chips = this.shadowRoot.getElementById('chips');
    const clearBtn = this.shadowRoot.getElementById('clear');

    search.addEventListener('focus', () => {
      // Open dropdown without re-rendering to avoid focus→render→focus loops
      this.isOpen = true;
      const dd = this.shadowRoot.getElementById('dropdown');
      if (dd) dd.style.display = 'block';
      this.attachOutsideListener();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.isOpen = false;
        const dd = this.shadowRoot.getElementById('dropdown');
        if (dd) dd.style.display = 'none';
        this.detachOutsideListener();
        search.blur();
      }
    });
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      this.filteredSources = q ? this.sources.filter(s => s.toLowerCase().includes(q)) : [];
      this.render(); this.setupEventListeners();
      const s2 = this.shadowRoot.getElementById('search'); s2.value = search.value;
      s2.focus();
    });

    dropdown.addEventListener('click', (e) => {
      const allToggle = e.target.id === 'all-toggle' ? e.target : null;
      if (allToggle) {
        if (allToggle.checked) {
          this.selected = [];
        }
        this.emitChange();
        this.render(); this.setupEventListeners();
        return;
      }
      const row = e.target.closest('.option[data-source]');
      if (row) {
        const src = row.getAttribute('data-source');
        const checked = !this.selected.includes(src);
        if (checked) {
          this.selected.push(src);
        } else {
          this.selected = this.selected.filter(s => s !== src);
        }
        this.emitChange();
        this.render(); this.setupEventListeners();
        this.shadowRoot.getElementById('search').focus();
      }
    });

    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-remove]');
      if (btn) {
        const value = btn.getAttribute('data-remove');
        this.selected = this.selected.filter(s => s !== value);
        this.emitChange();
        this.render(); this.setupEventListeners();
      }
    });

    clearBtn.addEventListener('click', () => {
      this.selected = [];
      this.emitChange();
      this.render(); this.setupEventListeners();
    });
  }

  attachOutsideListener() {
    if (this._outsideHandler) return;
    this._outsideHandler = (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (!path.includes(this)) {
        this.isOpen = false;
        const dd = this.shadowRoot.getElementById('dropdown');
        if (dd) dd.style.display = 'none';
        this.detachOutsideListener();
      }
    };
    document.addEventListener('mousedown', this._outsideHandler, true);
  }

  detachOutsideListener() {
    if (this._outsideHandler) {
      document.removeEventListener('mousedown', this._outsideHandler, true);
      this._outsideHandler = null;
    }
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent('source-selected', {
      detail: { source: this.selected.slice() },
      bubbles: true,
      composed: true
    }));
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public APIs
  setSources(sources) {
    this.sources = Array.from(new Set(sources || [])).sort();
    // keep selected intersect with new sources
    this.selected = (this.selected || []).filter(s => this.sources.includes(s));
    this.filteredSources = [];
    this.render(); this.setupEventListeners();
  }

  getValue() {
    return this.selected.slice();
  }

  setValue(value) {
    const arr = Array.isArray(value)
      ? value
      : (typeof value === 'string' ? value.split(',').map(v => v.trim()).filter(Boolean) : []);
    this.selected = arr.filter((s) => this.sources.length === 0 || this.sources.includes(s));
    this.render(); this.setupEventListeners();
  }
}

customElements.define('source-filter', SourceFilter);
export default SourceFilter;


