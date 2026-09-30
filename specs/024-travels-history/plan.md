# Plan

New history-query and history-store modules own validation, keyset cursor and explicit projection. Existing PostgresObservationStore delegates via one adapter; server dispatch authenticates before bounded body parsing. Functions route forwards authenticated POST only. Existing observations/session/producer fields are authoritative, not the current nearby list.

A read-only PostgreSQL transaction uses a three-second statement timeout. Page size is at most 200 and each interval at most 31 days; arbitrary historical intervals remain queryable. A cursor binds filters, timestamp/UUID position and an ingestion cutoff, not a long-lived MVCC snapshot. Exact microsecond capture timestamps prevent tie skips. No offsets/count-all queries. Existing indexes are reused; performance claims require representative measurements before deployment.

Isolated Travels state/view and map modules initialize through private shell boot. MapLibre remains optional; reduced-motion/low-power users can use the list without loading it. Query freshness means time since server retrieval, not current radio presence. Parent coordinates shared server/store hooks with entity work.
