/**
 * PSP Price History Card
 * A Home Assistant custom card for displaying Ameren PSP hourly price history.
 *
 * Config options:
 *   sensor:   entity_id of the REST sensor providing hourlyPriceDetails (default: sensor.rtp_graph_feed)
 *   datetime: entity_id of the input_datetime helper used to select the date (default: input_datetime.rtp_graph_date)
 *   title:    card title (default: "PSP Price History")
 */

var PSP_LEGEND_TEXT = '🟩 <2¢ | 🟨 2-8¢ | 🟧 8–12¢ | 🟥 >12¢';

// Color ranges mirror the apexcharts-card `color_threshold` config used on the
// "Today" card so bars are colored by value, not by index.
var PSP_COLOR_RANGES = [
  { from: 0,    to: 1.999,  color: '#16a34a' },
  { from: 2,    to: 7.999,  color: '#ffc000' },
  { from: 8,    to: 11.999, color: '#f97316' },
  { from: 12,   to: 1000,   color: '#dc2626' },
];

function pspWaitApex(ms) {
  return new Promise(function(res, rej) {
    var d = Date.now() + ms;
    (function c() {
      if (window.ApexCharts) { res(window.ApexCharts); return; }
      if (Date.now() > d) { rej(new Error('ApexCharts timeout')); return; }
      setTimeout(c, 200);
    })();
  });
}

function pspWaitFrame() {
  return new Promise(function(res) { requestAnimationFrame(res); });
}

function pspTodaySv() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

class PspHistoryCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._chart = null;
    this._chartReady = false;
    this._booted = false;
    this._chartEl = null;
    this._overlayEl = null;
    this._dateInput = null;
    this._nextBtn = null;
    this._config = {};
  }

  static getStubConfig() {
    return {
      sensor: 'sensor.rtp_graph_feed',
      datetime: 'input_datetime.rtp_graph_date',
      title: 'PSP Price History',
    };
  }

  setConfig(config) {
    this._config = Object.assign({
      sensor: 'sensor.rtp_graph_feed',
      datetime: 'input_datetime.rtp_graph_date',
      title: 'PSP Price History',
    }, config || {});
  }

  set hass(h) {
    var prev = this._hass;
    this._hass = h;
    if (!this._booted) { this._booted = true; this._boot(); return; }
    var ps = prev && prev.states[this._config.sensor] && prev.states[this._config.sensor].state;
    var ns = h.states[this._config.sensor] && h.states[this._config.sensor].state;
    if (ns !== ps) { this._onFeedUpdate(); }
  }

  connectedCallback() { this.style.display = 'block'; }

  _currentDateSv() {
    var s = this._hass && this._hass.states[this._config.datetime];
    return (s && s.state) || pspTodaySv();
  }

  _dayBaseMs(sv) {
    // Local-midnight epoch ms for the given YYYY-MM-DD string.
    return new Date(sv + 'T00:00:00').getTime();
  }

  _vals() {
    var s = this._hass && this._hass.states[this._config.sensor];
    var d = s && s.attributes && s.attributes.hourlyPriceDetails;
    if (!d || !d.length) return [];
    var sorted = d.slice().sort(function(a, b) { return parseInt(a.hour) - parseInt(b.hour); });
    var base = this._dayBaseMs(this._currentDateSv());
    return sorted.map(function(i) {
      var hour = parseInt(i.hour);
      var price = parseFloat((parseFloat(i.price || 0) * 100).toFixed(2));
      return [base + hour * 3600000, price];
    });
  }

  async _setDate(sv) {
    if (!this._hass) return;
    if (sv > pspTodaySv()) sv = pspTodaySv();
    this._setLoading(true);
    await this._hass.callService('input_datetime', 'set_datetime', {
      entity_id: this._config.datetime,
      date: sv,
    });
    this._updateDateDisplay(sv);
  }

  _offsetDate(sv, days) {
    var d = new Date(sv + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  _updateDateDisplay(sv) {
    if (this._dateInput) this._dateInput.value = sv;
    if (this._nextBtn) this._nextBtn.style.opacity = sv >= pspTodaySv() ? '0.3' : '1';
  }

  _setLoading(on) {
    if (this._overlayEl) this._overlayEl.style.display = on ? 'flex' : 'none';
    if (this._chartEl) this._chartEl.style.opacity = on ? '0.35' : '1';
  }

  async _boot() {
    this.innerHTML = '';
    var card = document.createElement('ha-card');
    card.style.cssText = 'display:block;padding:12px 16px 10px';

    // Scoped CSS overrides. ApexCharts' option-based styling (strokeDashArray,
    // fill.opacity, theme.mode) is unreliable inside HA — these rules force the
    // visuals to match the apexcharts-card "Today" tile.
    var style = document.createElement('style');
    style.textContent = [
      'psp-history-card .apexcharts-text,',
      'psp-history-card .apexcharts-yaxis text,',
      'psp-history-card .apexcharts-xaxis text { fill: var(--primary-text-color) !important; }',
      'psp-history-card .apexcharts-gridline { stroke-dasharray: 4 !important; }',
      'psp-history-card .apexcharts-bar-area,',
      'psp-history-card .apexcharts-area-series .apexcharts-area,',
      'psp-history-card .apexcharts-series path { fill-opacity: 1 !important; }',
    ].join(' ');
    card.appendChild(style);

    var titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:14px;font-weight:600;color:var(--primary-text-color);margin-bottom:10px';
    titleEl.textContent = this._config.title;

    var nav = document.createElement('div');
    nav.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px';

    var btnStyle = 'background:var(--card-background-color,#1c1c1c);border:1px solid var(--divider-color,rgba(255,255,255,0.15));color:var(--primary-text-color);border-radius:8px;padding:4px 12px;font-size:18px;cursor:pointer;line-height:1;flex-shrink:0';

    var prevBtn = document.createElement('button');
    prevBtn.style.cssText = btnStyle;
    prevBtn.textContent = '<';

    var dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.max = pspTodaySv();
    dateInput.style.cssText = [
      'width:140px',
      'text-align:center',
      'font-size:13px',
      'font-weight:500',
      'font-family:inherit',
      'color:var(--primary-text-color)',
      'background:transparent',
      'border:none',
      'border-bottom:1px dotted var(--secondary-text-color)',
      'outline:none',
      'cursor:pointer',
      'padding:2px 4px',
      'color-scheme:dark',
    ].join(';');
    this._dateInput = dateInput;

    var nextBtn = document.createElement('button');
    nextBtn.style.cssText = btnStyle;
    nextBtn.textContent = '>';
    this._nextBtn = nextBtn;

    var self = this;
    dateInput.addEventListener('change', function() {
      if (dateInput.value) self._setDate(dateInput.value);
    });
    prevBtn.addEventListener('click', function() {
      self._setDate(self._offsetDate(self._currentDateSv(), -1));
    });
    nextBtn.addEventListener('click', function() {
      var next = self._offsetDate(self._currentDateSv(), 1);
      if (next <= pspTodaySv()) self._setDate(next);
    });

    nav.appendChild(prevBtn);
    nav.appendChild(dateInput);
    nav.appendChild(nextBtn);

    // Container matches chart.height (305) — no extra buffer needed because
    // the SVG itself is now tall enough to hold the legend.
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:100%;min-height:305px';

    this._chartEl = document.createElement('div');
    this._chartEl.style.cssText = 'width:100%;min-height:305px;transition:opacity 0.2s';

    this._overlayEl = document.createElement('div');
    this._overlayEl.style.cssText = 'display:none;position:absolute;top:0;left:0;width:100%;height:100%;align-items:center;justify-content:center;font-size:13px;color:var(--primary-text-color);pointer-events:none';
    this._overlayEl.textContent = 'Updating...';

    wrapper.appendChild(this._chartEl);
    wrapper.appendChild(this._overlayEl);

    card.appendChild(titleEl);
    card.appendChild(nav);
    card.appendChild(wrapper);
    this.appendChild(card);

    this._updateDateDisplay(this._currentDateSv());
    await pspWaitFrame();
    await pspWaitFrame();
    await this._buildChart();
  }

  async _buildChart() {
    var Apex;
    try { Apex = await pspWaitApex(20000); }
    catch (e) { console.error('[psp-history-card] ApexCharts not found'); return; }
    if (!this._chartEl) return;
    this._chartReady = false;
    var vals = this._vals();
    var base = this._dayBaseMs(this._currentDateSv());
    var opts = {
      series: [{ name: 'c/kWh', data: vals }],
      chart: {
        // 305px (not 300) so the SVG itself is tall enough to contain the
        // emoji descenders of the legend annotation rendered at y=300.
        // Verified in DevTools that 305 fixes the clipping.
        type: 'bar',
        height: 305,
        toolbar: { show: false },
        background: 'transparent',
        animations: { enabled: false },
      },
      plotOptions: {
        bar: {
          columnWidth: '85%',
          borderRadius: 2,
          colors: { ranges: PSP_COLOR_RANGES },
        },
      },
      // apexcharts-card sets these implicitly; for raw ApexCharts we need them
      // explicit so bars stay opaque (grid behind, not through) and HA theme
      // hover/focus tints don't desaturate them.
      fill: { opacity: 1 },
      states: {
        normal: { filter: { type: 'none' } },
        hover: { filter: { type: 'none' } },
        active: { filter: { type: 'none' } },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: {
        type: 'datetime',
        min: base,
        max: base + 24 * 3600000,
        labels: {
          datetimeUTC: false,
          format: 'htt',
          style: { fontSize: '10px' },
        },
      },
      yaxis: { min: 0, decimalsInFloat: 1 },
      grid: { strokeDashArray: 4, padding: { bottom: 24 } },
      annotations: { texts: [{
        x: '50%',
        y: 300,
        text: PSP_LEGEND_TEXT,
        textAnchor: 'middle',
        style: { fontSize: '11px', color: 'var(--primary-text-color)', background: 'transparent' },
      }]},
      theme: { mode: 'dark' },
    };
    if (this._chart) { this._chart.destroy(); this._chart = null; }
    this._chart = new Apex(this._chartEl, opts);
    await this._chart.render();
    this._chartReady = true;
  }

  _onFeedUpdate() {
    this._setLoading(false);
    this._updateDateDisplay(this._currentDateSv());
    if (!this._chart || !this._chartReady) return;
    var vals = this._vals();
    var base = this._dayBaseMs(this._currentDateSv());
    try {
      // Update both the data and the x-axis window so navigating to a different
      // day re-anchors the 12a→12a span.
      this._chart.updateOptions({
        series: [{ data: vals }],
        xaxis: { min: base, max: base + 24 * 3600000 },
      }, false, false);
    } catch (e) {
      this._chartReady = false;
      this._buildChart();
    }
  }

  getCardSize() { return 5; }
}

customElements.define('psp-history-card', PspHistoryCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(function(c) { return c.type === 'psp-history-card'; })) {
  window.customCards.push({
    type: 'psp-history-card',
    name: 'PSP Price History',
    description: 'Displays Ameren PSP hourly price history with date navigation.',
  });
}
