-- CreateTable
CREATE TABLE "ConsultantIndustry" (
    "consultantId" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,

    CONSTRAINT "ConsultantIndustry_pkey" PRIMARY KEY ("consultantId","industryId")
);

-- CreateIndex
CREATE INDEX "ConsultantIndustry_industryId_idx" ON "ConsultantIndustry"("industryId");

-- AddForeignKey
ALTER TABLE "ConsultantIndustry" ADD CONSTRAINT "ConsultantIndustry_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantIndustry" ADD CONSTRAINT "ConsultantIndustry_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
