import { CaseData, CaseStatus, JudgePersona } from "../types";
import { supabase } from '../supabaseClient';

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
  createCase: async (plaintiffId: string): Promise<CaseData> => {
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

    // Sync to Supabase (Add real DB insert)
    try {
      // NOTE: Using 'plaintiff_id' as per database structure requirement
      const { error } = await supabase.from('cases').insert({
        id: newCase.id,
        plaintiff_id: plaintiffId, // Correctly mapped from user_id/plaintiffId to plaintiff_id
        share_code: newCase.shareCode,
        category: newCase.category,
        description: newCase.description,
        status: newCase.status,
        created_at: new Date(newCase.createdDate).toISOString(),
        // Store initial empty structure if needed by your DB constraints, 
        // or rely on DB defaults.
      });

      if (error) {
        console.warn("Supabase insert failed (falling back to local):", error.message);
      }
    } catch (e) {
      console.warn("Supabase connection error:", e);
    }

    // Always save to local mock DB for instant UI feedback/offline capability
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
  updateCase: async (id: string, updates: Partial<CaseData>): Promise<CaseData> => {
    const db = getDb();
    if (!db[id]) throw new Error("Case not found");
    
    // 1. Optimistic Local Update
    const updatedCase = { ...db[id], ...updates, lastUpdateDate: Date.now() };
    db[id] = updatedCase;
    saveDb(db);

    // 2. Supabase Sync (Async)
    try {
        const payload: any = {};
        
        // Map fields to DB columns (snake_case)
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.demands !== undefined) payload.demands = updates.demands;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.title !== undefined) payload.title = updates.title;
        if (updates.plaintiffSummary !== undefined) payload.plaintiff_summary = updates.plaintiffSummary;
        if (updates.defenseStatement !== undefined) payload.defense_statement = updates.defenseStatement;
        if (updates.defenseSummary !== undefined) payload.defense_summary = updates.defenseSummary;
        if (updates.plaintiffRebuttal !== undefined) payload.plaintiff_rebuttal = updates.plaintiffRebuttal;
        if (updates.defendantRebuttal !== undefined) payload.defendant_rebuttal = updates.defendantRebuttal;
        
        // Handle complex objects if column exists and is jsonb
        if (updates.evidence !== undefined) payload.evidence = updates.evidence;
        if (updates.defendantEvidence !== undefined) payload.defendant_evidence = updates.defendantEvidence;
        if (updates.disputePoints !== undefined) payload.dispute_points = updates.disputePoints;
        if (updates.verdict !== undefined) payload.verdict = updates.verdict;
        if (updates.judgePersona !== undefined) payload.judge_persona = updates.judgePersona;
        if (updates.defendantId !== undefined) payload.defendant_id = updates.defendantId;

        if (Object.keys(payload).length > 0) {
            const { error } = await supabase.from('cases').update(payload).eq('id', id);
            if (error) {
                console.warn("Supabase update failed:", error.message);
            }
        }
    } catch (e) {
        console.warn("Supabase update exception:", e);
    }

    return updatedCase;
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