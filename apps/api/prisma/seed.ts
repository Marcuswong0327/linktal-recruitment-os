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
  "user",
  "report",
] as const;

// Define all actions
const ACTIONS = ["create", "read", "update", "delete"] as const;

// Define role permissions matrix
const ROLE_PERMISSIONS: Record<string, { resources: string[]; actions: string[] }[]> = {
  admin: [
    // Full access to everything
    { resources: [...RESOURCES], actions: [...ACTIONS] },
  ],
  manager: [
    // Full read access, limited write
    { resources: [...RESOURCES], actions: ["read"] },
    { resources: ["candidate", "client", "stakeholder", "job_order", "job_research", "submission", "placement", "consultant"], actions: ["create", "update"] },
    { resources: ["report"], actions: ["create"] },
  ],
  consultant: [
    // CRUD on core recruitment entities
    { resources: ["candidate", "client", "stakeholder", "job_order", "job_research", "submission", "placement"], actions: [...ACTIONS] },
    { resources: ["consultant", "user", "role", "permission"], actions: ["read"] },
  ],
  finance: [
    // Read access to placements and reports, limited other access
    { resources: ["placement", "client", "job_order"], actions: ["read"] },
    { resources: ["report"], actions: ["create", "read"] },
  ],
  researcher: [
    // Research and upload only
    { resources: ["client", "stakeholder", "job_research", "candidate"], actions: ["create", "read", "update"] },
    { resources: ["job_order", "submission", "placement"], actions: ["read"] },
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
    for (const action of ACTIONS) {
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
