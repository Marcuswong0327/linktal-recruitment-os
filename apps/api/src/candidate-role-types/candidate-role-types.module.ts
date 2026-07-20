import { Module } from '@nestjs/common';
import { CandidateRoleTypesController } from './candidate-role-types.controller';
import { CandidateRoleTypesService } from './candidate-role-types.service';

@Module({
  controllers: [CandidateRoleTypesController],
  providers: [CandidateRoleTypesService],
})
export class CandidateRoleTypesModule {}
