import { PartialType } from '@nestjs/swagger';
import { CreateJobOrderDto } from './create-job-order.dto';

export class UpdateJobOrderDto extends PartialType(CreateJobOrderDto) {}
