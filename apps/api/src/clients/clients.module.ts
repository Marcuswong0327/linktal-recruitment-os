import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientsImportService } from './clients-import.service';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, ClientsImportService],
})
export class ClientsModule {}
