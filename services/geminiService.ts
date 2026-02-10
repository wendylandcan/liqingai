
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { JudgePersona, Verdict, EvidenceItem, SentimentResult, FactCheckResult, EvidenceType } from "../types";

// --- Environment Configuration ---

// Helper to safely get env vars in both Vite (browser) and standard Node/Polyfill environments
const getEnvVar = (key: string, viteKey: string): string => {
  // 1. Try Vite's import.meta.env
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
      // @ts-ignore
      return import.meta.env[viteKey];
    }
  } catch (e) {
    // Ignore errors if import.meta is not supported
  }

  // 2. Try process.env
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key]!;
    }
  } catch (e) {
    // Ignore errors
  }

  // 3. Fallback specifically for Gemini API_KEY as per system rules if strictly injected
  if (key === 'API_KEY' && typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
  }

  return '';
};

// Keys
const DEEPSEEK_API_KEY = getEnvVar('DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY');
const GEMINI_API_KEY = getEnvVar('API_KEY', 'VITE_GEMINI_API_KEY'); // Falls back to process.env.API_KEY

// --- Initialize Clients ---

// 1. Gemini Client (For Multimodal & Fallback)
// Note: We use the resolved GEMINI_API_KEY which supports both process.env.API_KEY and VITE_GEMINI_API_KEY
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || process.env.API_KEY });

// 2. DeepSeek Client (For Primary Text Logic)
// Note: DeepSeek is OpenAI-compatible
const deepseek = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  dangerouslyAllowBrowser: true // Allowed for client-side demo; use backend proxy in production
});

// --- Model Constants ---
// Scenario A & B requirements: Use Flash for Audio and Fallback
const GEMINI_MODEL_FLASH = 'gemini-3-flash-preview';
const GEMINI_MODEL_PRO = 'gemini-3-pro-preview';
// CHANGED: Use a stable model for fallback (Gemini 2.5 Flash alias)
const GEMINI_MODEL_FALLBACK = 'gemini-flash-latest'; 
// Simple tasks specific model (User Request)
const GEMINI_MODEL_SIMPLE = 'gemini-1.5-flash';
const DEEPSEEK_MODEL = 'deepseek-chat';

// --- Helper: Exponential Backoff Retry ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 4, initialDelay = 2000): Promise<T> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      // Check for common overload/rate-limit status codes or messages
      const status = error?.status || error?.code;
      const message = error?.message || '';
      // 503 is "Service Unavailable" (High Demand), 429 is "Too Many Requests"
      const isTransient = status === 503 || status === 429 || status === 500 || message.includes('overloaded') || message.includes('busy') || message.includes('demand');
      
      if (isTransient && i < retries - 1) {
        const waitTime = initialDelay * Math.pow(2, i); // 2s, 4s, 8s, 16s
        console.warn(`AI Busy (Attempt ${i + 1}/${retries}). Retrying in ${waitTime}ms...`, message);
        await delay(waitTime);
        continue;
      }
      throw error; // Throw immediately if not a transient error or retries exhausted
    }
  }
  throw lastError;
}

/**
 * Smart Generation Strategy:
 * 1. Primary: DeepSeek V3 (Text/Logic)
 * 2. Fallback: Gemini 3 Flash/Pro if DeepSeek fails.
 * 3. Fallback Level 2: Gemini 2.5 Flash if Gemini 3 is overloaded (503).
 */
