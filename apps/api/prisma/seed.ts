import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Every resource in the system. Grouped by shape, because the action set a
// resource supports (and who may create in it) is what most of the matrix below
// turns on.
const RESOURCES = [
  // Business entities — full CRUD
  "candidate",
  "client",
  "stakeholder",
  "job_order",
  "job_research",
  "submission",
  "placement",
  "tob",
  // Identity & RBAC
  "consultant",
  "role",
  "permission",
  // Scope-bearing catalogs — full CRUD, but restricted creation (see below)
  "location",
  "industry",
  "specialization",
  // Combobox catalogs — create+read, open to anyone who can edit the parent form
  "job_title",
  "job_role_type",
  "stakeholder_role_type",
  // Consultant scope grants — read+update (full-set-replace PUT per arm)
  "consultant_industry",
  "consultant_specialization",
  "consultant_location",
  // Misc
  "report",
  "audit",
] as const;

// Define all actions
const ACTIONS = ["create", "read", "update", "delete"] as const;

// Resources that only ever support `read` at runtime — there are no mutation
// endpoints for them (the permission catalog is static, defined here in code).
// `audit` is read-only too: the activity log is append-only and admin-viewed.
const READ_ONLY_RESOURCES = new Set<string>(["permission", "audit"]);

// Combobox catalogs: no update/delete endpoints — no admin page to rename or
// retire one; the relevant form's combobox is the only way they get added
// (create), alongside listing them for its dropdown (read). Safe to leave open
// because none of them is read by the scope resolver — unlike location/
// industry/specialization, where a near-duplicate row would silently move
// records outside someone's desk.
const CREATE_READ_ONLY_RESOURCES = new Set<string>([
  "job_title",
  "job_role_type",
  "stakeholder_role_type",
]);

// Assigning scope to a consultant is a full-set-replace PUT per arm (view +
// edit the whole list in one call), not separate create/delete endpoints —
// same reasoning as the create/read-only resources above, different action pair.
const READ_UPDATE_RESOURCES = new Set<string>([
  "consultant_industry",
  "consultant_specialization",
  "consultant_location",
]);

// The activity log is sensitive — keep it admin-only, so it's excluded from the
// "read everything" grants that managers otherwise get.
const ADMIN_ONLY_RESOURCES = new Set<string>(["audit"]);

// The three catalogs the scope resolver walks. Creation is restricted: admin
// only for `location` (GeoNames-loaded, never hand-typed), admin+manager for
// the taxonomy. Everyone else reads them.
const SCOPE_BEARING_CATALOGS = ["location", "industry", "specialization"] as const;

// Business entities every workflow role can at least read.
const BUSINESS_ENTITIES = [
  "candidate",
  "client",
  "stakeholder",
  "job_order",
  "job_research",
  "submission",
  "placement",
  "tob",
] as const;

const COMBOBOX_CATALOGS = [...CREATE_READ_ONLY_RESOURCES];
const SCOPE_GRANTS = [...READ_UPDATE_RESOURCES];

const readableBy = (excludeAdminOnly: boolean): string[] =>
  excludeAdminOnly ? RESOURCES.filter((r) => !ADMIN_ONLY_RESOURCES.has(r)) : [...RESOURCES];
const actionsFor = (resource: string): readonly string[] =>
  READ_ONLY_RESOURCES.has(resource)
    ? ["read"]
    : CREATE_READ_ONLY_RESOURCES.has(resource)
      ? ["create", "read"]
      : READ_UPDATE_RESOURCES.has(resource)
        ? ["read", "update"]
        : ACTIONS;

