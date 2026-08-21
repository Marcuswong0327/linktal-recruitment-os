import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { CandidatesImportService } from './candidates-import.service';

@Module({
  imports: [AuditModule],
  controllers: [CandidatesController],
  providers: [CandidatesService, CandidatesImportService],
})
export class CandidatesModule {}
