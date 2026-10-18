-- CreateTable
CREATE TABLE "IvrAudio" (
    "id" UUID NOT NULL,
    "tenantUuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "menuSound" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IvrAudio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IvrAudio_tenantUuid_createdAt_idx" ON "IvrAudio"("tenantUuid", "createdAt");
