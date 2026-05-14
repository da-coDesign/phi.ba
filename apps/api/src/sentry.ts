import { permissions, type RequestContext } from "@phi-ba/contracts";
import { createId, nowIso } from "@phi-ba/shared";
import { requirePermission } from "./request-context.js";
import { notFound } from "./errors.js";
import { store, type PlatformStore } from "./store.js";
import type { AlertEvent, AlertRule, JsonRecord, MetricSubscription } from "./platform-types.js";

export class SentryService {
  constructor(private readonly repository: PlatformStore) {}

  listSubscriptions(context: RequestContext): MetricSubscription[] {
    return this.repository.snapshot().metricSubscriptions.filter((item) => item.tenantId === context.tenantId);
  }

  listRules(context: RequestContext): AlertRule[] {
    return this.repository.snapshot().alertRules.filter((rule) => rule.tenantId === context.tenantId);
  }

  listAlerts(context: RequestContext): AlertEvent[] {
    return this.repository.snapshot().alertEvents.filter((alert) => alert.tenantId === context.tenantId);
  }

  runMetricCheck(context: RequestContext, input?: { metricKey?: string; currentValue?: number; baselineValue?: number }): JsonRecord {
    requirePermission(context, permissions.alertsWrite);
    const metricKey = input?.metricKey ?? "marketplace_credit_volume";
    const rules = this.listRules(context).filter((rule) => rule.metricKey === metricKey && rule.enabled);
    const baselineValue = input?.baselineValue ?? 100;
    const currentValue = input?.currentValue ?? 72;
    const deltaPct = baselineValue === 0 ? 0 : ((currentValue - baselineValue) / baselineValue) * 100;
    const created: AlertEvent[] = [];
    for (const rule of rules) {
      const triggered = rule.ruleType === "threshold"
        ? deltaPct <= Number(rule.threshold ?? -20)
        : Math.abs(deltaPct) >= (rule.sensitivity ?? 2) * 10;
      if (!triggered) continue;
      const dedupeKey = `${rule.id}:${Math.round(deltaPct)}`;
      const existing = this.repository.snapshot().alertEvents.find((alert) => alert.tenantId === context.tenantId && alert.dedupeKey === dedupeKey);
      if (existing) continue;
      const alert: AlertEvent = {
        id: createId("alert"),
        tenantId: context.tenantId,
        ruleId: rule.id,
        priority: rule.priority,
        title: rule.name,
        explanation: `Metric ${metricKey} moved ${deltaPct.toFixed(1)}% versus baseline. This matches the seeded abnormal marketplace credit-volume drop scenario.`,
        dedupeKey,
        createdAt: nowIso()
      };
      this.repository.snapshot().alertEvents.unshift(alert);
      created.push(alert);
      this.repository.appendAudit({
        tenantId: context.tenantId,
        actorUserId: context.userId,
        eventType: "WORKFLOW_ACTION",
        action: "sentry.alert.created",
        resourceType: "alert",
        resourceId: alert.id,
        correlationId: context.correlationId,
        metadata: { metricKey, currentValue, baselineValue, deltaPct }
      });
    }
    return { metricKey, currentValue, baselineValue, deltaPct, alertsCreated: created };
  }

  acknowledge(context: RequestContext, alertId: string): AlertEvent {
    requirePermission(context, permissions.alertsWrite);
    const alert = this.repository.snapshot().alertEvents.find((item) => item.tenantId === context.tenantId && item.id === alertId);
    if (!alert) throw notFound(`Alert ${alertId} was not found`);
    alert.acknowledgedAt = nowIso();
    alert.acknowledgedBy = context.userId;
    this.repository.appendAudit({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: "WORKFLOW_ACTION",
      action: "alert.acknowledge",
      resourceType: "alert",
      resourceId: alert.id,
      correlationId: context.correlationId
    });
    return alert;
  }
}

export const sentryService = new SentryService(store);
