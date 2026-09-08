-- AlterTable
ALTER TABLE "SessionDiffFile" ADD COLUMN "oldContent" TEXT,
ADD COLUMN "newContent" TEXT,
ADD COLUMN "contentTooLarge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "binary" BOOLEAN NOT NULL DEFAULT false;
