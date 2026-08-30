import { createClient } from '@vercel/edge-config';

type EdgeConfigClient = { get: (key: string) => Promise<unknown> };
type ClientFactory = (connectionString: string) => EdgeConfigClient;

export function createEdgeConfigModeReader(
  connectionString: unknown,
  clientFactory: ClientFactory = createClient,
): (() => Promise<unknown>) | undefined {
  if (typeof connectionString !== 'string' || connectionString.trim() === '') return undefined;
  const client = clientFactory(connectionString);
  return () => client.get('siteMode');
}
