import type { JsonRecord } from "./platform-types.js";

export const BANKING_DEMO_ROW_COUNTS = {
  customers: 2500,
  accounts: 4000,
  transactions: 40000,
  cardTransactions: 12000,
  loanApplications: 3000,
  loanPortfolio: 1200,
  riskMonitoring: 420,
  digitalSessions: 8000,
  mobileRetention: 144,
  branchPerformance: 480,
  campaignEvents: 1500,
  complaints: 600,
  fraudAlerts: 700,
  collectionsCases: 500,
  treasuryRates: 180,
  marketRates: 720
} as const;

export const BANKING_BASE_TABLES = [
  "bank_customers",
  "bank_accounts",
  "bank_products",
  "bank_transactions",
  "card_transactions",
  "loan_applications",
  "loan_portfolio",
  "risk_monitoring",
  "digital_sessions",
  "mobile_retention",
  "branch_performance",
  "campaign_events",
  "complaints",
  "fraud_alerts",
  "collections_cases",
  "treasury_rates",
  "market_rates"
] as const;

export const BANKING_REPORTING_VIEWS = [
  "v_dataset_summary",
  "v_customer_360",
  "v_transaction_volume",
  "v_card_approval_daily",
  "v_credit_risk_snapshot",
  "v_mobile_retention",
  "v_branch_kpi",
  "v_campaign_conversion",
  "v_complaint_quality",
  "v_fraud_alerts",
  "v_collections_snapshot",
  "v_market_rate_comparison"
] as const;

export const BANKING_COMPAT_TABLES = ["islemler", "musteriler", "urunler", "risk_izleme", "kart_islemleri", "mobil_kullanim"] as const;

export const BANKING_ALLOWED_TABLES = [
  ...BANKING_BASE_TABLES,
  ...BANKING_REPORTING_VIEWS,
  ...BANKING_COMPAT_TABLES
];

