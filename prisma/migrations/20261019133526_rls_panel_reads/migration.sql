-- Los datos públicos del comercio se leen abiertos solo fuera del panel
-- (cliente, login, pieza pública). Dentro del panel, solo los del propio
-- comercio: si no, una consulta sin filtro mezcla los de otros.
ALTER POLICY merchants_read ON merchants
  USING (app_merchant_id() IS NULL OR id = app_merchant_id());

ALTER POLICY reward_rules_read ON reward_rules
  USING (app_merchant_id() IS NULL OR merchant_id = app_merchant_id());

ALTER POLICY pieces_read ON pieces
  USING (app_merchant_id() IS NULL OR merchant_id = app_merchant_id());
