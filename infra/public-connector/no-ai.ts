/** Build-time replacement used only by the isolated anonymous service.
 * Private AI metering/database modules must never enter this artifact. */
export async function requestGatewayJson(): Promise<never> {
  throw new Error("AI generation is disabled in the public connector deployment.");
}
