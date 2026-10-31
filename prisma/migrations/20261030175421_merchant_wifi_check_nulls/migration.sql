-- El CHECK anterior aceptaba un Wi-Fi incompleto: con wifi_security en NULL
-- cada comparación daba NULL, y un CHECK que da NULL pasa. Con CASE, lo que no
-- encaja en ningún caso da false.
ALTER TABLE "merchants" DROP CONSTRAINT "merchants_wifi_check";
ALTER TABLE "merchants"
  ADD CONSTRAINT "merchants_wifi_check" CHECK (
    CASE
      WHEN "wifi_ssid" IS NULL
        THEN "wifi_security" IS NULL AND "wifi_password" IS NULL
      WHEN "wifi_security" = 'NONE' THEN "wifi_password" IS NULL
      WHEN "wifi_security" IN ('WPA', 'WEP') THEN "wifi_password" IS NOT NULL
      ELSE false
    END
  );
