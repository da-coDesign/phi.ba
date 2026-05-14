CREATE TABLE IF NOT EXISTS bank_customers (
  customer_id TEXT PRIMARY KEY,
  segment TEXT NOT NULL,
  city TEXT NOT NULL,
  age_band TEXT NOT NULL,
  income_band TEXT NOT NULL,
  acquisition_channel TEXT NOT NULL,
  risk_score NUMERIC(5, 2) NOT NULL,
  product_count INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_at DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_products (
  product_id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_family TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY'
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  account_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  product_id TEXT NOT NULL REFERENCES bank_products(product_id),
  branch_id TEXT NOT NULL,
  account_type TEXT NOT NULL,
  balance_try NUMERIC(16, 2) NOT NULL,
  opened_at DATE NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  transaction_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  account_id TEXT NOT NULL REFERENCES bank_accounts(account_id),
  product_id TEXT NOT NULL REFERENCES bank_products(product_id),
  channel TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  amount_try NUMERIC(16, 2) NOT NULL,
  transaction_date DATE NOT NULL,
  status TEXT NOT NULL,
  merchant_category TEXT NOT NULL,
  city TEXT NOT NULL,
  is_marketplace BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS card_transactions (
  card_txn_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  segment TEXT NOT NULL,
  channel TEXT NOT NULL,
  amount_try NUMERIC(16, 2) NOT NULL,
  approved BOOLEAN NOT NULL,
  decline_reason TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  hour_band TEXT NOT NULL,
  merchant_category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_applications (
  application_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  product_id TEXT NOT NULL REFERENCES bank_products(product_id),
  channel TEXT NOT NULL,
  requested_amount_try NUMERIC(16, 2) NOT NULL,
  approved BOOLEAN NOT NULL,
  rejection_reason TEXT NOT NULL,
  application_date DATE NOT NULL,
  credit_score_bucket TEXT NOT NULL,
  dti_pct NUMERIC(5, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_portfolio (
  loan_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  product_id TEXT NOT NULL REFERENCES bank_products(product_id),
  segment TEXT NOT NULL,
  risk_band TEXT NOT NULL,
  outstanding_balance_try NUMERIC(16, 2) NOT NULL,
  overdue_balance_try NUMERIC(16, 2) NOT NULL,
  dpd_bucket TEXT NOT NULL,
  interest_rate_pct NUMERIC(6, 2) NOT NULL,
  origination_date DATE NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_monitoring (
  risk_id TEXT PRIMARY KEY,
  report_date DATE NOT NULL,
  segment TEXT NOT NULL,
  product_name TEXT NOT NULL,
  risk_band TEXT NOT NULL,
  active_customer_count INTEGER NOT NULL,
  exposure_try NUMERIC(16, 2) NOT NULL,
  overdue_balance_try NUMERIC(16, 2) NOT NULL,
  npl_ratio_pct NUMERIC(6, 2) NOT NULL,
  early_warning_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS digital_sessions (
  session_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  segment TEXT NOT NULL,
  channel TEXT NOT NULL,
  session_date DATE NOT NULL,
  session_count INTEGER NOT NULL,
  successful_login_count INTEGER NOT NULL,
  digital_sales_try NUMERIC(16, 2) NOT NULL,
  journey TEXT NOT NULL,
  device_os TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mobile_retention (
  cohort_month DATE NOT NULL,
  segment TEXT NOT NULL,
  acquisition_channel TEXT NOT NULL,
  active_customers INTEGER NOT NULL,
  retained_30d_pct NUMERIC(6, 2) NOT NULL,
  retained_90d_pct NUMERIC(6, 2) NOT NULL,
  expected_revenue_try NUMERIC(16, 2) NOT NULL,
  churn_risk_score NUMERIC(6, 2) NOT NULL,
  PRIMARY KEY (cohort_month, segment, acquisition_channel)
);

CREATE TABLE IF NOT EXISTS branch_performance (
  branch_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  branch_region TEXT NOT NULL,
  report_month DATE NOT NULL,
  active_customers INTEGER NOT NULL,
  deposit_balance_try NUMERIC(16, 2) NOT NULL,
  loan_balance_try NUMERIC(16, 2) NOT NULL,
  new_products_sold INTEGER NOT NULL,
  complaint_count INTEGER NOT NULL,
  nps_score NUMERIC(6, 2) NOT NULL,
  PRIMARY KEY (branch_id, report_month)
);

CREATE TABLE IF NOT EXISTS campaign_events (
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  segment TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_date DATE NOT NULL,
  impressions INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  conversions INTEGER NOT NULL,
  revenue_try NUMERIC(16, 2) NOT NULL,
  opt_out_count INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, segment, channel, event_date)
);

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  segment TEXT NOT NULL,
  topic TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at DATE NOT NULL,
  resolution_hours NUMERIC(8, 2) NOT NULL,
  channel TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  alert_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  fraud_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_at_risk_try NUMERIC(16, 2) NOT NULL,
  confirmed BOOLEAN NOT NULL,
  alert_date DATE NOT NULL,
  channel TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections_cases (
  case_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  segment TEXT NOT NULL,
  bucket TEXT NOT NULL,
  exposure_try NUMERIC(16, 2) NOT NULL,
  recovered_try NUMERIC(16, 2) NOT NULL,
  promise_to_pay BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  opened_at DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury_rates (
  rate_date DATE NOT NULL,
  product_name TEXT NOT NULL,
  internal_rate_pct NUMERIC(6, 2) NOT NULL,
  funding_cost_pct NUMERIC(6, 2) NOT NULL,
  liquidity_buffer_pct NUMERIC(6, 2) NOT NULL,
  PRIMARY KEY (rate_date, product_name)
);

CREATE TABLE IF NOT EXISTS market_rates (
  rate_date DATE NOT NULL,
  competitor TEXT NOT NULL,
  product_name TEXT NOT NULL,
  interest_rate_pct NUMERIC(6, 2) NOT NULL,
  confidence_score NUMERIC(4, 2) NOT NULL,
  source_name TEXT NOT NULL,
  PRIMARY KEY (rate_date, competitor, product_name)
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_product ON bank_transactions(product_id, segment);
CREATE INDEX IF NOT EXISTS idx_card_transactions_date ON card_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_loan_portfolio_segment ON loan_portfolio(segment, risk_band);
CREATE INDEX IF NOT EXISTS idx_complaints_topic ON complaints(topic, priority);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_type ON fraud_alerts(fraud_type, severity);

DROP VIEW IF EXISTS v_market_rate_comparison;
DROP VIEW IF EXISTS v_collections_snapshot;
DROP VIEW IF EXISTS v_fraud_alerts;
DROP VIEW IF EXISTS v_complaint_quality;
DROP VIEW IF EXISTS v_campaign_conversion;
DROP VIEW IF EXISTS v_branch_kpi;
DROP VIEW IF EXISTS v_mobile_retention;
DROP VIEW IF EXISTS v_credit_risk_snapshot;
DROP VIEW IF EXISTS v_card_approval_daily;
DROP VIEW IF EXISTS v_transaction_volume;
DROP VIEW IF EXISTS v_customer_360;

CREATE OR REPLACE VIEW v_customer_360 AS
SELECT
  c.segment,
  c.city,
  COUNT(DISTINCT c.customer_id)::INTEGER AS customer_count,
  COUNT(DISTINCT c.customer_id) FILTER (WHERE c.is_active)::INTEGER AS active_customer_count,
  ROUND(AVG(a.balance_try), 2) AS avg_total_balance_try,
  ROUND(AVG(c.risk_score), 2) AS avg_risk_score,
  ROUND(AVG(c.product_count), 2) AS avg_products
FROM bank_customers c
JOIN bank_accounts a ON a.customer_id = c.customer_id
GROUP BY c.segment, c.city;

CREATE OR REPLACE VIEW v_transaction_volume AS
SELECT
  p.product_name,
  c.segment,
  t.channel,
  COUNT(*)::INTEGER AS txn_count,
  ROUND(SUM(t.amount_try), 2) AS txn_volume_try,
  ROUND(SUM(t.amount_try) FILTER (WHERE t.is_marketplace), 2) AS marketplace_volume_try,
  COUNT(*) FILTER (WHERE t.status = 'successful')::INTEGER AS successful_txn_count
FROM bank_transactions t
JOIN bank_customers c ON c.customer_id = t.customer_id
JOIN bank_products p ON p.product_id = t.product_id
WHERE t.transaction_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY p.product_name, c.segment, t.channel;

CREATE OR REPLACE VIEW v_card_approval_daily AS
SELECT
  transaction_date AS report_date,
  channel,
  segment,
  decline_reason,
  COUNT(*)::INTEGER AS txn_count,
  ROUND(SUM(amount_try), 2) AS txn_volume_try,
  ROUND(100 * AVG(CASE WHEN approved THEN 1 ELSE 0 END), 2) AS approval_rate_pct,
  COUNT(*) FILTER (WHERE NOT approved)::INTEGER AS rejected_txn_count,
  ROUND(COALESCE(SUM(amount_try) FILTER (WHERE NOT approved), 0), 2) AS lost_volume_try
FROM card_transactions
GROUP BY transaction_date, channel, segment, decline_reason;

CREATE OR REPLACE VIEW v_credit_risk_snapshot AS
SELECT
  p.product_name,
  l.segment,
  l.risk_band,
  COUNT(DISTINCT l.customer_id)::INTEGER AS active_customer_count,
  ROUND(SUM(l.outstanding_balance_try), 2) AS exposure_try,
  ROUND(SUM(l.overdue_balance_try), 2) AS overdue_balance_try,
  ROUND(100 * SUM(l.overdue_balance_try) / NULLIF(SUM(l.outstanding_balance_try), 0), 2) AS npl_ratio_pct,
  COUNT(*) FILTER (WHERE l.dpd_bucket IN ('31-60', '61-90', '90+'))::INTEGER AS early_warning_count
FROM loan_portfolio l
JOIN bank_products p ON p.product_id = l.product_id
GROUP BY p.product_name, l.segment, l.risk_band;

CREATE OR REPLACE VIEW v_mobile_retention AS
SELECT
  cohort_month,
  segment,
  acquisition_channel,
  active_customers,
  retained_30d_pct,
  retained_90d_pct,
  expected_revenue_try,
  churn_risk_score
FROM mobile_retention;

CREATE OR REPLACE VIEW v_branch_kpi AS
SELECT
  branch_region,
  branch_name,
  SUM(active_customers)::INTEGER AS active_customers,
  ROUND(SUM(deposit_balance_try), 2) AS deposit_balance_try,
  ROUND(SUM(loan_balance_try), 2) AS loan_balance_try,
  SUM(new_products_sold)::INTEGER AS new_products_sold,
  SUM(complaint_count)::INTEGER AS complaint_count,
  ROUND(AVG(nps_score), 2) AS nps_score
FROM branch_performance
WHERE report_month >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'
GROUP BY branch_region, branch_name;

CREATE OR REPLACE VIEW v_campaign_conversion AS
SELECT
  campaign_name,
  segment,
  channel,
  SUM(impressions)::INTEGER AS impressions,
  SUM(clicks)::INTEGER AS clicks,
  SUM(conversions)::INTEGER AS conversions,
  ROUND(100 * SUM(conversions) / NULLIF(SUM(clicks), 0), 2) AS conversion_rate_pct,
  ROUND(SUM(revenue_try), 2) AS revenue_try,
  SUM(opt_out_count)::INTEGER AS opt_out_count
FROM campaign_events
WHERE event_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY campaign_name, segment, channel;

CREATE OR REPLACE VIEW v_complaint_quality AS
SELECT
  topic,
  priority,
  COUNT(*)::INTEGER AS complaint_count,
  COUNT(*) FILTER (WHERE status <> 'closed')::INTEGER AS open_cases,
  ROUND(AVG(resolution_hours), 2) AS avg_resolution_hours,
  ROUND(100 * AVG(CASE WHEN channel IN ('mobile', 'web') THEN 1 ELSE 0 END), 2) AS digital_share_pct
FROM complaints
WHERE opened_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY topic, priority;

CREATE OR REPLACE VIEW v_fraud_alerts AS
SELECT
  fraud_type,
  severity,
  COUNT(*)::INTEGER AS alert_count,
  COUNT(*) FILTER (WHERE confirmed)::INTEGER AS confirmed_count,
  ROUND(SUM(amount_at_risk_try), 2) AS amount_at_risk_try,
  ROUND(COALESCE(SUM(amount_at_risk_try) FILTER (WHERE confirmed), 0), 2) AS confirmed_amount_try
FROM fraud_alerts
WHERE alert_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY fraud_type, severity;

CREATE OR REPLACE VIEW v_collections_snapshot AS
SELECT
  segment,
  bucket,
  COUNT(*)::INTEGER AS case_count,
  ROUND(SUM(exposure_try), 2) AS exposure_try,
  ROUND(SUM(recovered_try), 2) AS recovered_try,
  ROUND(100 * SUM(recovered_try) / NULLIF(SUM(exposure_try), 0), 2) AS recovery_rate_pct,
  COUNT(*) FILTER (WHERE promise_to_pay)::INTEGER AS promise_to_pay_count
FROM collections_cases
WHERE opened_at >= CURRENT_DATE - INTERVAL '180 days'
GROUP BY segment, bucket;

CREATE OR REPLACE VIEW v_market_rate_comparison AS
SELECT
  m.rate_date,
  m.competitor,
  m.product_name,
  m.interest_rate_pct,
  t.internal_rate_pct,
  ROUND((m.interest_rate_pct - t.internal_rate_pct) * 100, 0) AS spread_bps,
  m.confidence_score
FROM market_rates m
JOIN treasury_rates t ON t.rate_date = m.rate_date AND t.product_name = m.product_name;
