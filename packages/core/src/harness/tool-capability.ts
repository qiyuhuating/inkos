import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { ActionResultSchema, ActionArtifactRefSchema, type ActionArtifactRef, type ActionResult, type ActionRisk, type WorkManifest } from "./contracts.js";
import { CapabilityRegistry, defineCapabilityAction, type Capability, type CapabilityExecutionContext } from "./capability-registry.js";
import { loadWorkManifest } from "./work-store.js";
import { syncWorkSourceArtifacts, captureWorkSourceState, changedWorkSourcePaths } from "./source-sync.js";
import { ObservationSchema, type Observation } from "../models/observation.js";
import { readArtifactRevision } from "./artifact-reader.js";

export type ProductionAgentTool = AgentTool<any, any> & { readonly artifactsCommitted?: boolean; readonly managesWorkLock?: boolean };

export interface ProductionToolAction {
  readonly tool: ProductionAgentTool;
  readonly risk: ActionRisk;
  readonly requiresConfirmation?: boolean;
  readonly artifactsCommitted?: boolean;
}

export interface ConfirmedCapabilityBinding {
  readonly capabilityId: string;
  readonly actionId: string;
  readonly profileId: string;
  readonly risk: ActionRisk;
}

export function createSingleToolCapabilityRegistry(input: {
  readonly binding: ConfirmedCapabilityBinding;
  readonly tool: AgentTool<any, any>;
}): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registerToolCapability(
    registry,
    input.binding.capabilityId,
    input.binding.capabilityId,
    [actionTool(input.tool, input.binding.risk, true)],
  );
  return registry;
}

export function registerToolCapability(
  registry: CapabilityRegistry,
  id: string,
  title: string,
  actions: ReadonlyArray<ProductionToolAction>,
): void {
  const capability: Capability = {
    id,
    title,
    description: title,
    actions: actions.map(toolBackedAction),
  };
  registry.register(capability);
}

export function actionTool(
  tool: ProductionAgentTool,
  risk: ActionRisk,
  requiresConfirmation = false,
): ProductionToolAction {
  return { tool, risk, requiresConfirmation, artifactsCommitted: tool.artifactsCommitted };
}

function toolBackedAction(spec: ProductionToolAction) {
  const { tool, risk, requiresConfirmation } = spec;
  return defineCapabilityAction({
    id: tool.name,
    title: tool.label || tool.name,
    description: tool.description || tool.name,
    risk,
    requiresConfirmation,
    managesWorkLock: tool.managesWorkLock,
    parameters: tool.parameters ?? Type.Any(),
    async execute(context: CapabilityExecutionContext, input: unknown): Promise<ActionResult> {
      const before = await loadKnownWork(context.projectRoot, context.work?.id);
      const observeWrites = risk !== "read" && !spec.artifactsCommitted;
      const beforeSources = observeWrites && before ? await captureWorkSourceState(context.projectRoot, before.id) : undefined;
      const existingWorkIds = new Set<string>();
      if (observeWrites) {
        try { for (const id of await readdir(join(context.projectRoot, "works"))) existingWorkIds.add(id); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      const result = await tool.execute(context.episodeId, input, context.signal, context.onUpdate);
      return normalizeToolResult(
        context,
        result,
        before,
        risk !== "read",
        tool.label || tool.name,
        spec.artifactsCommitted,
        beforeSources,
        existingWorkIds,
        tool.managesWorkLock,
      );
    },
  });
}

async function normalizeToolResult(
  context: CapabilityExecutionContext,
  result: AgentToolResult<unknown>,
  before: WorkManifest | null,
  syncArtifacts: boolean,
  summary: string,
  artifactsCommitted = false,
  beforeSources?: ReadonlyMap<string, string>,
  existingWorkIds: ReadonlySet<string> = new Set(),
  exactCommittedArtifacts = false,
): Promise<ActionResult> {
  const content = result.content
    .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
  const details = result.details;
  const isError = (result as { isError?: boolean }).isError === true;
  const workIds = new Set<string>();
  if (syncArtifacts && context.work) workIds.add(context.work.id);
  if (syncArtifacts && details && typeof details === "object") {
    const workId = (details as Record<string, unknown>).workId;
    if (typeof workId === "string" && workId) workIds.add(workId);
  }
  const artifacts: ActionArtifactRef[] = [];
  if (exactCommittedArtifacts) {
    const refs = ActionArtifactRefSchema.array().parse((details as { committedArtifacts?: unknown })?.committedArtifacts);
    for (const ref of refs) {
      if (ref.workId !== context.work?.id || !ref.revisionId) throw new Error('Invalid committed artifact receipt');
      const { revision } = await readArtifactRevision({ projectRoot: context.projectRoot, ...ref });
      if (ref.path !== revision.path) throw new Error('Committed artifact path does not match its revision');
      artifacts.push(ref);
    }
  }
  for (const workId of workIds) {
    if (exactCommittedArtifacts) continue;
    if (!artifactsCommitted && await loadKnownWork(context.projectRoot, workId)) {
      await syncWorkSourceArtifacts({
        projectRoot: context.projectRoot,
        workId,
        episodeId: context.episodeId,
        accept: !isError,
        acceptPaths: before?.id === workId && beforeSources
          ? await changedWorkSourcePaths(context.projectRoot, workId, beforeSources)
          : existingWorkIds.has(workId) ? [] : await changedWorkSourcePaths(context.projectRoot, workId, new Map()),
      });
    }
    const after = await loadKnownWork(context.projectRoot, workId);
    if (!after) continue;
    const previous = before?.id === workId ? before : null;
    const priorRevisions = new Map(previous?.artifacts.map((artifact) => [artifact.id, artifact.currentRevisionId]) ?? []);
    for (const artifact of after.artifacts) {
      if (priorRevisions.get(artifact.id) === artifact.currentRevisionId) continue;
      const revision = artifact.revisions.find((candidate) => candidate.id === artifact.currentRevisionId);
      const previousRevision = previous?.artifacts
        .find((candidate) => candidate.id === artifact.id)
        ?.revisions.find((candidate) => candidate.id === priorRevisions.get(artifact.id));
      artifacts.push({
        workId,
        artifactId: artifact.id,
        ...(artifact.currentRevisionId ? { revisionId: artifact.currentRevisionId } : {}),
        ...(revision?.path || previousRevision?.path ? { path: revision?.path ?? previousRevision!.path } : {}),
      });
    }
  }
  if (isError) throw new Error(content || "Capability tool execution failed.");
  const observations = extractObservations(details);
  return ActionResultSchema.parse({
    status: "success",
    summary,
    ...(content ? { content } : {}),
    artifacts,
    observations,
    ...(details === undefined ? {} : { data: details }),
  });
}

function extractObservations(details: unknown): Observation[] {
  if (!details || typeof details !== "object") return [];
  const raw = (details as Record<string, unknown>).observations;
  if (raw === undefined) return [];
  return ObservationSchema.array().parse(raw);
}

async function loadKnownWork(projectRoot: string, workId: string | undefined): Promise<WorkManifest | null> {
  if (!workId) return null;
  try {
    return await loadWorkManifest(projectRoot, workId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
