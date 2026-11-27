import type { StoryGraph } from "./graph-schema.js";
import type { ValidationIssue } from "./validation.js";

// The default value defines the runtime scalar type; `type` is also used for
// domain labels such as resource/item/flag and is not a JavaScript type name.
export function validateVariableTypes(graph: StoryGraph): ValidationIssue[] {
  const variables = new Map(graph.variables.map(variable => [variable.name, variable]));
  const issues: ValidationIssue[] = [];
  for (const node of graph.nodes) {
    const owners = [
      ...node.choices.map(choice=>({label:`choice ${choice.id}`,operations:[...choice.effects,...(choice.condition?[choice.condition]:[])]})),
      ...node.dialogue.map((line,index)=>({label:`dialogue ${index+1}`,operations:line.condition?[line.condition]:[]})),
    ];
    for (const owner of owners) for (const operation of owner.operations) {
      const variable = variables.get(operation.var);
      if (!variable) continue; // An incremental authoring draft may declare it later.
      const numeric = ['add', 'sub', '>', '<', '>=', '<='].includes(operation.op);
      if (typeof operation.value !== typeof variable.default ||
          (numeric && typeof variable.default !== 'number')) {
        issues.push({code:'VARIABLE_TYPE_MISMATCH',level:'error',nodeIds:[node.id],
          message:`Variable ${variable.name} requires ${typeof variable.default} values; ${owner.label} uses an incompatible ${operation.op} operation`});
      }
    }
  }
  return issues;
}

export function assertVariableTypes(graph: StoryGraph): void {
  const issues = validateVariableTypes(graph);
  if (issues.length) throw Object.assign(new Error(issues.map(issue => issue.message).join('; ')), {
    code: 'VARIABLE_TYPE_MISMATCH', issues,
  });
}
