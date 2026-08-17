-- CreateTable
CREATE TABLE "IsspDocument" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "agencyAcronym" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "planStatus" TEXT NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsspDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IsspDocument_ownerId_idx" ON "IsspDocument"("ownerId");
