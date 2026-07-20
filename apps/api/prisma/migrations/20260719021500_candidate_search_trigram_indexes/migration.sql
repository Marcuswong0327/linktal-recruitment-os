-- Speeds up quick-search's `contains`/ILIKE filters (see QueryCandidatesDto.q)
-- by turning a substring scan into a trigram index scan. Postgres-native,
-- no external search service.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "Candidate_fullName_trgm_idx" ON "Candidate" USING GIN ("fullName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_email_trgm_idx" ON "Candidate" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_currentPosition_trgm_idx" ON "Candidate" USING GIN ("currentPosition" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_currentCompany_trgm_idx" ON "Candidate" USING GIN ("currentCompany" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_city_trgm_idx" ON "Candidate" USING GIN ("city" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_country_trgm_idx" ON "Candidate" USING GIN ("country" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_mobile_trgm_idx" ON "Candidate" USING GIN ("mobile" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Candidate_displayId_trgm_idx" ON "Candidate" USING GIN ("displayId" gin_trgm_ops);
