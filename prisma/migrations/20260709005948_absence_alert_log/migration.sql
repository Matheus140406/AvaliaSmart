-- CreateTable
CREATE TABLE "AbsenceAlertLog" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "lastAbsenceDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceAlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceAlertLog_enrollmentId_classSubjectId_lastAbsenceDate_key" ON "AbsenceAlertLog"("enrollmentId", "classSubjectId", "lastAbsenceDate");
