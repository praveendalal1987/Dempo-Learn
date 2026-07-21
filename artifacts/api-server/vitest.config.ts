import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // These are integration tests that exercise a real Postgres database.
    // The default 5s timeout is too tight when the dev/CI database is not
    // co-located with the test runner (e.g. a cloud DB in another region),
    // where each query incurs real network latency. Give generous headroom.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
