-- CreateTable
CREATE TABLE "ClientConsultant" (
    "clientId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientConsultant_pkey" PRIMARY KEY ("clientId","consultantId")
);

-- CreateIndex
CREATE INDEX "ClientConsultant_consultantId_idx" ON "ClientConsultant"("consultantId");

-- AddForeignKey
ALTER TABLE "ClientConsultant" ADD CONSTRAINT "ClientConsultant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientConsultant" ADD CONSTRAINT "ClientConsultant_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
