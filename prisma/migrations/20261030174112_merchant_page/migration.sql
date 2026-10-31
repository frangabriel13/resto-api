-- CreateEnum
CREATE TYPE "wifi_security" AS ENUM ('WPA', 'WEP', 'NONE');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "cover_url" TEXT,
ADD COLUMN     "facebook_url" TEXT,
ADD COLUMN     "instagram_username" TEXT,
ADD COLUMN     "tiktok_username" TEXT,
ADD COLUMN     "whatsapp_phone_e164" TEXT,
ADD COLUMN     "wifi_password" TEXT,
ADD COLUMN     "wifi_security" "wifi_security",
ADD COLUMN     "wifi_ssid" TEXT;

-- El Wi-Fi va completo o vacío: una red abierta (NONE) sin contraseña, una
-- con seguridad con contraseña.
ALTER TABLE "merchants"
  ADD CONSTRAINT "merchants_wifi_check" CHECK (
    ("wifi_ssid" IS NULL AND "wifi_security" IS NULL AND "wifi_password" IS NULL)
    OR ("wifi_ssid" IS NOT NULL AND "wifi_security" = 'NONE' AND "wifi_password" IS NULL)
    OR ("wifi_ssid" IS NOT NULL AND "wifi_security" IN ('WPA', 'WEP') AND "wifi_password" IS NOT NULL)
  );
