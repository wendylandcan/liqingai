import { GoogleGenAI } from "@google/genai";
import { JudgePersona, Verdict, EvidenceItem, SentimentResult, FactCheckResult, DisputePoint, EvidenceType } from "../types";

// --- Environment Configuration ---

// Helper to safely get env vars
const getEnvVar = (key: string, viteKey: string): string => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
      // @ts-ignore
      return import.meta.env[viteKey];
    }
  } catch (e) {}

  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key]!;
    }
  } catch (e) {}

  if (key === 'API_KEY' && typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
  }

  return '';
};

// Keys
const GEMINI_API_KEY = getEnvVar('API_KEY', 'VITE_GEMINI_API_KEY');

// --- Initialize Client ---
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || process.env.API_KEY });

// --- Model Constants ---
// Use Flash for simple tasks (speed)
const GEMINI_MODEL_FLASH = 'gemini-3-flash-preview'; 
// Use Pro for complex analysis (replacing DeepSeek/Gemini 1.5 Pro requirement with latest Pro model)
const GEMINI_MODEL_PRO = 'gemini-3-pro-preview'; 

// --- Helper: Retry Logic ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 3, initialDelay = 2000): Promise<T> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.code;
      const message = error?.message || '';
      // Retry on transient errors
      const isTransient = status === 503 || status === 429 || status === 500 || message.includes('overloaded');
      
      if (isTransient && i < retries - 1) {
        await delay(initialDelay * Math.pow(2, i));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Core Gemini Generation Function
 */
async function callGemini(params: {
  model: string;
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  jsonMode?: boolean;
  images?: { inlineData: { data: string, mimeType: string } }[];
}): Promise<string> {
  try {
    return await retryWithBackoff(async () => {
      const config: any = {
        systemInstruction: params.systemInstruction,
        temperature: params.temperature ?? 0.7, // Default to 0.7 as requested for flexibility
      };

      if (params.jsonMode) {
        config.responseMimeType = "application/json";
      }

      let contentsInput: any;
      if (params.images && params.images.length > 0) {
        contentsInput = {
          parts: [
            { text: params.prompt },
            ...params.images
          ]
        };
      } else {
        contentsInput = params.prompt;
      }

      const response = await ai.models.generateContent({
        model: params.model,
        contents: contentsInput,
        config: config
      });

      return response.text || "";
    });
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("AI 法官正在休庭，请稍后重试");
  }
}

// --- Public Services ---

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_FLASH,
      config: {
        systemInstruction: `You are an expert transcriber. Filter out fillers. Add punctuation.`
      },
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Audio } },
          { text: "Transcribe this audio." },
        ],
      },
    });
    return response.text?.trim() || "";
  } catch (error) {
    console.error("Transcription Error", error);
    return "（语音转录失败，请重试）";
  }
};

export const summarizeStatement = async (text: string, role: string): Promise<string> => {
  if (!text) return "";
  try {
    return await callGemini({
      model: GEMINI_MODEL_FLASH,
      systemInstruction: `Summarize the ${role}'s statement into 50-100 Chinese characters. Retain facts and emotion.`,
      prompt: `Statement: "${text}"`
    });
  } catch (error) {
    return text.slice(0, 150) + "...";
  }
};

export const generateCaseTitle = async (description: string): Promise<string> => {
  try {
    const res = await callGemini({
      model: GEMINI_MODEL_FLASH,
      systemInstruction: `Summarize into a short title (max 12 chars). No quotes.`,
      prompt: `Case: "${description}"`
    });
    return res.trim();
  } catch (e) {
    return "未命名案件";
  }
};

export const polishText = async (text: string): Promise<string> => {
  try {
    return await callGemini({
      model: GEMINI_MODEL_FLASH,
      systemInstruction: `Remove profanity. Normalize judgments. Keep facts. Output only clean text.`,
      prompt: `Text: "${text}"`
    });
  } catch (e) {
    return text;
  }
};

export const fixGrammar = async (text: string): Promise<string> => {
  try {
    return await callGemini({
      model: GEMINI_MODEL_FLASH,
      systemInstruction: `Add punctuation. Remove fillers (uh, um). Fix fragments. Keep tone.`,
      prompt: `Text: "${text}"`
    });
  } catch (e) {
    return text;
  }
};

export const analyzeSentiment = async (text: string): Promise<SentimentResult> => {
  try {
    const res = await callGemini({
      model: GEMINI_MODEL_FLASH,
      jsonMode: true,
      systemInstruction: `Analyze for toxicity. Return JSON: {isToxic, score, reason}.`,
      prompt: `Text: "${text}"`
    });
    return JSON.parse(res);
  } catch (e) {
    return { isToxic: false, score: 0, reason: "" };
  }
};

export const extractFactPoints = async (narrative: string): Promise<FactCheckResult> => {
  try {
    const res = await callGemini({
      model: GEMINI_MODEL_FLASH,
      jsonMode: true,
      systemInstruction: `Extract objective facts. Return JSON: {facts: string[]}.`,
      prompt: `Narrative: "${narrative}"`
    });
    return JSON.parse(res);
  } catch (e) {
    return { facts: [] };
  }
};

/**
 * Identifies core dispute points.
 * NOW EXCLUSIVELY USES GEMINI PRO (High Quality).
 */
