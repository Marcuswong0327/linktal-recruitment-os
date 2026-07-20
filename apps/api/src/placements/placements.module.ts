import { Module } from '@nestjs/common';
import { PlacementsController } from './placements.controller';
import { PlacementsService } from './placements.service';

@Module({
  controllers: [PlacementsController],
  providers: [PlacementsService],
})
export class PlacementsModule {}
