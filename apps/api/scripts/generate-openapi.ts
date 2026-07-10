import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { swaggerConfig } from '../src/swagger.config';
import { ErrorResponse } from '../src/common/error-response.entity';
import { addErrorResponses } from '../src/common/openapi-errors';

/**
 * Emits the OpenAPI spec to apps/api/openapi.json without starting an HTTP
 * server or connecting to the database.
 *
 * `preview: true` builds the module graph for metadata introspection only —
 * providers are not instantiated, so no lifecycle hooks (e.g. Prisma
 * $connect) run. This lets the spec be generated offline / in CI.
 */
async function generate() {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });

  const document = addErrorResponses(
    SwaggerModule.createDocument(app, swaggerConfig, {
      extraModels: [ErrorResponse],
    }),
  );
  const outPath = join(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
  console.log(`OpenAPI spec written to ${outPath}`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
