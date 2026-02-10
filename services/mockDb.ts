
import { CaseData, CaseStatus, JudgePersona } from "../types";

const DB_KEY = 'court_of_love_db_v1';

// Helper to generate a random 6-character code
const generateCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const getDb = (): Record<string, CaseData> => {
  const str = localStorage.getItem(DB_KEY);
  return str ? JSON.parse(str) : {};
};

const saveDb = (db: Record<string, CaseData>) => {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
};

export const MockDb = {
  // Create a new case
  createCase: (plaintiffId: string): CaseData => {
    const db = getDb();
    const id = Date.now().toString();
    const newCase: CaseData = {
      id,
      shareCode: generateCode(),
      createdDate: Date.now(),
      lastUpdateDate: Date.now(),
      plaintiffId,
      category: '亲密关系纠纷',
      description: '',
      title: '', // Initialize empty title
      plaintiffSummary: '', // Initialize empty summary
      demands: '',
      evidence: [],
      defenseStatement: '',
      defenseSummary: '', // Initialize empty defense summary
      defendantEvidence: [],
      plaintiffRebuttal: '',
      plaintiffRebuttalEvidence: [],
      defendantRebuttal: '',
      defendantRebuttalEvidence: [],
      disputePoints: [], // Initialize empty dispute points
      judgePersona: JudgePersona.BORDER_COLLIE, // Default to Border Collie
      status: CaseStatus.DRAFTING
    };
    db[id] = newCase;
    saveDb(db);
    return newCase;
  },

  // Get a case by ID
  getCase: (id: string): CaseData | null => {
    const db = getDb();
    return db[id] || null;
  },

  // Get all cases relevant to a user
  getCasesForUser: (userId: string): CaseData[] => {
    const db = getDb();
    return Object.values(db).filter(c => c.plaintiffId === userId || c.defendantId === userId).sort((a, b) => b.lastUpdateDate - a.lastUpdateDate);
  },

  // Join a case via code
  joinCase: (code: string, defendantId: string): { success: boolean, caseId?: string, error?: string } => {
    const db = getDb();
    const caseItem = Object.values(db).find(c => c.shareCode === code);
    
    if (!caseItem) return { success: false, error: "无效的案件代码" };
    if (caseItem.plaintiffId === defendantId) return { success: false, error: "您是原告，无法作为被告加入" };
    if (caseItem.defendantId && caseItem.defendantId !== defendantId) return { success: false, error: "该案件已有被告" };

    caseItem.defendantId = defendantId;
    caseItem.lastUpdateDate = Date.now();
    saveDb(db);
    return { success: true, caseId: caseItem.id };
  },

  // Update a case
  updateCase: (id: string, updates: Partial<CaseData>): CaseData => {
    const db = getDb();
    if (!db[id]) throw new Error("Case not found");
    
    db[id] = { ...db[id], ...updates, lastUpdateDate: Date.now() };
    saveDb(db);
    return db[id];
  },

  // Delete a case
  deleteCase: (id: string) => {
    const db = getDb();
    if (db[id]) {
      delete db[id];
      saveDb(db);
    }
  },

  // For debugging/demo: Clear DB
  clear: () => localStorage.removeItem(DB_KEY)
};