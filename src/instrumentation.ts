/** Next calls register before serving requests; keep Node-only dependencies out of Edge. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installInvestigationGateway } = await import("./lib/backend/investigation-gateway");
    installInvestigationGateway();
  }
}
