# Local list performance

Measured on 2026-11-02 against real PostgreSQL 16 in an isolated database.

- Dataset: 10,000 fictional players, all isExample=true.
- Default API page: 50 records plus total count and owner-session checks.
- Five warm-up requests, then 50 measured requests through Fastify injection.
- p95: **31.3 ms**, below the 500 ms target. This excludes public network latency.
- Three EXPLAIN ANALYZE plans (default list, status-filtered list, normalized name-search list) use index scans; no sequential scan over the player table.
- Machine: linux/x64, 5 logical CPUs exposed, AMD EPYC 9V74 80-Core Processor.
- Full measured plans are generated in ignored .local/performance.json by npm run perf:test.

The first run had a 149.1 ms p95 but failed the query-plan gate due to full-table sorts. Active-record partial indexes resolved that failure. No planner settings were disabled or forced.
