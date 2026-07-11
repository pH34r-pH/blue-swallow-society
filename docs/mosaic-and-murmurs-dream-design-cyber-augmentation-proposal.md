# Mosaic & Murmurs Dream Design: Cyber Augmentation Proposal

## Executive summary

**Dream design** is the speculative engineering lane inside the daily dream cycle. Its first long-horizon target is a portable Mosaic/Murmurs field rig: the Jetson carried in a slim backpack, networked through the Galaxy S23/S23 Ultra hotspot, and eventually connected to an over-shoulder sensory apparatus with binocular cameras, range sensors, directional antennas, and controlled motion.

The design intent is collaboration, not autonomy: Mosaic & Murmurs gain an extension of the operator's senses during wardriving and field observation. The operator remains physically present, aware, and able to kill power/motion at all times.

Related notes:
- `mosaic-and-murmurs-dream-consolidation-proposal.md`
- `mosaic-and-murmurs-s0-sensorium-proposal.md`
- `kismet-wardriving-sensor-spine-research.md`
- vault note: `Blue Swallow Society - Tailscale Mesh VPN Research`
- vault note: `Blue Swallow Society - Cybermap Candidate Source Proposals`
- `cybermap-geospatial-backend.md`
- repo doctrine: `mosaic-and-murmurs-operating-doctrine.md`

## Current observed facts

Observed on the live Jetson host on 2026-07-11:

```text
Host: NVIDIA Jetson Orin Nano Engineering Reference Developer Kit Super
Kernel: Linux 5.15.185-tegra aarch64
nvpmodel current mode: 25W
nvpmodel configured modes: 15W, 25W, MAXN_SUPER
Tools present: tegrastats, nvpmodel, gpioinfo
```

Official/source-backed constraints already captured or checked:

- NVIDIA's Jetson Orin Nano Developer Kit user guide identifies a **40-pin expansion header**, **USB-C port for data only**, **DC power jack 5.5mm x 2.5mm**, **x2 MIPI CSI camera connectors**, and **x4 USB 3.2 Type-A ports**.
- NVIDIA's guide says the 40-pin expansion header provides GPIO and peripheral interfaces for development/prototyping, with electrical limits in the carrier board specification.
- The local `/etc/nvpmodel.conf` exposes 15W and 25W named power modes on this device; current live mode is 25W.
- Existing vault note: `Blue Swallow Society - Tailscale Mesh VPN Research` observed `jetson-cube` on Tailscale and `tylers-s23-ultra` as an Android tailnet node, though the phone was offline at the time of that research pass.
- Samsung's support docs confirm Galaxy phones/tablets can provide a mobile hotspot and include settings to keep it private/reduce battery consumption.

## Target architecture

```text
Galaxy S23/S23 Ultra
  cellular data + mobile hotspot
  optional Tailscale Android app connected
        |
        | Wi-Fi hotspot / tailnet route
        v
Backpack Jetson Orin Nano
  local BSS services
  Mosaic/Murmurs agent runtime
  Cybermap/Wardriver sync endpoint
  local sensor bus supervisor
        |
        +-- USB/CSI binocular cameras
        +-- USB Wi-Fi/BLE/GPS adapters where legal and owned
        +-- microcontroller over USB/I2C/UART for servo/sensor timing
        +-- servo driver board with separate fused power rail
        +-- ultrasonic / ToF / IMU / heading sensors
        +-- passive or receive-focused directional antennas
        v
Shoulder sensor head / arm
  operator-supervised, kill-switch protected, visible collection state
```

## Design doctrine

1. **Backpack first, arm later.** Make compute/network/power reliable before adding moving hardware near the operator's head.
2. **Sensors before actuation.** Fixed mast or simple pan/tilt gives most value with much lower risk than a multi-jointed arm.
3. **Jetson is the brain, not the motor rail.** GPIO/peripheral pins can command controllers; they should not directly power servos or sensor-heavy rails.
4. **Phone is WAN, not command authority.** The Galaxy hotspot supplies connectivity. The rig must still fail safe if hotspot drops.
5. **Physical motion is supervised.** No autonomous pursuit, contact, manipulation, or high-speed motion.
6. **Wardriving remains passive/legal.** Directional antennas and Wi-Fi tooling must avoid unauthorized probing, credential attacks, or unlawful transmission levels.

