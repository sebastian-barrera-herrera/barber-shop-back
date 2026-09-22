-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "currentPeriodEnd" TIMESTAMPTZ(3),
ADD COLUMN     "subscriptionPlan" "SubscriptionPlan",
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN     "trialEndsAt" TIMESTAMPTZ(3);
