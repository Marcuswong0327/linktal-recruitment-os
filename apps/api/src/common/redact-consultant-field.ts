import { AuthUser } from '../auth/auth.types';

/**
 * Hides who a Client/Job Order is assigned to from the `consultant` role,
 * server-side — not just a hidden grid column on the frontend (which is
 * trivially bypassed by reading the raw API response). Every other role
 * (admin/manager/finance/researcher/viewer) sees the real value unchanged.
 *
 * Nulls the field rather than omitting the key: the OpenAPI entity declares
 * `consultantId` as always-present (`string | null`, not optional), so
 * nulling preserves that contract while still not exposing the real value.
 */
export function redactConsultantField<T extends { consultantId: string | null }>(
  entity: T,
  user: AuthUser,
): T {
  if (user.roleName !== 'consultant') return entity;
  return { ...entity, consultantId: null };
}
