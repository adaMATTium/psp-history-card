# PSP Price History Card

A Home Assistant custom card for displaying [Ameren Power Smart Pricing](https://www.ameren.com/bill/rates/power-smart-pricing) hourly price history with interactive date navigation.

## Features

- Bar chart of hourly PSP prices for any past date
- Color-coded bars: green (<2¢), yellow (2-8¢), orange (8-12¢), red (>12¢)
- Prev/next day navigation buttons
- Click the date to open a calendar picker
- "Updating..." overlay while data loads
- Fully configurable entity IDs

## Dependencies

This card requires [apexcharts-card](https://github.com/RomRider/apexcharts-card) by RomRider to be installed. It does not bundle ApexCharts itself — instead it uses the `window.ApexCharts` instance that `apexcharts-card` loads. Install `apexcharts-card` via HACS before using this card.

## Prerequisites

Beyond `apexcharts-card`, you will need the following set up in Home Assistant:

### 1. REST sensor (`rest.yaml`)

Fetches hourly prices from Ameren for the selected date:

```yaml
- resource: 'https://www.ameren.com/api/ameren/promotion/RtpHourlyPricesbyDate'
  method: POST
  scan_interval: 86400
  payload_template: '{"SelectedDate":"{{ states(''input_datetime.rtp_graph_date'') }}"}'
  headers:
    Content-Type: application/json
  sensor:
    - name: "RTP Graph Feed"
      unique_id: rtp_graph_feed
      value_template: "{{ value_json.selectedDate }}"
      json_attributes:
        - hourlyPriceDetails
```

### 2. Input datetime helper

Create a date-only (no time) helper in **Settings > Devices & Services > Helpers**:
- Name: `RTP Graph Date`
- Type: Date and/or time — select **Date** only

### 3. Automation

Refreshes the sensor whenever the selected date changes:

```yaml
alias: Update RTP Graph Feed
triggers:
  - entity_id: input_datetime.rtp_graph_date
    trigger: state
conditions:
  - condition: template
    value_template: >
      {{ states('input_datetime.rtp_graph_date') <= now().strftime('%Y-%m-%d') }}
actions:
  - target:
      entity_id: sensor.rtp_graph_feed
    action: homeassistant.update_entity
mode: single
```

## Installation via HACS

1. In HACS, go to **Frontend**
2. Click the three-dot menu > **Custom repositories**
3. Add `https://github.com/adaMATTium/psp-history-card/` with type **Dashboard**
4. Install **PSP Price History Card**
5. HACS will register the resource automatically

## Manual Installation

1. Copy `psp-history-card.js` to `/config/www/psp-history-card.js`
2. Add a resource in **Settings > Dashboards > Resources**:
   - URL: `/local/psp-history-card.js`
   - Type: JavaScript module

## Configuration

```yaml
type: custom:psp-history-card
sensor: sensor.rtp_graph_feed
datetime: input_datetime.rtp_graph_date
title: PSP Price History   # optional
```

| Option     | Required | Default             | Description                                              |
|------------|----------|---------------------|----------------------------------------------------------|
| `sensor`   | Yes      | —                   | Entity ID of the REST sensor with `hourlyPriceDetails`   |
| `datetime` | Yes      | —                   | Entity ID of the `input_datetime` date helper            |
| `title`    | No       | `PSP Price History` | Card title                                               |

## Notes

- Historical data availability depends on your REST sensor's `scan_interval` and HA recorder retention. The card only shows data for dates that have been fetched by the sensor — it does not fetch historical data itself.
- Dates in the future are blocked by the date picker and navigation buttons.
- The card is designed for Ameren Illinois PSP customers but could be adapted for any hourly pricing sensor that exposes an `hourlyPriceDetails` attribute array with `price` values in $/kWh.

## License

MIT