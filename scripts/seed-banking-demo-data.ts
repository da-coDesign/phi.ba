import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

type Row = Record<string, string | number | boolean>;

interface PersonaTemplate {
  persona_key: string;
  segment: string;
  display_name: string;
  description: string;
  lifecycle_bias: string;
  primary_need: string;
  risk_bias: number;
  digital_bias: number;
  campaign_bias: number;
  product_affinity: string[];
  targetCount: number;
  preferredChannels: readonly string[];
  lifecycleStages: readonly string[];
  profitabilityBands: readonly string[];
}

interface CustomerSeed extends Row {
  customer_id: string;
  segment: string;
  city: string;
  age_band: string;
  income_band: string;
  acquisition_channel: string;
  risk_score: number;
  product_count: number;
  is_active: boolean;
  created_at: string;
  persona_key: string;
  lifecycle_stage: string;
  profitability_band: string;
  digital_maturity_score: number;
  marketing_consent: boolean;
  kyc_risk_level: string;
  primary_branch_id: string;
  preferred_channel: string;
  churn_risk_score: number;
  relationship_value_try: number;
}

interface AccountSeed extends Row {
  account_id: string;
  customer_id: string;
  product_id: string;
  branch_id: string;
  account_type: string;
  balance_try: number;
  opened_at: string;
  status: string;
}

