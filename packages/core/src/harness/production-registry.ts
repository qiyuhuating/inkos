import { createProfileWorkTools } from "./tools/work-creation.js";
import {existsSync} from "node:fs";
import {join} from "node:path";
import { bindProductionTool } from "./tools/bound-production.js";
import { createBuiltInWorkProfileRegistry } from "./builtin-profiles.js";
import { createArtifactMethodTools, createDeliverWorkArtifactTool } from "./tools/artifact-methods.js";
import { createShortProductionStageTools } from "./tools/short-production.js";
import { createInspectPlayStateTool } from "./tools/play-state.js";
import { createPlayImageTool } from "./tools/play-image.js";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type, type TSchema } from "@sinclair/typebox";
import type { PipelineRunner } from "../pipeline/runner.js";
import type { ActionPayload, RequestedIntent } from "../interaction/action-envelope.js";
import type { PlayMode } from "../interaction/session.js";
import type { ActivatedSkillGuidance } from "../agent/skill-tool.js";
import {
  createContinuationImportTool,
  createDeleteLatestChapterTool,
  createFanficBookTool,
  createGenerateCoverTool,
  createGrepTool,
  createImportChaptersTool,
  createImportCanonTool,
  createIngestMaterialTool,
  createInteractiveFilmCreationTool,
  createInspectWorkTool,
  createListWorksTool,
  createLsTool,
  createManageBookReferenceTool,
  createPlayEditTool,
  createPlayReviseTool,
  createPlayStartTool,
  createPlayStepTool,
  createRefreshFanficCanonTool,
  createProposeActionTool,
  createReadTool,
  createResearchWebTool,
  createResyncChapterStateTool,
  createRetrieveMaterialTool,
  createScriptCreationTool,
  createShortFictionRunTool,
  createShortFictionReviseTool,
  createSpinoffBookTool,
  createStoryboardCreationTool,
  createImitationBookTool,
  type ProposedActionName,
} from "../agent/agent-tools.js";
import {
  createBookFoundationTool,
  createFoundationRevisionTool,
  createReviewChapterTool,
  createReviseChapterTool,
  createGenerateStyleGuideTool,
  createWriteChaptersTool,
} from "./tools/longform-production.js";
import { createExportBookTool } from "./tools/export-book.js";
import {
  createPatchChapterTextTool,
  createRenameEntityTool,
  createReplaceChapterTextTool,
  createWriteTruthFileTool,
} from "./tools/longform-edits.js";
import {
  createTranslationCreateTool,
  createTranslationExportTool,
  createTranslationRunTool,
  createTranslationRevisionTool,
} from "./tools/translation.js";
import { createReplaceWorkArtifactTool, createExportWorkTool } from "./tools/work-artifacts.js";
import type * as FilmAuthoring from "../agent/film-authoring-tools.js";
import {
  createNarrativeForecastCreateTool,
  createNarrativeForecastGetTool,
  createNarrativeForecastSelectTool,
} from "../agent/forecast-tools.js";
import { mergeActivatedSkillGuidance } from "../skills/index.js";
import type { WorkManifest } from "./contracts.js";
import { CapabilityRegistry } from "./capability-registry.js";
import { registerToolCapability, actionTool, type ProductionAgentTool, type ProductionToolAction, type ConfirmedCapabilityBinding } from "./tool-capability.js";
export { createSingleToolCapabilityRegistry, type ConfirmedCapabilityBinding } from "./tool-capability.js";
import { StateManager } from "../state/manager.js";
import { isActionAuthorized } from "./runtime.js";

