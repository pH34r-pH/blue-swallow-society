# Private mobile Fleet map

## Purpose

The owner opens `/operator/fleet` to see resources, repository relationships,
and recently changed work in one graphical view. The existing Society shell,
owner identity, Functions runtime, and private storage remain the integration
boundary. This feature creates no Azure resource or deployment authority.

## Observable behavior

- At phone width the first useful view is a graph. Hardware, Azure resources,
  and repositories have distinct symbols, readable names, and health or issue
  activity markers. Ingest, build, and deploy edges have a visible legend.
- Selecting a repository focuses its neighborhood and expands its most recently
  updated issues as selectable nodes. Open and completed work appear together;
  a closure with `not_planned` is never described as completed.
- Selecting a resource or issue opens a secondary detail sheet without sending
  the owner to another text page. The map remains available behind the sheet.
- Recent-work windows use issue update times. Connection filters and bounded
  pages reduce clutter without silently implying that hidden records are absent.
- Health is unknown without an observation, and stale after its declared
  freshness deadline. Fetching an old snapshot does not renew observation time.
- Keyboard controls and an optional text view expose the same entities and
  connections. Touch targets remain usable at a 390-pixel viewport. Motion
  respects the user's reduced-motion preference.

## Private data contract

`GET /api/operator-fleet` requires the existing Entra owner-read boundary before
reading configuration or storage. Legacy passcodes, platform principal headers,
and device update/sync credentials do not grant access. The response is private
and no-store. The route reads one configured private JSON Blob through the
existing managed identity; it does not accept a request-supplied source URL.

The `bss.fleet.v1` snapshot contains bounded `sources`, `nodes`, `edges`, and
`issues` collections and a producer `generatedAt` timestamp. Health includes
producer `observedAt` and `freshUntil`. Unknown observations may be null.
Node IDs are unique; all relationship endpoints and issue repository IDs must
resolve. Only minimized, validated fields reach the browser.

No real private inventory, issue title, endpoint, or credential is checked into
this public repository. Synthetic examples exist only in tests and an explicitly
labeled review preview. The runtime has no demo-data fallback.

## Failure and acceptance

Missing configuration, denied storage, timeouts, malformed or oversized data
return a redacted unavailable response. The UI distinguishes authentication
failure, unavailable data, empty data, and stale evidence. It aborts work on
deactivation and clears private state on destruction. Refreshing this view never
dispatches a workflow, starts a host, deploys, or changes an issue.

Source acceptance is the focused API, state, routing, and asset tests plus a
390-pixel graphical interaction check. Hosted acceptance additionally requires
Society's qualified runtime, real owner/wrong-owner probes, a private producer
snapshot, storage-read authorization, and exact-source deployment evidence.
Local acceptance does not establish those live conditions.
