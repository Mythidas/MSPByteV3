import type { WorkflowStageNode, NodeDataType } from './types.js';
import { WorkflowTypeError } from './types.js';

// TODO: call at workflow save
export interface ValidationError { stageId: string; message: string }
export interface ValidationResult { valid: boolean; errors: ValidationError[] }

export function validateWorkflowGraph(stages: WorkflowStageNode[]): ValidationResult {
  const errors: ValidationError[] = [];
  const outputTypeMap = new Map<string, NodeDataType | null>();

  for (const stage of stages) {
    outputTypeMap.set(stage.id, stage.outputType ?? null);

    const upstreamIds = Object.values(stage.input_map)
      .map(({ from }) => from.match(/^stage_outputs\.([^.]+)/)?.[1])
      .filter(Boolean) as string[];

    if (upstreamIds.length > 0 && stage.inputType !== null) {
      const upstreamId = upstreamIds[0]!;
      const upstreamOutputType = outputTypeMap.get(upstreamId) ?? null;
      try {
        validateTypeMatch(upstreamOutputType, stage.inputType);
      } catch (e) {
        if (e instanceof WorkflowTypeError) {
          errors.push({ stageId: stage.id, message: e.message });
        } else throw e;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateTypeMatch(upstream: NodeDataType | null, downstream: NodeDataType | null): void {
  if (downstream === null || upstream === null) return;
  if (upstream !== downstream) {
    throw new WorkflowTypeError(
      `Type mismatch: upstream produces '${upstream}', this stage expects '${downstream}'`
    );
  }
}
