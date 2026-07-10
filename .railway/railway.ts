import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  // GitHub source with checkSuites enabled to wait for CI to pass
  const repo = github("Icarus-my/linktal-recruitment-os", {
    branch: "main",
    checkSuites: true, // Wait for GitHub Actions to pass before deploying
  });

  const api = service("api", {
    source: repo,
    replicas: 1,
    build: {
      builder: "NIXPACKS",
      buildCommand: "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @linktal/api build",
      watchPatterns: [
        "apps/api/**",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
      ],
    },
    deploy: {
      startCommand: "pnpm --filter @linktal/api start:prod",
      healthcheckPath: "/api/health",
      healthcheckTimeout: 100,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
    env: {
      DATABASE_URL: { preserveExisting: true },
      DIRECT_URL: { preserveExisting: true },
      CORS_ORIGIN: { preserveExisting: true },
    },
  });

  const web = service("web", {
    source: repo,
    replicas: 1,
    build: {
      builder: "NIXPACKS",
      buildCommand: "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @linktal/web build",
      watchPatterns: [
        "apps/web/**",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
      ],
    },
    deploy: {
      startCommand: "pnpm --filter @linktal/web start",
      healthcheckPath: "/",
      healthcheckTimeout: 100,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
    },
    env: {
      NEXT_PUBLIC_API_URL: { preserveExisting: true },
      NEXT_PUBLIC_APP_URL: { preserveExisting: true },
      NEON_AUTH_BASE_URL: { preserveExisting: true },
      NEON_AUTH_COOKIE_SECRET: { preserveExisting: true },
    },
  });

  return project("linktal-recruitment-os", {
    resources: [api, web],
  });
});
