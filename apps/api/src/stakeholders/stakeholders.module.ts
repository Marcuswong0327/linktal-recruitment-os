import { Module } from '@nestjs/common';
import { StakeholdersController } from './stakeholders.controller';
import { StakeholdersService } from './stakeholders.service';
import { StakeholdersImportService } from './stakeholders-import.service';

@Module({
  controllers: [StakeholdersController],
  providers: [StakeholdersService, StakeholdersImportService],
})
export class StakeholdersModule {}
