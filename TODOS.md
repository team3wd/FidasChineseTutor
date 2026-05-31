# TODOS

Items deferred from planning sessions. Pick these up in a future milestone.

---

## Conversation Readiness Screen (deferred from 2026-05-31 CEO plan)

- **Hash-based staleness check for `ch_cluster_cache`**
  The v1 cache invalidation uses `vocab_count` — if the count is the same but the actual words changed (e.g. user deletes one word and adds another), the cache won't refresh. A hash of the hanzi array would catch this edge case.
  Deferred: vocab_count check is sufficient for v1; hash adds complexity not yet warranted for a personal tool.

- **readiness_pct staleness in cached scenarios**
  Cached scenarios embed `readiness_pct` computed at cache-write time. If the user studies more cards after the cache was written but before `vocab_count` changes, the displayed percentages will be slightly stale. Acceptable for v1.