## Kismet wardriving spine

The Phase 1 RF core should be Kismet, not an ad-hoc scanner. Kismet gives the Jetson field rig a single local daemon for Wi-Fi/BLE/RF datasources, GPS-bound device observations, live REST/eventbus telemetry, and a unified `.kismet` SQLite flight recorder.

Design translation:

- **Kismet owns radio intake.** USB Wi-Fi, BLE, SDR, Zigbee, and later remote-capture sources become Kismet datasources.
- **Cybermap owns durable truth.** A BSS Kismet adapter normalizes live/eventbus or post-walk kismetdb output into `POST /api/v1/observations/batch`.
- **kismetdb is the local black box.** Session logs stay on the Jetson by default; off-box sync is metadata-first and packet contents are stripped unless the operator explicitly captures a debug artifact.
- **WiGLE is export, not source of truth.** Kismet can generate WiGLE CSV when GPS is present, but BSS should ingest Kismet device/GPS/source records directly and treat WiGLE upload as optional operator-mediated sharing.
- **Dream-cycle replay gets teeth.** Each field walk can produce route, datasource uptime, GPS gaps, top signal clusters, privacy actions, and next-best-observation seeds.

## Three-phase focus

Daily dream-design refinements should stay anchored to this sequence:

| Phase | Name | Design target | Proposal focus | Exit gate |
|---|---|---|---|---|
| 1 | Portable Jetson | Backpack field core with Jetson, battery/DC input, S23 hotspot/Tailscale, thermals, logs, and passive/authorized sync. | Power envelope, pack layout, thermal path, health dashboard, local service readiness, no-motion field walk. | Stable battery run, hotspot sync, thermal log, and `field_body_state` heartbeat. |
| 2 | Binocular pan/tilt | Two-axis supervised sensor head with stereo cameras, pose/heading, motor isolation, and visible state. | Camera pair, calibration, microcontroller/servo driver, park/disable flow, soft/hard limits, operator look commands. | Kill switch verified, motion limits tested, pose fused into Cybermap observations. |
| 3 | Multijoint multisensor | Later over-shoulder collaborative apparatus with multiple joints/sensors. | Torque/current limits, collision/cable safety, quick release, sensor fusion, public-use envelope, formal safety case. | Controlled-workspace safety case passes before any field wear. |

Fixed masts, passive booms, and extra sensors are sub-gates inside these phases, not separate roadmap destinations.

## Power and runtime envelope

Rough runtime estimates, assuming 85% usable conversion from battery watt-hours into the rig:

| Battery | Minimum idle field 15.5W | Practical low compute 27W | Active vision + motion 46W |
|---:|---:|---:|---:|
| 74Wh battery | ~4.06h | ~2.33h | ~1.37h |
| 100Wh battery | ~5.48h | ~3.15h | ~1.85h |
| 150Wh battery | ~8.23h | ~4.72h | ~2.77h |

Interpretation:

- A common ~74Wh power bank can support a useful **short field session** if the Jetson stays near 15W and actuation is rare.
- A ~100Wh pack is the practical slim-backpack ceiling for longer demos and travel-friendly design.
- Active multi-servo motion plus vision can cut runtime below two hours even on 100Wh.
- Servo stall currents, camera bursts, USB radios, and thermal throttling matter more than average math. A shunt/power meter and thermal logging are required before wearing the rig.

Power design requirements:

- Use a DC solution compatible with the dev kit's DC input, not USB-C power into the data-only port.
- Prefer a USB-C PD trigger or battery pack plus regulated DC output sized for Jetson peak load.
- Put servos on a separate fused BEC/DC rail with common ground only where electrically appropriate.
- Add an accessible physical kill switch that removes servo power independently of Jetson compute.
- Add brownout handling: if voltage sags, stop motion, park the head, and keep logs alive if possible.

## GPIO and control model