const anchor = new Date("2026-05-14T00:00:00.000Z");
const segments = ["Mass", "Affluent", "SME", "Young", "Private", "Micro"] as const;
const cities = ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana", "Konya", "Gaziantep"] as const;
const incomeBands = ["low", "mid", "upper_mid", "high"] as const;
const acquisitionChannels = ["mobile", "branch", "marketplace", "web", "relationship_manager"] as const;
const channels = ["mobile", "web", "branch", "atm", "call_center", "marketplace"] as const;
const branches = [
  ["BR001", "Istanbul Levent", "Marmara"],
  ["BR002", "Istanbul Kadikoy", "Marmara"],
  ["BR003", "Istanbul Bakirkoy", "Marmara"],
  ["BR004", "Izmir Alsancak", "Ege"],
  ["BR005", "Izmir Karsiyaka", "Ege"],
  ["BR006", "Ankara Cankaya", "Ic Anadolu"],
  ["BR007", "Ankara Sogutozu", "Ic Anadolu"],
  ["BR008", "Bursa Nilufer", "Marmara"],
  ["BR009", "Antalya Lara", "Akdeniz"],
  ["BR010", "Adana Seyhan", "Akdeniz"],
  ["BR011", "Konya Meram", "Ic Anadolu"],
  ["BR012", "Gaziantep Sahinbey", "Guneydogu"],
  ["BR013", "Kocaeli Gebze", "Marmara"],
  ["BR014", "Mersin Yenisehir", "Akdeniz"],
  ["BR015", "Kayseri Melikgazi", "Ic Anadolu"],
  ["BR016", "Eskisehir Tepebasi", "Ic Anadolu"],
  ["BR017", "Samsun Atakum", "Karadeniz"],
  ["BR018", "Trabzon Ortahisar", "Karadeniz"],
  ["BR019", "Diyarbakir Kayapinar", "Guneydogu"],
  ["BR020", "Mugla Bodrum", "Ege"]
] as const;
const products = [
  ["PRD001", "Current Account", "deposit", "TRY"],
  ["PRD002", "Deposit", "deposit", "TRY"],
  ["PRD003", "Credit Card", "card", "TRY"],
  ["PRD004", "Consumer Loan", "loan", "TRY"],
  ["PRD005", "Mortgage", "loan", "TRY"],
  ["PRD006", "SME Working Capital Loan", "loan", "TRY"],
  ["PRD007", "POS Merchant Bundle", "merchant", "TRY"],
  ["PRD008", "Investment Account", "investment", "TRY"]
] as const;
const campaignNames = ["Spring Digital Loan", "Premium Card Upgrade", "SME POS Bundle", "Deposit Boost", "Mobile Winback"] as const;
const complaintTopics = ["Card decline", "Mobile login", "Loan pricing", "Transfer delay", "Branch waiting", "Limit management"] as const;
const fraudTypes = ["account_takeover", "card_testing", "synthetic_identity", "merchant_collusion", "social_engineering"] as const;
const competitors = ["Competitor A", "Competitor B", "Competitor C", "Competitor D"] as const;
const marketProducts = ["Consumer Loan", "SME Working Capital Loan", "Deposit", "Credit Card", "Mortgage", "POS Merchant Bundle"] as const;
const personaTemplates: PersonaTemplate[] = [
  {
    persona_key: "mass_digital_salary",
    segment: "Mass",
    display_name: "Mass Digital Salary",
    description: "Payroll-led mass customer with mobile-first daily banking, moderate balances, and high card usage.",
    lifecycle_bias: "grow",
    primary_need: "salary_cashflow_and_card_limits",
    risk_bias: 46,
    digital_bias: 78,
    campaign_bias: 72,
    product_affinity: ["PRD001", "PRD003", "PRD004", "PRD002"],
    targetCount: 760,
    preferredChannels: ["mobile", "web", "atm"],
    lifecycleStages: ["onboarding", "grow", "retain", "reactivate"],
    profitabilityBands: ["low", "mid", "upper_mid"]
  },
  {
    persona_key: "affluent_investor",
    segment: "Affluent",
    display_name: "Affluent Investor",
    description: "High-balance customer with deposit, investment, and premium card appetite.",
    lifecycle_bias: "deepen",
    primary_need: "wealth_growth_and_deposit_pricing",
    risk_bias: 30,
    digital_bias: 68,
    campaign_bias: 64,
    product_affinity: ["PRD002", "PRD008", "PRD003", "PRD005"],
    targetCount: 390,
    preferredChannels: ["mobile", "branch", "relationship_manager"],
    lifecycleStages: ["deepen", "retain", "grow"],
    profitabilityBands: ["upper_mid", "high"]
  },
  {
    persona_key: "sme_merchant",
    segment: "SME",
    display_name: "SME Merchant",
    description: "Merchant and working-capital customer with POS, cashflow, and credit exposure patterns.",
    lifecycle_bias: "grow",
    primary_need: "merchant_cashflow_and_pos_financing",
    risk_bias: 62,
    digital_bias: 58,
    campaign_bias: 56,
    product_affinity: ["PRD007", "PRD006", "PRD001", "PRD003"],
    targetCount: 420,
    preferredChannels: ["relationship_manager", "branch", "web"],
    lifecycleStages: ["onboarding", "grow", "watchlist", "retain"],
    profitabilityBands: ["mid", "upper_mid", "high"]
  },
  {
    persona_key: "young_mobile_first",
    segment: "Young",
    display_name: "Young Mobile First",
    description: "Low-to-mid balance customer with high mobile engagement, card growth, and churn sensitivity.",
    lifecycle_bias: "activate",
    primary_need: "mobile_engagement_and_first_credit",
    risk_bias: 52,
    digital_bias: 88,
    campaign_bias: 82,
    product_affinity: ["PRD003", "PRD004", "PRD001", "PRD002"],
    targetCount: 430,
    preferredChannels: ["mobile", "marketplace", "web"],
    lifecycleStages: ["onboarding", "activate", "grow", "reactivate"],
    profitabilityBands: ["low", "mid"]
  },
  {
    persona_key: "private_wealth",
    segment: "Private",
    display_name: "Private Wealth",
    description: "Relationship-managed high value customer with wealth, mortgage, and retention expectations.",
    lifecycle_bias: "retain",
    primary_need: "private_banking_retention",
    risk_bias: 24,
    digital_bias: 54,
    campaign_bias: 48,
    product_affinity: ["PRD008", "PRD002", "PRD005", "PRD003"],
    targetCount: 160,
    preferredChannels: ["relationship_manager", "branch", "mobile"],
    lifecycleStages: ["deepen", "retain", "watchlist"],
    profitabilityBands: ["high"]
  },
  {
    persona_key: "micro_merchant",
    segment: "Micro",
    display_name: "Micro Merchant",
    description: "Small merchant with volatile transaction flow, POS dependency, and price sensitivity.",
    lifecycle_bias: "stabilize",
    primary_need: "simple_pos_and_short_term_liquidity",
    risk_bias: 58,
    digital_bias: 62,
    campaign_bias: 60,
    product_affinity: ["PRD007", "PRD001", "PRD006", "PRD004"],
    targetCount: 340,
    preferredChannels: ["mobile", "branch", "marketplace"],
    lifecycleStages: ["activate", "grow", "watchlist", "reactivate"],
    profitabilityBands: ["low", "mid", "upper_mid"]
  }
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the banking demo dataset.");
  }

  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const schemaSql = await loadMigrationSql(root);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const dataset = buildBankingDemoDataset(42);

  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await client.query(`
      TRUNCATE
        customer_offer_eligibility,
        customer_events,
        customer_profiles,
        synthetic_customer_templates,
        market_rates,
        treasury_rates,
        collections_cases,
        fraud_alerts,
        complaints,
        campaign_events,
        branch_performance,
        mobile_retention,
        digital_sessions,
        risk_monitoring,
        loan_portfolio,
        loan_applications,
        card_transactions,
        bank_transactions,
        bank_accounts,
        bank_products,
        bank_customers
      RESTART IDENTITY CASCADE
    `);
    await insertRows(client, "synthetic_customer_templates", dataset.syntheticCustomerTemplates);
    await insertRows(client, "bank_customers", dataset.customers);
    await insertRows(client, "bank_products", dataset.products);
    await insertRows(client, "customer_profiles", dataset.customerProfiles);
    await insertRows(client, "bank_accounts", dataset.accounts);
    await insertRows(client, "bank_transactions", dataset.transactions);
    await insertRows(client, "card_transactions", dataset.cardTransactions);
    await insertRows(client, "loan_applications", dataset.loanApplications);
    await insertRows(client, "loan_portfolio", dataset.loanPortfolio);
    await insertRows(client, "risk_monitoring", dataset.riskMonitoring);
    await insertRows(client, "digital_sessions", dataset.digitalSessions);
    await insertRows(client, "mobile_retention", dataset.mobileRetention);
    await insertRows(client, "branch_performance", dataset.branchPerformance);
    await insertRows(client, "campaign_events", dataset.campaignEvents);
    await insertRows(client, "complaints", dataset.complaints);
    await insertRows(client, "fraud_alerts", dataset.fraudAlerts);
    await insertRows(client, "collections_cases", dataset.collectionsCases);
    await insertRows(client, "treasury_rates", dataset.treasuryRates);
    await insertRows(client, "market_rates", dataset.marketRates);
    await insertRows(client, "customer_events", dataset.customerEvents);
    await insertRows(client, "customer_offer_eligibility", dataset.customerOfferEligibility);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  const counts = {
    syntheticCustomerTemplates: dataset.syntheticCustomerTemplates.length,
    customers: dataset.customers.length,
    customerProfiles: dataset.customerProfiles.length,
    accounts: dataset.accounts.length,
    transactions: dataset.transactions.length,
    cardTransactions: dataset.cardTransactions.length,
    loanApplications: dataset.loanApplications.length,
    loanPortfolio: dataset.loanPortfolio.length,
    riskMonitoring: dataset.riskMonitoring.length,
    digitalSessions: dataset.digitalSessions.length,
    mobileRetention: dataset.mobileRetention.length,
    branchPerformance: dataset.branchPerformance.length,
    campaignEvents: dataset.campaignEvents.length,
    complaints: dataset.complaints.length,
    fraudAlerts: dataset.fraudAlerts.length,
    collectionsCases: dataset.collectionsCases.length,
    treasuryRates: dataset.treasuryRates.length,
    marketRates: dataset.marketRates.length,
    customerEvents: dataset.customerEvents.length,
    customerOfferEligibility: dataset.customerOfferEligibility.length
  };
  console.log(`Seeded synthetic banking demo dataset (${Object.values(counts).reduce((sum, count) => sum + count, 0)} rows).`);
  console.table(counts);
}

