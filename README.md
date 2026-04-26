# PSP Price History Card

A Home Assistant custom card for displaying [Ameren Power Smart Pricing](https://www.ameren.com/bill/rates/power-smart-pricing) hourly price history with interactive date navigation.

![PSP Price History Card](https://raw.githubusercontent.com/mwinner86/ha-psp-history-card/main/screenshot.png)

## Features

- Bar chart of hourly PSP prices for any past date
- Color-coded bars: green (<2¢), yellow (2-8¢), orange (8-12¢), red (>12¢)
- Prev/next day navigation buttons
- Click the date to open a calendar picker
- "Updating..." overlay while data loads
- Fully configurable entity IDs

## Prerequisites

This card requires:

1. A REST sensor in `rest.yaml` that fetches hourly prices from Ameren:

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

2. An `input_datetime` helper (date only, no time) — create it in **Settings > Devices & Services > Helpers**:
   - Name: `RTP Graph Date`
   - Type: Date

3. An automation that refreshes the sensor when the date changes:

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

4. [apexcharts-card](https://github.com/RomRider/apexcharts-card) installed via HACS (the PSP card uses the ApexCharts library bundled with it)

## Installation via HACS

1. In HACS, go to **Frontend**
2. Click the three-dot menu > **Custom repositories**
3. Add `https://github.com/mwinner86/ha-psp-history-card` with category **Lovelace**
4. Install **PSP Price History Card**
5. Add a resource entry pointing to the installed file (HACS does this automatically)

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

| Option     | Required | Default              | Description                                        |
|------------|----------|----------------------|----------------------------------------------------|
| `sensor`   | Yes      | —                    | Entity ID of the REST sensor with `hourlyPriceDetails` |
| `datetime` | Yes      | —                    | Entity ID of the `input_datetime` date helper      |
| `title`    | No       | `PSP Price History`  | Card title                                         |
