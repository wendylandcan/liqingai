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
// Unified model: gemini-2.0-flash (Smart, Fast, Cost-effective)
const GEMINI_MODEL_FLASH = 'gemini-2.0-flash'; 
const GEMINI_MODEL_PRO = 'gemini-2.0-flash'; 

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
        temperature: params.temperature ?? 0.7, // Default to 0.7 as requested
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
 * Uses GEMINI 2.0 Flash with "Experienced Judge" Persona.
 */
export const analyzeDisputeFocus = async (
  category: string,
  plaintiffDesc: string,
  defenseDesc: string,
  plaintiffRebuttal: string,
  defendantRebuttal: string,
  plaintiffEvidence: EvidenceItem[] 
): Promise<DisputePoint[]> => {
  
  // Format evidence for prompt
  const evidenceText = plaintiffEvidence.length > 0 
    ? plaintiffEvidence.map((e, i) => `${i+1}. [${e.type}] ${e.description || '无描述'}`).join('\n') 
    : "（未提交主要证据）";

  // New System Instruction as requested
  const JUDGE_SYSTEM_PROMPT = `你是一个经验丰富的 AI 法官，擅长挖掘情感纠纷背后的深层逻辑。你的分析必须客观、分点陈述，并引用原告和被告的具体证词。
  
  你的具体任务：
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
  }`;

  try {
    const result = await callGemini({
      model: GEMINI_MODEL_PRO, // Now mapped to gemini-2.0-flash
      jsonMode: true,
      temperature: 0.7, 
      systemInstruction: JUDGE_SYSTEM_PROMPT,
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
    if (error.message.includes("休庭")) throw error; 
    throw new Error("AI 分析服务暂时不可用，请稍后重试。");
  }
};

/**
 * Generates the final verdict.
 * Uses GEMINI 2.0 Flash with "Experienced Judge" Persona.
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

  const judgePrefix = persona === JudgePersona.BORDER_COLLIE ? '本汪裁判：' : '本喵裁判：';

  // Combine user's requested persona with existing functional requirements
  const systemPrompt = `你是一个经验丰富的 AI 法官，同时也是一位深谙亲密关系经营之道的专家。

  当前人设风格: 你是 "${persona === JudgePersona.BORDER_COLLIE ? '边牧法官 (逻辑缜密, 绝对中立, 理性分析)' : '猫猫法官 (共情力强, 关注情绪事实, 治愈调解)'}".

  任务: 对这起亲密关系纠纷做出最终判决。

  【关键要求】:

  1. **法官寄语 (finalJudgment)**:
     - **必须以 "${judgePrefix}" 开头**。
     - **必须逐一回应原告的诉请**: "${plaintiffDemands}"。
     - **格式要求**: 如果有多项诉请，必须按 "1. ...\\n2. ..." 的格式分行展示。
     - **内容结构**: 针对每一项诉请，明确给出【支持】、【驳回】或【修正/调整】的结论，并以“亲密关系中立专家”的视角，从沟通、理解、包容等角度撰写评语。

  2. **补偿任务 (penaltyTasks)**:
     - **核心目的**: 修复亲密关系 (Restoring Intimacy)。
     - **原则**: 
       a) 有趣味性 (Gamified/Fun)。
       b) 可行性 (Feasible within a week)。
       c) 贴合案情 (Case-Specific)。
     - **禁止**: 纯金钱惩罚、无意义的枯燥劳动。
     - **推荐**: 涉及肢体接触、深度沟通、共同体验的任务。
  
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
      model: GEMINI_MODEL_PRO, // Now mapped to gemini-2.0-flash
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