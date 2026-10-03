import { defineRailway, project, service, preserve } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "worker";

export default defineRailway(() => {
  const worker = service("worker", {
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile.worker" },
    env: Object.fromEntries([
      "ALLOWED_REPOS", "APP_URL", "DATABASE_URL", "GITHUB_TOKEN", "GROQ_API_KEY",
      "JOB_TIMEOUT_SECONDS", "MAX_ATTEMPTS", "MAX_MODEL_TOKENS", "MAX_STEPS",
      "MODEL_BASE_URL", "MODEL_CONTEXT_TOKENS", "MODEL_NAME", "OWNER_LOGIN", "PORT",
      "RAILWAY_TOKEN", "WORKER_WAKE_TOKEN",
      "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY_B64", "GITHUB_APP_SLUG",
      "SENTRY_DSN", "SENTRY_ENVIRONMENT", "SENTRY_RELEASE", "SENTRY_ENABLED",
      "SENTRY_ERROR_SAMPLE_RATE", "SENTRY_TRACES_SAMPLE_RATE", "SENTRY_LOGS_ENABLED",
      "SENTRY_LOG_SAMPLE_RATE", "SENTRY_MAX_EVENTS_PER_MINUTE",
    ].map(key => [key, preserve()])),
    deploy: {
      healthcheckPath: "/health", healthcheckTimeout: 120,
      sleepApplication: true, numReplicas: 1,
      multiRegionConfig: { "europe-west4-drams3a": { numReplicas: 1 } },
      restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3,
      limitOverride: { containers: { cpu: 1, memoryBytes: 536870912 } },
    },
  });
  return project("patchgoblin", {
    resources: [worker],
  });
});
