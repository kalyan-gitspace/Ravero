CREATE TABLE "google_maps_monthly_usage" (
    "month" DATE NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_maps_monthly_usage_pkey" PRIMARY KEY ("month", "sku"),
    CONSTRAINT "google_maps_monthly_usage_request_count_check" CHECK ("request_count" >= 0)
);