export const BANKING_ALLOWED_COLUMNS: Record<string, string[]> = {
  bank_customers: ["customer_id", "segment", "city", "age_band", "income_band", "acquisition_channel", "risk_score", "product_count", "is_active", "created_at"],
  bank_accounts: ["account_id", "customer_id", "product_id", "branch_id", "account_type", "balance_try", "opened_at", "status"],
  bank_products: ["product_id", "product_name", "product_family", "currency"],
  bank_transactions: ["transaction_id", "customer_id", "account_id", "product_id", "channel", "transaction_type", "amount_try", "transaction_date", "status", "merchant_category", "city", "is_marketplace"],
  card_transactions: ["card_txn_id", "customer_id", "segment", "channel", "amount_try", "approved", "decline_reason", "transaction_date", "hour_band", "merchant_category"],
  loan_applications: ["application_id", "customer_id", "product_id", "channel", "requested_amount_try", "approved", "rejection_reason", "application_date", "credit_score_bucket", "dti_pct"],
  loan_portfolio: ["loan_id", "customer_id", "product_id", "segment", "risk_band", "outstanding_balance_try", "overdue_balance_try", "dpd_bucket", "interest_rate_pct", "origination_date", "status"],
  risk_monitoring: ["risk_id", "report_date", "segment", "product_name", "risk_band", "active_customer_count", "exposure_try", "overdue_balance_try", "npl_ratio_pct", "early_warning_count"],
  digital_sessions: ["session_id", "customer_id", "segment", "channel", "session_date", "session_count", "successful_login_count", "digital_sales_try", "journey", "device_os"],
  mobile_retention: ["cohort_month", "segment", "acquisition_channel", "active_customers", "retained_30d_pct", "retained_90d_pct", "expected_revenue_try", "churn_risk_score"],
  branch_performance: ["branch_id", "branch_name", "branch_region", "report_month", "active_customers", "deposit_balance_try", "loan_balance_try", "new_products_sold", "complaint_count", "nps_score"],
  campaign_events: ["campaign_id", "campaign_name", "segment", "channel", "event_date", "impressions", "clicks", "conversions", "revenue_try", "opt_out_count"],
  complaints: ["complaint_id", "customer_id", "segment", "topic", "priority", "status", "opened_at", "resolution_hours", "channel"],
  fraud_alerts: ["alert_id", "customer_id", "fraud_type", "severity", "status", "amount_at_risk_try", "confirmed", "alert_date", "channel"],
  collections_cases: ["case_id", "customer_id", "segment", "bucket", "exposure_try", "recovered_try", "promise_to_pay", "status", "opened_at"],
  treasury_rates: ["rate_date", "product_name", "internal_rate_pct", "funding_cost_pct", "liquidity_buffer_pct"],
  market_rates: ["rate_date", "competitor", "product_name", "interest_rate_pct", "confidence_score", "source_name"],
  v_customer_360: ["segment", "city", "customer_count", "active_customer_count", "avg_total_balance_try", "avg_risk_score", "avg_products"],
  v_transaction_volume: ["product_name", "segment", "channel", "txn_count", "txn_volume_try", "marketplace_volume_try", "successful_txn_count"],
  v_card_approval_daily: ["report_date", "channel", "segment", "decline_reason", "txn_count", "txn_volume_try", "approval_rate_pct", "rejected_txn_count", "lost_volume_try"],
  v_credit_risk_snapshot: ["product_name", "segment", "risk_band", "active_customer_count", "exposure_try", "overdue_balance_try", "npl_ratio_pct", "early_warning_count"],
  v_mobile_retention: ["cohort_month", "segment", "acquisition_channel", "active_customers", "retained_30d_pct", "retained_90d_pct", "expected_revenue_try", "churn_risk_score"],
  v_branch_kpi: ["branch_region", "branch_name", "active_customers", "deposit_balance_try", "loan_balance_try", "new_products_sold", "complaint_count", "nps_score"],
  v_campaign_conversion: ["campaign_name", "segment", "channel", "impressions", "clicks", "conversions", "conversion_rate_pct", "revenue_try", "opt_out_count"],
  v_complaint_quality: ["topic", "priority", "complaint_count", "open_cases", "avg_resolution_hours", "digital_share_pct"],
  v_fraud_alerts: ["fraud_type", "severity", "alert_count", "confirmed_count", "amount_at_risk_try", "confirmed_amount_try"],
  v_collections_snapshot: ["segment", "bucket", "case_count", "exposure_try", "recovered_try", "recovery_rate_pct", "promise_to_pay_count"],
  v_market_rate_comparison: ["rate_date", "competitor", "product_name", "interest_rate_pct", "internal_rate_pct", "spread_bps", "confidence_score"],
  v_dataset_summary: ["metric_name", "row_count", "description"],
  islemler: ["id", "musteri_id", "urun_id", "tutar", "durum", "gerceklesme_tarihi"],
  musteriler: ["id", "segment", "edinim_kanali"],
  urunler: ["id", "ad", "kategori"],
  risk_izleme: ["urun_adi", "segment", "npl_orani", "aktif_musteri", "riskli_bakiye", "rapor_donemi"],
  kart_islemleri: ["kanal", "saat_dilimi", "onay_orani", "reddedilen_islem", "kayip_hacim", "islem_tarihi"],
  mobil_kullanim: ["kohort", "segment", "retention_90d", "aktif_musteri", "beklenen_gelir", "edinim_kanali"]
};

type FallbackTopic =
  | "dataset"
  | "card"
  | "risk"
  | "mobile"
  | "branch"
  | "campaign"
  | "complaints"
  | "fraud"
  | "collections"
  | "market"
  | "customer"
  | "transactions";

