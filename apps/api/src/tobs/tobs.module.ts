import { Module } from '@nestjs/common';
import { TobsController } from './tobs.controller';
import { TobsService } from './tobs.service';

@Module({
  controllers: [TobsController],
  providers: [TobsService],
})
export class TobsModule {}
