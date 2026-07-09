import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

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

<<<<<<< Updated upstream
  // Swagger / OpenAPI setup
=======
  // Swagger setup
>>>>>>> Stashed changes
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Linktal Recruitment API')
    .setDescription('API for Linktal Recruitment OS')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://0.0.0.0:${port}/api`);
<<<<<<< Updated upstream
  console.log(`Swagger docs: http://0.0.0.0:${port}/docs`);
=======
  console.log(`Swagger docs at http://0.0.0.0:${port}/docs`);
>>>>>>> Stashed changes
}

bootstrap();
