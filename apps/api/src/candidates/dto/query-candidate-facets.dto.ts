import { OmitType } from '@nestjs/swagger';
import { QueryCandidatesDto } from './query-candidates.dto';

/**
 * Same filters as the list endpoint, minus pagination/sort (facets return
 * every option, not a page) and `jobRoleTypeIds` itself — a facet count
 * answers "how many if I added this option on top of everything else I've
 * already picked", so the field being faceted on can't also be a filter.
 */
export class QueryCandidateFacetsDto extends OmitType(QueryCandidatesDto, [
  'page',
  'pageSize',
  'sortBy',
  'sortOrder',
  'jobRoleTypeIds',
] as const) {}
