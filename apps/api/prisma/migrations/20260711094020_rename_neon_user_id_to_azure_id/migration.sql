-- Rename Consultant.neonUserId to azureId (auth moved from Neon Auth to
-- NextAuth + Azure AD; azureId stores Azure's stable object id / oid claim).
ALTER TABLE "Consultant" RENAME COLUMN "neonUserId" TO "azureId";