export function buildBankingDemoDataset(seed = 42) {
  const random = createPrng(seed);
  const customerSeeds = buildCustomers(random);
  const customerRows = customerSeeds.map(toBankCustomerRow);
  const productRows = products.map(([product_id, product_name, product_family, currency]) => ({ product_id, product_name, product_family, currency }));
  const customerProfiles = buildCustomerProfiles(customerSeeds);
  const accounts = buildAccounts(random, customerSeeds);
  const transactions = buildTransactions(random, customerSeeds, accounts);
  const cardTransactions = buildCardTransactions(random, customerSeeds);
  const loanApplications = buildLoanApplications(random, customerSeeds);
  const loanPortfolio = buildLoanPortfolio(random, customerSeeds);
  const riskMonitoring = buildRiskMonitoring(random);
  const digitalSessions = buildDigitalSessions(random, customerSeeds);
  const mobileRetention = buildMobileRetention(random);
  const branchPerformance = buildBranchPerformance(random);
  const campaignEvents = buildCampaignEvents(random);
  const complaints = buildComplaints(random, customerSeeds);
  const fraudAlerts = buildFraudAlerts(random, customerSeeds);
  const collectionsCases = buildCollectionsCases(random, customerSeeds);
  const treasuryRates = buildTreasuryRates(random);
  const marketRates = buildMarketRates(random);
  const customerEvents = buildCustomerEvents(random, customerSeeds);
  const customerOfferEligibility = buildCustomerOfferEligibility(random, customerSeeds);
  return {
    syntheticCustomerTemplates: buildSyntheticCustomerTemplates(),
    customers: customerRows,
    customerProfiles,
    products: productRows,
    accounts,
    transactions,
    cardTransactions,
    loanApplications,
    loanPortfolio,
    riskMonitoring,
    digitalSessions,
    mobileRetention,
    branchPerformance,
    campaignEvents,
    complaints,
    fraudAlerts,
    collectionsCases,
    treasuryRates,
    marketRates,
    customerEvents,
    customerOfferEligibility
  };
}

async function loadMigrationSql(root: string): Promise<string> {
  const migrationsRoot = resolve(root, "prisma/migrations");
  const migrationDirs = [
    "000002_banking_demo_dataset",
    "000003_dataset_summary_view",
    "000004_customer_scenario_templates"
  ];
  const files = await Promise.all(
    migrationDirs.map((dir) => readFile(resolve(migrationsRoot, dir, "migration.sql"), "utf8"))
  );
  return files.join("\n\n");
}