export interface ProductionCapabilityEnvironment {
  readonly pipeline: PipelineRunner;
  readonly projectRoot: string;
  readonly sessionId: string;
  readonly profileId: string;
  readonly proposalAction?: RequestedIntent;
  readonly work: WorkManifest | null;
  readonly language: string;
  readonly actionPayload?: ActionPayload;
  readonly playMode?: PlayMode;
  readonly playWorldExists: boolean;
  readonly sameSessionProposal: boolean;
  readonly allowSystemFileRead: boolean;
  readonly intentSkillTool?: AgentTool<any, any>;
  readonly requestedSkillIds?: () => ReadonlyArray<string>;
  readonly attachmentPaths?: () => ReadonlyArray<string>;
  readonly activeSkills?: () => ReadonlyArray<ActivatedSkillGuidance>;
  readonly workerSkills?: (agent: string) => ReadonlyArray<ActivatedSkillGuidance>;
  readonly profileSkills?: (
    profileId: string,
    includeRecommended?: boolean,
  ) => ReadonlyArray<ActivatedSkillGuidance>;
  readonly skillActivations?: (...skillIds: ReadonlyArray<string>) => ReadonlyArray<ActivatedSkillGuidance>;
  readonly interactiveFilmAuthoring?: boolean;
  readonly confirmedCreation?: boolean;
}

function withoutInlineImportSource(tool:ReturnType<typeof createImportChaptersTool>):ProductionAgentTool {
  return {...tool,parameters:Type.Omit(tool.parameters,['sourceText'],{additionalProperties:false})};
}

const CONFIRMED_CAPABILITY_BINDINGS: Readonly<Partial<Record<RequestedIntent, ConfirmedCapabilityBinding>>> = {
  create_book: { capabilityId: "longform", actionId: "create_book", profileId: "longform-novel", risk: "recoverable-write" },
  write_next: { capabilityId: "longform", actionId: "write_chapters", profileId: "longform-novel", risk: "recoverable-write" },
  short_run: { capabilityId: "short-fiction", actionId: "short_fiction_run", profileId: "short-fiction", risk: "recoverable-write" },
  play_start: { capabilityId: "interactive-world", actionId: "play_start", profileId: "interactive-world", risk: "recoverable-write" },
  play_step: { capabilityId: "interactive-world", actionId: "play_step", profileId: "interactive-world", risk: "recoverable-write" },
  generate_cover: { capabilityId: "visual", actionId: "generate_cover", profileId: "visual-asset", risk: "recoverable-write" },
  fanfic_init: { capabilityId: "adaptation", actionId: "fanfic_create", profileId: "workspace-default", risk: "recoverable-write" },
  continuation_import: { capabilityId: "adaptation", actionId: "continuation_import", profileId: "workspace-default", risk: "recoverable-write" },
  spinoff_create: { capabilityId: "adaptation", actionId: "spinoff_create", profileId: "workspace-default", risk: "recoverable-write" },
  style_imitation: { capabilityId: "adaptation", actionId: "imitation_create", profileId: "workspace-default", risk: "recoverable-write" },
  script_create: { capabilityId: "script", actionId: "script_create", profileId: "script", risk: "recoverable-write" },
  storyboard_create: { capabilityId: "storyboard", actionId: "storyboard_create", profileId: "storyboard", risk: "recoverable-write" },
  interactive_film_create: { capabilityId: "interactive-film", actionId: "interactive_film_create", profileId: "interactive-film", risk: "recoverable-write" },
  translation_create: { capabilityId: "translation", actionId: "translation_create", profileId: "translation", risk: "recoverable-write" },
  draft_structure: { capabilityId: "interactive-film", actionId: "draft_structure", profileId: "interactive-film", risk: "recoverable-write" },
  connect_choice: { capabilityId: "interactive-film", actionId: "connect_choice", profileId: "interactive-film", risk: "recoverable-write" },
  remove_node: { capabilityId: "interactive-film", actionId: "remove_node", profileId: "interactive-film", risk: "recoverable-write" },
};

export function confirmedCapabilityBinding(intent: RequestedIntent): ConfirmedCapabilityBinding | undefined {
  return CONFIRMED_CAPABILITY_BINDINGS[intent];
}

