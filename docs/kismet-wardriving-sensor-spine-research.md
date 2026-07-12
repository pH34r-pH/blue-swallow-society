# Kismet Wardriving Sensor Spine Research

**Status:** Research / architecture recommendation

**Date:** 2026-07-11

**Scope:** Blue Swallow Society Wardriver, RaID, Cybermap, Mosaic/Murmurs dream design, backpack Jetson field rig

## Decision candidate

Use **Kismet as the local wardriving sensor spine** for the backpack Jetson field core.

Kismet should not replace Cybermap/PostGIS. It should sit below it as the radio capture and normalization layer:

```text
USB radios / SDR / GPS / remote captures
  -> Kismet datasources
  -> Kismet device model + GPS + eventbus + kismetdb
  -> BSS Kismet adapter
  -> /api/v1/observations/batch
  -> PostGIS observations + cybermap_cells + Mosaic/Murmurs memory summaries
```

That gives the dream-design cyber-augmentation pattern a real nervous system: one daemon for RF intake, one append-only flight recorder, one live event stream, and one adapter boundary into the BSS evidence graph.

## Official sources

- Kismet project home: <https://www.kismetwireless.net/>
- Kismet intro: <https://www.kismetwireless.net/docs/readme/intro/kismet/>
- Kismet datasources: <https://www.kismetwireless.net/docs/readme/datasources/>
- Kismet Linux install notes: <https://www.kismetwireless.net/docs/readme/installing/linux/>
- REST-like API: <https://www.kismetwireless.net/docs/api/rest_like/>
- Datasource API: <https://www.kismetwireless.net/docs/api/datasources/>
- Device API: <https://www.kismetwireless.net/docs/api/devices/>
- Eventbus API: <https://www.kismetwireless.net/docs/api/eventbus/>
- GPS API: <https://www.kismetwireless.net/docs/api/gps/>
- kismetdb logging: <https://www.kismetwireless.net/docs/readme/logging/kismetdb/>
- kismetdb developer format notes: <https://www.kismetwireless.net/docs/dev/kismetdb/>
- WiGLE CSV logging/export: <https://www.kismetwireless.net/docs/readme/logging/wiglecsv/>
- kismetdb device JSON export: <https://www.kismetwireless.net/docs/readme/kismetdb/kismetdb_device_json/>
- kismetdb statistics: <https://www.kismetwireless.net/docs/readme/kismetdb/kismetdb_statistics/>
- kismetdb packet stripping: <https://www.kismetwireless.net/docs/readme/kismetdb/kismetdb_strip_packets/>

## Observed facts

- Kismet describes itself as an open-source sniffer, WIDS, wardriver, and packet-capture tool for Wi-Fi, Bluetooth/BLE, wireless thermometers, airplanes/ADSB, power meters, Zigbee, SDR-backed sensors, and more.
- Kismet runs on Linux, macOS, and Windows via WSL; Linux is the natural target for the Jetson field rig.
- The datasource model is broad enough for Wi-Fi monitor-mode adapters, Bluetooth HCI, Zigbee capture hardware, rtl_433-style sensor reception, rtlamr meters, rtladsb, Radiacode/Radview radiation sources, kismetdb replay, and pcap replay.
- Kismet can run headless or with a web UI; the server exposes a REST-like API and websocket eventbus.
- Every source of packet/device data is a Kismet datasource. Datasource APIs expose source types, running state, driver/configuration info, packet counts, and runtime source controls.
- The device model is Kismet's central tracked-entity record: access points, clients, bridges, sensors, and other observed entities become devices with common fields plus PHY-specific records.
- The API docs warn that full device fetches can be large; integrations should use device views, pagination, and field simplification rather than pulling every field every tick.
- The eventbus websocket is Kismet's push system for async events: device activity, GPS updates, datasource state, alerts, system messages, and more. It is the right live-feed interface for a field dashboard.
- Kismet GPS support includes configured GPS devices, current best location, all GPS locations, web GPS updates, websocket web GPS, and meta-GPS for remote capture instances.
- `kismetdb` is a unified SQLite-backed log containing packets, devices, location, system messages, datasource records, historical trends, and almost everything Kismet tracks.
- `kismetdb` can be time-limited or ephemeral for fixed sensors where a rolling live history is useful but permanent files are not desired.
- kismetdb tools can export device JSON, KML, PCAP/PCAP-NG, statistics JSON, and WiGLE CSV.
- WiGLE CSV is a wardriving exchange/export format, not a full-fidelity product store: Kismet's WiGLE docs state it records simplified Wi-Fi AP and Bluetooth device/location rows, does not contain packet contents, and is empty without GPS.
- Packet contents can be large and privacy-sensitive. Kismet provides `kismetdb_strip_packets` to retain metadata such as MAC/signal/location while deleting stored packet contents before sharing.
- Linux Wi-Fi capture uses monitor mode. Kismet docs call out adapter/driver quality as a first-order issue; Mediatek `mt7612u` devices are noted as well-supported, while some drivers/devices produce spurious packets or limited channel control.
- Linux install docs recommend using current Kismet packages or source builds; old distro packages may still ship the obsolete 2016 generation. Capture tools need elevated privileges; Kismet supports `suidinstall` so capture helpers hold privileges while the main server/UI avoids running entirely as root.