function buildSyntheticCustomerTemplates(): Row[] {
  return personaTemplates.map((template) => ({
    persona_key: template.persona_key,
    segment: template.segment,
    display_name: template.display_name,
    description: template.description,
    lifecycle_bias: template.lifecycle_bias,
    primary_need: template.primary_need,
    risk_bias: template.risk_bias,
    digital_bias: template.digital_bias,
    campaign_bias: template.campaign_bias,
    product_affinity: JSON.stringify(template.product_affinity)
  }));
}

function buildCustomers(random: () => number): CustomerSeed[] {
  return Array.from({ length: 2500 }, (_, index) => {
    const template = personaForIndex(index);
    const relationshipValue = relationshipValueFor(template, random);
    const lifecycleStage = pick(template.lifecycleStages, random);
    const digitalScore = round(range(random, template.digital_bias - 16, template.digital_bias + 14), 2);
    const churnRisk = round(churnRiskFor(template, lifecycleStage, random), 2);
    const riskScore = round(riskScoreFor(template, random), 2);
    return {
      customer_id: id("CUST", index),
      segment: template.segment,
      city: pick(cities, random),
      age_band: ageBandFor(template, random),
      income_band: incomeBandFor(template, random),
      acquisition_channel: acquisitionChannelFor(template, random),
      risk_score: riskScore,
      product_count: productCountFor(template, random),
      is_active: random() > 0.08,
      created_at: daysAgo(Math.floor(range(random, 30, 2400))),
      persona_key: template.persona_key,
      lifecycle_stage: lifecycleStage,
      profitability_band: pick(template.profitabilityBands, random),
      digital_maturity_score: Math.max(1, Math.min(99, digitalScore)),
      marketing_consent: random() < template.campaign_bias / 100,
      kyc_risk_level: riskScore > 68 ? "high" : riskScore > 45 ? "medium" : "low",
      primary_branch_id: pick(branches, random)[0],
      preferred_channel: pick(template.preferredChannels, random),
      churn_risk_score: Math.max(1, Math.min(99, churnRisk)),
      relationship_value_try: relationshipValue
    };
  });
}

function toBankCustomerRow(customer: CustomerSeed): Row {
  return {
    customer_id: customer.customer_id,
    segment: customer.segment,
    city: customer.city,
    age_band: customer.age_band,
    income_band: customer.income_band,
    acquisition_channel: customer.acquisition_channel,
    risk_score: customer.risk_score,
    product_count: customer.product_count,
    is_active: customer.is_active,
    created_at: customer.created_at
  };
}

function buildCustomerProfiles(customers: CustomerSeed[]): Row[] {
  return customers.map((customer) => ({
    customer_id: customer.customer_id,
    persona_key: customer.persona_key,
    lifecycle_stage: customer.lifecycle_stage,
    profitability_band: customer.profitability_band,
    digital_maturity_score: customer.digital_maturity_score,
    marketing_consent: customer.marketing_consent,
    kyc_risk_level: customer.kyc_risk_level,
    primary_branch_id: customer.primary_branch_id,
    preferred_channel: customer.preferred_channel,
    churn_risk_score: customer.churn_risk_score,
    relationship_value_try: customer.relationship_value_try
  }));
}

function personaForIndex(index: number): PersonaTemplate {
  let cursor = 0;
  for (const template of personaTemplates) {
    cursor += template.targetCount;
    if (index < cursor) return template;
  }
  return personaTemplates.at(-1)!;
}

function ageBandFor(template: PersonaTemplate, random: () => number): string {
  if (template.persona_key === "young_mobile_first") return pick(["18-25", "26-35"], random);
  if (template.persona_key === "private_wealth") return pick(["46-60", "60+"], random);
  if (template.segment === "SME" || template.segment === "Micro") return pick(["26-35", "36-45", "46-60"], random);
  return pick(["26-35", "36-45", "46-60", "60+"], random);
}

function incomeBandFor(template: PersonaTemplate, random: () => number): string {
  if (template.segment === "Private") return "high";
  if (template.segment === "Affluent") return pick(["upper_mid", "high"], random);
  if (template.segment === "Young") return pick(["low", "mid"], random);
  if (template.segment === "SME") return pick(["mid", "upper_mid", "high"], random);
  return pick(incomeBands, random);
}

function acquisitionChannelFor(template: PersonaTemplate, random: () => number): string {
  if (template.persona_key === "private_wealth") return pick(["relationship_manager", "branch"], random);
  if (template.persona_key === "young_mobile_first") return pick(["mobile", "marketplace", "web"], random);
  if (template.segment === "SME") return pick(["relationship_manager", "branch", "web"], random);
  return pick(acquisitionChannels, random);
}

function riskScoreFor(template: PersonaTemplate, random: () => number): number {
  return Math.max(8, Math.min(92, range(random, template.risk_bias - 14, template.risk_bias + 18)));
}