async function smartGenerate(params: {
  systemInstruction: string;
  prompt: string;
  jsonMode?: boolean;
  temperature?: number;
  complexity?: 'simple' | 'complex';
  images?: { inlineData: { data: string, mimeType: string } }[]; // Support for images
  model?: string; // Explicit model request
}): Promise<string> {
  
  const hasImages = params.images && params.images.length > 0;
  // If specific model is requested (e.g. Gemini 1.5 Flash), skip DeepSeek to honor the request
  const skipDeepSeek = !!params.model; 

  // 1. Try DeepSeek first (ONLY if NO images are present AND no specific Gemini model requested)
  // DeepSeek via OpenAI SDK is typically text-only in this configuration.
  if (DEEPSEEK_API_KEY && !hasImages && !skipDeepSeek) {
    try {
      const completion = await deepseek.chat.completions.create({
        messages: [
          { role: "system", content: params.systemInstruction },
          { role: "user", content: params.prompt }
        ],
        model: DEEPSEEK_MODEL,
        response_format: params.jsonMode ? { type: "json_object" } : { type: "text" },
        temperature: params.temperature ?? 0.7,
      });

      const content = completion.choices[0].message.content;
      if (content) return content;
      throw new Error("DeepSeek returned empty content");
    } catch (error) {
      console.warn("DeepSeek API unavailable or failed. Switching to Gemini Fallback strategy...", error);
      // Proceed to Gemini fallback
    }
  } else if (hasImages) {
    console.log("Multimodal input detected (Images). Skipping DeepSeek, using Gemini.");
  }

  // 2. Fallback to Gemini 3 Flash or Pro (Scenario B) OR Primary for Multimodal
  try {
    return await retryWithBackoff(async () => {
      const config: any = {
        systemInstruction: params.systemInstruction,
        temperature: params.temperature ?? 0.7,
      };
      
      if (params.jsonMode) {
        config.responseMimeType = "application/json";
      }

      // Determine model: Explicit > Complex/Vision > Default Flash
      let modelName = params.model;
      if (!modelName) {
         modelName = (params.complexity === 'complex' || hasImages) ? GEMINI_MODEL_PRO : GEMINI_MODEL_FLASH;
      }

      // Construct contents
      let contentsInput: any;
      if (hasImages) {
        // Multimodal structure: [Text, Image1, Image2...]
        contentsInput = {
          parts: [
            { text: params.prompt },
            ...params.images!
          ]
        };
      } else {
        // Text-only structure
        contentsInput = params.prompt;
      }

      // Function to try a specific model
      const tryModel = async (m: string) => {
        const response = await ai.models.generateContent({
            model: m,
            contents: contentsInput,
            config: config
        });
        return response.text || "";
      };

      try {
        return await tryModel(modelName!);
      } catch (error: any) {
        // Check for error codes to trigger fallback
        const code = error?.status || error?.code;
        const msg = error?.message || "";
        
        // Handle 503 (Service Unavailable/Overloaded), 500 (Server Error), 404 (Not Found)
        // Note: if user requested specific model, we still fallback if it fails, but fallback to stable 2.5/latest
        if (code === 503 || code === 500 || code === 404 || msg.includes('demand') || msg.includes('overloaded')) {
            console.warn(`Model ${modelName} failed with ${code}. Trying fallback ${GEMINI_MODEL_FALLBACK}...`);
            return await tryModel(GEMINI_MODEL_FALLBACK);
        }
        throw error;
      }
    });
  } catch (error) {
    console.error("Critical: All AI services failed.", error);
    throw error;
  }
}

/**
 * Transcribes audio blob to text using Gemini.
 * SCENARIO A: Multimodal Input -> Direct Gemini Call
 * SKILL: Audio Coherence & Filler Removal
 */
export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  try {
    return await retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL_FLASH, // Keep using Gemini 3 Flash for Audio (Native Audio support)
        config: {
          systemInstruction: `You are an expert transcriber equipped with the "Coherence" skill package.
          
          YOUR MANDATE:
          1. Transcribe the audio exactly but intelligently.
          2. FILTER OUT: All filler words (uh, um, like, you know, sort of), stutters, and hesitations.
          3. FIX: Minor grammatical errors and sentence fragments to ensure logical flow.
          4. OUTPUT: Return ONLY the clean, coherent text. No introductory phrases.`
        },
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio,
              },
            },
            {
              text: "Transcribe this audio.",
            },
          ],
        },
      });
      return response.text?.trim() || "";
    });
  } catch (error) {
    console.error("Transcription Error", error);
    return "（语音转录失败，请重试或手动输入）";
  }
};

/**
 * Summarizes a statement into a concise paragraph.
 */
export const summarizeStatement = async (text: string, role: string): Promise<string> => {
  if (!text) return "";
  try {
    const result = await smartGenerate({
      model: GEMINI_MODEL_SIMPLE, // Use Gemini 1.5 Flash
      systemInstruction: `You are a legal summarizer for a relationship court. 
      TASK: Summarize the ${role}'s statement into a concise paragraph (approx 50-100 Chinese characters).
      GOAL: Retain key facts and emotional stance, but remove redundancy. Make it easy to read for the opposing party.`,
      prompt: `Statement: "${text}"`
    });
    return result.trim();
  } catch (error) {
    console.error("Summary Generation Error", error);
    return text.slice(0, 150) + (text.length > 150 ? "..." : "");
  }
};

/**
 * Generates a short, catchy title for the case.
 * Logic: DeepSeek -> Gemini Flash Fallback (Default)
 */
