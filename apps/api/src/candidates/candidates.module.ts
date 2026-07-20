import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { CandidateSavedSearchesService } from './saved-searches/candidate-saved-searches.service';

@Module({
  imports: [AuditModule],
  controllers: [CandidatesController],
  providers: [CandidatesService, CandidateSavedSearchesService],
})
export class CandidatesModule {}
