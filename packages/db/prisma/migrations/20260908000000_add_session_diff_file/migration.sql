-- CreateTable
CREATE TABLE "SessionDiffFile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "previousPath" TEXT,
    "additions" INTEGER NOT NULL,
    "deletions" INTEGER NOT NULL,
    "patch" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionDiffFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionDiffFile_sessionId_path_key" ON "SessionDiffFile"("sessionId", "path");

-- AddForeignKey
ALTER TABLE "SessionDiffFile" ADD CONSTRAINT "SessionDiffFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
