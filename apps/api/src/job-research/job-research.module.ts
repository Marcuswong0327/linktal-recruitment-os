import { Module } from '@nestjs/common';
import { JobResearchController } from './job-research.controller';
import { JobResearchService } from './job-research.service';

@Module({
  controllers: [JobResearchController],
  providers: [JobResearchService],
})
export class JobResearchModule {}
