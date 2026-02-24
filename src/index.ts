// =============================================================================
// Pricenesia - Root Worker Entry Point
// =============================================================================
// This is a placeholder for the root wrangler.toml configuration.
// The actual Workers are in the packages/ directory.

export default {
  async fetch(request: Request): Promise<Response> {
    return new Response('Pricenesia API - See packages/ingestion-api', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};