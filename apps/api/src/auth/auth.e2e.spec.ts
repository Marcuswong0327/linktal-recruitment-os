import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Boots the real app (global guards + exception filter) to prove the auth
 * wiring end-to-end without a database: public routes pass, protected routes
 * reject unauthenticated requests before any DB/token work happens.
 */
describe('Auth wiring (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health is public → 200', () =>
    request(app.getHttpServer()).get('/api/health').expect(200));

  it('GET /api/candidates without a token → 401', () =>
    request(app.getHttpServer())
      .get('/api/candidates')
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('UNAUTHORIZED');
      }));
});
