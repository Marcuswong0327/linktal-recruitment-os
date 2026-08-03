import { PartialType } from '@nestjs/swagger';
import { CreateTobDto } from './create-tob.dto';

export class UpdateTobDto extends PartialType(CreateTobDto) {}
