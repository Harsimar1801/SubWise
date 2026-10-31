-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "confirmedAt" TIMESTAMPTZ(3),
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubscriptionItem" ADD COLUMN     "allowEarlyClosure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowPause" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowRenew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowResume" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoCloseAtExpiry" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SubscriptionActivity" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" "SubscriptionStatus",
    "toStatus" "SubscriptionStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionActivity_subscriptionId_createdAt_idx" ON "SubscriptionActivity"("subscriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionActivity" ADD CONSTRAINT "SubscriptionActivity_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_payment_terms_check" CHECK ("paymentTermsDays" BETWEEN 0 AND 365);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_payment_terms_check" CHECK ("paymentTermsDays" BETWEEN 0 AND 365);
