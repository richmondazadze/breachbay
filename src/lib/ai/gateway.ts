import 'server-only';
import type { StartInvestigationCommand, BackendSession } from '../contracts';
import type { InvestigationPorts } from './investigation';
/** Backend-owned factory must authenticate request and enforce INVESTIGATE before returning ports. */
export type InvestigationGatewayFactory = (request: Request, command: StartInvestigationCommand) => Promise<{ session: BackendSession; ports: InvestigationPorts }>;
let factory: InvestigationGatewayFactory | undefined;
export function configureInvestigationGateway(value: InvestigationGatewayFactory) { factory = value; }
export function getInvestigationGateway() { return factory; }
