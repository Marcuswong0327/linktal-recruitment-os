import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { checkDisplayIdSequences } from './display-id-sequences';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();

    // A lagging sequence means the next app-created row on that table 500s
    // with a bare "record already exists" — this turns that into a named
    // warning at boot instead. Fix: `pnpm --filter @linktal/api resync:display-ids`.
    const lagging = await checkDisplayIdSequences(this).catch((error) => {
      this.logger.warn(`displayId sequence check failed to run: ${error instanceof Error ? error.message : error}`);
      return [];
    });
    if (lagging.length > 0) {
      this.logger.warn(
        `displayId sequence(s) lagging behind their table max — the next insert on ${lagging.length === 1 ? 'this table' : 'these tables'} will collide: ` +
          lagging.map((l) => `${l.table} (next=${l.seqNext}, max=${l.maxNum})`).join(', ') +
          `. Run "pnpm --filter @linktal/api resync:display-ids" to fix.`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
