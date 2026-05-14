import { PrismaClient } from "@prisma/client";
import { permissions } from "@phi-ba/contracts";
import { createSeedState } from "../apps/api/src/seed-data.js";

const prisma = new PrismaClient();
const db = prisma as any;
const seed = createSeedState();

async function main() {
  for (const tenant of seed.tenants) {
    await db.tenant.upsert({
      where: { id: tenant.id },
      update: { name: tenant.name, slug: tenant.slug, deploymentMode: tenant.deploymentMode },
      create: tenant
    });
  }

  for (const config of seed.tenantConfigs) {
    await db.tenantConfig.upsert({
      where: { tenantId: config.tenantId },
      update: {
        productName: config.productName,
        locale: config.locale,
        customDomain: config.customDomain,
        enabledFeatures: config.enabledFeatures,
        industryDomainPack: config.industryDomainPack,
        modelPolicy: config.modelPolicy,
        dataResidencyPolicy: config.dataResidencyPolicy,
        securityPolicy: config.securityPolicy
      },
      create: {
        id: config.id,
        tenantId: config.tenantId,
        productName: config.productName,
        locale: config.locale,
        customDomain: config.customDomain,
        enabledFeatures: config.enabledFeatures,
        industryDomainPack: config.industryDomainPack,
        modelPolicy: config.modelPolicy,
        dataResidencyPolicy: config.dataResidencyPolicy,
        securityPolicy: config.securityPolicy
      }
    });
    await db.brandConfig.upsert({
      where: { tenantId: config.tenantId },
      update: {
        productName: config.productName,
        logoUrl: config.logoUrl,
        primaryColor: config.themeColors.primary,
        secondaryColor: config.themeColors.secondary,
        accentColor: config.themeColors.accent,
        textColor: config.themeColors.text
      },
      create: {
        tenantId: config.tenantId,
        productName: config.productName,
        logoUrl: config.logoUrl,
        primaryColor: config.themeColors.primary,
        secondaryColor: config.themeColors.secondary,
        accentColor: config.themeColors.accent,
        textColor: config.themeColors.text
      }
    });
  }

  for (const flag of seed.featureFlags) {
    await db.featureFlag.upsert({
      where: { tenantId_key: { tenantId: flag.tenantId, key: flag.key } },
      update: { enabled: flag.enabled, config: flag.config },
      create: flag
    });
  }

  for (const user of seed.users) {
    await db.user.upsert({
      where: { id: user.id },
      update: user,
      create: user
    });
  }

  for (const key of Object.values(permissions)) {
    await db.permission.upsert({
      where: { key },
      update: { description: key },
      create: { id: `perm_${key.replace(/[^a-z0-9]+/gi, "_")}`, key, description: key }
    });
  }

  for (const role of seed.roles) {
    await db.role.upsert({
      where: { id: role.id },
      update: { name: role.name, description: role.description },
      create: { id: role.id, tenantId: role.tenantId, name: role.name, description: role.description }
    });
    for (const permissionKey of role.permissions) {
      const permission = await db.permission.findUnique({ where: { key: permissionKey } });
      if (permission) {
        await db.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id }
        });
      }
    }
  }

  await db.userRole.upsert({ where: { userId_roleId: { userId: "user_admin", roleId: "role_admin" } }, update: {}, create: { userId: "user_admin", roleId: "role_admin" } });
  await db.userRole.upsert({ where: { userId_roleId: { userId: "user_analyst", roleId: "role_analyst" } }, update: {}, create: { userId: "user_analyst", roleId: "role_analyst" } });
  await db.userRole.upsert({ where: { userId_roleId: { userId: "user_approver", roleId: "role_approver" } }, update: {}, create: { userId: "user_approver", roleId: "role_approver" } });

  for (const secret of seed.secretReferences) {
    await db.secretReference.upsert({ where: { id: secret.id }, update: secret, create: secret });
  }
  for (const connector of seed.connectors) {
    await db.connector.upsert({
      where: { id: connector.id },
      update: {
        type: connector.type,
        name: connector.name,
        config: connector.config,
        secretReferenceId: connector.secretReferenceId,
        status: connector.status,
        allowedTables: connector.allowedTables,
        allowedColumns: connector.allowedColumns
      },
      create: {
        id: connector.id,
        tenantId: connector.tenantId,
        type: connector.type,
        name: connector.name,
        config: connector.config,
        secretReferenceId: connector.secretReferenceId,
        status: connector.status,
        allowedTables: connector.allowedTables,
        allowedColumns: connector.allowedColumns
      }
    });
  }

  for (const term of seed.glossaryTerms) {
    await db.businessGlossaryTerm.upsert({ where: { id: term.id }, update: term, create: term });
  }
  for (const metric of seed.metricDefinitions) {
    await db.metricDefinition.upsert({ where: { id: metric.id }, update: metric, create: metric });
  }
  for (const index of seed.vectorIndexes) {
    await db.vectorIndex.upsert({ where: { id: index.id }, update: index, create: index });
  }
  for (const prompt of seed.prompts) {
    await db.prompt.upsert({
      where: { id: prompt.id },
      update: { key: prompt.key, name: prompt.name, description: prompt.description },
      create: { id: prompt.id, tenantId: prompt.tenantId, key: prompt.key, name: prompt.name, description: prompt.description }
    });
    for (const version of prompt.versions) {
      await db.promptVersion.upsert({
        where: { id: version.id },
        update: { version: version.version, body: version.body, metadata: version.metadata },
        create: { id: version.id, promptId: prompt.id, version: version.version, body: version.body, metadata: version.metadata }
      });
    }
  }
  for (const template of seed.agentTemplates) {
    await db.agentTemplate.upsert({ where: { id: template.id }, update: template, create: template });
  }
  for (const agent of seed.agents) {
    await db.agent.upsert({ where: { id: agent.id }, update: agent, create: agent });
  }
  for (const tool of seed.tools) {
    await db.tool.upsert({ where: { key: tool.key }, update: tool, create: tool });
  }
  for (const workflow of seed.workflows) {
    await db.workflow.upsert({ where: { id: workflow.id }, update: workflow, create: workflow });
  }
  for (const rule of seed.alertRules) {
    await db.alertRule.upsert({ where: { id: rule.id }, update: rule, create: rule });
  }
  for (const source of seed.externalSources) {
    await db.externalSource.upsert({ where: { id: source.id }, update: source, create: source });
  }
  for (const scenario of seed.simulationScenarios) {
    await db.simulationScenario.upsert({ where: { id: scenario.id }, update: scenario, create: scenario });
  }
  for (const check of seed.safetyGateChecks) {
    await db.safetyGateCheck.upsert({ where: { key: check.key }, update: check, create: check });
  }

  console.log("Seeded phi.ba enterprise platform example data.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
