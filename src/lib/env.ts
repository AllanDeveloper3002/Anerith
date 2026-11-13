const MIN_SECRET_LENGTH = 32;

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

/**
 * Production boot check. Secrets are validated at runtime (not build time)
 * because the Docker image is built before deployment environment variables exist.
 */
export function validateProductionEnv(): EnvReport {
  const report: EnvReport = { errors: [], warnings: [] };
  if (process.env.NODE_ENV !== "production") return report;

  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    report.errors.push(
      `SESSION_SECRET must be set to at least ${MIN_SECRET_LENGTH} random characters. Generate one with: openssl rand -hex 48`,
    );
  }

  if (!process.env.APP_URL) {
    report.warnings.push(
      "APP_URL is not set. PesaPal callback and IPN URLs will fall back to the request host.",
    );
  }

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    report.warnings.push(
      "ADMIN_EMAIL/ADMIN_PASSWORD are not set. No administrator will be seeded on first boot.",
    );
  }

  if (!process.env.PESAPAL_CONSUMER_KEY || !process.env.PESAPAL_CONSUMER_SECRET) {
    report.warnings.push(
      "PesaPal credentials are not set. Card and mobile-money checkout stays disabled; manual methods remain available.",
    );
  }

  if (process.env.SEED_DEMO_DATA === "true") {
    report.warnings.push(
      "SEED_DEMO_DATA=true will create a demo trader, demo accounts and a seeded leaderboard on first boot.",
    );
  }

  return report;
}