export function buildProductionCapabilityRegistry(
  environment: ProductionCapabilityEnvironment,
  filmAuthoring?: typeof FilmAuthoring,
): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  const lang = environment.language === "en" ? "en" : "zh";
  const profile = createBuiltInWorkProfileRegistry(environment.projectRoot).require(environment.work?.profileId ?? environment.profileId);
  // The same policy governs execution and the offered confirmation action space.
  const allowedProposals = Object.entries(CONFIRMED_CAPABILITY_BINDINGS).flatMap(([intent, binding]) => {
    const action = proposedActionName(intent as RequestedIntent);
    if (!action || !binding) return [];
    if (binding.risk === "destructive-write" && !profile.capabilityIds.includes(binding.capabilityId)) return [];
    return !isActionAuthorized(profile, binding, "agent", false)
      || !isActionAuthorized(profile, binding, "explicit", false) ? [action] : [];
  });
  const proposalTool = allowedProposals.length ? createProposeActionTool(lang, {
    allowedActions: allowedProposals,
    sameSession: environment.sameSessionProposal,
    proposalAction: environment.work
      ? undefined
      : proposedActionName(environment.proposalAction) ?? proposalActionForProfile(environment.profileId),
    playMode: environment.playMode,
    requestedSkillIds: environment.requestedSkillIds,
    attachmentPaths: environment.attachmentPaths,
  }) : undefined;
  const workspaceTools: ProductionToolAction[] = [
    ...createProfileWorkTools(environment.projectRoot, registry).map(tool => tool.name === "list_work_profiles" ? readAction(tool) : writeAction(tool)),
    ...(proposalTool ? [readAction(proposalTool)] : []),
    readAction(createReadTool(environment.projectRoot, {
      scope: "project",
      allowSystemPaths: environment.allowSystemFileRead,
      workId: environment.work?.id,
    })),
    readAction(createListWorksTool(environment.projectRoot)),
    readAction(createInspectWorkTool(environment.projectRoot)),
    readAction(createLsTool(environment.projectRoot)),
    readAction(createResearchWebTool(environment.projectRoot)),
    writeAction(createIngestMaterialTool(environment.projectRoot)),
    readAction(createRetrieveMaterialTool(environment.projectRoot)),
  ];
  if (environment.work) {
    workspaceTools.push(committedAction(createReplaceWorkArtifactTool(environment.projectRoot, environment.work.id)));
    workspaceTools.push(committedAction(createDeliverWorkArtifactTool(environment.pipeline, environment.projectRoot, environment.work.id)));
    workspaceTools.push(committedAction(createExportWorkTool(environment.projectRoot, environment.work.id)));
  }
  if (environment.work) workspaceTools.push(...createArtifactMethodTools(environment.pipeline, environment.projectRoot, environment.work.id).map(committedAction));
  if (environment.intentSkillTool) workspaceTools.push(readAction(environment.intentSkillTool));
  registerToolCapability(registry, "workspace", "Creative workspace", workspaceTools);

  const longformTools: ProductionToolAction[] = environment.work
    ? [
        ...(!existsSync(join(environment.projectRoot,"works",environment.work.id,"source/book.json")) || environment.work.status==="draft"
          ? [writeAction(createBookFoundationTool(environment.pipeline,{language:lang,activeSkills:environment.activeSkills,workerSkills:environment.workerSkills,activeWork:{work:environment.work,projectRoot:environment.projectRoot}}))]
          : []),
        writeAction(createFoundationRevisionTool(environment.pipeline, environment.work.id, {
          language: lang, activeSkills: environment.activeSkills, workerSkills: environment.workerSkills,
        })),
        writeAction(createWriteChaptersTool(environment.pipeline, environment.work.id, {
          language: lang, activeSkills: environment.activeSkills, workerSkills: environment.workerSkills,
        })),
        committedAction(createReviewChapterTool(environment.pipeline, environment.work.id, {
          language: lang, activeSkills: environment.activeSkills, workerSkills: environment.workerSkills,
        })),
        writeAction(createReviseChapterTool(environment.pipeline, environment.work.id, {
          language: lang, activeSkills: environment.activeSkills, workerSkills: environment.workerSkills,
        })),
        writeAction(createGenerateStyleGuideTool(environment.pipeline, environment.work.id, {
          language: lang,
          activeSkills: environment.activeSkills,
          workerSkills: environment.workerSkills,
        })),
        writeAction(createExportBookTool(new StateManager(environment.projectRoot), environment.work.id)),
        writeAction(createWriteTruthFileTool(environment.projectRoot, environment.work.id)),
        writeAction(createRenameEntityTool(environment.projectRoot, environment.work.id)),
        writeAction(createPatchChapterTextTool(environment.projectRoot, environment.work.id)),
        writeAction(createReplaceChapterTextTool(environment.projectRoot, environment.work.id)),
        writeAction(createResyncChapterStateTool(environment.pipeline, environment.work.id, {
          language: lang,
          defaultSkills: environment.profileSkills?.("longform-novel"),
          activeSkills: environment.activeSkills,
        })),
        destructiveAction(createDeleteLatestChapterTool(environment.projectRoot, environment.work.id)),
        writeAction(createManageBookReferenceTool(environment.projectRoot, environment.work.id)),
        writeAction(withoutInlineImportSource(createImportChaptersTool(environment.pipeline, environment.work.id, environment.projectRoot, {
          defaultSkills: environment.profileSkills?.("longform-novel"),
          activeSkills: environment.activeSkills,
        }))),
        writeAction(createImportCanonTool(environment.pipeline, environment.work.id)),
        writeAction(createRefreshFanficCanonTool(environment.pipeline, environment.projectRoot, environment.work.id, {
          defaultSkills: [
            ...(environment.profileSkills?.("longform-novel") ?? []),
            ...(environment.skillActivations?.("inkos-story-import", "inkos-fanfic-writing") ?? []),
          ],
          activeSkills: environment.activeSkills,
        })),
        writeAction(createNarrativeForecastCreateTool(environment.pipeline, environment.work.id, environment.projectRoot, {
          defaultSkills: environment.profileSkills?.("longform-novel"),
          activeSkills: environment.activeSkills,
        })),
        readAction(createNarrativeForecastGetTool(environment.work.id, environment.projectRoot)),
        writeAction(createNarrativeForecastSelectTool(environment.work.id, environment.projectRoot)),
        readAction(createGrepTool(environment.projectRoot)),
        readAction(createLsTool(environment.projectRoot)),
      ]
    : [confirmedAction(createBookFoundationTool(environment.pipeline, {
        actionPayload: environment.actionPayload,
        language: lang,
        activeSkills: environment.activeSkills,
        workerSkills: environment.workerSkills,
      })), writeAction(createWriteChaptersTool(environment.pipeline, null, {
        language: lang, activeSkills: environment.activeSkills, workerSkills: environment.workerSkills,
      }))];
  registerToolCapability(registry, "longform", "Long-form creation", longformTools);

  registerToolCapability(registry, "short-fiction", "Short fiction", [
    ...createShortProductionStageTools(environment.pipeline, environment.projectRoot, environment.work?.id).map(committedAction),
    ...(environment.work && createBuiltInWorkProfileRegistry(environment.projectRoot).require(environment.work.profileId).capabilityIds.includes("short-fiction") ? [writeAction(createShortFictionReviseTool(environment.pipeline,environment.projectRoot,environment.work.id,{
      defaultSkills:environment.profileSkills?.(environment.work?.profileId ?? "short-fiction"),activeSkills:environment.activeSkills,
    }))] : []),
    confirmedAction(createShortFictionRunTool(environment.pipeline, environment.projectRoot, {
      actionPayload: environment.actionPayload,
      activeWorkId: environment.work?.id,
      language: lang,
      defaultSkills: environment.profileSkills?.(environment.work?.profileId ?? "short-fiction"),
      activeSkills: environment.activeSkills,
    })),
  ]);
  registerToolCapability(registry, "script", "Script creation", [
    ...scopedProduction(createScriptCreationTool(environment.pipeline, environment.projectRoot, {
      actionPayload: environment.confirmedCreation ? environment.actionPayload : undefined,
      language: lang,
      defaultSkills: environment.profileSkills?.("script"),
      activeSkills: environment.activeSkills,
    }), environment),
  ]);
  registerToolCapability(registry, "storyboard", "Storyboard creation", [
    ...scopedProduction(createStoryboardCreationTool(environment.pipeline, environment.projectRoot, {
      actionPayload: environment.confirmedCreation ? environment.actionPayload : undefined,
      language: lang,
      defaultSkills: environment.profileSkills?.("storyboard"),
      activeSkills: environment.activeSkills,
    }), environment),
  ]);

  if (environment.interactiveFilmAuthoring && environment.work && !filmAuthoring) throw new Error('Film authoring implementation is required.');
  const interactiveFilmTools: ProductionToolAction[] = environment.interactiveFilmAuthoring && environment.work
    ? filmAuthoring!.createFilmAuthoringTools({
        projectRoot: environment.projectRoot,
        projectId: environment.work.id,
        llm: filmAuthoring!.filmLLMDepsFromClient(
          environment.pipeline.createAgentContext("film-authoring", environment.work.id).client,
          environment.pipeline.createAgentContext("film-authoring", environment.work.id).model,
          {
            activatedSkills: () => mergeActivatedSkillGuidance(
              environment.profileSkills?.("interactive-film") ?? [],
              environment.activeSkills?.() ?? [],
            ),
          },
        ),
        language: lang,
      }).map((tool) => tool.name==='inspect_story_graph' ? readAction(tool) : writeAction(tool))
    : scopedProduction(createInteractiveFilmCreationTool(environment.pipeline, environment.projectRoot, {
        actionPayload: environment.confirmedCreation ? environment.actionPayload : undefined,
        language: lang,
        defaultSkills: environment.profileSkills?.("interactive-film"),
        activeSkills: environment.activeSkills,
      }), environment);
  registerToolCapability(registry, "interactive-film", "Interactive film", interactiveFilmTools);

  const interactiveWorldId = environment.work?.id ?? environment.sessionId;
  const interactiveWorldTools: ProductionToolAction[] = environment.playWorldExists
    ? [
        readAction(createInspectPlayStateTool(environment.projectRoot, interactiveWorldId)),
        writeAction(createPlayImageTool(environment.projectRoot, interactiveWorldId)),
        writeAction(createPlayEditTool(environment.projectRoot, interactiveWorldId, lang)),
        writeAction(createPlayReviseTool(environment.pipeline, environment.projectRoot, interactiveWorldId, {
          language: lang,
          defaultSkills: environment.profileSkills?.("interactive-world"),
          activeSkills: environment.activeSkills,
        })),
        writeAction(createPlayStepTool(environment.pipeline, environment.projectRoot, interactiveWorldId, {
          language: lang,
          defaultSkills: environment.profileSkills?.("interactive-world"),
          activeSkills: environment.activeSkills,
        })),
      ]
    : [confirmedAction(createPlayStartTool(
        environment.pipeline,
        environment.projectRoot,
        interactiveWorldId,
        environment.playMode,
        {
          actionPayload: environment.actionPayload,
          language: lang,
          defaultSkills: environment.profileSkills?.("interactive-world"),
          activeSkills: environment.activeSkills,
        },
      ))];
  registerToolCapability(registry, "interactive-world", "Interactive world", interactiveWorldTools);

  const translationWorkId = environment.work?.profileId === "translation" ? environment.work.id : undefined;
  const translationTools: ProductionToolAction[] = [
    ...(!translationWorkId ? [writeAction(createTranslationCreateTool(environment.projectRoot, { actionPayload: environment.actionPayload }))] : []),
    writeAction(createTranslationRunTool(environment.pipeline, environment.projectRoot, translationWorkId, {
      defaultSkills: environment.profileSkills?.("translation"), activeSkills: environment.activeSkills,
    })),
    committedAction(createTranslationRevisionTool(environment.pipeline,environment.projectRoot,translationWorkId,{defaultSkills:environment.profileSkills?.("translation"),activeSkills:environment.activeSkills})),
    committedAction(createTranslationExportTool(environment.projectRoot, translationWorkId)),
  ];
  registerToolCapability(registry, "translation", "Translation", translationTools);
  registerToolCapability(registry, "adaptation", "Adaptation", [
    ...(!environment.work ? [writeAction(createWriteChaptersTool(environment.pipeline, null, {
      language: lang, activeSkills: environment.activeSkills, workerSkills: environment.workerSkills,
    }))] : []),
    confirmedAction(createFanficBookTool(environment.pipeline, environment.projectRoot, {
      defaultSkills: mergeActivatedSkillGuidance(
        environment.profileSkills?.("longform-novel") ?? [],
        environment.skillActivations?.("inkos-story-import", "inkos-fanfic-writing") ?? [],
      ),
      activeSkills: environment.activeSkills,
    })),
    confirmedAction(createContinuationImportTool(environment.pipeline, environment.work?.id ?? null, environment.projectRoot, {
      defaultSkills: mergeActivatedSkillGuidance(
        environment.profileSkills?.("longform-novel") ?? [],
        environment.skillActivations?.("inkos-story-import", "inkos-continuation-writing") ?? [],
      ),
      activeSkills: environment.activeSkills,
    })),
    confirmedAction(createSpinoffBookTool(environment.pipeline, environment.projectRoot, {
      defaultSkills: mergeActivatedSkillGuidance(
        environment.profileSkills?.("longform-novel") ?? [],
        environment.skillActivations?.("inkos-spinoff-writing") ?? [],
      ),
      activeSkills: environment.activeSkills,
    })),
    confirmedAction(createImitationBookTool(environment.pipeline, environment.projectRoot, {
      defaultSkills: mergeActivatedSkillGuidance(
        environment.profileSkills?.("longform-novel") ?? [],
        environment.skillActivations?.("inkos-imitation-writing") ?? [],
      ),
      activeSkills: environment.activeSkills,
    })),
  ]);
  registerToolCapability(registry, "visual", "Visual assets", environment.work ? [
    committedAction(createGenerateCoverTool(environment.projectRoot, { actionPayload: environment.actionPayload, activeWorkId: environment.work.id })),
  ] : []);
  return registry;
}

