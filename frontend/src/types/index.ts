export type UserRole = "INDIVIDUAL" | "BUSINESS" | "EXPERT" | "OWNER";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface Service {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  estimatedDays: number;
  baseFeeSar: string;
  requiredDocs: string[];
}

export type OperationStatus =
  | "PENDING_PAYMENT"
  | "DOCS_REQUIRED"
  | "IN_PROGRESS"
  | "DELAYED"
  | "ESCALATED_TO_EXPERT"
  | "COMPLETED"
  | "CANCELLED";

export interface OperationStep {
  id: string;
  stepNumber: number;
  titleAr: string;
  titleEn: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE";
  executedBy: "AUTO" | "EXPERT";
  expertNote?: string | null;
}

export interface DocumentItem {
  id: string;
  docType: string;
  fileUrl: string | null;
  status: "PENDING" | "UPLOADED" | "VERIFIED" | "REJECTED";
}

export interface Operation {
  id: string;
  userId: string;
  serviceId: string;
  service: Service;
  status: OperationStatus;
  executorType: "AUTO" | "EXPERT";
  feeAmountSar: string;
  feePaid: boolean;
  currentStep: number;
  totalSteps: number;
  delayed: boolean;
  delayReason?: string | null;
  expectedCompletionAt: string | null;
  createdAt: string;
  steps: OperationStep[];
  documents: DocumentItem[];
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  diagnosedService: { code: string; nameAr: string; feeAmountSar: string } | null;
  operationId: string | null;
  needsClarification: boolean;
}
