/**
 * PSP Price History Card
 * A Home Assistant custom card for displaying Ameren PSP hourly price history.
 *
 * Config options:
 *   sensor:   entity_id of the REST sensor providing hourlyPriceDetails (required)
 *   datetime: entity_id of the input_datetime helper used to select the date (required)
 *   title:    card title (optional, default: "PSP Price History")
 */

function pspColorFor(v) {
  return v >= 12 ? '#dc2626' : v >= 8 ? '#f97316' : v >= 2 ? '#ffc000' : '#16a34a';
}

var PSP_HL = ['1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a','12p',
              '1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p','12a'];

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

function pspTodaySv() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function pspFmtDate(sv) {
  var d = new Date(sv + 'T12:00:00');
  var today = pspTodaySv();
  var yest = new Date(Date.now() - 86400000);
  var yestSv = yest.getFullYear() + '-' +
    String(yest.getMonth() + 1).padStart(2, '0') + '-' +
    String(yest.getDate()).padStart(2, '0');
  if (sv === today) return 'Today';
  if (sv === yestSv) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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

  static getConfigElement() {
    return document.createElement('psp-history-card-editor');
  }

  static getStubConfig() {
    return {
      sensor: 'sensor.rtp_graph_feed',
      datetime: 'input_datetime.rtp_graph_date',
      title: 'PSP Price History',
    };
  }

  setConfig(config) {
    if (!config.sensor) throw new Error('PSP History Card: "sensor" is required');
    if (!config.datetime) throw new Error('PSP History Card: "datetime" is required');
    this._config = Object.assign({ title: 'PSP Price History' }, config);
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

  _vals() {
    var s = this._hass && this._hass.states[this._config.sensor];
    var d = s && s.attributes && s.attributes.hourlyPriceDetails;
    if (!d || !d.length) return [];
    return d.map(function(i) {
      return parseFloat((parseFloat(i.price || 0) * 100).toFixed(2));
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

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:100%;min-height:260px';

    this._chartEl = document.createElement('div');
    this._chartEl.style.cssText = 'width:100%;min-height:260px;transition:opacity 0.2s';

    this._overlayEl = document.createElement('div');
    this._overlayEl.style.cssText = 'display:none;position:absolute;top:0;left:0;width:100%;height:100%;align-items:center;justify-content:center;font-size:13px;color:var(--secondary-text-color);pointer-events:none';
    this._overlayEl.textContent = 'Updating...';

    wrapper.appendChild(this._chartEl);
    wrapper.appendChild(this._overlayEl);

    var legend = document.createElement('div');
    legend.style.cssText = 'font-size:11px;color:var(--secondary-text-color);text-align:center;margin-top:6px';
    legend.textContent = '\uD83D\uDFE9 <2\u00A2 | \uD83D\uDFE8 2-8\u00A2 | \uD83D\uDFE7 8-12\u00A2 | \uD83D\uDFE5 >12\u00A2';

    card.appendChild(titleEl);
    card.appendChild(nav);
    card.appendChild(wrapper);
    card.appendChild(legend);
    this.appendChild(card);

    this._updateDateDisplay(this._currentDateSv());
    await this._buildChart();
  }

  async _buildChart() {
    var Apex;
    try { Apex = await pspWaitApex(20000); }
    catch (e) { console.error('[psp-history-card] ApexCharts not found'); return; }
    if (!this._chartEl) return;
    this._chartReady = false;
    var vals = this._vals();
    var colors = vals.map(pspColorFor);
    var opts = {
      series: [{ name: 'c/kWh', data: vals }],
      chart: { type: 'bar', height: 260, toolbar: { show: false }, background: 'transparent', animations: { enabled: false }, foreColor: 'var(--primary-text-color)' },
      colors: colors.length ? colors : ['#16a34a'],
      plotOptions: { bar: { columnWidth: '85%', borderRadius: 2, distributed: true } },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: { categories: PSP_HL, labels: { style: { fontSize: '10px', colors: Array(24).fill('var(--secondary-text-color)') } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { min: 0, decimalsInFloat: 1, labels: { style: { fontSize: '10px', colors: ['var(--secondary-text-color)'] } } },
      grid: { borderColor: 'rgba(128,128,128,0.15)', padding: { left: 0, right: 8, bottom: 4 } },
      tooltip: { theme: 'dark', y: { formatter: function(v) { return v.toFixed(2) + ' c/kWh'; } } },
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
    var colors = vals.map(pspColorFor);
    try {
      this._chart.updateOptions({ colors: colors.length ? colors : ['#16a34a'], series: [{ data: vals }] }, false, false);
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
