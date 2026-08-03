import { Module } from '@nestjs/common';
import { JobRoleTypesController } from './job-role-types.controller';
import { JobRoleTypesService } from './job-role-types.service';

@Module({
  controllers: [JobRoleTypesController],
  providers: [JobRoleTypesService],
})
export class JobRoleTypesModule {}
