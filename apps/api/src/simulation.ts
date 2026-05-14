import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { safetyGateService } from "./safety-gates.js";
import { notFound } from "./errors.js";
import { store, type PlatformStore } from "./store.js";
import type { JsonRecord, Segment, SimulationResult, SimulationScenario, SyntheticUserSegment } from "./platform-types.js";

export class SimulationService {
  constructor(private readonly repository: PlatformStore) {}

  listScenarios(context: RequestContext): SimulationScenario[] {
    return this.repository.snapshot().simulationScenarios.filter((scenario) => scenario.tenantId === context.tenantId);
  }

  listSegments(context: RequestContext): Segment[] {
    return this.repository.snapshot().segments.filter((segment) => segment.tenantId === context.tenantId);
  }

  listSyntheticSegments(context: RequestContext): SyntheticUserSegment[] {
    return this.repository.snapshot().syntheticUserSegments.filter((segment) => segment.tenantId === context.tenantId);
  }

  runWhatIf(context: RequestContext, input: { scenarioId: string; parameters?: JsonRecord }): SimulationResult {
    safetyGateService.assertAllowed(context, {
      tenantId: context.tenantId,
      operationType: "simulation",
      operationId: createId("simulation"),
      requiredPermission: permissions.simulationsExecute,
      riskLevel: "medium",
      sandbox: true,
      liveMutationTarget: false,
      payload: input.parameters
    });
    const scenario = this.repository.snapshot().simulationScenarios.find((item) => item.tenantId === context.tenantId && item.id === input.scenarioId);
    if (!scenario) throw notFound(`Simulation scenario ${input.scenarioId} was not found`);
    const parameters = { ...scenario.parameters, ...(input.parameters ?? {}) };
    const baseRate = Number(parameters.baseRate ?? 3.2);
    const proposedRate = Number(parameters.proposedRate ?? baseRate);
    const rateDelta = proposedRate - baseRate;
    const estimatedConversionDelta = Number((-rateDelta * 8.5).toFixed(2));
    const estimatedRevenueDeltaTry = Math.round(rateDelta * 1000000 * -1);
    const result: SimulationResult = {
      id: createId("simulation_result"),
      tenantId: context.tenantId,
      scenarioId: scenario.id,
      input: parameters,
      output: {
        estimatedConversionDeltaPct: estimatedConversionDelta,
        estimatedRevenueDeltaTry,
        approvalRequiredBeforeAction: scenario.requiresApprovalForAction,
        note: "Foundation-only deterministic scenario. This is not a production ML simulation engine."
      },
      safetyStatus: "PASS",
      createdAt: nowIso()
    };
    this.repository.snapshot().simulationResults.unshift(result);
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "SIMULATION_RUN",
      action: "simulation.run",
      resourceType: "simulation_scenario",
      resourceId: scenario.id,
      correlationId: context.correlationId,
      metadata: { parameters, result: result.output }
    });
    return result;
  }
}

export const simulationService = new SimulationService(store);