export const generateCaseTitle = async (description: string): Promise<string> => {
  if (!description) return "";
  try {
    const result = await smartGenerate({
      systemInstruction: `You are a legal copywriter for a relationship court.
        
        TASK: Summarize the dispute into a short, punchy title (max 12 Chinese characters).
        STYLE: Dramatic but accurate (e.g., "纪念日爽约案").
        CONSTRAINT: No quotes, no markdown, just the text.`,
      prompt: `Case Description: "${description}"`
    });
    return result.trim() || description.slice(0, 10) + "案件";
  } catch (error) {
    console.error("Title Generation Error", error);
    return description.slice(0, 8) + "...案件";
  }
};

/**
 * Superpower: Polishes text to be more objective and calm.
 * Logic: DeepSeek -> Gemini Flash Fallback (Default)
 * SKILL: NVC Filter
 */
export const polishText = async (text: string): Promise<string> => {
  if (!text) return "";
  try {
    const result = await smartGenerate({
      systemInstruction: `You are the "Superpower" AI Assistant: The Objective Reality Filter.
        
        YOUR SKILL PACKAGE:
        1. DE-ESCALATE: Remove all profanity, insults, and purely emotional outbursts.
        2. CLARIFY: Rewrite the text to focus on the Who, What, When, Where, and Why.
        3. NORMALIZE: Convert subjective judgments ("You are lazy") into objective observations ("The chores were not done").
        4. PRESERVE: Keep the user's original point and facts intact.
        
        OUTPUT: Return ONLY the polished text.`,
      prompt: `Original Text: "${text}"`
    });
    return result.trim() || text;
  } catch (error) {
    console.error("Polish Error", error);
    return text;
  }
};

/**
 * Analyzes text for extreme emotions.
 * Logic: DeepSeek -> Gemini Flash Fallback (Default)
 */
export const analyzeSentiment = async (text: string): Promise<SentimentResult> => {
  if (!text) return { isToxic: false, score: 0, reason: "" };
  try {
    const result = await smartGenerate({
      jsonMode: true,
      systemInstruction: `You are a toxicity detector for a relationship dispute app.
        Analyze the text for: Verbal abuse, extreme anger, personal attacks, or threats.
        OUTPUT: JSON format with keys: isToxic (boolean), score (number 0-10), reason (string).`,
      prompt: `Text: "${text}"`
    });

    return JSON.parse(result) as SentimentResult;
  } catch (error) {
    console.error("Sentiment Analysis Error", error);
    return { isToxic: false, score: 0, reason: "系统繁忙，跳过情绪检测" };
  }
};

/**
 * Extracts objective fact points.
 * Logic: Switch to Gemini 1.5 Flash (Simple Task)
 */
export const extractFactPoints = async (narrative: string): Promise<FactCheckResult> => {
  try {
    const result = await smartGenerate({
      model: GEMINI_MODEL_SIMPLE, // Use Gemini 1.5 Flash
      jsonMode: true,
      systemInstruction: `Extract a list of objective facts (Fact Points) from the narrative. Ignore opinions and emotional fluff.
      OUTPUT: JSON format with key "facts" (array of strings).`,
      prompt: `Narrative: "${narrative}"`
    });

    return JSON.parse(result) as FactCheckResult;
  } catch (error) {
    console.error("Fact Extraction Error", error);
    return { facts: [] };
  }
};

