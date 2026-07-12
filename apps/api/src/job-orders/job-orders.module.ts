import { Module } from '@nestjs/common';
import { JobOrdersController } from './job-orders.controller';
import { JobOrdersService } from './job-orders.service';

@Module({
  controllers: [JobOrdersController],
  providers: [JobOrdersService],
})
export class JobOrdersModule {}
