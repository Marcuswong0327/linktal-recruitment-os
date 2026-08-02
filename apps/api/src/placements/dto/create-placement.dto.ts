import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PlacementFeeType } from '@prisma/client';

export class CreatePlacementDto {
  @ApiProperty({ description: 'Submission being placed (must be unique — one placement per submission)' })
  @IsString()
  submissionId!: string;

  @ApiPropertyOptional({ description: 'Base salary offered', example: 90000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalary?: number;

  @ApiPropertyOptional({ description: 'Superannuation percentage; defaults to 12 (per Terms of Business)', example: 12, default: 12 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  superPercentage?: number;

  @ApiPropertyOptional({ description: 'Fee type; defaults to PERCENTAGE', enum: PlacementFeeType, default: 'PERCENTAGE' })
  @IsOptional()
  @IsEnum(PlacementFeeType)
  feeType?: PlacementFeeType;

  @ApiPropertyOptional({ description: 'Fee percentage of total package (only used when feeType = PERCENTAGE)', example: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  feePercentage?: number;

  @ApiPropertyOptional({ description: 'Flat fee value (only used when feeType = FLAT — ignored/overwritten by the auto-calc when feeType = PERCENTAGE)', example: 13500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeValue?: number;

  @ApiPropertyOptional({ description: "Candidate's start date = invoice date." })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'End of the guarantee period. Entered manually — guarantee terms live per-TOB and a client can hold several that disagree, so it is not derived from startDate.',
  })
  @IsOptional()
  @IsDateString()
  guaranteeEndDate?: string;

  @ApiPropertyOptional({ description: 'Whether accounts/finance has been notified of this placement', default: false })
  @IsOptional()
  @IsBoolean()
  accountsNotified?: boolean;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