## Project translation

### What Kismet gives BSS

Kismet is the **radio thalamus** for the cyber-augmentation rig:

| Need | Kismet fit | BSS adapter output |
|---|---|---|
| Live RF awareness | eventbus websocket + recent device/device-view APIs | `field_body_state`, current nearby devices, source health |
| Post-walk replay | `.kismet` SQLite flight recorder | normalized `ObservationBatch` with provenance |
| Multi-radio expansion | datasource abstraction | one adapter contract for Wi-Fi, BLE, Zigbee, SDR sensors |
| GPS-bound wardriving | GPS/web GPS/meta-GPS APIs | observation `geom`, `accuracy`, route/session basis |
| Privacy control | ephemeral logs, filters, packet stripping, WiGLE no-packet export | metadata-first product sync, explicit debug captures only |
| External exchange | `kismetdb_to_wiglecsv` | optional operator-mediated WiGLE upload, not source of truth |
| Health/safety | datasource state, alerts, messages | dashboard warnings: `GPS DARK`, `RADIO STALLED`, `LOGGING OFF` |

### Core architecture

```text
Backpack Jetson
  kismet_server
    datasources:
      linuxwifi wlanX monitor-mode adapter(s)
      bluetooth HCI adapter
      optional rtl_433 / rtladsb / zigbee hardware later
      GPSD / Web GPS / meta-GPS from phone or module
    outputs:
      eventbus websocket for live dashboard
      REST device/datasource/GPS APIs for polling and diagnostics
      rotating or session-scoped .kismet log

  bss-kismet-adapter
    live mode:
      subscribes to eventbus topics
      emits current RF summary + source health
    batch mode:
      reads kismetdb or kismetdb_dump_devices --ekjson
      strips packet contents before any off-box sync
      POSTs /api/v1/observations/batch with idempotency key

Cybermap API/PostGIS
  observations payload keeps Kismet-specific fields in JSONB
  normalized columns keep geom/time/source/kind/confidence/caveats
  cybermap_cells materialize sparse map overlays

Mosaic/Murmurs
  Mosaic: direct-observation confidence changes
  Murmurs: perception deltas around claimed infrastructure/events
  Dream cycle: post-walk replay + next-best-observation queue
```

### How this ties into dream-design cyber augmentation

The existing dream-design ladder becomes sharper if Kismet owns the RF spine:

1. **Phase 1 — Portable Jetson field core:** run Kismet headless on the Jetson with one known-good Wi-Fi adapter, GPS source, session-scoped kismetdb logging, and BSS adapter output. This proves power/network/thermal/logging before any moving hardware.
2. **Phase 2 — Binocular pan/tilt:** add pose and antenna-basis metadata. A directional or elevated antenna becomes useful only if each observation can say `location + GPS accuracy + antenna heading + sensor pose + datasource UUID`.
3. **Phase 3 — Multijoint multisensor:** add more datasources without changing the Cybermap contract. Zigbee/SDR/radiation/BLE become new Kismet PHY/source payloads flowing through the same BSS adapter and policy gates.

The important move: **Kismet is not the map and not the memory.** Kismet is the peripheral nervous system. Cybermap remains durable spatial truth; Mosaic/Murmurs decide how observations affect claims, memories, and perceptual deltas.

## Proposed BSS data contracts

### Source catalog entry

```json
{
  "source_class": "owned_device",
  "name": "jetson-cube-kismet",
  "provider": "kismet",
  "provenance": {
    "kismet_server_uuid": "...",
    "datasource_uuid": "...",
    "datasource_type": "linuxwifi",
    "hardware": "mt7612u",
    "capture_mode": "monitor",
    "operator_visible": true
  }
}
```

