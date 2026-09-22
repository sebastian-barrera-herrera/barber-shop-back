-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('BARBERSHOP', 'SALON', 'SPA', 'NAILS', 'AESTHETICS', 'OTHER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('WEB', 'ADMIN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WEB', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BusinessType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CO',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "locale" TEXT NOT NULL DEFAULT 'es-CO',
    "logoUrl" TEXT,
    "heroImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_settings" (
    "businessId" UUID NOT NULL,
    "branding" JSONB NOT NULL DEFAULT '{}',
    "social" JSONB NOT NULL DEFAULT '{}',
    "openingHours" JSONB NOT NULL DEFAULT '[]',
    "booking" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "categoryId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "social" JSONB,
    "color" TEXT NOT NULL DEFAULT '#141412',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_services" (
    "professionalId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,

    CONSTRAINT "professional_services_pkey" PRIMARY KEY ("professionalId","serviceId")
);

-- CreateTable
CREATE TABLE "working_hours" (
    "id" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "startMinute" SMALLINT NOT NULL,
    "endMinute" SMALLINT NOT NULL,

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "professionalId" UUID,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "source" "AppointmentSource" NOT NULL DEFAULT 'WEB',
    "serviceNameSnapshot" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" "PaymentMethod",
    "notes" TEXT,
    "internalNotes" TEXT,
    "accessTokenHash" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "reminder24hSentAt" TIMESTAMPTZ(3),
    "reminder2hSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_configs" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "environment" "PaymentEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "publicKey" TEXT,
    "encryptedSecrets" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "channel" "ChannelType" NOT NULL DEFAULT 'WEB',
    "externalId" TEXT,
    "lastMessageAt" TIMESTAMPTZ(3),
    "unreadForBusiness" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "userId" UUID,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_businessId_idx" ON "users"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "categories_businessId_sortOrder_idx" ON "categories"("businessId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "categories_businessId_slug_key" ON "categories"("businessId", "slug");

-- CreateIndex
CREATE INDEX "services_businessId_categoryId_idx" ON "services"("businessId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "services_businessId_slug_key" ON "services"("businessId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_userId_key" ON "professionals"("userId");

-- CreateIndex
CREATE INDEX "professionals_businessId_idx" ON "professionals"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_businessId_slug_key" ON "professionals"("businessId", "slug");

-- CreateIndex
CREATE INDEX "professional_services_serviceId_idx" ON "professional_services"("serviceId");

-- CreateIndex
CREATE INDEX "working_hours_professionalId_weekday_idx" ON "working_hours"("professionalId", "weekday");

-- CreateIndex
CREATE INDEX "time_off_businessId_startsAt_idx" ON "time_off"("businessId", "startsAt");

-- CreateIndex
CREATE INDEX "time_off_professionalId_startsAt_idx" ON "time_off"("professionalId", "startsAt");

-- CreateIndex
CREATE INDEX "customers_businessId_name_idx" ON "customers"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_businessId_phone_key" ON "customers"("businessId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_accessTokenHash_key" ON "appointments"("accessTokenHash");

-- CreateIndex
CREATE INDEX "appointments_businessId_startsAt_idx" ON "appointments"("businessId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_professionalId_startsAt_idx" ON "appointments"("professionalId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_customerId_idx" ON "appointments"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerReference_key" ON "payments"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerTransactionId_key" ON "payments"("providerTransactionId");

-- CreateIndex
CREATE INDEX "payments_businessId_createdAt_idx" ON "payments"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_appointmentId_idx" ON "payments"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_configs_businessId_provider_key" ON "payment_provider_configs"("businessId", "provider");

-- CreateIndex
CREATE INDEX "conversations_businessId_lastMessageAt_idx" ON "conversations"("businessId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_businessId_customerId_channel_key" ON "conversations"("businessId", "customerId", "channel");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_businessId_readAt_idx" ON "notifications"("businessId", "readAt");

-- AddForeignKey
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_provider_configs" ADD CONSTRAINT "payment_provider_configs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Reglas que Prisma no puede expresar ─────────────

-- Evita la doble reserva a nivel de base de datos: un profesional no puede tener
-- dos citas activas que se crucen, aunque dos solicitudes lleguen al mismo tiempo.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "professionalId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));

ALTER TABLE "appointments"   ADD CONSTRAINT "appointments_time_order"   CHECK ("endsAt" > "startsAt");
ALTER TABLE "time_off"       ADD CONSTRAINT "time_off_time_order"       CHECK ("endsAt" > "startsAt");
ALTER TABLE "working_hours"  ADD CONSTRAINT "working_hours_range"       CHECK ("weekday" BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute");
ALTER TABLE "services"       ADD CONSTRAINT "services_positive"         CHECK ("priceCents" >= 0 AND "durationMinutes" > 0);
ALTER TABLE "appointments"   ADD CONSTRAINT "appointments_positive"     CHECK ("priceCents" >= 0 AND "durationMinutes" > 0);
