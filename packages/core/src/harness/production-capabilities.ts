import * as filmAuthoring from "../agent/film-authoring-tools.js";
import { buildProductionCapabilityRegistry, type ProductionCapabilityEnvironment } from "./production-registry.js";
export { confirmedCapabilityBinding, createSingleToolCapabilityRegistry, type ConfirmedCapabilityBinding, type ProductionCapabilityEnvironment } from "./production-registry.js";

/** Synchronous compatibility entry point. Agent sessions load film authoring only when needed. */
export function createProductionCapabilityRegistry(environment: ProductionCapabilityEnvironment) {
  return buildProductionCapabilityRegistry(environment, filmAuthoring);
}
