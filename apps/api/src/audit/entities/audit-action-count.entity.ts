import { ApiProperty } from '@nestjs/swagger';

/**
 * How many entries of one action match the current filters — across every
 * page, not just the loaded one.
 *
 * Served as an aggregate rather than counted client-side because the grid
 * loads a page at a time: a client-side tally could only ever describe the
 * rows currently in memory, and a number that looks like a total but isn't is
 * the failure mode this app's design principles rank as its most expensive.
 */
export class AuditActionCountEntity {
  @ApiProperty({ example: 'UPDATE' }) action!: string;

  @ApiProperty({ example: 142 }) count!: number;
}
