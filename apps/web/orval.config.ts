import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    // Read the committed spec produced by `pnpm --filter @linktal/api openapi:gen`
    // so generation works offline / in CI without a running API server.
    input: {
      target: '../api/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './src/lib/api/generated',
      schemas: './src/lib/api/generated/types',
      client: 'react-query',
      httpClient: 'fetch',
      // Wipe the output dir before each run so renamed/removed types don't leave
      // orphaned files behind.
      clean: true,
      override: {
        // Route all generated requests through our single fetcher (base URL +
        // auth cookies). Generated URLs stay relative — no baseUrl here.
        mutator: {
          path: './src/lib/api/fetcher.ts',
          name: 'customFetch',
        },
        // Let orval pick the right hook per verb: GET -> useQuery,
        // POST/PATCH/DELETE -> useMutation.
      },
    },
  },
});
