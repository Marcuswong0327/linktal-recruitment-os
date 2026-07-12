import { PartialType } from '@nestjs/swagger';
import { CreateConsultantDto } from './create-consultant.dto';

export class UpdateConsultantDto extends PartialType(CreateConsultantDto) {}
