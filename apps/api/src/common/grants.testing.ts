/**
 * Prisma delegates the assignment guards in `scope.ts` read, as a spread-able
 * mock. Test-only — imported by service specs, never by app code.
 *
 * `consultantCovers` needs three things: the consultant's industry grants,
 * their location grants, and a `location.count` to resolve the record's own
 * nodes against those grants through `ancestorIds`. Every spec that exercises
 * create/update with a `consultantId` has to provide all three, so they live
 * here rather than being re-hand-rolled per file.
 */
export function grantsMock(
  grants: { industryIds?: string[]; locationIds?: string[]; locationCovers?: boolean } = {},
) {
  return {
    consultantIndustry: {
      findMany: jest.fn().mockResolvedValue((grants.industryIds ?? []).map((industryId) => ({ industryId }))),
    },
    consultantLocation: {
      findMany: jest.fn().mockResolvedValue((grants.locationIds ?? []).map((locationId) => ({ locationId }))),
    },
    location: { count: jest.fn().mockResolvedValue(grants.locationCovers ? 1 : 0) },
  };
}