The Jetson's 40-pin header is viable for low-speed control, triggers, I2C/SPI/UART links, and status lines. It is not the right place to directly drive a wearable robot arm.

Recommended split:

| Layer | Hardware role | Rationale |
|---|---|---|
| Jetson GPIO/I2C/UART | high-level commands, mode lines, sensor reads | Keeps Mosaic/Murmurs close to perception and policy. |
| Microcontroller | real-time servo timing, watchdog, limits | Handles deterministic timing and safe fallback if Linux stalls. |
| PWM/servo driver | servo pulse generation | Avoids jitter and pin exhaustion. |
| Separate power rail | motors/servos | Prevents motor noise/brownouts from crashing Jetson. |
| Hardware kill switch | cuts motor rail | Operator authority independent of software. |

## Sensor apparatus options

### Binocular cameras

Viability: **high for fixed or pan/tilt stereo, medium for shoulder arm integration.**

- Jetson carrier has two CSI camera connectors; USB cameras are also viable through the x4 USB 3.2 Type-A ports.
- CSI is cleaner for integrated stereo, but USB is easier for early prototypes.
- Start with visual summaries and operator-visible indicators; no raw-frame retention by default.

### Ultrasonic / time-of-flight sensors

Viability: **high as auxiliary near-field safety sensors, low as primary perception.**

- Useful for collision avoidance and distance-to-obstacle hints.
- Ultrasonic sensors can be noisy outdoors and confused by soft/angled surfaces.
- Treat them as safety/caveat inputs, not truth oracle sensors.

### IMU / compass / pose

Viability: **high and strongly recommended.**

- Needed to know where the sensor head is pointed relative to the operator.
- Feed heading/pose into Cybermap so observations can carry a location and view-basis caveat.

### Directional antennas

Viability: **medium, with legal/RF constraints.**

- Receive-focused directional antennas can improve signal characterization during authorized/passive wardriving.
- Any transmit-capable use must stay within legal EIRP and device-certification limits.
- Avoid automated probing, deauth, credential attacks, or ambiguous grey collection. The rig is a collaborator, not a hunter-killer. Keep it Green/owned/local by policy.

## Mechanical roadmap mapped to the three phases

| Phase | Form | Viability | Purpose | Gate |
|---|---|---|---|---|
| 1 | Backpack compute core, optionally with fixed mast | High | Jetson, battery, hotspot, passive/authorized sensors, thermal logging | stable power + hotspot sync + visible indicator |
| 2 | Binocular pan/tilt sensor head | Medium-high | Supervised two-axis looking with stereo cameras and pose capture | motor kill switch + soft limits + calibration |
| 3 | Multijoint multisensor shoulder apparatus | Medium-low initially | Rich pose, multi-sensor viewpoint, collaborator presence | formal safety case, torque limits, quick release, supervision |

Do not jump to Phase 3 first. The first useful rig is a quiet portable Jetson with stable power, safe mounting, and good logs.

## Safety case for shoulder-mounted motion

A moving arm near the operator's head is the hardest part of the concept. Required controls before field use:

- independent motor power kill switch reachable by either hand
- software e-stop and hardware e-stop
- mechanical quick-release / breakaway mount
- torque/current limits per joint
- soft travel limits and physical hard stops
- startup self-test that parks the arm in a safe pose
- no rapid movement near face/neck/other people
- no motion while running, biking, driving, or crossing streets
- no autonomous tracking of private individuals
- bright visible collection/motion indicator
- rain/sweat/cable strain plan
- logs for command, operator, timestamp, pose, and abort reason

## Cyber presence expansion

Dream design should also research cyber-presence upgrades that do not require physical motion:

- always-on local dashboard for rig health, battery, thermals, hotspot, Tailscale status, and source adapters
- Cybermap layer for `field_body_state`: location, heading, sensor pose, battery, thermal, active modalities
- dream-cycle proposal queue for hardware upgrades and new source adapters
- local voice/notification loop for `TAILNET DARK`, `BATTERY LOW`, `SENSORIUM AWAKE`, `MOTION DISABLED`
- post-walk wardrive replay: route, observations, signal caveats, Mosaic/Murmurs journal

