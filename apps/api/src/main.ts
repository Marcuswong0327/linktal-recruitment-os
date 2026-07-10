import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { swaggerConfig } from './swagger.config';
import { ErrorResponse } from './common/error-response.entity';
import { addErrorResponses } from './common/openapi-errors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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
