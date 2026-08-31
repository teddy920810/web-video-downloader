import { CreditService } from './credit-service';
import { PostgresCreditStore } from './postgres-credit-store';

let service: CreditService | undefined;

export function getCreditService() {
  service ??= new CreditService(new PostgresCreditStore());
  return service;
}
