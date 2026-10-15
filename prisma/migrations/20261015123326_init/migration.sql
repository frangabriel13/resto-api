-- CreateEnum
CREATE TYPE "merchant_status" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('OWNER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "piece_type" AS ENUM ('NFC_QR');

-- CreateEnum
CREATE TYPE "stamp_source" AS ENUM ('QR_SCAN', 'MANUAL');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('STAFF', 'CUSTOMER', 'PLATFORM_ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "google_review_url" TEXT,
    "stamp_cooldown_minutes" INTEGER NOT NULL DEFAULT 60,
    "status" "merchant_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_memberships" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "role" "staff_role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_sessions" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "selected_merchant_id" UUID,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin_sessions" (
    "id" UUID NOT NULL,
    "platform_admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "platform_admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "phone_e164" TEXT,
    "phone_verified_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "current_cycle" INTEGER NOT NULL DEFAULT 1,
    "current_cycle_reward_rule_id" UUID NOT NULL,
    "joined_via_piece_id" UUID,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "marketing_consent_at" TIMESTAMPTZ(3),
    "marketing_consent_revoked_at" TIMESTAMPTZ(3),
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "public_code" TEXT NOT NULL,
    "type" "piece_type" NOT NULL DEFAULT 'NFC_QR',
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_rules" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "stamps_required" INTEGER NOT NULL,
    "reward_description" TEXT NOT NULL,
    "conditions" TEXT,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stamps" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "cycle" INTEGER NOT NULL,
    "granted_by_staff_id" UUID NOT NULL,
    "source" "stamp_source" NOT NULL,
    "cooldown_override" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_staff_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "stamps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "cycle" INTEGER NOT NULL,
    "reward_rule_id" UUID NOT NULL,
    "stamps_used" INTEGER NOT NULL,
    "carry_over" INTEGER NOT NULL,
    "confirmed_by_staff_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_staff_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "merchant_id" UUID,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_slug_key" ON "merchants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE INDEX "staff_memberships_merchant_id_idx" ON "staff_memberships"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_memberships_staff_user_id_merchant_id_key" ON "staff_memberships"("staff_user_id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "staff_sessions_staff_user_id_idx" ON "staff_sessions"("staff_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_staff_user_id_idx" ON "password_reset_tokens"("staff_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admin_sessions_token_hash_key" ON "platform_admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "platform_admin_sessions_platform_admin_id_idx" ON "platform_admin_sessions"("platform_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_e164_key" ON "customers"("phone_e164");

-- CreateIndex
CREATE INDEX "memberships_merchant_id_joined_at_idx" ON "memberships"("merchant_id", "joined_at");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_customer_id_merchant_id_key" ON "memberships"("customer_id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_id_merchant_id_key" ON "memberships"("id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "customer_sessions_customer_id_idx" ON "customer_sessions"("customer_id");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_e164_created_at_idx" ON "otp_challenges"("phone_e164", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_public_code_key" ON "pieces"("public_code");

-- CreateIndex
CREATE INDEX "pieces_merchant_id_idx" ON "pieces"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_id_merchant_id_key" ON "pieces"("id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_rules_merchant_id_version_key" ON "reward_rules"("merchant_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "reward_rules_id_merchant_id_key" ON "reward_rules"("id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_rules_one_active_per_merchant" ON "reward_rules"("merchant_id") WHERE (active);

-- CreateIndex
CREATE INDEX "stamps_membership_id_cycle_idx" ON "stamps"("membership_id", "cycle");

-- CreateIndex
CREATE INDEX "stamps_membership_id_created_at_idx" ON "stamps"("membership_id", "created_at");

-- CreateIndex
CREATE INDEX "stamps_merchant_id_created_at_idx" ON "stamps"("merchant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stamps_merchant_id_idempotency_key_key" ON "stamps"("merchant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "redemptions_merchant_id_created_at_idx" ON "redemptions"("merchant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_merchant_id_idempotency_key_key" ON "redemptions"("merchant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_one_valid_per_cycle" ON "redemptions"("membership_id", "cycle") WHERE (voided_at IS NULL);

-- CreateIndex
CREATE INDEX "audit_events_merchant_id_created_at_idx" ON "audit_events"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_selected_merchant_id_fkey" FOREIGN KEY ("staff_user_id", "selected_merchant_id") REFERENCES "staff_memberships"("staff_user_id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_admin_sessions" ADD CONSTRAINT "platform_admin_sessions_platform_admin_id_fkey" FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_current_cycle_reward_rule_id_merchant_id_fkey" FOREIGN KEY ("current_cycle_reward_rule_id", "merchant_id") REFERENCES "reward_rules"("id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_joined_via_piece_id_merchant_id_fkey" FOREIGN KEY ("joined_via_piece_id", "merchant_id") REFERENCES "pieces"("id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_rules" ADD CONSTRAINT "reward_rules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_membership_id_merchant_id_fkey" FOREIGN KEY ("membership_id", "merchant_id") REFERENCES "memberships"("id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_granted_by_staff_id_merchant_id_fkey" FOREIGN KEY ("granted_by_staff_id", "merchant_id") REFERENCES "staff_memberships"("staff_user_id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_voided_by_staff_id_merchant_id_fkey" FOREIGN KEY ("voided_by_staff_id", "merchant_id") REFERENCES "staff_memberships"("staff_user_id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_membership_id_merchant_id_fkey" FOREIGN KEY ("membership_id", "merchant_id") REFERENCES "memberships"("id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_rule_id_merchant_id_fkey" FOREIGN KEY ("reward_rule_id", "merchant_id") REFERENCES "reward_rules"("id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_confirmed_by_staff_id_merchant_id_fkey" FOREIGN KEY ("confirmed_by_staff_id", "merchant_id") REFERENCES "staff_memberships"("staff_user_id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_voided_by_staff_id_merchant_id_fkey" FOREIGN KEY ("voided_by_staff_id", "merchant_id") REFERENCES "staff_memberships"("staff_user_id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Controles de valores (agregados a mano: Prisma no genera CHECK) ─────────

ALTER TABLE "merchants"
  ADD CONSTRAINT "merchants_stamp_cooldown_minutes_check" CHECK ("stamp_cooldown_minutes" >= 0);

ALTER TABLE "reward_rules"
  ADD CONSTRAINT "reward_rules_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "reward_rules_stamps_required_check" CHECK ("stamps_required" >= 1);

-- Cuenta activa: nombre y teléfono obligatorios. Cuenta borrada: anonimizada.
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_active_or_anonymized_check" CHECK (
    ("deleted_at" IS NULL AND "name" IS NOT NULL AND "phone_e164" IS NOT NULL)
    OR ("deleted_at" IS NOT NULL AND "name" IS NULL AND "phone_e164" IS NULL)
  );

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_current_cycle_check" CHECK ("current_cycle" >= 1),
  ADD CONSTRAINT "memberships_marketing_consent_at_check" CHECK (NOT "marketing_consent" OR "marketing_consent_at" IS NOT NULL);

ALTER TABLE "otp_challenges"
  ADD CONSTRAINT "otp_challenges_attempts_check" CHECK ("attempts" >= 0);

-- Una anulación siempre registra quién la hizo.
ALTER TABLE "stamps"
  ADD CONSTRAINT "stamps_cycle_check" CHECK ("cycle" >= 1),
  ADD CONSTRAINT "stamps_voided_by_check" CHECK (("voided_at" IS NULL) = ("voided_by_staff_id" IS NULL));

ALTER TABLE "redemptions"
  ADD CONSTRAINT "redemptions_cycle_check" CHECK ("cycle" >= 1),
  ADD CONSTRAINT "redemptions_stamps_used_check" CHECK ("stamps_used" >= 1),
  ADD CONSTRAINT "redemptions_carry_over_check" CHECK ("carry_over" >= 0),
  ADD CONSTRAINT "redemptions_voided_by_check" CHECK (("voided_at" IS NULL) = ("voided_by_staff_id" IS NULL));
