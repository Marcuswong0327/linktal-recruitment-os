import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { HealthController } from './health/health.controller';
import { CandidatesModule } from './candidates/candidates.module';
import { ClientsModule } from './clients/clients.module';
import { StakeholdersModule } from './stakeholders/stakeholders.module';
import { JobOrdersModule } from './job-orders/job-orders.module';
import { ConsultantsModule } from './consultants/consultants.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { IndustriesModule } from './industries/industries.module';
import { SpecializationsModule } from './specializations/specializations.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CandidatesModule,
    ClientsModule,
    StakeholdersModule,
    JobOrdersModule,
    ConsultantsModule,
    RolesModule,
    PermissionsModule,
    IndustriesModule,
    SpecializationsModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  // Global: every request runs inside a RequestContext scope so writes can be
  // attributed to the acting consultant (see RequestContextMiddleware).
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