function proposedActionName(value: RequestedIntent | undefined): ProposedActionName | undefined {
  if (value === "create_book"
    || value === "short_run"
    || value === "play_start"
    || value === "generate_cover"
    || value === "fanfic_init"
    || value === "continuation_import"
    || value === "spinoff_create"
    || value === "style_imitation"
    || value === "script_create"
    || value === "storyboard_create"
    || value === "interactive_film_create"
    || value === "translation_create"
    || value === "draft_structure"
    || value === "connect_choice"
    || value === "remove_node") {
    return value;
  }
  return undefined;
}

function proposalActionForProfile(profileId: string): ProposedActionName | undefined {
  if (profileId === "longform-novel") return "create_book";
  if (profileId === "short-fiction") return "short_run";
  if (profileId === "interactive-world") return "play_start";
  if (profileId === "script") return "script_create";
  if (profileId === "storyboard") return "storyboard_create";
  if (profileId === "interactive-film") return "interactive_film_create";
  if (profileId === "translation") return "translation_create";
  if (profileId === "visual-asset") return "generate_cover";
  return undefined;
}

function readAction(tool: ProductionAgentTool): ProductionToolAction {
  return actionTool(tool, "read");
}

function writeAction(tool: ProductionAgentTool): ProductionToolAction {
  return actionTool(tool, "recoverable-write");
}

function committedAction(tool: ProductionAgentTool): ProductionToolAction {
  return { ...writeAction(tool), artifactsCommitted: true };
}

function confirmedAction(tool: ProductionAgentTool): ProductionToolAction {
  return actionTool(tool, "recoverable-write");
}

function scopedProduction(tool: ProductionAgentTool, environment: ProductionCapabilityEnvironment): ProductionToolAction[] {
  if (environment.confirmedCreation) return [confirmedAction(tool)];
  return environment.work ? [writeAction(bindProductionTool(environment.projectRoot, environment.work, tool))] : [];
}

function destructiveAction(tool: ProductionAgentTool): ProductionToolAction {
  return actionTool(tool, "destructive-write", true);
}
