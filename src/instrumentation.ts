export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateProductionEnv } = await import("./lib/env");
    const report = validateProductionEnv();
    for (const warning of report.warnings) {
      console.warn(`[anerith] ${warning}`);
    }
    if (report.errors.length > 0) {
      for (const error of report.errors) {
        console.error(`[anerith] ${error}`);
      }
      throw new Error("Production environment validation failed.");
    }

    const { ensureEngine } = await import("./lib/engine");
    ensureEngine();
  }
}
