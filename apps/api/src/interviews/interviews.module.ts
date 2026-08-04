import { Module } from '@nestjs/common';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  controllers: [InterviewsController],
  providers: [InterviewsService],
})
export class InterviewsModule {}
