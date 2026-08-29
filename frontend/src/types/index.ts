export type UserRole = "INDIVIDUAL" | "BUSINESS" | "EXPERT" | "OWNER";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export type ServiceAudience = "CITIZEN" | "RESIDENT" | "VISITOR" | "BUSINESS";

export interface Service {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  descriptionAr: string | null;
  targetAudience: ServiceAudience[];
  estimatedDays: number;
  platformFeeSar: string;
  govFeeEstimateSar: string;
  requiredDocs: string[];
}

export type OperationStatus =
  | "BIDDING"
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
  verificationNote?: string | null;
}

export interface Operation {
  id: string;
  userId: string;
  serviceId: string;
  service: Service;
  status: OperationStatus;
  executorType: "AUTO" | "EXPERT";
  feeAmountSar: string;
  targetPriceSar?: string;
  acceptedBidId?: string | null;
  govFeeEstimateSar: string;
  creditAppliedSar: string;
  feePaid: boolean;
  currentStep: number;
  totalSteps: number;
  delayed: boolean;
  delayReason?: string | null;
  expectedCompletionAt: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  steps: OperationStep[];
  documents: DocumentItem[];
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  diagnosedService: { code: string; nameAr: string; nameEn?: string; feeAmountSar: string; govFeeEstimateSar: string } | null;
  operationId: string | null;
  needsClarification: boolean;
}

// ─── سوق العروض (آلية inDrive) ───
export interface BidExpertCard {
  id: string;
  displayName: string;
  specialty: string | null;
  completedOps: number;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface Bid {
  id: string;
  priceSar: number;
  deliveryDays: number | null;
  note: string | null;
  status: "OFFERED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "EXPIRED";
  createdAt: string;
  expert: BidExpertCard;
}

export interface MarketOperation {
  id: string;
  service: { nameAr: string; nameEn: string; category: string; estimatedDays: number };
  targetPriceSar: number;
  createdAt: string;
  myBid: { id: string; priceSar: number; deliveryDays: number | null; status: string } | null;
}
