import { getSecret } from 'astro:env/server';
import { createSiteModeResolver } from './site-mode';
import { createEdgeConfigModeReader } from './edge-config-site-mode';

const readRemote = createEdgeConfigModeReader(getSecret('EDGE_CONFIG'));

const resolver = createSiteModeResolver({
  production: import.meta.env.PROD,
  localOverride: getSecret('SITE_MODE'),
  readRemote,
});

export const getSiteMode = () => resolver();
