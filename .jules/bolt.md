## 2026-05-27 - Deferred Vault Search Queries
**Learning:** For Vault trees and Node lists, large datasets combined with complex filtering inside `useMemo` blocks block the main thread.
**Action:** Always wrap user-facing filter inputs with `useDeferredValue` when those inputs drive heavy structural filtering logic inside `useMemo` (e.g., `searchQuery`).
