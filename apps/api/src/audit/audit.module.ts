import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { LabelResolverService } from './label-resolver.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService, LabelResolverService],
  // CandidatesModule/JobOrdersModule reuse getPipelineTimeline for their own
  // (non-admin-gated) pipeline-history endpoints. LabelResolverService is
  // exported too — the natural next consumer is a future GET
  // /audit-logs/:id detail endpoint, reusing collectRefs+resolve+presentRow
  // on a single-element array.
  exports: [AuditService, LabelResolverService],
})
export class AuditModule {}
