import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { CandidatesModule } from './candidates/candidates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CandidatesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
