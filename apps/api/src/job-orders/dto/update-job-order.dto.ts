import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateJobOrderDto } from './create-job-order.dto';

// consultantIds is create-time seeding only — changing who's assigned after
// creation goes through the dedicated PUT /job-orders/:id/consultants
// full-set-replace endpoint (audited per-row), never a PATCH field.
export class UpdateJobOrderDto extends PartialType(OmitType(CreateJobOrderDto, ['consultantIds'] as const)) {}