function productCountFor(template: PersonaTemplate, random: () => number): number {
  const maxProducts = template.segment === "Private" ? 8 : template.segment === "Affluent" ? 6 : template.segment === "SME" ? 6 : 5;
  return Math.max(1, Math.floor(range(random, 2, maxProducts)));
}

function relationshipValueFor(template: PersonaTemplate, random: () => number): number {
  const value = template.segment === "Private"
    ? range(random, 900_000, 8_500_000)
    : template.segment === "Affluent"
      ? range(random, 180_000, 1_900_000)
      : template.segment === "SME"
        ? range(random, 120_000, 2_800_000)
        : template.segment === "Micro"
          ? range(random, 45_000, 780_000)
          : template.segment === "Young"
            ? range(random, 8_000, 180_000)
            : range(random, 18_000, 420_000);
  return round(value, 2);
}

function churnRiskFor(template: PersonaTemplate, lifecycleStage: string, random: () => number): number {
  const stagePressure = lifecycleStage === "reactivate" ? 22 : lifecycleStage === "watchlist" ? 18 : lifecycleStage === "retain" ? 10 : 0;
  const digitalRelief = template.digital_bias > 75 ? -7 : 0;
  return range(random, 18, 54) + stagePressure + digitalRelief;
}

function buildAccounts(random: () => number, customers: CustomerSeed[]): AccountSeed[] {
  return Array.from({ length: 4000 }, (_, index) => {
    const customer = pick(customers, random);
    const product = pick(products.slice(0, 5), random);
    return {
      account_id: id("ACC", index),
      customer_id: customer.customer_id,
      product_id: product[0],
      branch_id: pick(branches, random)[0],
      account_type: product[2],
      balance_try: round(range(random, 500, customer.segment === "Affluent" || customer.segment === "Private" ? 850000 : 160000), 2),
      opened_at: daysAgo(Math.floor(range(random, 15, 2200))),
      status: random() > 0.05 ? "active" : "dormant"
    };
  });
}

function buildTransactions(random: () => number, customers: CustomerSeed[], accounts: AccountSeed[]): Row[] {
  const merchantCategories = ["grocery", "marketplace", "travel", "utilities", "loan_payment", "investment", "cash_withdrawal"];
  return Array.from({ length: 40000 }, (_, index) => {
    const account = pick(accounts, random);
    const customer = customers.find((item) => item.customer_id === account.customer_id) ?? customers[0]!;
    const productId = String(account.product_id);
    const channel = pick(channels, random);
    const amountBase = productId === "PRD005" || productId === "PRD006" ? 40000 : 4500;
    return {
      transaction_id: id("TXN", index),
      customer_id: customer.customer_id,
      account_id: account.account_id,
      product_id: productId,
      channel,
      transaction_type: pick(["purchase", "transfer", "loan_disbursement", "bill_payment", "deposit"], random),
      amount_try: round(range(random, 50, amountBase), 2),
      transaction_date: daysAgo(Math.floor(range(random, 0, 180))),
      status: random() > 0.035 ? "successful" : "failed",
      merchant_category: pick(merchantCategories, random),
      city: customer.city,
      is_marketplace: channel === "marketplace" || random() < 0.18
    };
  });
}

function buildCardTransactions(random: () => number, customers: CustomerSeed[]): Row[] {
  return Array.from({ length: 12000 }, (_, index) => {
    const customer = pick(customers, random);
    const channel = pick(["Sanal POS", "Mobile Wallet", "E-Commerce", "Physical POS"], random);
    const approved = random() > (channel === "Sanal POS" ? 0.24 : 0.14);
    return {
      card_txn_id: id("CARDTXN", index),
      customer_id: customer.customer_id,
      segment: customer.segment,
      channel,
      amount_try: round(range(random, 40, customer.segment === "Affluent" ? 12500 : 4200), 2),
      approved,
      decline_reason: approved ? "none" : pick(["insufficient_limit", "issuer_timeout", "fraud_rule", "expired_card"], random),
      transaction_date: daysAgo(Math.floor(range(random, 0, 45))),
      hour_band: pick(["00:00-06:00", "06:00-12:00", "12:00-18:00", "18:00-24:00"], random),
      merchant_category: pick(["grocery", "electronics", "travel", "marketplace", "fuel", "restaurant"], random)
    };
  });
}

function buildLoanApplications(random: () => number, customers: CustomerSeed[]): Row[] {
  return Array.from({ length: 3000 }, (_, index) => {
    const customer = pick(customers, random);
    const productId = pick(["PRD004", "PRD005", "PRD006"], random);
    const dti = range(random, 18, 72);
    const approved = dti < 55 && Number(customer.risk_score) < 68 && random() > 0.18;
    return {
      application_id: id("APP", index),
      customer_id: customer.customer_id,
      product_id: productId,
      channel: pick(["mobile", "branch", "marketplace", "relationship_manager"], random),
      requested_amount_try: round(range(random, productId === "PRD005" ? 600000 : 25000, productId === "PRD005" ? 4500000 : 650000), 2),
      approved,
      rejection_reason: approved ? "none" : pick(["high_dti", "low_score", "policy_rule", "missing_document"], random),
      application_date: daysAgo(Math.floor(range(random, 0, 180))),
      credit_score_bucket: pick(["A", "B", "C", "D"], random),
      dti_pct: round(dti, 2)
    };
  });
}

