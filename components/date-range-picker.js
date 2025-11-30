/**
 * Date Range Picker Web Component
 * Allows users to select a start and end date with validation
 * Ensures dates are not more than 1 week apart
 */
class DateRangePicker extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.isInitialized = false;
  }

  static get observedAttributes() {
    return ['placeholder', 'start', 'end'];
  }

  connectedCallback() {
    this.render();
    this.initializeLastValidDifference();
    this.setupEventListeners();
    // Mark as initialized after a short delay to prevent initial event emission
    setTimeout(() => {
      this.isInitialized = true;
    }, 100);
  }

  initializeLastValidDifference() {
    const startDate = this.getAttribute('start');
    const endDate = this.getAttribute('end');

    if (startDate && endDate) {
      const diff = this.calculateDaysDifference(startDate, endDate);
      if (diff >= 0 && diff <= 7) {
        this.lastValidDifference = diff;
      }
    }
  }

  calculateDaysDifference(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end - start;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    const startDateInput = this.shadowRoot.getElementById('start-date');
    const endDateInput = this.shadowRoot.getElementById('end-date');
    if (name === 'start' && startDateInput) {
      startDateInput.value = newValue || '';
    } else if (name === 'end' && endDateInput) {
      endDateInput.value = newValue || '';
    }
  }

  render() {
    const placeholder = this.getAttribute('placeholder') || 'Select date range';
    const startDate = this.getAttribute('start') || '';
    const endDate = this.getAttribute('end') || '';
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maxDate = this.format(todayLocal);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
        }

        .date-range-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }

        .date-range-inputs {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .date-input-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 150px;
        }

        label {
          font-size: 0.875rem;
          color: #374151;
          font-weight: 500;
        }

        input[type="date"] {
          padding: 10px 12px;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.875rem;
          font-family: inherit;
          transition: all 0.2s;
          background: white;
          width: 100%;
        }

        input[type="date"]:hover {
          border-color: #d1d5db;
        }

        input[type="date"]:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        input[type="date"].error {
          border-color: #ef4444;
        }

        input[type="date"].error:focus {
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        }

        .error-message {
          color: #ef4444;
          font-size: 0.75rem;
          margin-top: 4px;
          display: none;
        }

        .error-message.visible {
          display: block;
        }

        .date-info {
          font-size: 0.75rem;
          color: #6b7280;
          font-style: italic;
        }

        .presets {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }

        .preset-btn {
          appearance: none;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #111827;
          border-radius: 9999px;
          padding: 6px 12px;
          font-size: 0.8125rem;
          cursor: pointer;
          transition: all 0.15s ease-in-out;
        }

        .preset-btn:hover {
          border-color: #d1d5db;
          background: #f9fafb;
        }

        .preset-btn:active {
          transform: translateY(1px);
        }

        .preset-btn.active {
          background: #2563eb; /* blue-600 */
          border-color: #2563eb;
          color: #ffffff;
        }

        .preset-btn[disabled] {
          opacity: 0.6;
          cursor: default;
        }

        .preset-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .preset-label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #374151;
        }

        .selection-summary {
          font-size: 0.8125rem;
          color: #374151;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          padding: 4px 8px;
          border-radius: 9999px;
          white-space: nowrap;
        }

        .separator {
          color: #9ca3af;
          font-weight: 500;
          padding-top: 20px;
        }

        @media (max-width: 640px) {
          .date-range-inputs {
            flex-direction: column;
            align-items: stretch;
          }

          .separator {
            padding-top: 0;
            text-align: center;
          }
        }
      </style>

      <div class="date-range-container">
        <div class="preset-bar">
          <span class="preset-label">Choose a Date Range (Max 7 Days)</span>
          <span id="selection-summary" class="selection-summary" aria-live="polite"></span>
        </div>
        <div class="presets" aria-label="Quick date ranges">
          <button type="button" class="preset-btn" data-preset="today" title="Select today" aria-pressed="false">Today</button>
          <button type="button" class="preset-btn" data-preset="yesterday" title="Select yesterday" aria-pressed="false">Yesterday</button>
          <button type="button" class="preset-btn" data-preset="last7" title="Last 7 days including today" aria-pressed="false">Last 7 days</button>
          <button type="button" class="preset-btn" data-preset="custom" title="Pick a custom range" aria-pressed="false">Custom</button>
        </div>
        <div class="date-range-inputs">
          <div class="date-input-group">
            <label for="start-date">Start Date</label>
            <input
              type="date"
              id="start-date"
              value="${startDate}"
              max="${maxDate}"
              required
            />
          </div>
          <span class="separator">to</span>
          <div class="date-input-group">
            <label for="end-date">End Date</label>
            <input
              type="date"
              id="end-date"
              value="${endDate}"
              max="${maxDate}"
              required
            />
          </div>
        </div>
        <div class="error-message" id="error-message"></div>
        <div class="date-info">Maximum 7 days between dates</div>
      </div>
    `;
  }

  setupEventListeners() {
    const startDateInput = this.shadowRoot.getElementById('start-date');
    const endDateInput = this.shadowRoot.getElementById('end-date');
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayISO = this.format(todayLocal);
    // Enforce max selectable date as today
    startDateInput.max = todayISO;
    endDateInput.max = todayISO;

    // Handle start date changes with smart adjustment
    startDateInput.addEventListener('change', () => {
      if (!startDateInput.value) return;

      // Clamp to today if future selected
      if (startDateInput.value > todayISO) {
        startDateInput.value = todayISO;
      }

      endDateInput.min = startDateInput.value;

      if (endDateInput.value) {
        const currentDiff = this.calculateDaysDifference(startDateInput.value, endDateInput.value);

        // If range exceeds 7 days or end date is before start date, clamp to max 7 days
        if (currentDiff > 7 || currentDiff < 0) {
          const daysUntilToday = Math.max(0, Math.ceil((new Date(todayISO) - new Date(startDateInput.value)) / (1000 * 60 * 60 * 24)));
          const clamped = Math.min(7, daysUntilToday);
          const newEndDate = this.addDays(startDateInput.value, clamped);
          endDateInput.value = newEndDate;
        }
      } else {
        // If no end date, default to same day as start
        endDateInput.value = startDateInput.value;
      }

      this.validateAndStoreDifference();
      this.updateActivePresetFromInputs();
      this.updateSelectionSummary();
    });

    // Handle end date changes with smart adjustment
    endDateInput.addEventListener('change', () => {
      if (!endDateInput.value) return;

      // Clamp to today if future selected
      if (endDateInput.value > todayISO) {
        endDateInput.value = todayISO;
      }

      startDateInput.max = endDateInput.value;

      if (startDateInput.value) {
        const currentDiff = this.calculateDaysDifference(startDateInput.value, endDateInput.value);

        // If range exceeds 7 days or end date is before start date, clamp to max 7 days
        if (currentDiff > 7 || currentDiff < 0) {
          const newStartDate = this.subtractDays(endDateInput.value, 7);
          startDateInput.value = newStartDate;
        }
      } else {
        // If no start date, default to same day as end
        startDateInput.value = endDateInput.value;
      }

      this.validateAndStoreDifference();
      this.updateActivePresetFromInputs();
      this.updateSelectionSummary();
    });

    // Preset selection
    const presets = this.shadowRoot.querySelector('.presets');
    presets.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-preset]');
      if (!btn) return;
      const presetKey = btn.getAttribute('data-preset');
      // Special handling for 'Custom': do not change dates, just enable free selection
      if (presetKey === 'custom') {
        this.setActivePreset('custom');
        this.clearDynamicBounds();
        const startDateInput = this.shadowRoot.getElementById('start-date');
        startDateInput?.focus();
        this.updateSelectionSummary();
        return;
      }
      const { start, end } = this.getPresetDates(presetKey);
      if (!start || !end) return;
      this.setDates(start, end);
      // Maintain last valid difference and emit change
      this.lastValidDifference = this.calculateDaysDifference(start, end);
      // Relax dynamic bounds so the user can freely choose a new custom range next
      this.clearDynamicBounds();
      this.emitDateRangeChanged(start, end);
      this.setActivePreset(presetKey);
      this.updateSelectionSummary();
    });
  }

  addDays(dateString, days) {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  subtractDays(dateString, days) {
    const date = new Date(dateString);
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  validateAndStoreDifference() {
    const validation = this.validateDates();

    // If valid, store the current difference for future use
    if (validation.valid) {
      const startDateInput = this.shadowRoot.getElementById('start-date');
      const endDateInput = this.shadowRoot.getElementById('end-date');

      if (startDateInput.value && endDateInput.value) {
        this.lastValidDifference = this.calculateDaysDifference(
          startDateInput.value,
          endDateInput.value
        );

        // Emit event when date range changes
        this.emitDateRangeChanged(startDateInput.value, endDateInput.value);
        this.updateActivePresetFromInputs();
      }
    }
  }

  emitDateRangeChanged(startDate, endDate) {
    // Only emit event after component is fully initialized
    if (!this.isInitialized) return;

    const event = new CustomEvent('date-range-changed', {
      detail: {
        startDate,
        endDate
      },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  validateDates() {
    const startDateInput = this.shadowRoot.getElementById('start-date');
    const endDateInput = this.shadowRoot.getElementById('end-date');
    const errorMessage = this.shadowRoot.getElementById('error-message');

    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    // Clear previous errors
    startDateInput.classList.remove('error');
    endDateInput.classList.remove('error');
    errorMessage.classList.remove('visible');
    errorMessage.textContent = '';

    if (!startDate || !endDate) {
      return { valid: false, message: 'Both dates are required' };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check if end date is before start date
    if (end < start) {
      startDateInput.classList.add('error');
      endDateInput.classList.add('error');
      errorMessage.textContent = 'End date must be after start date';
      errorMessage.classList.add('visible');
      return { valid: false, message: 'End date must be after start date' };
    }

    // Check if dates are more than 7 days apart
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 7) {
      startDateInput.classList.add('error');
      endDateInput.classList.add('error');
      errorMessage.textContent = `Date range too large: ${diffDays} days. Maximum allowed is 7 days.`;
      errorMessage.classList.add('visible');
      return { valid: false, message: `Date range cannot exceed 7 days (selected: ${diffDays} days)` };
    }

    return { valid: true, message: '' };
  }

  getValue() {
    const validation = this.validateDates();

    if (!validation.valid) {
      return null;
    }

    const startDateInput = this.shadowRoot.getElementById('start-date');
    const endDateInput = this.shadowRoot.getElementById('end-date');

    return {
      startDate: startDateInput.value,
      endDate: endDateInput.value,
      valid: true
    };
  }

  setDates(startDate, endDate) {
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayISO = this.format(todayLocal);
    const safeStart = startDate && startDate > todayISO ? todayISO : startDate;
    const safeEnd = endDate && endDate > todayISO ? todayISO : endDate;
    this.setAttribute('start', safeStart);
    this.setAttribute('end', safeEnd);
    this.validateDates();
    this.updateActivePresetFromInputs();
    this.updateSelectionSummary();
  }

  getStartDate() {
    const startDateInput = this.shadowRoot.getElementById('start-date');
    return startDateInput?.value || '';
  }

  getEndDate() {
    const endDateInput = this.shadowRoot.getElementById('end-date');
    return endDateInput?.value || '';
  }

  isValid() {
    const validation = this.validateDates();
    return validation.valid;
  }

  // Helpers for presets
  format(date) {
    return date.toISOString().split('T')[0];
  }

  clearDynamicBounds() {
    const startDateInput = this.shadowRoot.getElementById('start-date');
    const endDateInput = this.shadowRoot.getElementById('end-date');
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayISO = this.format(todayLocal);
    // Allow picking either side first; invalid combos will be corrected by validation
    startDateInput.min = '';
    startDateInput.max = todayISO;
    endDateInput.min = '';
    endDateInput.max = todayISO;
  }

  getPresetDates(preset) {
    const now = new Date();
    // Ensure we operate on local midnight boundaries
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'today') {
      const d = this.format(today);
      return { start: d, end: d };
    }
    if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const d = this.format(y);
      return { start: d, end: d };
    }
    if (preset === 'last7') {
      const end = this.format(today);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 6); // inclusive range of 7 days
      const start = this.format(startDate);
      return { start, end };
    }
    return { start: null, end: null };
  }

  setActivePreset(preset) {
    const buttons = this.shadowRoot.querySelectorAll('.preset-btn');
    buttons.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    const match = this.shadowRoot.querySelector(`.preset-btn[data-preset="${preset}"]`);
    if (match) {
      match.classList.add('active');
      match.setAttribute('aria-pressed', 'true');
    }
  }

  updateActivePresetFromInputs() {
    const start = this.getStartDate();
    const end = this.getEndDate();
    if (!start || !end) return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = this.format(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = this.format(yesterday);
    const last7Start = new Date(today);
    last7Start.setDate(last7Start.getDate() - 6);
    const last7StartStr = this.format(last7Start);

    if (start === todayStr && end === todayStr) {
      this.setActivePreset('today');
    } else if (start === yesterdayStr && end === yesterdayStr) {
      this.setActivePreset('yesterday');
    } else if (start === last7StartStr && end === todayStr) {
      this.setActivePreset('last7');
    } else {
      this.setActivePreset('custom');
    }
  }

  // UX helpers
  formatHuman(dateString) {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateString;
    }
  }

  updateSelectionSummary() {
    const el = this.shadowRoot.getElementById('selection-summary');
    if (!el) return;
    const start = this.getStartDate();
    const end = this.getEndDate();
    if (!start || !end) {
      el.textContent = '';
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    const dayMs = 1000 * 60 * 60 * 24;
    const diffDaysInclusive = Math.floor((endDate - startDate) / dayMs) + 1;
    const daysText = diffDaysInclusive === 1 ? '1 day' : `${diffDaysInclusive} days`;
    el.textContent = `Selected: ${this.formatHuman(start)} → ${this.formatHuman(end)} (${daysText})`;
  }
}

// Define the custom element
customElements.define('date-range-picker', DateRangePicker);

export default DateRangePicker;

