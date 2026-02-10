
import { supabase } from '../supabaseClient';
import { CaseData, CaseStatus, JudgePersona } from "../types";

// Database Schema Mapper
// Maps frontend CamelCase to database snake_case
function mapToDb(data: Partial<CaseData>): any {
  const map: any = {};
  
  if (data.status !== undefined) map.status = data.status;
  if (data.description !== undefined) map.description = data.description;
  if (data.demands !== undefined) map.demands = data.demands;
  if (data.title !== undefined) map.title = data.title;
  if (data.plaintiffSummary !== undefined) map.plaintiff_summary = data.plaintiffSummary;
  if (data.evidence !== undefined) map.evidence = data.evidence;
  
  if (data.defenseStatement !== undefined) map.defense_statement = data.defenseStatement;
  if (data.defenseSummary !== undefined) map.defense_summary = data.defenseSummary;
  if (data.defendantEvidence !== undefined) map.defendant_evidence = data.defendantEvidence;
  
  if (data.plaintiffRebuttal !== undefined) map.plaintiff_rebuttal = data.plaintiffRebuttal;
  if (data.plaintiffRebuttalEvidence !== undefined) map.plaintiff_rebuttal_evidence = data.plaintiffRebuttalEvidence;
  
  if (data.defendantRebuttal !== undefined) map.defendant_rebuttal = data.defendantRebuttal;
  if (data.defendantRebuttalEvidence !== undefined) map.defendant_rebuttal_evidence = data.defendantRebuttalEvidence;
  
  if (data.judgePersona !== undefined) map.judge_persona = data.judgePersona;
  if (data.verdict !== undefined) map.verdict = data.verdict;

  // Always update timestamp
  map.updated_at = new Date().toISOString();
  
  return map;
}

function mapFromDb(row: any): CaseData {
  return {
    id: row.id,
    shareCode: row.share_code,
    createdDate: new Date(row.created_at).getTime(),
    lastUpdateDate: new Date(row.updated_at).getTime(),
    plaintiffId: row.plaintiff_id,
    defendantId: row.defendant_id,
    
    category: row.category,
    description: row.description || "",
    title: row.title,
    plaintiffSummary: row.plaintiff_summary,
    demands: row.demands || "",
    
    evidence: row.evidence || [],
    defenseStatement: row.defense_statement || "",
    defenseSummary: row.defense_summary,
    defendantEvidence: row.defendant_evidence || [],
    
    plaintiffRebuttal: row.plaintiff_rebuttal || "",
    plaintiffRebuttalEvidence: row.plaintiff_rebuttal_evidence || [],
    defendantRebuttal: row.defendant_rebuttal || "",
    defendantRebuttalEvidence: row.defendant_rebuttal_evidence || [],
    
    judgePersona: row.judge_persona || JudgePersona.BORDER_COLLIE,
    status: row.status,
    verdict: row.verdict
  };
}

export const CaseService = {
  // Create a new case
  createCase: async (plaintiffId: string): Promise<CaseData> => {
    const shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Explicitly using plaintiff_id as requested by the user to fix the bug
    const { data, error } = await supabase.from('cases').insert({
      plaintiff_id: plaintiffId, // <--- User requested fix here
      share_code: shareCode,
      category: '亲密关系纠纷',
      status: CaseStatus.DRAFTING,
      judge_persona: JudgePersona.BORDER_COLLIE,
      // Default empty JSONB fields
      evidence: [],
      defendant_evidence: [],
      description: "",
      demands: "",
      title: "新案件" // Ensure title is set
    }).select().single();

    if (error) {
      console.error("Supabase Create Error:", error);
      throw error;
    }

    if (!data) {
      throw new Error("Creation failed: No data returned. This might be due to RLS policies.");
    }

    return mapFromDb(data);
  },

  // Get a case by ID
  getCase: async (id: string): Promise<CaseData | null> => {
    const { data, error } = await supabase.from('cases').select('*').eq('id', id).single();
    if (error) {
      // console.error("Get Case Error:", error);
      return null;
    }
    return mapFromDb(data);
  },

  // Get all cases relevant to a user
  getCasesForUser: async (userId: string): Promise<CaseData[]> => {
    // Filter where user is plaintiff OR defendant
    const { data, error } = await supabase.from('cases')
      .select('*')
      .or(`plaintiff_id.eq.${userId},defendant_id.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error("Get User Cases Error:", error);
      return [];
    }
    return data.map(mapFromDb);
  },

  // Join a case via code
  joinCase: async (code: string, defendantId: string): Promise<{ success: boolean, caseId?: string, error?: string }> => {
    // 1. Find the case
    const { data: caseItem, error } = await supabase
      .from('cases')
      .select('*')
      .eq('share_code', code)
      .single();
    
    if (error || !caseItem) return { success: false, error: "无效的案件代码" };
    if (caseItem.plaintiff_id === defendantId) return { success: false, error: "您是原告，无法作为被告加入" };
    if (caseItem.defendant_id && caseItem.defendant_id !== defendantId) return { success: false, error: "该案件已有被告" };

    // 2. Update the case
    const { error: updateError } = await supabase
      .from('cases')
      .update({
        defendant_id: defendantId,
        status: CaseStatus.DEFENSE_PENDING, // Auto-advance status if needed, or keep current
        updated_at: new Date().toISOString()
      })
      .eq('id', caseItem.id);

    if (updateError) return { success: false, error: "加入失败" };
    
    return { success: true, caseId: caseItem.id };
  },

  // Update a case
  updateCase: async (id: string, updates: Partial<CaseData>): Promise<CaseData> => {
    const dbUpdates = mapToDb(updates);
    const { data, error } = await supabase
      .from('cases')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error("Update Case Error:", error);
      throw error;
    }
    return mapFromDb(data);
  },

  // Delete a case
  deleteCase: async (id: string): Promise<void> => {
    await supabase.from('cases').delete().eq('id', id);
  }
};