const fallbackRows: Record<FallbackTopic, JsonRecord[]> = {
  dataset: [
    { metric_name: "customers", row_count: BANKING_DEMO_ROW_COUNTS.customers, description: "Synthetic banking demo customer records in FBDWHPRD." },
    { metric_name: "accounts", row_count: BANKING_DEMO_ROW_COUNTS.accounts, description: "Synthetic banking demo account records in FBDWHPRD." },
    { metric_name: "transactions", row_count: BANKING_DEMO_ROW_COUNTS.transactions, description: "Synthetic banking demo transaction records in FBDWHPRD." }
  ],
  card: [
    { report_date: "2026-05-13", channel: "Sanal POS", segment: "Mass", decline_reason: "insufficient_limit", txn_count: 8420, txn_volume_try: 18420000, approval_rate_pct: 71.8, rejected_txn_count: 2374, lost_volume_try: 5420000 },
    { report_date: "2026-05-13", channel: "Mobile Wallet", segment: "Young", decline_reason: "issuer_timeout", txn_count: 6110, txn_volume_try: 9240000, approval_rate_pct: 76.4, rejected_txn_count: 1442, lost_volume_try: 2110000 },
    { report_date: "2026-05-12", channel: "E-Commerce", segment: "Affluent", decline_reason: "fraud_rule", txn_count: 3920, txn_volume_try: 15680000, approval_rate_pct: 82.7, rejected_txn_count: 678, lost_volume_try: 1960000 }
  ],
  risk: [
    { product_name: "SME Working Capital Loan", segment: "SME", risk_band: "High", active_customer_count: 1840, exposure_try: 418000000, overdue_balance_try: 46800000, npl_ratio_pct: 11.2, early_warning_count: 214 },
    { product_name: "Consumer Loan", segment: "Mass", risk_band: "Medium", active_customer_count: 21400, exposure_try: 612000000, overdue_balance_try: 42700000, npl_ratio_pct: 7.0, early_warning_count: 486 },
    { product_name: "Mortgage", segment: "Affluent", risk_band: "Low", active_customer_count: 3860, exposure_try: 945000000, overdue_balance_try: 18900000, npl_ratio_pct: 2.0, early_warning_count: 38 }
  ],
  mobile: [
    { cohort_month: "2026-02-01", segment: "Young", acquisition_channel: "mobile", active_customers: 8400, retained_30d_pct: 78.6, retained_90d_pct: 62.4, expected_revenue_try: 18400000, churn_risk_score: 41.8 },
    { cohort_month: "2026-02-01", segment: "Mass", acquisition_channel: "mobile", active_customers: 12600, retained_30d_pct: 74.2, retained_90d_pct: 58.9, expected_revenue_try: 22600000, churn_risk_score: 47.5 },
    { cohort_month: "2026-01-01", segment: "Affluent", acquisition_channel: "branch_referral", active_customers: 2100, retained_30d_pct: 84.3, retained_90d_pct: 70.5, expected_revenue_try: 16200000, churn_risk_score: 28.4 }
  ],
  branch: [
    { branch_region: "Marmara", branch_name: "Istanbul Levent", active_customers: 18400, deposit_balance_try: 1640000000, loan_balance_try: 982000000, new_products_sold: 2140, complaint_count: 34, nps_score: 62.1 },
    { branch_region: "Ege", branch_name: "Izmir Alsancak", active_customers: 9800, deposit_balance_try: 734000000, loan_balance_try: 412000000, new_products_sold: 1180, complaint_count: 21, nps_score: 58.4 },
    { branch_region: "Ic Anadolu", branch_name: "Ankara Cankaya", active_customers: 12100, deposit_balance_try: 884000000, loan_balance_try: 538000000, new_products_sold: 1360, complaint_count: 25, nps_score: 60.7 }
  ],
  campaign: [
    { campaign_name: "Spring Digital Loan", segment: "Mass", channel: "mobile", impressions: 420000, clicks: 38600, conversions: 4120, conversion_rate_pct: 10.7, revenue_try: 28600000, opt_out_count: 980 },
    { campaign_name: "Premium Card Upgrade", segment: "Affluent", channel: "email", impressions: 84000, clicks: 11200, conversions: 1380, conversion_rate_pct: 12.3, revenue_try: 18400000, opt_out_count: 210 },
    { campaign_name: "SME POS Bundle", segment: "SME", channel: "relationship_manager", impressions: 16400, clicks: 3860, conversions: 520, conversion_rate_pct: 13.5, revenue_try: 22600000, opt_out_count: 38 }
  ],
  complaints: [
    { topic: "Card decline", priority: "HIGH", complaint_count: 142, open_cases: 37, avg_resolution_hours: 18.4, digital_share_pct: 72.5 },
    { topic: "Mobile login", priority: "MEDIUM", complaint_count: 118, open_cases: 22, avg_resolution_hours: 9.6, digital_share_pct: 91.2 },
    { topic: "Loan pricing", priority: "MEDIUM", complaint_count: 76, open_cases: 18, avg_resolution_hours: 24.1, digital_share_pct: 54.8 }
  ],
  fraud: [
    { fraud_type: "synthetic_identity", severity: "CRITICAL", alert_count: 18, confirmed_count: 7, amount_at_risk_try: 18600000, confirmed_amount_try: 7400000 },
    { fraud_type: "account_takeover", severity: "HIGH", alert_count: 86, confirmed_count: 24, amount_at_risk_try: 12800000, confirmed_amount_try: 3960000 },
    { fraud_type: "card_testing", severity: "MEDIUM", alert_count: 214, confirmed_count: 61, amount_at_risk_try: 4200000, confirmed_amount_try: 870000 }
  ],
  collections: [
    { segment: "Mass", bucket: "31-60 DPD", case_count: 284, exposure_try: 42600000, recovered_try: 7800000, recovery_rate_pct: 18.3, promise_to_pay_count: 96 },
    { segment: "SME", bucket: "61-90 DPD", case_count: 112, exposure_try: 68200000, recovered_try: 9200000, recovery_rate_pct: 13.5, promise_to_pay_count: 34 },
    { segment: "Young", bucket: "1-30 DPD", case_count: 326, exposure_try: 18400000, recovered_try: 6100000, recovery_rate_pct: 33.2, promise_to_pay_count: 148 }
  ],
  market: [
    { rate_date: "2026-05-13", competitor: "Competitor A", product_name: "Consumer Loan", interest_rate_pct: 3.69, internal_rate_pct: 3.54, spread_bps: 15, confidence_score: 0.82 },
    { rate_date: "2026-05-13", competitor: "Competitor B", product_name: "Deposit", interest_rate_pct: 47.5, internal_rate_pct: 46.0, spread_bps: 150, confidence_score: 0.76 },
    { rate_date: "2026-05-13", competitor: "Competitor C", product_name: "SME Loan", interest_rate_pct: 4.08, internal_rate_pct: 3.92, spread_bps: 16, confidence_score: 0.71 }
  ],
  customer: [
    { segment: "Affluent", city: "Istanbul", customer_count: 18400, active_customer_count: 17120, avg_total_balance_try: 284000, avg_risk_score: 31.6, avg_products: 3.8 },
    { segment: "Mass", city: "Ankara", customer_count: 26800, active_customer_count: 24100, avg_total_balance_try: 48200, avg_risk_score: 52.4, avg_products: 2.1 },
    { segment: "SME", city: "Izmir", customer_count: 7200, active_customer_count: 6810, avg_total_balance_try: 612000, avg_risk_score: 44.9, avg_products: 4.4 }
  ],
  transactions: [
    { product_name: "Credit Card", segment: "Mass", channel: "mobile", txn_count: 184210, txn_volume_try: 91428000, marketplace_volume_try: 31800000, successful_txn_count: 176940 },
    { product_name: "Consumer Loan", segment: "Mass", channel: "marketplace", txn_count: 9120, txn_volume_try: 76452000, marketplace_volume_try: 76452000, successful_txn_count: 8410 },
    { product_name: "Deposit", segment: "Affluent", channel: "branch", txn_count: 6240, txn_volume_try: 286400000, marketplace_volume_try: 0, successful_txn_count: 6188 }
  ]
};

