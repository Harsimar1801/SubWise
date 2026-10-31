-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costPriceMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'LKR',
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sellingPriceMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'SERVICE';

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "additionalPriceMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowEarlyClosure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowPause" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowRenew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowResume" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoCloseAtExpiry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "availableFrom" TIMESTAMPTZ(3),
ADD COLUMN     "availableUntil" TIMESTAMPTZ(3),
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minimumQuantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "DiscountRule" ADD COLUMN     "maximumUses" INTEGER,
ADD COLUMN     "minimumPurchaseMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minimumQuantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DiscountRule_productId_idx" ON "DiscountRule"("productId");

-- AddForeignKey
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_catalog_check" CHECK ("type" IN ('SERVICE','GOODS') AND "sellingPriceMinor" >= 0 AND "costPriceMinor" >= 0 AND "currency" ~ '^[A-Z]{3}$');
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_check" CHECK ("additionalPriceMinor" >= 0);
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_catalog_check" CHECK ("minimumQuantity" > 0 AND ("availableFrom" IS NULL OR "availableUntil" IS NULL OR "availableUntil" >= "availableFrom"));
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_eligibility_check" CHECK ("minimumPurchaseMinor" >= 0 AND "minimumQuantity" > 0 AND "usageCount" >= 0 AND ("maximumUses" IS NULL OR ("maximumUses" > 0 AND "usageCount" <= "maximumUses")) AND (("scope" = 'PRODUCT' AND "productId" IS NOT NULL) OR ("scope" = 'SUBSCRIPTION' AND "productId" IS NULL)));