export const analyzeDisputeFocus = async (
  category: string,
  plaintiffDesc: string,
  defenseDesc: string,
  plaintiffRebuttal: string,
  defendantRebuttal: string,
  plaintiffEvidence: EvidenceItem[] // Added Plaintiff Evidence
): Promise<DisputePoint[]> => {
  
  // Format evidence for prompt
  const evidenceText = plaintiffEvidence.length > 0 
    ? plaintiffEvidence.map((e, i) => `${i+1}. [${e.type}] ${e.description || '无描述'}`).join('\n') 
    : "（未提交主要证据）";

  try {
    const result = await callGemini({
      model: GEMINI_MODEL_PRO, // Mandatory High Quality Model
      jsonMode: true,
      temperature: 0.7, // As requested for flexibility
      systemInstruction: `你是一位公正、深刻的 AI 法官。请根据原告和被告的陈述，分析案件的核心争议焦点。你的分析必须深入具体，拒绝笼统的套话，并明确引用双方的陈述作为依据。
      
      你的输出任务：
      1. 提炼 1-3 个最核心的争议焦点。
      2. 每个焦点的描述必须是一个具体的【是/否问句】（Yes/No Question），供双方辩论。
      
      输出 JSON 格式：
      {
        "points": [
           {
             "title": "简短标题",
             "description": "具体的 是/否 辩论问句"
           }
        ]
      }`,
      prompt: `请分析本案争议焦点：
      
      【案件类型】：${category}
      
      【原告陈述】：
      ${plaintiffDesc || "（空）"}
      
      【原告证据】：
      ${evidenceText}

      【被告答辩】：
      ${defenseDesc || "（被告缺席或未详细答辩）"}
      
      【原告质证】：
      ${plaintiffRebuttal || "（无）"}
      
      【被告质证】：
      ${defendantRebuttal || "（无）"}`
    });

    const parsed = JSON.parse(result);
    return parsed.points.map((p: any, index: number) => ({
      ...p,
      id: p.id ? String(p.id) : `focus-${index}-${Date.now()}`
    }));

  } catch (error: any) {
    console.error("Dispute Analysis Failed:", error);
    // Return a fallback point if it fails so the app doesn't crash, but logged the error.
    if (error.message.includes("休庭")) throw error; // Re-throw friendly error
    throw new Error("AI 分析服务暂时不可用，请稍后重试。");
  }
};

/**
 * Generates the final verdict.
 * EXCLUSIVELY USES GEMINI PRO.
 */
export const generateVerdict = async (
  category: string,
  plaintiffDesc: string,
  plaintiffDemands: string,
  defenseDesc: string,
  plaintiffEvidence: EvidenceItem[],
  defendantEvidence: EvidenceItem[],
  plaintiffRebuttal: string,
  plaintiffRebuttalEvidence: EvidenceItem[],
  defendantRebuttal: string,
  defendantRebuttalEvidence: EvidenceItem[],
  disputePoints: DisputePoint[],
  persona: JudgePersona
): Promise<Verdict> => {

  const formatEv = (items: EvidenceItem[]) => items.map(e => `[${e.type}] ${e.description}`).join('; ');
  
  // Helper to extract base64 images
  const collectImages = (items: EvidenceItem[]) => {
    return items
      .filter(i => i.type === EvidenceType.IMAGE && i.content.startsWith('data:'))
      .map(i => {
        const [meta, data] = i.content.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        return { inlineData: { data, mimeType } };
      });
  };

  const allImages = [
    ...collectImages(plaintiffEvidence),
    ...collectImages(defendantEvidence),
    ...collectImages(plaintiffRebuttalEvidence || []),
    ...collectImages(defendantRebuttalEvidence || [])
  ];

  const systemPrompt = `IDENTITY: You are the "${persona === JudgePersona.BORDER_COLLIE ? 'Border Collie Judge (Logic)' : 'Cat Judge (Empathy)'}".
  
  TASK: Issue a final verdict for a relationship dispute.
  
  REQUIREMENTS:
  1. Address Plaintiff's Demands: "${plaintiffDemands}".
  2. Penalties: Must be creative, fun, and connection-focused (e.g., "Massage for 10 mins"), NOT monetary or boring chores.
  3. Output JSON: { summary, facts[], responsibilitySplit {plaintiff, defendant}, disputeAnalyses [{title, analysis}], reasoning, finalJudgment, penaltyTasks[], tone }.`;

  const casePrompt = `CASE FILE:
  Category: ${category}
  Plaintiff: ${plaintiffDesc}
  Defense: ${defenseDesc}
  
  Evidence (P): ${formatEv(plaintiffEvidence)}
  Evidence (D): ${formatEv(defendantEvidence)}
  
  Debate Points:
  ${disputePoints.map(p => `- Q: ${p.title}? P: ${p.plaintiffArg} vs D: ${p.defendantArg}`).join('\n')}
  `;

  try {
    const result = await callGemini({
      model: GEMINI_MODEL_PRO, // Mandatory High Quality
      jsonMode: true,
      temperature: 0.7,
      systemInstruction: systemPrompt,
      prompt: casePrompt,
      images: allImages
    });

    const parsed = JSON.parse(result);
    // Sanitize penaltyTasks to string[]
    if (parsed.penaltyTasks) {
       parsed.penaltyTasks = parsed.penaltyTasks.map((t: any) => typeof t === 'string' ? t : JSON.stringify(t));
    }
    return parsed;
  } catch (error) {
    console.error("Verdict Generation Failed:", error);
    throw new Error("AI 法官正在休庭，请稍后重试");
  }
};