function buildLoanPortfolio(random: () => number, customers: CustomerSeed[]): Row[] {
  return Array.from({ length: 1200 }, (_, index) => {
    const customer = pick(customers, random);
    const productId = pick(["PRD004", "PRD005", "PRD006"], random);
    const riskBand = Number(customer.risk_score) > 65 ? "High" : Number(customer.risk_score) > 42 ? "Medium" : "Low";
    const outstanding = range(random, productId === "PRD005" ? 500000 : 15000, productId === "PRD005" ? 4000000 : 900000);
    const overdueMultiplier = riskBand === "High" ? range(random, 0.04, 0.22) : riskBand === "Medium" ? range(random, 0.01, 0.09) : range(random, 0, 0.03);
    return {
      loan_id: id("LOAN", index),
      customer_id: customer.customer_id,
      product_id: productId,
      segment: customer.segment,
      risk_band: riskBand,
      outstanding_balance_try: round(outstanding, 2),
      overdue_balance_try: round(outstanding * overdueMultiplier, 2),
      dpd_bucket: overdueMultiplier > 0.14 ? "90+" : overdueMultiplier > 0.08 ? "61-90" : overdueMultiplier > 0.025 ? "31-60" : "0-30",
      interest_rate_pct: round(productId === "PRD005" ? range(random, 2.7, 3.6) : range(random, 3.2, 4.4), 2),
      origination_date: daysAgo(Math.floor(range(random, 60, 1800))),
      status: overdueMultiplier > 0.18 ? "watchlist" : "active"
    };
  });
}

function buildRiskMonitoring(random: () => number): Row[] {
  const rows: Row[] = [];
  for (let month = 0; month < 14; month += 1) {
    for (const segment of segments) {
      for (const productName of marketProducts.slice(0, 5)) {
        const exposure = range(random, 25_000_000, segment === "SME" ? 280_000_000 : 190_000_000);
        const ratio = range(random, segment === "SME" ? 5.5 : 1.8, segment === "SME" ? 13.8 : 9.4);
        rows.push({
          risk_id: `RISK_${month}_${segment}_${productName}`.replace(/\W/g, "_"),
          report_date: monthStart(month),
          segment,
          product_name: productName,
          risk_band: ratio > 9 ? "High" : ratio > 5 ? "Medium" : "Low",
          active_customer_count: Math.floor(range(random, 300, 18000)),
          exposure_try: round(exposure, 2),
          overdue_balance_try: round(exposure * ratio / 100, 2),
          npl_ratio_pct: round(ratio, 2),
          early_warning_count: Math.floor(range(random, 5, 420))
        });
      }
    }
  }
  return rows;
}

function buildDigitalSessions(random: () => number, customers: CustomerSeed[]): Row[] {
  return Array.from({ length: 8000 }, (_, index) => {
    const customer = pick(customers, random);
    const count = Math.floor(range(random, 1, 18));
    return {
      session_id: id("SESSION", index),
      customer_id: customer.customer_id,
      segment: customer.segment,
      channel: pick(["mobile", "web"], random),
      session_date: daysAgo(Math.floor(range(random, 0, 120))),
      session_count: count,
      successful_login_count: Math.max(0, count - Math.floor(range(random, 0, 3))),
      digital_sales_try: round(random() > 0.82 ? range(random, 150, 35000) : 0, 2),
      journey: pick(["login", "loan_application", "card_limit", "money_transfer", "investment"], random),
      device_os: pick(["iOS", "Android", "Web"], random)
    };
  });
}

function buildMobileRetention(random: () => number): Row[] {
  const rows: Row[] = [];
  for (let month = 0; month < 12; month += 1) {
    for (const segment of segments) {
      for (const channel of ["mobile", "marketplace"] as const) {
        const active = Math.floor(range(random, 600, segment === "Mass" ? 16000 : 6500));
        const retained30 = range(random, 62, 88);
        rows.push({
          cohort_month: monthStart(month),
          segment,
          acquisition_channel: channel,
          active_customers: active,
          retained_30d_pct: round(retained30, 2),
          retained_90d_pct: round(retained30 - range(random, 8, 19), 2),
          expected_revenue_try: round(active * range(random, 900, 3400), 2),
          churn_risk_score: round(range(random, 18, 62), 2)
        });
      }
    }
  }
  return rows;
}

