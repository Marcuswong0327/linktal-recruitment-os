import { Module } from '@nestjs/common';
import { ConsultantsController } from './consultants.controller';
import { ConsultantsService } from './consultants.service';

@Module({
  controllers: [ConsultantsController],
  providers: [ConsultantsService],
})
export class ConsultantsModule {}
