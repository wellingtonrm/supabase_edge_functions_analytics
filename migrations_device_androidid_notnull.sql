-- Primeiro, atualizar registros existentes com NULL para evitar erro na constraint
UPDATE "Device" SET "androidId" = '' WHERE "androidId" IS NULL;

-- Adicionar NOT NULL constraint
ALTER TABLE "Device" ALTER COLUMN "androidId" SET NOT NULL;