function buildBranchPerformance(random: () => number): Row[] {
  const rows: Row[] = [];
  for (let month = 0; month < 24; month += 1) {
    for (const [branch_id, branch_name, branch_region] of branches) {
      rows.push({
        branch_id,
        branch_name,
        branch_region,
        report_month: monthStart(month),
        active_customers: Math.floor(range(random, 2500, 22000)),
        deposit_balance_try: round(range(random, 120_000_000, 1_900_000_000), 2),
        loan_balance_try: round(range(random, 80_000_000, 1_250_000_000), 2),
        new_products_sold: Math.floor(range(random, 120, 2600)),
        complaint_count: Math.floor(range(random, 2, 68)),
        nps_score: round(range(random, 42, 72), 2)
      });
    }
  }
  return rows;
}

function buildCampaignEvents(random: () => number): Row[] {
  return Array.from({ length: 1500 }, (_, index) => {
    const impressions = Math.floor(range(random, 400, 52000));
    const clicks = Math.floor(impressions * range(random, 0.02, 0.18));
    const conversions = Math.floor(clicks * range(random, 0.03, 0.16));
    return {
      campaign_id: id("CAMP", index),
      campaign_name: pick(campaignNames, random),
      segment: pick(segments, random),
      channel: pick(["mobile", "email", "sms", "relationship_manager", "web"], random),
      event_date: daysAgo(Math.floor(range(random, 0, 120))),
      impressions,
      clicks,
      conversions,
      revenue_try: round(conversions * range(random, 850, 12500), 2),
      opt_out_count: Math.floor(impressions * range(random, 0.001, 0.009))
    };
  });
}

function buildComplaints(random: () => number, customers: CustomerSeed[]): Row[] {
  return Array.from({ length: 600 }, (_, index) => {
    const customer = pick(customers, random);
    const status = pick(["open", "in_progress", "closed"], random);
    return {
      complaint_id: id("CMP", index),
      customer_id: customer.customer_id,
      segment: customer.segment,
      topic: pick(complaintTopics, random),
      priority: pick(["LOW", "MEDIUM", "HIGH"], random),
      status,
      opened_at: daysAgo(Math.floor(range(random, 0, 120))),
      resolution_hours: status === "closed" ? round(range(random, 2, 72), 2) : round(range(random, 8, 96), 2),
      channel: pick(["mobile", "web", "call_center", "branch"], random)
    };
  });
}

function buildFraudAlerts(random: () => number, customers: CustomerSeed[]): Row[] {
  return Array.from({ length: 700 }, (_, index) => {
    const confirmed = random() > 0.68;
    return {
      alert_id: id("FRAUD", index),
      customer_id: pick(customers, random).customer_id,
      fraud_type: pick(fraudTypes, random),
      severity: pick(["LOW", "MEDIUM", "HIGH", "CRITICAL"], random),
      status: confirmed ? "confirmed" : pick(["open", "dismissed", "investigating"], random),
      amount_at_risk_try: round(range(random, 500, 850000), 2),
      confirmed,
      alert_date: daysAgo(Math.floor(range(random, 0, 120))),
      channel: pick(["card", "mobile", "web", "merchant"], random)
    };
  });
}

function buildCollectionsCases(random: () => number, customers: CustomerSeed[]): Row[] {
  return Array.from({ length: 500 }, (_, index) => {
    const customer = pick(customers, random);
    const exposure = range(random, 2500, customer.segment === "SME" ? 1_200_000 : 180_000);
    const recovered = exposure * range(random, 0.02, 0.42);
    return {
      case_id: id("COLL", index),
      customer_id: customer.customer_id,
      segment: customer.segment,
      bucket: pick(["1-30 DPD", "31-60 DPD", "61-90 DPD", "90+ DPD"], random),
      exposure_try: round(exposure, 2),
      recovered_try: round(recovered, 2),
      promise_to_pay: random() > 0.55,
      status: pick(["open", "promise", "recovered", "legal"], random),
      opened_at: daysAgo(Math.floor(range(random, 0, 240)))
    };
  });
}

function buildTreasuryRates(random: () => number): Row[] {
  const rows: Row[] = [];
  for (let day = 0; day < 30; day += 1) {
    for (const productName of marketProducts) {
      const base = productName === "Deposit" ? range(random, 42, 49) : range(random, 2.6, 4.4);
      rows.push({
        rate_date: daysAgo(day),
        product_name: productName,
        internal_rate_pct: round(base, 2),
        funding_cost_pct: round(productName === "Deposit" ? base - range(random, 2, 5) : range(random, 37, 45), 2),
        liquidity_buffer_pct: round(range(random, 8, 18), 2)
      });
    }
  }
  return rows;
}

function buildMarketRates(random: () => number): Row[] {
  const rows: Row[] = [];
  for (let day = 0; day < 30; day += 1) {
    for (const competitor of competitors) {
      for (const productName of marketProducts) {
        const isDeposit = productName === "Deposit";
        rows.push({
          rate_date: daysAgo(day),
          competitor,
          product_name: productName,
          interest_rate_pct: round(isDeposit ? range(random, 41, 50.5) : range(random, 2.7, 4.6), 2),
          confidence_score: round(range(random, 0.62, 0.92), 2),
          source_name: "governed_demo_feed"
        });
      }
    }
  }
  return rows;
}

