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
  joinCase: async (code: string, defendantId: string): Promise<{ success: boolean, caseId?: string, error?: string }> => {
    const db = getDb();
    const cleanCode = code.trim().toUpperCase();

    try {
      // 1. Query Cloud (Supabase) first
      const { data: remoteCase, error } = await supabase
        .from('cases')
        .select('*')
        .eq('share_code', cleanCode)
        .single();

      if (error || !remoteCase) {
        return { success: false, error: "无效的案件代码" };
      }

      // 2. Validate Identity
      if (remoteCase.plaintiff_id === defendantId) {
        return { success: false, error: "您是原告，无法作为被告加入" };
      }

      if (remoteCase.defendant_id && remoteCase.defendant_id !== defendantId) {
        return { success: false, error: "该案件已有被告" };
      }

      // 3. Update Cloud (if not already set)
      if (!remoteCase.defendant_id) {
        const { error: updateError } = await supabase
          .from('cases')
          .update({ defendant_id: defendantId })
          .eq('id', remoteCase.id);
        
        if (updateError) {
          console.error("Join update failed:", updateError);
          return { success: false, error: "加入失败: 云端同步错误" };
        }
        // Optimistically update local reference
        remoteCase.defendant_id = defendantId;
      }

      // 4. Sync to Local Cache (Map snake_case DB to camelCase App)
      // This ensures the user has the case data locally immediately
      const localCase: CaseData = {
        id: remoteCase.id,
        shareCode: remoteCase.share_code,
        createdDate: new Date(remoteCase.created_at).getTime(),
        lastUpdateDate: Date.now(),
        plaintiffId: remoteCase.plaintiff_id,
        defendantId: remoteCase.defendant_id,
        category: remoteCase.category,
        description: remoteCase.description || '',
        title: remoteCase.title,
        plaintiffSummary: remoteCase.plaintiff_summary,
        demands: remoteCase.demands || '',
        evidence: remoteCase.evidence || [],
        defenseStatement: remoteCase.defense_statement || '',
        defenseSummary: remoteCase.defense_summary,
        defendantEvidence: remoteCase.defendant_evidence || [],
        plaintiffRebuttal: remoteCase.plaintiff_rebuttal || '',
        // Handle potentially missing columns gracefully with defaults
        plaintiffRebuttalEvidence: remoteCase.plaintiff_rebuttal_evidence || [], 
        defendantRebuttal: remoteCase.defendant_rebuttal || '',
        defendantRebuttalEvidence: remoteCase.defendant_rebuttal_evidence || [],
        disputePoints: remoteCase.dispute_points || [],
        judgePersona: remoteCase.judge_persona || JudgePersona.BORDER_COLLIE,
        status: remoteCase.status as CaseStatus,
        verdict: remoteCase.verdict
      };

      db[localCase.id] = localCase;
      saveDb(db);

      return { success: true, caseId: localCase.id };

    } catch (e) {
      console.error("Join error:", e);
      return { success: false, error: "网络连接失败，请稍后重试" };
    }
  },

  // Sync a specific case from Cloud to Local (Fix for Plaintiff waiting screen)
  syncCaseFromCloud: async (caseId: string): Promise<CaseData | null> => {
    const db = getDb();
    
    try {
      const { data: remoteCase, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', caseId)
        .single();

      if (error || !remoteCase) {
        // If fetch fails, return local version if exists, or null
        return db[caseId] || null;
      }

      // --- CONFLICT RESOLUTION LOGIC ---
      // Check if the local status is "ahead" of the remote status. 
      // This happens when we just updated the status locally (e.g., to DEBATE) 
      // but the remote DB (or read replica) is slightly behind or this poll request 
      // was initiated before the update completed.
      const local = db[caseId];
      if (local && local.status) {
          const statusOrder = {
            [CaseStatus.DRAFTING]: 0,
            [CaseStatus.PLAINTIFF_EVIDENCE]: 1,
            [CaseStatus.DEFENSE_PENDING]: 2,
            [CaseStatus.CROSS_EXAMINATION]: 3,
            [CaseStatus.DEBATE]: 4,
            [CaseStatus.ADJUDICATING]: 5,
            [CaseStatus.CLOSED]: 6,
            [CaseStatus.CANCELLED]: 99
          };
          
          const localS = local.status as CaseStatus;
          const remoteS = remoteCase.status as CaseStatus;
          const localLevel = statusOrder[localS] || 0;
          const remoteLevel = statusOrder[remoteS] || 0;

          // Specific fix: If local is in DEBATE (4) or ADJUDICATING (5) 
          // and remote is still in CROSS_EXAMINATION (3), 
          // it is extremely likely to be stale data. Ignore it.
          if (localLevel > remoteLevel && remoteS === CaseStatus.CROSS_EXAMINATION) {
              console.log(`[Sync] Ignoring stale remote data. Local: ${localS} > Remote: ${remoteS}`);
              // We return null to indicate "no update needed/valid from cloud", 
              // BUT the calling function expects CaseData. 
              // Returning 'local' keeps the app state consistent.
              return local;
          }
      }
      // ---------------------------------

      // Map snake_case to camelCase
      const localCase: CaseData = {
        id: remoteCase.id,
        shareCode: remoteCase.share_code,
        createdDate: new Date(remoteCase.created_at).getTime(),
        lastUpdateDate: Date.now(), // Force update timestamp
        plaintiffId: remoteCase.plaintiff_id,
        defendantId: remoteCase.defendant_id,
        category: remoteCase.category,
        description: remoteCase.description || '',
        title: remoteCase.title,
        plaintiffSummary: remoteCase.plaintiff_summary,
        demands: remoteCase.demands || '',
        evidence: remoteCase.evidence || [],
        defenseStatement: remoteCase.defense_statement || '',
        defenseSummary: remoteCase.defense_summary,
        defendantEvidence: remoteCase.defendant_evidence || [],
        plaintiffRebuttal: remoteCase.plaintiff_rebuttal || '',
        plaintiffRebuttalEvidence: remoteCase.plaintiff_rebuttal_evidence || [], 
        defendantRebuttal: remoteCase.defendant_rebuttal || '',
        defendantRebuttalEvidence: remoteCase.defendant_rebuttal_evidence || [],
        disputePoints: remoteCase.dispute_points || [],
        judgePersona: remoteCase.judge_persona || JudgePersona.BORDER_COLLIE,
        status: remoteCase.status as CaseStatus,
        verdict: remoteCase.verdict
      };

      // Update Local Cache
      db[localCase.id] = localCase;
      saveDb(db);

      return localCase;

    } catch (e) {
      console.warn("Sync failed, returning local data:", e);
      return db[caseId] || null;
    }
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