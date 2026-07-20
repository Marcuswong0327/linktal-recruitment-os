import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { CandidateSavedSearchesService } from './saved-searches/candidate-saved-searches.service';

@Module({
  controllers: [CandidatesController],
  providers: [CandidatesService, CandidateSavedSearchesService],
})
export class CandidatesModule {}
