import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CandidateStatus } from '@prisma/client';

export class CreateCandidateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  role!: string;

  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
