import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { swaggerConfig } from './swagger.config';
import { ErrorResponse } from './common/error-response.entity';
import { addErrorResponses } from './common/openapi-errors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Express/body-parser's default 100kb JSON limit is fine for every other
  // route, but the export-by-ids endpoints (POST /<entity>/export) accept an
  // array of selected row ids — a multi-thousand-row drag-select (plausible
  // on Stakeholders, ~6.4k rows) or Candidates' "select all matching"
  // (capped at 5000) can exceed it. Bumped once, globally, rather than
  // per-route.
  app.useBodyParser('json', { limit: '2mb' });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',') : true,
    credentials: true,
  });

  // Swagger setup
  const document = addErrorResponses(
    SwaggerModule.createDocument(app, swaggerConfig, {
      extraModels: [ErrorResponse],
    }),
  );
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://0.0.0.0:${port}/api`);
  console.log(`Swagger docs at http://0.0.0.0:${port}/docs`);
}

bootstrap();
