-- Adds optional email+password auth alongside Azure AD sign-in.
ALTER TABLE "Consultant" ADD COLUMN "passwordHash" TEXT;