function buildCustomerEvents(random: () => number, customers: CustomerSeed[]): Row[] {
  const eventTypesByStage: Record<string, readonly string[]> = {
    onboarding: ["account_opened", "first_login", "first_product_activation"],
    activate: ["mobile_activation", "card_first_use", "marketplace_visit"],
    grow: ["salary_inflow", "cross_sell_signal", "limit_review"],
    deepen: ["wealth_review", "deposit_rollover", "investment_interest"],
    retain: ["relationship_review", "service_recovery", "loyalty_offer"],
    reactivate: ["dormancy_warning", "winback_offer", "low_activity_signal"],
    watchlist: ["risk_watchlist", "overdue_signal", "manual_review"]
  };
  return customers.flatMap((customer, customerIndex) => {
    const eventTypes = eventTypesByStage[customer.lifecycle_stage] ?? ["relationship_signal", "product_signal", "service_signal"];
    return Array.from({ length: 3 }, (_, eventIndex) => {
      const eventType = eventTypes[eventIndex % eventTypes.length]!;
      const value = eventType.includes("risk") || eventType.includes("overdue")
        ? range(random, 5_000, 480_000)
        : eventType.includes("wealth") || eventType.includes("deposit")
          ? range(random, 25_000, 1_600_000)
          : range(random, 250, 95_000);
      return {
        event_id: `EVT_${String(customerIndex + 1).padStart(6, "0")}_${eventIndex + 1}`,
        customer_id: customer.customer_id,
        event_type: eventType,
        event_date: daysAgo(Math.floor(range(random, 0, 180))),
        channel: customer.preferred_channel,
        severity: severityForEvent(eventType, customer, random),
        value_try: round(value, 2),
        metadata: JSON.stringify({
          persona_key: customer.persona_key,
          lifecycle_stage: customer.lifecycle_stage,
          source: "scenario_template"
        })
      };
    });
  });
}

function buildCustomerOfferEligibility(random: () => number, customers: CustomerSeed[]): Row[] {
  return customers.flatMap((customer, customerIndex) => {
    const template = personaTemplates.find((item) => item.persona_key === customer.persona_key) ?? personaTemplates[0]!;
    return template.product_affinity.slice(0, 3).map((productId, offerIndex) => {
      const rawScore = template.campaign_bias + Number(customer.digital_maturity_score) * 0.22 - Number(customer.churn_risk_score) * 0.18 + range(random, -12, 14);
      const score = Math.max(1, Math.min(99, round(rawScore, 2)));
      const eligible = Boolean(customer.marketing_consent) && score >= (customer.kyc_risk_level === "high" ? 74 : 58);
      return {
        eligibility_id: `ELIG_${String(customerIndex + 1).padStart(6, "0")}_${offerIndex + 1}`,
        customer_id: customer.customer_id,
        offer_key: offerKeyForProduct(productId),
        product_id: productId,
        score,
        eligible,
        reason: eligible ? reasonForOffer(productId, customer) : customer.marketing_consent ? "risk_or_low_propensity" : "marketing_consent_missing",
        expires_at: daysAgo(-Math.floor(range(random, 15, 75)))
      };
    });
  });
}

function severityForEvent(eventType: string, customer: CustomerSeed, random: () => number): string {
  if (eventType.includes("risk") || eventType.includes("overdue")) return customer.kyc_risk_level === "high" ? "HIGH" : "MEDIUM";
  if (eventType.includes("warning") || eventType.includes("recovery")) return random() > 0.5 ? "MEDIUM" : "LOW";
  return "LOW";
}

function offerKeyForProduct(productId: string): string {
  const product = products.find((item) => item[0] === productId);
  return `offer_${String(product?.[1] ?? productId).toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function reasonForOffer(productId: string, customer: CustomerSeed): string {
  if (productId === "PRD006" || productId === "PRD007") return `${customer.persona_key}_merchant_cashflow_fit`;
  if (productId === "PRD008" || productId === "PRD002") return `${customer.persona_key}_balance_growth_fit`;
  if (productId === "PRD003") return `${customer.persona_key}_card_usage_fit`;
  return `${customer.persona_key}_lifecycle_fit`;
}

async function insertRows(client: pg.Client, table: string, rows: Row[], batchSize = 500): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!);
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: Array<string | number | boolean> = [];
    const placeholders = batch.map((row, rowIndex) => {
      const cells = columns.map((column, columnIndex) => {
        values.push(row[column]!);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${cells.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`,
      values
    );
  }
}

function createPrng(seed: number): () => number {
  let value = seed;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function range(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function daysAgo(days: number): string {
  const date = new Date(anchor);
  date.setUTCDate(anchor.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function monthStart(monthsAgo: number): string {
  const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - monthsAgo, 1));
  return date.toISOString().slice(0, 10);
}

function id(prefix: string, index: number): string {
  return `${prefix}_${String(index + 1).padStart(6, "0")}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
