# Dormant vision evidence validity — #88

The existing dormant endpoint/file helpers must not turn retained observations into current camera evidence. This repair does not expose controls, enable a camera, or establish world/pose association.

- Live loads replace previous detections and frame metadata, including empty responses and errors. Only explicitly historical imports may merge with historical imports.
- Original detection timestamps take precedence over dataset/frame capture timestamps. Missing/invalid capture time stays unknown; receipt time never becomes capture time.
- Current live evidence has a nonfuture capture time and age strictly below a configurable positive TTL, default 1,000 ms. This conservative display bound is not camera synchronization proof. At expiry, overlays disappear even without another input event.
- Historical imports remain list evidence labeled historical and never become live overlays. Stale/untimed live detections remain in the list with capture time or an unknown-time label, but do not render boxes.
- Geometry must have finite coordinates and positive finite dimensions. Missing/invalid geometry is unavailable, not a synthetic box. Valid geometry is scaled/clipped to viewport bounds without minimum-size or position fallbacks.
