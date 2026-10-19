-- Row Level Security: red de seguridad por debajo de las extensiones de Prisma.
-- Cada request fija su contexto con set_config(..., true) dentro de su
-- transacción; sin contexto, las tablas del dominio no devuelven nada.
-- Sin RLS (se leen antes de saber de quién es el request): sesiones,
-- otp_challenges, password_reset_tokens, platform_admins y staff_users.

-- Una variable no seteada en una conexión reutilizada vale '': el NULLIF evita
-- que el cast a uuid falle.
CREATE FUNCTION app_merchant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.merchant_id', true), '')::uuid
$$;

CREATE FUNCTION app_customer_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.customer_id', true), '')::uuid
$$;

-- Login y guards del staff, antes de elegir comercio.
CREATE FUNCTION app_staff_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.staff_user_id', true), '')::uuid
$$;

-- Verificación del OTP: el teléfono que acaba de validar el código.
CREATE FUNCTION app_customer_phone() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.customer_phone', true), '')
$$;

-- Datos públicos del comercio (los muestra /public/pieces): lectura abierta,
-- escritura solo desde su panel.
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants FORCE ROW LEVEL SECURITY;
CREATE POLICY merchants_read ON merchants FOR SELECT USING (true);
CREATE POLICY merchants_write ON merchants FOR ALL
  USING (id = app_merchant_id())
  WITH CHECK (id = app_merchant_id());

ALTER TABLE reward_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY reward_rules_read ON reward_rules FOR SELECT USING (true);
CREATE POLICY reward_rules_write ON reward_rules FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());

ALTER TABLE pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE pieces FORCE ROW LEVEL SECURITY;
CREATE POLICY pieces_read ON pieces FOR SELECT USING (true);
CREATE POLICY pieces_write ON pieces FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());

ALTER TABLE staff_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_memberships_merchant ON staff_memberships FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());
CREATE POLICY staff_memberships_own ON staff_memberships FOR SELECT
  USING (staff_user_id = app_staff_user_id());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_scope ON memberships FOR ALL
  USING (merchant_id = app_merchant_id() OR customer_id = app_customer_id())
  WITH CHECK (merchant_id = app_merchant_id() OR customer_id = app_customer_id());

-- El panel ve a los clientes solo a través de una membresía de su comercio.
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_self ON customers FOR ALL
  USING (id = app_customer_id())
  WITH CHECK (id = app_customer_id());
CREATE POLICY customers_by_phone ON customers FOR ALL
  USING (phone_e164 = app_customer_phone())
  WITH CHECK (phone_e164 = app_customer_phone());
CREATE POLICY customers_of_merchant ON customers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.customer_id = customers.id AND m.merchant_id = app_merchant_id()
  ));

-- El cliente lee los de sus membresías; escribir, solo el panel.
ALTER TABLE stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamps FORCE ROW LEVEL SECURITY;
CREATE POLICY stamps_merchant ON stamps FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());
CREATE POLICY stamps_customer_read ON stamps FOR SELECT
  USING (membership_id IN (
    SELECT id FROM memberships WHERE customer_id = app_customer_id()
  ));

ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions FORCE ROW LEVEL SECURITY;
CREATE POLICY redemptions_merchant ON redemptions FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());
CREATE POLICY redemptions_customer_read ON redemptions FOR SELECT
  USING (membership_id IN (
    SELECT id FROM memberships WHERE customer_id = app_customer_id()
  ));

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_merchant ON audit_events FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());
