/// <reference types="astro/client" />

import type { SiteMode } from './lib/config/site-mode';

declare global {
  namespace App {
    interface Locals {
      siteMode: SiteMode;
    }
  }
}

export {};
