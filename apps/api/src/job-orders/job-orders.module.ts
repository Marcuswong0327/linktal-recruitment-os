import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { JobOrdersController } from './job-orders.controller';
import { JobOrdersService } from './job-orders.service';

@Module({
  imports: [AuditModule],
  controllers: [JobOrdersController],
  providers: [JobOrdersService],
})
export class JobOrdersModule {}
