import { ApiProperty } from '@nestjs/swagger';

/** One row of GET /candidates/facets/job-role-types — a Role Type option plus how many currently-matching candidates carry it. */
export class JobRoleTypeFacetEntity {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Fitter' }) name!: string;
  @ApiProperty({ example: 793 }) count!: number;
}
