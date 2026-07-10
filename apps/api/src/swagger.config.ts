import { DocumentBuilder } from '@nestjs/swagger';

// Shared Swagger/OpenAPI definition used both by the running server (main.ts)
// and the offline spec generator (scripts/generate-openapi.ts) so the two never
// drift.
export const swaggerConfig = new DocumentBuilder()
  .setTitle('Linktal Recruitment API')
  .setDescription('API for Linktal Recruitment OS')
  .setVersion('1.0')
  .addBearerAuth()
  .build();