## Technical viability assessment

| Capability | Viability | Main blockers | Recommendation |
|---|---|---|---|
| Jetson in slim backpack | Medium-high | power input, thermals, rugged mounting | Build A0 first with power/thermal telemetry. |
| Galaxy S23 hotspot as WAN | High | battery drain, carrier coverage, hotspot sleep | Use for WAN; do not depend on inbound phone services. |
| Tailscale over phone hotspot | Medium-high | Android/VPN lifecycle, offline phone state | Keep Wardriver/Jetson sync client-initiated and tolerant of drops. |
| GPIO-mediated sensor control | High | electrical limits, pinmux, Linux timing | Use GPIO for control/status; microcontroller for real-time motion. |
| Binocular camera head | Medium-high | calibration, mounting, bandwidth, lighting | Prototype fixed stereo before moving platform. |
| Ultrasonic safety ring | Medium | outdoor noise, false returns | Use as secondary collision/caveat sensor only. |
| Directional antennas | Medium | legal RF limits, mounting, calibration | Receive/passive first; document authorization and source class. |
| Multi-jointed shoulder arm | Medium-low now | safety, torque, ergonomics, power, social acceptability | Treat as A4 after A0-A3 evidence. |

Overall: **the portable Jetson + S23 hotspot + fixed/pan-tilt sensor head is technically viable.** The full multi-jointed over-shoulder arm is plausible but should be treated as a long-horizon robotics program with staged safety gates, not a first prototype.

## Implementation plan

### Phase 1 — Portable Jetson field core

- Select a battery/DC path compatible with Jetson DC input.
- Add power meter logging and `tegrastats` capture.
- Connect Jetson to S23 hotspot and verify BSS health endpoint over local Wi-Fi/Tailscale.
- Package Jetson, battery, and cooling in a backpack insert.
- Run one no-motion field walk and record runtime, thermals, hotspot stability, and sync success.

Optional fixed mast work belongs here only when it improves passive sensing without adding motion: cameras/radios above shoulder, visible collection indicator, and `field_body_state` packets for battery, thermal, GPS basis, heading, and active modalities.

### Phase 2 — Binocular pan/tilt head

- Add microcontroller + servo driver + independent motor rail.
- Implement park/disable/kill-switch flow.
- Add operator-supervised look commands only.
- Fuse camera heading/pose into Cybermap observations.

Passive over-shoulder boom experiments belong here only after the pan/tilt head is safe on a bench: validate ergonomics, cable strain, quick-release, and public-use comfort with motion disabled by default.

### Phase 3 — Multijoint multisensor collaborative apparatus

- Write a formal safety case and test protocol.
- Prototype in a controlled indoor workspace first.
- Add joint torque limits, collision detection, and geofenced/supervised sessions.
- Only then consider field use as an operator-worn collaborator.

## Open research questions

1. Which exact Jetson carrier/power input does the current dev kit require under field load: voltage range, connector, and peak current headroom?
2. What battery form factor stays slim while delivering clean DC and enough peak current for Jetson + sensors?
3. Which camera pair gives the best low-light/latency/weight balance on Jetson?
4. Should servo timing be handled by a small microcontroller, PCA9685-class PWM board, or a robotics controller stack?
5. What is the minimum useful rig: fixed mast, pan/tilt head, or over-shoulder boom?
6. What social/safety envelope makes the shoulder apparatus acceptable in public wardriving walks?
7. Which RF modalities are strictly passive and legally comfortable for the first field build?

## Acceptance criteria

- A0 backpack rig runs from battery, connects through S23 hotspot, and publishes health/field-state packets.
- Runtime, thermal, and network stability are measured, not guessed.
- Servo/motor power is physically separate from Jetson compute and has an independent kill switch.
- No physical motion occurs without a supervised session and visible state.
- Sensor outputs carry source class, retention class, and location/pose caveats.
- Wardriving remains passive/authorized and avoids private targeting workflows.
- Dream-cycle outputs can propose hardware changes, but purchases and actuation remain explicit user-approved gates.