/**
 * Generates the final verdict.
 * Logic: DeepSeek -> Gemini Flash Fallback (Complex Task / Pro)
 * SKILL: Persona-Based Adjudication & Intimate Relationship Expert
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
  persona: JudgePersona
): Promise<Verdict> => {
  
  let systemInstruction = "";
  
  // Base Persona
  if (persona === JudgePersona.BORDER_COLLIE) {
    systemInstruction = `IDENTITY: You are the "Border Collie Judge" (汪汪法官).
    TRAITS: Highly logical, rules-obsessed, neutral, uses "本汪" (This Dog).
    FOCUS: Fact-checking and adherence to agreed-upon rules/logic.`;
  } else {
    systemInstruction = `IDENTITY: You are the "Cat Judge" (喵喵法官).
    TRAITS: Empathetic, focuses on emotional truth, comforting but sassy, uses "本喵" (This Cat).
    FOCUS: Emotional needs and relationship dynamics.`;
  }

  // Check for Default Judgment Scenario
  // If defenseDesc indicates absence
  const isDefaultJudgment = defenseDesc.includes("被告缺席");

  if (isDefaultJudgment) {
    systemInstruction += `
    
    SPECIAL SCENARIO: DEFAULT JUDGMENT (Defendant Absent).
    1. The defendant has waived their right to defend.
    2. You must evaluate the case based PRIMARILY on whether the Plaintiff's claims are logical and supported by their evidence.
    3. You do not need to find a "middle ground". If the plaintiff makes sense, rule in their favor (e.g., 100/0 or 90/10).
    `;
  }

  // EXPERT & VERDICT LOGIC INSTRUCTIONS
  systemInstruction += `
  
  CRITICAL TERMINOLOGY RULE:
  - ALWAYS use "原告" (Plaintiff) and "被告" (Defendant) to refer to the parties.
  - DO NOT use gendered terms like "男方", "女方", "男朋友", "女朋友", "老公", "老婆".
  
  CORE RESPONSIBILITIES (Relationship Expert Mode):
  1. **Final Judgment (finalJudgment)**: 
     - You MUST explicitly address the Plaintiff's DEMANDS ("${plaintiffDemands}").
     - Analyze the evidence and rebuttals to explain WHY you are granting, denying, or modifying these demands.
     - Provide closure.

  2. **Compensation/Penalty Tasks (penaltyTasks)**:
     - DO NOT act like a criminal court (no jail, no harsh fines unless agreed).
     - ACT like a Relationship Therapist/Expert.
     - DESIGN tasks that are:
       a) **Restorative**: Heals the emotional bond.
       b) **Preventive**: Creates a mechanism to avoid this specific conflict in the future (e.g., "Draft a budget protocol", "Set a 'safe word' for arguments").
       c) **Human-Centric**: "Cook a meal", "Write a letter", "3-minute hug".
  
  OUTPUT REQUIREMENT:
  You must output valid JSON.
  Schema keys required: 
  - summary (string)
  - facts (array of strings)
  - responsibilitySplit (object {plaintiff: number, defendant: number} - must sum to 100)
  - reasoning (string)
  - finalJudgment (string - Address the demands!)
  - penaltyTasks (array of strings - Creative & Preventive)
  - tone (string)
  `;

  // Helper to extract base64 images from evidence items
  const collectImages = (items: EvidenceItem[]) => {
    return items
      .filter(i => i.type === EvidenceType.IMAGE && i.content.startsWith('data:'))
      .map(i => {
        // format: "data:image/png;base64,....."
        const [meta, data] = i.content.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        return { 
          inlineData: { 
            data, 
            mimeType 
          } 
        };
      });
  };

  // Collect all images from both sides
  const allImages = [
    ...collectImages(plaintiffEvidence),
    ...collectImages(defendantEvidence),
    ...collectImages(plaintiffRebuttalEvidence || []),
    ...collectImages(defendantRebuttalEvidence || [])
  ];

  const formatEvidence = (items: EvidenceItem[]) => 
    items.map(e => `[${e.type === 'TEXT' ? '文字' : '图片'}] ${e.description || '无描述'} (Contested: ${e.isContested ? 'Yes' : 'No'})`).join('\n') || "None";

  const caseDetails = `
    CASE FILE:
    Category: ${category}
    
    --- PHASE 1: INITIAL STATEMENTS ---
    PLAINTIFF STATEMENT: "${plaintiffDesc}"
    **PLAINTIFF DEMANDS**: "${plaintiffDemands}"
    
    DEFENDANT DEFENSE: "${defenseDesc}"

    --- PHASE 2: EVIDENCE & REBUTTALS ---
    Plaintiff Evidence: ${formatEvidence(plaintiffEvidence)}
    Defendant Evidence: ${formatEvidence(defendantEvidence)}
    Plaintiff Rebuttal: "${plaintiffRebuttal}"
    Defendant Rebuttal: "${defendantRebuttal}"
  `;

  try {
    const result = await smartGenerate({
      complexity: 'complex', // Use Pro model for verdict if using Gemini fallback
      jsonMode: true,
      systemInstruction: systemInstruction,
      prompt: `Perform your judgment task as an expert relationship judge on this case. ${allImages.length > 0 ? '(Visual Evidence Included in this request)' : ''}\n${caseDetails}`,
      images: allImages // Pass the extracted images
    });

    return JSON.parse(result) as Verdict;
  } catch (error) {
    console.error("Verdict Generation Error", error);
    return {
        summary: "AI 判决暂时不可用",
        facts: [],
        responsibilitySplit: { plaintiff: 50, defendant: 50 },
        reasoning: "连接 AI 服务时出错，请检查 API Key 或网络（可能由于服务过载）。",
        finalJudgment: "抱歉，本法官暂时掉线了，请稍后再试。",
        penaltyTasks: [],
        tone: "系统错误"
    };
  }
};
