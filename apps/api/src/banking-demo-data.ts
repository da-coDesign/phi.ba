import type { JsonRecord } from "./platform-types.js";

export const BANKING_DEMO_ROW_COUNTS = {
  syntheticCustomerTemplates: 6,
  customers: 2500,
  customerProfiles: 2500,
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
  marketRates: 720,
  customerEvents: 7500,
  customerOfferEligibility: 7500
} as const;

export const BANKING_BASE_TABLES = [
  "synthetic_customer_templates",
  "bank_customers",
  "customer_profiles",
  "customer_events",
  "customer_offer_eligibility",
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
  "v_market_rate_comparison",
  "v_customer_lifecycle",
  "v_segment_profitability",
  "v_channel_behavior",
  "v_product_cross_sell",
  "v_offer_eligibility"
] as const;

export const BANKING_COMPAT_TABLES = ["islemler", "musteriler", "urunler", "risk_izleme", "kart_islemleri", "mobil_kullanim"] as const;

export const BANKING_ALLOWED_TABLES = [
  ...BANKING_BASE_TABLES,
  ...BANKING_REPORTING_VIEWS,
  ...BANKING_COMPAT_TABLES
];

export const BANKING_ALLOWED_COLUMNS: Record<string, string[]> = {
  synthetic_customer_templates: ["persona_key", "segment", "display_name", "description", "lifecycle_bias", "primary_need", "risk_bias", "digital_bias", "campaign_bias", "product_affinity"],
  bank_customers: ["customer_id", "segment", "city", "age_band", "income_band", "acquisition_channel", "risk_score", "product_count", "is_active", "created_at"],
  customer_profiles: ["customer_id", "persona_key", "lifecycle_stage", "profitability_band", "digital_maturity_score", "marketing_consent", "kyc_risk_level", "primary_branch_id", "preferred_channel", "churn_risk_score", "relationship_value_try"],
  customer_events: ["event_id", "customer_id", "event_type", "event_date", "channel", "severity", "value_try", "metadata"],
  customer_offer_eligibility: ["eligibility_id", "customer_id", "offer_key", "product_id", "score", "eligible", "reason", "expires_at"],
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
  v_customer_360: ["segment", "city", "customer_count", "active_customer_count", "avg_total_balance_try", "avg_risk_score", "avg_products", "persona_key", "lifecycle_stage", "profitability_band", "avg_digital_maturity_score", "avg_churn_risk_score", "relationship_value_try"],
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
  v_customer_lifecycle: ["persona_key", "persona_name", "segment", "lifecycle_stage", "customer_count", "active_customer_count", "marketing_consent_count", "avg_digital_maturity_score", "avg_churn_risk_score", "relationship_value_try"],
  v_segment_profitability: ["segment", "persona_key", "profitability_band", "customer_count", "relationship_value_try", "avg_balance_try", "avg_risk_score", "avg_churn_risk_score"],
  v_channel_behavior: ["preferred_channel", "segment", "persona_key", "customer_count", "avg_digital_maturity_score", "session_count", "successful_login_count", "digital_sales_try"],
  v_product_cross_sell: ["persona_key", "segment", "product_name", "eligible_customer_count", "avg_offer_score", "avg_relationship_value_try"],
  v_offer_eligibility: ["offer_key", "product_name", "segment", "persona_key", "scored_customer_count", "eligible_customer_count", "avg_score", "avg_relationship_value_try"],
  islemler: ["id", "musteri_id", "urun_id", "tutar", "durum", "gerceklesme_tarihi"],
  musteriler: ["id", "segment", "edinim_kanali"],
  urunler: ["id", "ad", "kategori"],
  risk_izleme: ["urun_adi", "segment", "npl_orani", "aktif_musteri", "riskli_bakiye", "rapor_donemi"],
  kart_islemleri: ["kanal", "saat_dilimi", "onay_orani", "reddedilen_islem", "kayip_hacim", "islem_tarihi"],
  mobil_kullanim: ["kohort", "segment", "retention_90d", "aktif_musteri", "beklenen_gelir", "edinim_kanali"]
};

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