export function executeBankingDemoQuery(sql: string): { rows: JsonRecord[]; source: "fallback-synthetic"; topic: FallbackTopic; rowCount: number } {
  const topic = detectFallbackTopic(sql);
  const rows = fallbackRows[topic].map((row) => ({ ...row }));
  return { rows, source: "fallback-synthetic", topic, rowCount: rows.length };
}

export function describeBankingDemoDataset(): JsonRecord {
  const totalRows = Object.values(BANKING_DEMO_ROW_COUNTS).reduce((sum, count) => sum + count, 0);
  return {
    name: "Synthetic banking demo dataset",
    totalRows,
    tables: BANKING_BASE_TABLES.length,
    reportingViews: BANKING_REPORTING_VIEWS.length,
    rowCounts: BANKING_DEMO_ROW_COUNTS
  };
}

function detectFallbackTopic(sql: string): FallbackTopic {
  const normalized = sql.toLocaleLowerCase("tr-TR");
  if (/v_dataset_summary|metric_name|row_count|count\s*\(\s*\*\s*\).*bank_customers|bank_customers[\s\S]*count\s*\(/.test(normalized)) return "dataset";
  if (/v_card_approval_daily|card_transactions|kart_islemleri|approval|onay|decline/.test(normalized)) return "card";
  if (/v_credit_risk_snapshot|loan_portfolio|risk_monitoring|risk_izleme|npl|overdue|dpd/.test(normalized)) return "risk";
  if (/v_mobile_retention|mobile_retention|digital_sessions|mobil_kullanim|retention|cohort/.test(normalized)) return "mobile";
  if (/v_branch_kpi|branch_performance|branch/.test(normalized)) return "branch";
  if (/v_campaign_conversion|campaign_events|campaign/.test(normalized)) return "campaign";
  if (/v_complaint_quality|complaints|complaint/.test(normalized)) return "complaints";
  if (/v_fraud_alerts|fraud_alerts|fraud/.test(normalized)) return "fraud";
  if (/v_collections_snapshot|collections_cases|collections|recovery/.test(normalized)) return "collections";
  if (/v_market_rate_comparison|market_rates|treasury_rates|competitor/.test(normalized)) return "market";
  if (/v_customer_360|bank_customers|musteriler|customer/.test(normalized)) return "customer";
  return "transactions";
}
