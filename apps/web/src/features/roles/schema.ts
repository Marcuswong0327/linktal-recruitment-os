import type { RoleEntity } from '@/lib/api/generated/types';

export type Role = RoleEntity;

// Mirrors apps/api/prisma/seed.ts + the service guards.
export const BUILTIN_ROLES = ['admin', 'manager', 'consultant', 'finance', 'researcher', 'viewer'];
export const IMMUTABLE_ROLES = ['admin'];

export const isBuiltin = (name: string) => BUILTIN_ROLES.includes(name);
export const isImmutable = (name: string) => IMMUTABLE_ROLES.includes(name);
/** Built-ins can't be deleted; only custom roles can (matches roles.service). */
export const isDeletable = (name: string) => !isBuiltin(name);

// Column order for the permission picker.
export const ACTION_ORDER = ['create', 'read', 'update', 'delete'];
