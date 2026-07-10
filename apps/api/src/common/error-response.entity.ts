import { ApiProperty } from '@nestjs/swagger';

/**
 * The single shape returned for every error, produced by AllExceptionsFilter.
 * Also registered as an OpenAPI schema (via extraModels) so the generated
 * frontend client gets a typed error.
 */
export class ErrorResponse {
  @ApiProperty({ example: 404 }) statusCode!: number;
  @ApiProperty({ example: 'NOT_FOUND', description: 'Stable machine-readable code' })
  code!: string;
  @ApiProperty({ example: 'Candidate abc not found' }) message!: string;
  @ApiProperty({
    type: String,
    isArray: true,
    nullable: true,
    description: 'Field-level messages (e.g. validation errors)',
  })
  details!: string[] | null;
  @ApiProperty({ example: '/api/candidates/abc' }) path!: string;
  @ApiProperty({ example: '2026-07-09T10:20:30.000Z' }) timestamp!: string;
}
