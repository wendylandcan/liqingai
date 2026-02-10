
export enum CaseStatus {
  DRAFTING = 'DRAFTING', // Plaintiff is writing initial statement
  PLAINTIFF_EVIDENCE = 'PLAINTIFF_EVIDENCE', // Plaintiff is adding initial evidence
  DEFENSE_PENDING = 'DEFENSE_PENDING', // Waiting for Defendant to join/respond
  CROSS_EXAMINATION = 'CROSS_EXAMINATION', // Both parties can rebut/cross-examine
  ADJUDICATING = 'ADJUDICATING', // AI is processing
  CLOSED = 'CLOSED', // Verdict delivered
  CANCELLED = 'CANCELLED', // Case cancelled by plaintiff
}

export enum UserRole {
  PLAINTIFF = 'PLAINTIFF',
  DEFENDANT = 'DEFENDANT',
  SPECTATOR = 'SPECTATOR',
}

export enum JudgePersona {
  BORDER_COLLIE = 'BORDER_COLLIE', // 边牧法官: 逻辑，中立，理性
  CAT = 'CAT',                     // 猫猫法官: 情理，抚慰，调解
}

export enum EvidenceType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
}

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  content: string; // Text content, Image URL, or Audio Transcript/URL
  description?: string;
  isContested: boolean; // Has the opposing party objected?
  submittedBy: UserRole;
}

export interface CaseData {
  id: string;
  shareCode: string; // 6-digit code for defendant to join
  createdDate: number;
  lastUpdateDate: number;
  
  // User Identity
  plaintiffId: string; // Username
  defendantId?: string; // Username

  // Case Content
  title?: string; // AI Summarized short title
  category: string;
  description: string;
  plaintiffSummary?: string; // AI Summarized description
  demands: string;
  
  // Evidence & Arguments
  evidence: EvidenceItem[];
  defenseStatement: string;
  defenseSummary?: string; // AI Summarized defense statement
  defendantEvidence: EvidenceItem[];
  
  // Cross Examination
  plaintiffRebuttal: string;
  plaintiffRebuttalEvidence: EvidenceItem[];
  defendantRebuttal: string;
  defendantRebuttalEvidence: EvidenceItem[];

  judgePersona: JudgePersona;
  status: CaseStatus;
  verdict?: Verdict;
}

export interface Verdict {
  summary: string;
  facts: string[];
  responsibilitySplit: {
    plaintiff: number; // Percentage
    defendant: number;
  };
  reasoning: string;
  finalJudgment: string;
  penaltyTasks: string[];
  tone: string;
}

export interface FactCheckResult {
  facts: string[];
}

export interface SentimentResult {
  isToxic: boolean;
  score: number; // 0-10
  reason: string;
}
