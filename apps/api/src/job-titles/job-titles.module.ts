import { Module } from '@nestjs/common';
import { JobTitlesController } from './job-titles.controller';
import { JobTitlesService } from './job-titles.service';

@Module({
  controllers: [JobTitlesController],
  providers: [JobTitlesService],
})
export class JobTitlesModule {}
