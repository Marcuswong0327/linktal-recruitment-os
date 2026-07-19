import { Module } from '@nestjs/common';
import { IndustriesController } from './industries.controller';
import { IndustriesService } from './industries.service';

@Module({
  controllers: [IndustriesController],
  providers: [IndustriesService],
})
export class IndustriesModule {}
