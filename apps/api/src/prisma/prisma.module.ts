import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EXTENDED_PRISMA, extendedPrismaProvider } from './extended-prisma.provider';

@Global()
@Module({
  providers: [PrismaService, extendedPrismaProvider],
  exports: [PrismaService, EXTENDED_PRISMA],
})
export class PrismaModule {}
