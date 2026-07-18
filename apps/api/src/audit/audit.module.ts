import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService],
  // CandidatesModule/JobOrdersModule reuse getPipelineTimeline for their own
  // (non-admin-gated) pipeline-history endpoints.
  exports: [AuditService],
})
export class AuditModule {}