// Define role permissions matrix
const ROLE_PERMISSIONS: Record<string, { resources: string[]; actions: string[] }[]> = {
  admin: [
    // Full access to everything
    { resources: [...RESOURCES], actions: [...ACTIONS] },
  ],
  manager: [
    // Read everything except the admin-only activity log; full CRUD on business
    // resources (incl. consultant) and the taxonomy. RBAC management
    // (permission), the audit log, and the GeoNames-loaded location tree stay
    // admin-only for mutations.
    { resources: readableBy(true), actions: ["read"] },
    {
      resources: [...BUSINESS_ENTITIES, "consultant", "role", "industry", "specialization", ...COMBOBOX_CATALOGS],
      actions: ["create", "update", "delete"],
    },
    // Assigning scope to a consultant — admin gets this for free via the
    // blanket grant above; managers need it listed explicitly (self/peer
    // escalation rules for who they can target are enforced in code, not here).
    { resources: SCOPE_GRANTS, actions: ["update"] },
    { resources: ["report"], actions: ["create"] },
  ],
  consultant: [
    // CRUD on core recruitment entities only. The role editor stays
    // admin/manager only (no `role`/`permission` read).
    { resources: [...BUSINESS_ENTITIES], actions: [...ACTIONS] },
    // Editing a stakeholder's role type, a candidate's role type, or a job
    // title needs to list and add to the catalog, same as anyone who can update
    // the parent record.
    { resources: COMBOBOX_CATALOGS, actions: ["create", "read"] },
    // Read-only on the scope-bearing catalogs: a consultant picks from
    // location/industry/specialization but must not grow them.
    { resources: [...SCOPE_BEARING_CATALOGS], actions: ["read"] },
    // ...with one deliberate exception. Specialization is the fine-grained
    // rung consultants actually need while tagging a company (775 rows vs 4
    // industries), so they may grow it. Industry and location stay read-only:
    // a brand-new industry is held by nobody, so tagging a client with one
    // hides that client from every consultant at once via the industry arm
    // (see docs/scope-explained.md §3).
    { resources: ["specialization"], actions: ["create"] },
    // Read-only roster + grants: needed to pick teammates by name (and see
    // their industry/location) when assigning multiple consultants to a job
    // order (PUT /job-orders/:id/consultants) — see docs/scope-explained.md.
    // Still no write access to any of this; assigning a consultant's own
    // scope stays admin/manager only.
    { resources: ["consultant", ...SCOPE_GRANTS], actions: ["read"] },
  ],
  finance: [
    // Read access to the commercial side, plus reports.
    { resources: ["placement", "client", "job_order", "tob"], actions: ["read"] },
    { resources: [...SCOPE_BEARING_CATALOGS], actions: ["read"] },
    { resources: ["report"], actions: ["create", "read"] },
  ],
  researcher: [
    // Research and upload only
    { resources: ["client", "stakeholder", "job_research", "candidate"], actions: ["create", "read", "update"] },
    { resources: ["job_order", "submission", "placement"], actions: ["read"] },
    { resources: COMBOBOX_CATALOGS, actions: ["create", "read"] },
    { resources: [...SCOPE_BEARING_CATALOGS], actions: ["read"] },
    // Same roster + grants read access as consultant, and for the same
    // reason — researchers can also be added to a job order's consultant list.
    { resources: ["consultant", ...SCOPE_GRANTS], actions: ["read"] },
  ],
  viewer: [
    // Read-only access
    { resources: [...BUSINESS_ENTITIES], actions: ["read"] },
    { resources: [...SCOPE_BEARING_CATALOGS], actions: ["read"] },
  ],
};

async function main() {
  console.log("🌱 Seeding RBAC...\n");

  // 1. Create all permissions
  console.log("Creating permissions...");
  const permissions: { id: string; resource: string; action: string }[] = [];

  for (const resource of RESOURCES) {
    for (const action of actionsFor(resource)) {
      const permission = await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: {
          resource,
          action,
          description: `${action} ${resource}`,
        },
      });
      permissions.push({ id: permission.id, resource, action });
    }
  }
  console.log(`✓ Created ${permissions.length} permissions\n`);

  // 2. Create roles and assign permissions
  console.log("Creating roles...");
  for (const [roleName, permissionSets] of Object.entries(ROLE_PERMISSIONS)) {
    // Create or update role
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: `${roleName.charAt(0).toUpperCase() + roleName.slice(1)} role`,
      },
    });

    // Clear existing role permissions
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });

    // Assign permissions based on matrix
    for (const permSet of permissionSets) {
      for (const resource of permSet.resources) {
        for (const action of permSet.actions) {
          const permission = permissions.find(
            (p) => p.resource === resource && p.action === action
          );
          if (permission) {
            await prisma.rolePermission.create({
              data: {
                roleId: role.id,
                permissionId: permission.id,
              },
            });
          }
        }
      }
    }

    // Count permissions for this role
    const count = await prisma.rolePermission.count({
      where: { roleId: role.id },
    });
    console.log(`✓ ${roleName}: ${count} permissions`);
  }

  // Prune stale permissions (their role links cascade away): resources no longer
  // in the matrix (e.g. the removed 'user'), non-read actions on read-only
  // resources (e.g. permission:create/update/delete), and create/delete on
  // read-update-only resources (e.g. consultant_industry:create/delete).
  const pruned = await prisma.permission.deleteMany({
    where: {
      OR: [
        { resource: { notIn: [...RESOURCES] } },
        { resource: { in: [...READ_ONLY_RESOURCES] }, action: { not: "read" } },
        { resource: { in: [...READ_UPDATE_RESOURCES] }, action: { notIn: ["read", "update"] } },
        { resource: { in: [...CREATE_READ_ONLY_RESOURCES] }, action: { notIn: ["create", "read"] } },
      ],
    },
  });
  if (pruned.count > 0) {
    console.log(`\n🧹 Pruned ${pruned.count} stale permission(s)`);
  }

  console.log("\n✅ RBAC seeding complete!");

  // Print summary
  const roleCount = await prisma.role.count();
  const permCount = await prisma.permission.count();
  const rpCount = await prisma.rolePermission.count();

  console.log(`\nSummary:`);
  console.log(`  - Roles: ${roleCount}`);
  console.log(`  - Permissions: ${permCount}`);
  console.log(`  - Role-Permission mappings: ${rpCount}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
