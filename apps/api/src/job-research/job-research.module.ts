import { Module } from '@nestjs/common';
import { JobResearchController } from './job-research.controller';
import { JobResearchService } from './job-research.service';
import { JobResearchImportService } from './job-research-import.service';

@Module({
  controllers: [JobResearchController],
  providers: [JobResearchService, JobResearchImportService],
})
export class JobResearchModule {}