### Observation payload shape

```json
{
  "kind": "wifi_ap",
  "source_class": "green_owned",
  "observed_at": "2026-07-11T00:00:00Z",
  "geom": { "lat": 47.0, "lon": -122.0, "accuracy_m": 8.5 },
  "confidence": 0.7,
  "retention_class": "full_fidelity",
  "pii_status": "observed",
  "payload": {
    "schema": "bss.kismet.wifi_ap.v1",
    "kismet_device_key": "...",
    "bssid_policy": "passive-observed-retained-under-full_fidelity",
    "ssid_policy": "passive-broadcast-retained-under-full_fidelity",
    "signal_dbm": -62,
    "channel": 6,
    "phy": "IEEE802.11",
    "datasource_uuid": "...",
    "gps_basis": "kismet_best_gps",
    "antenna_heading_deg": null,
    "packet_contents_retained": false
  },
  "provenance": {
    "tool": "kismet",
    "kismetdb_session_id": "...",
    "adapter_version": "bss-kismet-adapter/0.1",
    "source_urls": ["https://www.kismetwireless.net/docs/"]
  }
}
```

## Privacy and safety gates

- Default product sync is **passive-observation first**: source/retention-tagged device summaries, broadcast identifiers, signal, location basis, source health, and caveats. Active/probe packet payloads stay off-box by default.
- Raw packets/PCAP are local-only debug artifacts with explicit operator capture and short retention.
- Strip packet contents before sharing a kismetdb file or before using it as a portable archive outside the controlled device.
- Treat BSS off-box MAC/BSSID handling as a policy choice: local-clear for owned/debug; hash or coarsen for public/demo views where appropriate.
- Keep wardriving passive. No deauth, auth bypass, credential capture workflows, automated probing, or private targeting.
- Expose visible collection state on the rig: Kismet running, GPS lock, recording/logging state, and sync state.
- Require `source_class`, `retention_class`, `gps_basis`, `operator_visible`, and `packet_contents_retained` in every Kismet-derived observation.
- WiGLE upload stays manual/operator-mediated. WiGLE CSV is an export artifact, not the BSS durable source of truth.

## Implementation slice

P0 should be small and proof-driven:

1. Install a current Kismet build/package on the Jetson; avoid obsolete distro packages.
2. Use `suidinstall`/capture-helper privilege separation rather than running the whole server as root where possible.
3. Attach one known-good monitor-mode Wi-Fi adapter and one GPS basis: GPSD module, phone-provided Web GPS, or Kismet meta-GPS tied to remote capture.
4. Run Kismet headless for a no-motion walk; produce one `.kismet` session log.
5. Build `scripts/kismet-local-bridge.py` or equivalent:
   - live path: eventbus websocket -> current RF/source-health JSON;
   - batch path: `kismetdb_dump_devices --ekjson` or direct kismetdb read -> normalized BSS observations.
6. Add a local-only endpoint analogous to the existing WiGLE bridge, but source it from Kismet instead of the Android WiGLE sqlite DB.
7. Post a sanitized batch to `POST /api/v1/observations/batch` once the Cybermap API exists.
8. Generate a dream-cycle post-walk digest: route, datasource uptime, GPS gaps, top signal clusters, discarded/private data, caveats, next-best observation.

## Acceptance criteria

- Jetson runs Kismet headless from battery during a no-motion field walk.
- Kismet reports datasource state, GPS state, and recent devices through REST/eventbus.
- A `.kismet` file is produced, summarized by `kismetdb_statistics`, and convertible to device JSON.
- BSS adapter emits normalized observations with source class, geom/time, datasource UUID, retention policy, and caveats.
- No packet contents are synced off-box by default.
- Cybermap can render Kismet-derived RF cells separately from public/greenfeed layers.
- Dream cycle consumes the walk as evidence plus speculative upgrade seeds without promoting RF observations into uncaveated truth.

## Open questions

1. Which Wi-Fi adapter is the first Jetson-approved monitor-mode radio: `mt7612u` likely, but test on-device.
2. Which GPS basis is lowest-friction for the backpack rig: USB GPSD, phone Web GPS, or Android/Wardriver-supplied route points.
3. Whether BSS should store clear BSSID/SSID locally and hash/coarsen only when syncing off-box or rendering public views.
4. Whether Kismet should run session-scoped logs per walk or a rolling ephemeral log plus explicit export command.
5. Whether the current WiGLE bridge becomes a compatibility adapter or gets deprecated after Kismet proves live.
