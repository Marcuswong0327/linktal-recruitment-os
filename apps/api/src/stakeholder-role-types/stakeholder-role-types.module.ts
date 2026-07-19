import { Module } from '@nestjs/common';
import { StakeholderRoleTypesController } from './stakeholder-role-types.controller';
import { StakeholderRoleTypesService } from './stakeholder-role-types.service';

@Module({
  controllers: [StakeholderRoleTypesController],
  providers: [StakeholderRoleTypesService],
})
export class StakeholderRoleTypesModule {}
