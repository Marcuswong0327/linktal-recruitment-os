import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Define all resources in the system
const RESOURCES = [
  "candidate",
  "client",
  "stakeholder",
  "job_order",
  "job_research",
  "submission",
  "placement",
  "consultant",
  "role",
  "permission",
  "industry",
  "specialization",
  "stakeholder_role_type",
  "candidate_role_type",
  "saved_search",
  "report",
  "audit",
] as const;

// Define all actions
const ACTIONS = ["create", "read", "update", "delete"] as const;

// Resources that only ever support `read` at runtime — there are no mutation
// endpoints for them (the permission catalog is static, defined here in code).
// `audit` is read-only too: the activity log is append-only and admin-viewed.
const READ_ONLY_RESOURCES = new Set<string>(["permission", "audit"]);

// Industry/specialization/stakeholder_role_type/candidate_role_type have no
// update/delete endpoints — no admin page to rename or retire one, the
// relevant form's combobox is the only way they get added (create), alongside
// listing them for its dropdown (read).
const CREATE_READ_ONLY_RESOURCES = new Set<string>([
  "industry",
  "specialization",
  "stakeholder_role_type",
  "candidate_role_type",
]);

// Saved searches are personal (owner-scoped) state with no update endpoint
// (rename isn't supported — delete + re-save covers it).
const CREATE_READ_DELETE_RESOURCES = new Set<string>(["saved_search"]);

// The activity log is sensitive — keep it admin-only, so it's excluded from the
// "read everything" grants that managers otherwise get.
const ADMIN_ONLY_RESOURCES = new Set<string>(["audit"]);
const readableBy = (excludeAdminOnly: boolean): string[] =>
  excludeAdminOnly ? RESOURCES.filter((r) => !ADMIN_ONLY_RESOURCES.has(r)) : [...RESOURCES];
const actionsFor = (resource: string): readonly string[] =>
  READ_ONLY_RESOURCES.has(resource)
    ? ["read"]
    : CREATE_READ_ONLY_RESOURCES.has(resource)
      ? ["create", "read"]
      : CREATE_READ_DELETE_RESOURCES.has(resource)
        ? ["create", "read", "delete"]
        : ACTIONS;

// Define role permissions matrix
const ROLE_PERMISSIONS: Record<string, { resources: string[]; actions: string[] }[]> = {
  admin: [
    // Full access to everything
    { resources: [...RESOURCES], actions: [...ACTIONS] },
  ],
  manager: [
    // Read everything except the admin-only activity log; full CRUD on business
    // resources (incl. consultant). RBAC management (role/permission/user) and
    // the audit log stay admin-only.
    { resources: readableBy(true), actions: ["read"] },
    { resources: ["candidate", "client", "stakeholder", "job_order", "job_research", "submission", "placement", "consultant", "role", "industry", "specialization", "stakeholder_role_type", "candidate_role_type", "saved_search"], actions: ["create", "update", "delete"] },
    { resources: ["report"], actions: ["create"] },
  ],
  consultant: [
    // CRUD on core recruitment entities only. No consultant/role/permission
    // read: the consultant directory and the role editor are admin/manager only.
    { resources: ["candidate", "client", "stakeholder", "job_order", "job_research", "submission", "placement"], actions: [...ACTIONS] },
    // Editing a company's Industry/Specialization combobox, a stakeholder's
    // role type combobox, or a candidate's role type combobox needs to list
    // and add to the catalog, same as anyone who can update a
    // client/stakeholder/candidate.
    { resources: ["industry", "specialization", "stakeholder_role_type", "candidate_role_type"], actions: ["create", "read"] },
    // Saving/loading/deleting their own candidate searches.
    { resources: ["saved_search"], actions: ["create", "read", "delete"] },
  ],
  finance: [
    // Read access to placements and reports, limited other access
    { resources: ["placement", "client", "job_order"], actions: ["read"] },
    { resources: ["report"], actions: ["create", "read"] },
  ],
  researcher: [
    // Research and upload only
    { resources: ["client", "stakeholder", "job_research", "candidate", "industry", "specialization", "stakeholder_role_type", "candidate_role_type"], actions: ["create", "read", "update"] },
    { resources: ["job_order", "submission", "placement"], actions: ["read"] },
    // Researching/uploading candidates includes building and reusing searches.
    { resources: ["saved_search"], actions: ["create", "read", "delete"] },
  ],
  viewer: [
    // Read-only access
    { resources: ["candidate", "client", "stakeholder", "job_order", "job_research", "submission", "placement"], actions: ["read"] },
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
  // in the matrix (e.g. the removed 'user'), and non-read actions on read-only
  // resources (e.g. permission:create/update/delete).
  const pruned = await prisma.permission.deleteMany({
    where: {
      OR: [
        { resource: { notIn: [...RESOURCES] } },
        { resource: { in: [...READ_ONLY_RESOURCES] }, action: { not: "read" } },
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
