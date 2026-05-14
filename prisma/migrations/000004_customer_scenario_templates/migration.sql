CREATE TABLE IF NOT EXISTS synthetic_customer_templates (
  persona_key TEXT PRIMARY KEY,
  segment TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  lifecycle_bias TEXT NOT NULL,
  primary_need TEXT NOT NULL,
  risk_bias NUMERIC(6, 2) NOT NULL,
  digital_bias NUMERIC(6, 2) NOT NULL,
  campaign_bias NUMERIC(6, 2) NOT NULL,
  product_affinity JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id TEXT PRIMARY KEY REFERENCES bank_customers(customer_id),
  persona_key TEXT NOT NULL REFERENCES synthetic_customer_templates(persona_key),
  lifecycle_stage TEXT NOT NULL,
  profitability_band TEXT NOT NULL,
  digital_maturity_score NUMERIC(6, 2) NOT NULL,
  marketing_consent BOOLEAN NOT NULL,
  kyc_risk_level TEXT NOT NULL,
  primary_branch_id TEXT NOT NULL,
  preferred_channel TEXT NOT NULL,
  churn_risk_score NUMERIC(6, 2) NOT NULL,
  relationship_value_try NUMERIC(16, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_events (
  event_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  channel TEXT NOT NULL,
  severity TEXT NOT NULL,
  value_try NUMERIC(16, 2) NOT NULL,
  metadata JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_offer_eligibility (
  eligibility_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES bank_customers(customer_id),
  offer_key TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES bank_products(product_id),
  score NUMERIC(6, 2) NOT NULL,
  eligible BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  expires_at DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_persona ON customer_profiles(persona_key, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_channel ON customer_profiles(preferred_channel, profitability_band);
CREATE INDEX IF NOT EXISTS idx_customer_events_customer_date ON customer_events(customer_id, event_date);
CREATE INDEX IF NOT EXISTS idx_customer_events_type ON customer_events(event_type, severity);
CREATE INDEX IF NOT EXISTS idx_customer_offer_eligibility_offer ON customer_offer_eligibility(offer_key, eligible);

DROP VIEW IF EXISTS v_offer_eligibility;
DROP VIEW IF EXISTS v_product_cross_sell;
DROP VIEW IF EXISTS v_channel_behavior;
DROP VIEW IF EXISTS v_segment_profitability;
DROP VIEW IF EXISTS v_customer_lifecycle;
DROP VIEW IF EXISTS v_customer_360;
DROP VIEW IF EXISTS v_dataset_summary;

CREATE OR REPLACE VIEW v_dataset_summary AS
SELECT 'customers'::TEXT AS metric_name, COUNT(*)::INTEGER AS row_count, 'Synthetic banking demo customer records in FBDWHPRD.'::TEXT AS description FROM bank_customers
UNION ALL
SELECT 'customer_profiles'::TEXT AS metric_name, COUNT(*)::INTEGER AS row_count, 'Scenario profile records linked one-to-one with customers.'::TEXT AS description FROM customer_profiles
UNION ALL
SELECT 'customer_events'::TEXT AS metric_name, COUNT(*)::INTEGER AS row_count, 'Scenario lifecycle, risk, digital, and offer events.'::TEXT AS description FROM customer_events
UNION ALL
SELECT 'customer_offer_eligibility'::TEXT AS metric_name, COUNT(*)::INTEGER AS row_count, 'Customer-level offer eligibility scores.'::TEXT AS description FROM customer_offer_eligibility
UNION ALL
SELECT 'accounts'::TEXT AS metric_name, COUNT(*)::INTEGER AS row_count, 'Synthetic banking demo account records in FBDWHPRD.'::TEXT AS description FROM bank_accounts
UNION ALL
SELECT 'transactions'::TEXT AS metric_name, COUNT(*)::INTEGER AS row_count, 'Synthetic banking demo transaction records in FBDWHPRD.'::TEXT AS description FROM bank_transactions;

CREATE OR REPLACE VIEW v_customer_360 AS
SELECT
  c.segment,
  c.city,
  COUNT(DISTINCT c.customer_id)::INTEGER AS customer_count,
  COUNT(DISTINCT c.customer_id) FILTER (WHERE c.is_active)::INTEGER AS active_customer_count,
  ROUND(AVG(a.balance_try), 2) AS avg_total_balance_try,
  ROUND(AVG(c.risk_score), 2) AS avg_risk_score,
  ROUND(AVG(c.product_count), 2) AS avg_products,
  p.persona_key,
  p.lifecycle_stage,
  p.profitability_band,
  ROUND(AVG(p.digital_maturity_score), 2) AS avg_digital_maturity_score,
  ROUND(AVG(p.churn_risk_score), 2) AS avg_churn_risk_score,
  ROUND(SUM(p.relationship_value_try), 2) AS relationship_value_try
FROM bank_customers c
JOIN bank_accounts a ON a.customer_id = c.customer_id
JOIN customer_profiles p ON p.customer_id = c.customer_id
GROUP BY c.segment, c.city, p.persona_key, p.lifecycle_stage, p.profitability_band;

CREATE OR REPLACE VIEW v_customer_lifecycle AS
SELECT
  p.persona_key,
  t.display_name AS persona_name,
  c.segment,
  p.lifecycle_stage,
  COUNT(*)::INTEGER AS customer_count,
  COUNT(*) FILTER (WHERE c.is_active)::INTEGER AS active_customer_count,
  COUNT(*) FILTER (WHERE p.marketing_consent)::INTEGER AS marketing_consent_count,
  ROUND(AVG(p.digital_maturity_score), 2) AS avg_digital_maturity_score,
  ROUND(AVG(p.churn_risk_score), 2) AS avg_churn_risk_score,
  ROUND(SUM(p.relationship_value_try), 2) AS relationship_value_try
FROM customer_profiles p
JOIN bank_customers c ON c.customer_id = p.customer_id
JOIN synthetic_customer_templates t ON t.persona_key = p.persona_key
GROUP BY p.persona_key, t.display_name, c.segment, p.lifecycle_stage;

CREATE OR REPLACE VIEW v_segment_profitability AS
SELECT
  c.segment,
  p.persona_key,
  p.profitability_band,
  COUNT(DISTINCT c.customer_id)::INTEGER AS customer_count,
  ROUND(SUM(p.relationship_value_try), 2) AS relationship_value_try,
  ROUND(AVG(a.balance_try), 2) AS avg_balance_try,
  ROUND(AVG(c.risk_score), 2) AS avg_risk_score,
  ROUND(AVG(p.churn_risk_score), 2) AS avg_churn_risk_score
FROM customer_profiles p
JOIN bank_customers c ON c.customer_id = p.customer_id
JOIN bank_accounts a ON a.customer_id = c.customer_id
GROUP BY c.segment, p.persona_key, p.profitability_band;

CREATE OR REPLACE VIEW v_channel_behavior AS
SELECT
  p.preferred_channel,
  c.segment,
  p.persona_key,
  COUNT(DISTINCT c.customer_id)::INTEGER AS customer_count,
  ROUND(AVG(p.digital_maturity_score), 2) AS avg_digital_maturity_score,
  SUM(d.session_count)::INTEGER AS session_count,
  SUM(d.successful_login_count)::INTEGER AS successful_login_count,
  ROUND(SUM(d.digital_sales_try), 2) AS digital_sales_try
FROM customer_profiles p
JOIN bank_customers c ON c.customer_id = p.customer_id
LEFT JOIN digital_sessions d ON d.customer_id = c.customer_id
GROUP BY p.preferred_channel, c.segment, p.persona_key;

CREATE OR REPLACE VIEW v_product_cross_sell AS
SELECT
  p.persona_key,
  c.segment,
  bp.product_name,
  COUNT(*) FILTER (WHERE o.eligible)::INTEGER AS eligible_customer_count,
  ROUND(AVG(o.score), 2) AS avg_offer_score,
  ROUND(AVG(p.relationship_value_try), 2) AS avg_relationship_value_try
FROM customer_offer_eligibility o
JOIN customer_profiles p ON p.customer_id = o.customer_id
JOIN bank_customers c ON c.customer_id = o.customer_id
JOIN bank_products bp ON bp.product_id = o.product_id
GROUP BY p.persona_key, c.segment, bp.product_name;

CREATE OR REPLACE VIEW v_offer_eligibility AS
SELECT
  o.offer_key,
  bp.product_name,
  c.segment,
  p.persona_key,
  COUNT(*)::INTEGER AS scored_customer_count,
  COUNT(*) FILTER (WHERE o.eligible)::INTEGER AS eligible_customer_count,
  ROUND(AVG(o.score), 2) AS avg_score,
  ROUND(AVG(p.relationship_value_try), 2) AS avg_relationship_value_try
FROM customer_offer_eligibility o
JOIN customer_profiles p ON p.customer_id = o.customer_id
JOIN bank_customers c ON c.customer_id = o.customer_id
JOIN bank_products bp ON bp.product_id = o.product_id
GROUP BY o.offer_key, bp.product_name, c.segment, p.persona_key;
