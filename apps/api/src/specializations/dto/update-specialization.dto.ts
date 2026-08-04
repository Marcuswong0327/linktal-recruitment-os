import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSpecializationDto } from './create-specialization.dto';

// industryId/parentId are excluded: moving a specialization to another
// industry or parent would need `ancestorIds` recomputed for it and every
// descendant, which today only the backfill script (scripts/backfill-ancestors.ts)
// does. Renaming is safe without that.
export class UpdateSpecializationDto extends PartialType(
  OmitType(CreateSpecializationDto, ['industryId', 'parentId'] as const),
) {}
