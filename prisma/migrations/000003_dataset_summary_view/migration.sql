CREATE OR REPLACE VIEW v_dataset_summary AS
SELECT
  'customers'::TEXT AS metric_name,
  COUNT(*)::INTEGER AS row_count,
  'Synthetic banking demo customer records in FBDWHPRD.'::TEXT AS description
FROM bank_customers
UNION ALL
SELECT
  'accounts'::TEXT AS metric_name,
  COUNT(*)::INTEGER AS row_count,
  'Synthetic banking demo account records in FBDWHPRD.'::TEXT AS description
FROM bank_accounts
UNION ALL
SELECT
  'transactions'::TEXT AS metric_name,
  COUNT(*)::INTEGER AS row_count,
  'Synthetic banking demo transaction records in FBDWHPRD.'::TEXT AS description
FROM bank_transactions;
