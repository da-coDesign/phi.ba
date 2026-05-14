import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

type Row = Record<string, string | number | boolean>;

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

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the banking demo dataset.");
  }

  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const schemaSql = await readFile(resolve(root, "prisma/migrations/000002_banking_demo_dataset/migration.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const random = createPrng(42);

  const customers = buildCustomers(random);
  const productRows = products.map(([product_id, product_name, product_family, currency]) => ({ product_id, product_name, product_family, currency }));
  const accounts = buildAccounts(random, customers);
  const transactions = buildTransactions(random, customers, accounts);
  const cardTransactions = buildCardTransactions(random, customers);
  const loanApplications = buildLoanApplications(random, customers);
  const loanPortfolio = buildLoanPortfolio(random, customers);
  const riskMonitoring = buildRiskMonitoring(random);
  const digitalSessions = buildDigitalSessions(random, customers);
  const mobileRetention = buildMobileRetention(random);
  const branchPerformance = buildBranchPerformance(random);
  const campaignEvents = buildCampaignEvents(random);
  const complaints = buildComplaints(random, customers);
  const fraudAlerts = buildFraudAlerts(random, customers);
  const collectionsCases = buildCollectionsCases(random, customers);
  const treasuryRates = buildTreasuryRates(random);
  const marketRates = buildMarketRates(random);

  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await client.query(`
      TRUNCATE
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
    await insertRows(client, "bank_customers", customers);
    await insertRows(client, "bank_products", productRows);
    await insertRows(client, "bank_accounts", accounts);
    await insertRows(client, "bank_transactions", transactions);
    await insertRows(client, "card_transactions", cardTransactions);
    await insertRows(client, "loan_applications", loanApplications);
    await insertRows(client, "loan_portfolio", loanPortfolio);
    await insertRows(client, "risk_monitoring", riskMonitoring);
    await insertRows(client, "digital_sessions", digitalSessions);
    await insertRows(client, "mobile_retention", mobileRetention);
    await insertRows(client, "branch_performance", branchPerformance);
    await insertRows(client, "campaign_events", campaignEvents);
    await insertRows(client, "complaints", complaints);
    await insertRows(client, "fraud_alerts", fraudAlerts);
    await insertRows(client, "collections_cases", collectionsCases);
    await insertRows(client, "treasury_rates", treasuryRates);
    await insertRows(client, "market_rates", marketRates);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  const counts = {
    customers: customers.length,
    accounts: accounts.length,
    transactions: transactions.length,
    cardTransactions: cardTransactions.length,
    loanApplications: loanApplications.length,
    loanPortfolio: loanPortfolio.length,
    riskMonitoring: riskMonitoring.length,
    digitalSessions: digitalSessions.length,
    mobileRetention: mobileRetention.length,
    branchPerformance: branchPerformance.length,
    campaignEvents: campaignEvents.length,
    complaints: complaints.length,
    fraudAlerts: fraudAlerts.length,
    collectionsCases: collectionsCases.length,
    treasuryRates: treasuryRates.length,
    marketRates: marketRates.length
  };
  console.log(`Seeded synthetic banking demo dataset (${Object.values(counts).reduce((sum, count) => sum + count, 0)} rows).`);
  console.table(counts);
}

function buildCustomers(random: () => number): Row[] {
  return Array.from({ length: 2500 }, (_, index) => {
    const segment = pick(segments, random);
    return {
      customer_id: id("CUST", index),
      segment,
      city: pick(cities, random),
      age_band: pick(["18-25", "26-35", "36-45", "46-60", "60+"], random),
      income_band: segment === "Affluent" || segment === "Private" ? pick(["upper_mid", "high"], random) : pick(incomeBands, random),
      acquisition_channel: pick(acquisitionChannels, random),
      risk_score: round(segment === "SME" ? range(random, 35, 78) : range(random, 18, 72), 2),
      product_count: Math.floor(range(random, 1, segment === "Private" ? 7 : 5)),
      is_active: random() > 0.08,
      created_at: daysAgo(Math.floor(range(random, 30, 2400)))
    };
  });
}

function buildAccounts(random: () => number, customers: Row[]): Row[] {
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

function buildTransactions(random: () => number, customers: Row[], accounts: Row[]): Row[] {
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

function buildCardTransactions(random: () => number, customers: Row[]): Row[] {
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

function buildLoanApplications(random: () => number, customers: Row[]): Row[] {
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

function buildLoanPortfolio(random: () => number, customers: Row[]): Row[] {
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

function buildDigitalSessions(random: () => number, customers: Row[]): Row[] {
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

function buildComplaints(random: () => number, customers: Row[]): Row[] {
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

function buildFraudAlerts(random: () => number, customers: Row[]): Row[] {
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

function buildCollectionsCases(random: () => number, customers: Row[]): Row[] {
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
