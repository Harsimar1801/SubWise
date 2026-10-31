-- Prisma 6 does not model CHECK constraints. Keep these in migration history.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_currency_check"
  CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_values_check"
  CHECK ("unitAmountMinor" >= 0 AND "intervalCount" > 0 AND "trialDays" >= 0
    AND "currency" ~ '^[A-Z]{3}$');

ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_rate_check"
  CHECK ("rateBps" BETWEEN 0 AND 10000);

ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_values_check"
  CHECK (
    ("type" = 'FIXED' AND "amountMinor" IS NOT NULL AND "amountMinor" >= 0
      AND "currency" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$' AND "percentageBps" IS NULL)
    OR
    ("type" = 'PERCENTAGE' AND "percentageBps" IS NOT NULL
      AND "percentageBps" BETWEEN 0 AND 10000 AND "amountMinor" IS NULL AND "currency" IS NULL)
  );
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_dates_check"
  CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" >= "startsAt");

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_totals_check"
  CHECK ("currency" ~ '^[A-Z]{3}$' AND "subtotalMinor" >= 0
    AND "discountTotalMinor" >= 0 AND "discountTotalMinor" <= "subtotalMinor"
    AND "taxTotalMinor" >= 0 AND "totalMinor" >= 0
    AND "totalMinor"::bigint = "subtotalMinor"::bigint - "discountTotalMinor" + "taxTotalMinor");

ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_values_check"
  CHECK ("position" >= 0 AND "quantity" > 0 AND "unitAmountMinor" >= 0
    AND "intervalCount" > 0 AND "taxRateBps" BETWEEN 0 AND 10000
    AND "discountAmountMinor" >= 0
    AND "discountAmountMinor"::bigint <= "quantity"::bigint * "unitAmountMinor"
    AND "taxAmountMinor" >= 0 AND "totalMinor" >= 0
    AND "totalMinor"::bigint = "quantity"::bigint * "unitAmountMinor" - "discountAmountMinor" + "taxAmountMinor");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_values_check"
  CHECK ("currency" ~ '^[A-Z]{3}$' AND "intervalCount" > 0
    AND ("endsAt" IS NULL OR "endsAt" >= "startsAt")
    AND ("trialEndsAt" IS NULL OR "trialEndsAt" >= "startsAt")
    AND (("currentPeriodStart" IS NULL AND "currentPeriodEnd" IS NULL)
      OR ("currentPeriodStart" IS NOT NULL AND "currentPeriodEnd" IS NOT NULL
        AND "currentPeriodEnd" > "currentPeriodStart")));

ALTER TABLE "SubscriptionItem" ADD CONSTRAINT "SubscriptionItem_values_check"
  CHECK ("position" >= 0 AND "quantity" > 0 AND "unitAmountMinor" >= 0
    AND "taxRateBps" BETWEEN 0 AND 10000 AND "discountAmountMinor" >= 0
    AND "discountAmountMinor"::bigint <= "quantity"::bigint * "unitAmountMinor");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_totals_check"
  CHECK ("currency" ~ '^[A-Z]{3}$' AND "subtotalMinor" >= 0
    AND "discountTotalMinor" >= 0 AND "discountTotalMinor" <= "subtotalMinor"
    AND "taxTotalMinor" >= 0 AND "totalMinor" >= 0
    AND "totalMinor"::bigint = "subtotalMinor"::bigint - "discountTotalMinor" + "taxTotalMinor");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dates_check"
  CHECK (("dueAt" IS NULL OR "issuedAt" IS NULL OR "dueAt" >= "issuedAt")
    AND (("periodStart" IS NULL AND "periodEnd" IS NULL)
      OR ("periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL AND "periodEnd" > "periodStart")));

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_values_check"
  CHECK ("position" >= 0 AND "quantity" > 0 AND "unitAmountMinor" >= 0
    AND "taxRateBps" BETWEEN 0 AND 10000 AND "discountAmountMinor" >= 0
    AND "discountAmountMinor"::bigint <= "quantity"::bigint * "unitAmountMinor"
    AND "taxAmountMinor" >= 0 AND "totalMinor" >= 0
    AND "totalMinor"::bigint = "quantity"::bigint * "unitAmountMinor" - "discountAmountMinor" + "taxAmountMinor");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_values_check"
  CHECK ("amountMinor" > 0 AND "currency" ~ '^[A-Z]{3}$');
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_check"
  CHECK ("amountMinor" > 0);

ALTER TABLE "BillingRun" ADD CONSTRAINT "BillingRun_values_check"
  CHECK ("processedCount" >= 0 AND "failedCount" >= 0
    AND ("completedAt" IS NULL OR "startedAt" IS NULL OR "completedAt" >= "startedAt"));

ALTER TABLE "RecoveryEvent" ADD CONSTRAINT "RecoveryEvent_attempt_check"
  CHECK ("attemptNumber" > 0);
