import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: {
      target: 'http://localhost:3001/docs/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './src/lib/api/generated',
      schemas: './src/lib/api/generated/types',
      client: 'react-query',
<<<<<<< Updated upstream
      baseUrl: 'http://localhost:3001/api',
=======
      baseUrl: 'http://localhost:3001',
>>>>>>> Stashed changes
      override: {
        query: {
          useQuery: true,
          useMutation: true,
        },
      },
    },
  },
});
