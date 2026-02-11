import React, { useState, useEffect } from 'react';
import { 
  Gavel, 
  Scale, 
  PlusCircle, 
  User, 
  CheckCircle2, 
  FileText, 
  Loader2, 
  ChevronLeft, 
  LogOut, 
  RefreshCw, 
  Copy, 
  Users, 
  Trash2, 
  AlertOctagon, 
  Sparkles, 
  Home, 
  Heart, 
  Dog, 
  Cat, 
  PawPrint, 
  Swords, 
  MessageSquare, 
  UserX,
  GraduationCap
} from 'lucide-react';
import { 
  CaseData, 
  CaseStatus, 
  UserRole, 
  Verdict, 
  JudgePersona 
} from './types';
import * as GeminiService from './services/geminiService';
import { MockDb } from './services/mockDb';
import { VerdictSection } from './VerdictSection';
import { 
  ConfirmDialog, 
  VoiceTextarea, 
  EvidenceList, 
  EvidenceCreator 
} from './components/Shared';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';

// --- Logic Steps (Wrapped components) ---

const FilingForm = ({ data, onSubmit }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => Promise<void> | void }) => {
  const [desc, setDesc] = useState(data.description);
  const [demands, setDemands] = useState(data.demands);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return alert("请填写陈述");
    
    setIsSubmitting(true);

    // 1. Wait ONLY for Data Save to Supabase (Blocking Navigation)
    // Once this awaits successfully, the parent will receive the status update.
    // The UI will likely re-render and unmount this component shortly after.
    await onSubmit({ 
      description: desc, 
      demands,
      status: CaseStatus.PLAINTIFF_EVIDENCE 
    });

    // 2. Background AI Processing (Non-Blocking)
    // We do NOT await this. It runs in the background.
    // Even if this component unmounts, the Promise chain usually completes in JS environment.
    // Ideally we'd use a global store or context to ensure it persists, but this works for this architecture.
    Promise.all([
      GeminiService.analyzeSentiment(desc),
      GeminiService.generateCaseTitle(desc),
      GeminiService.summarizeStatement(desc, "Plaintiff")
    ]).then(([sentiment, title, summary]) => {
      if (sentiment.isToxic) {
         console.warn("Toxic content detected:", sentiment.reason);
      }
      // Update the case with AI results. 
      // CaseManager is still mounted, so this onSubmit (which refers to CaseManager.update) is safe to call.
      onSubmit({
        title: title || undefined,
        plaintiffSummary: summary
      });
    }).catch(err => {
      console.error("Background AI task failed:", err);
    });
    
    // We don't necessarily need to set isSubmitting(false) if we are unmounting,
    // but good practice in case navigation fails or stays.
    // setIsSubmitting(false); 
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-rose-100 space-y-4">
      <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 font-cute"><FileText className="text-rose-500" />原告起诉</h2>
      <VoiceTextarea label="事实陈述" placeholder="请具体描述..." value={desc} onChange={setDesc} required />
      <VoiceTextarea label="诉请" placeholder="诉请 (如: 道歉)..." value={demands} onChange={setDemands} required />
      <button 
        onClick={handleSubmit} 
        disabled={isSubmitting}
        className="w-full bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isSubmitting ? <Loader2 className="animate-spin" /> : "下一步：举证"}
      </button>
    </div>
  );
};

const PlaintiffEvidenceStep = ({ data, onSubmit }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => Promise<void> | void }) => (
  <div className="space-y-6 animate-fade-in">
    <div className="bg-white p-6 rounded-xl shadow-sm border border-rose-100">
      <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 font-cute"><Gavel className="text-rose-500" />原告举证</h2>
      <EvidenceList 
        items={data.evidence} 
        title="已提交证据" 
        onDelete={(id) => onSubmit({ evidence: data.evidence.filter(e => e.id !== id) })}
      />
      <div className="mt-6 border-t pt-4">
        <EvidenceCreator userRole={UserRole.PLAINTIFF} onAdd={e => onSubmit({ evidence: [...data.evidence, e] })} />
      </div>
    </div>
    <button onClick={() => onSubmit({ status: CaseStatus.DEFENSE_PENDING })} className="w-full bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 shadow-lg">提交给被告</button>
  </div>
);

const DefenseStep = ({ data, onSubmit }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => Promise<void> | void }) => {
  const [stmt, setStmt] = useState(data.defenseStatement);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
      if (!stmt.trim()) return alert("请填写答辩理由");
      
      setIsSubmitting(true);

      // 1. Wait ONLY for Data Save to Supabase (Blocking Navigation)
      await onSubmit({ 
          defenseStatement: stmt, 
          status: CaseStatus.CROSS_EXAMINATION 
      });

      // 2. Background AI Processing (Non-Blocking)
      GeminiService.summarizeStatement(stmt, "Defendant")
        .then(summary => {
           onSubmit({ defenseSummary: summary });
        })
        .catch(err => console.error("Background summary failed", err));
        
      // setIsSubmitting(false); // Component unmounts
  };

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
        <h2 className="text-lg font-bold text-indigo-900 mb-2 font-cute">原告陈述 (AI 摘要)</h2>
        <p className="text-sm text-indigo-600 mb-3 bg-white/50 p-2 rounded">
           "{data.plaintiffSummary || data.description}"
        </p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4 font-cute">被告举证与答辩</h2>
        <VoiceTextarea label="答辩理由" placeholder="陈述你的理由..." value={stmt} onChange={setStmt} required />
        <div className="mt-6">
          <EvidenceList 
            items={data.defendantEvidence} 
            title="被告提交的证据" 
            onDelete={(id) => onSubmit({ defendantEvidence: data.defendantEvidence.filter(e => e.id !== id) })}
          />
          <div className="mt-2"><EvidenceCreator userRole={UserRole.DEFENDANT} onAdd={e => onSubmit({ defendantEvidence: [...data.defendantEvidence, e] })} /></div>
        </div>
      </div>
      <button 
        onClick={handleSubmit} 
        disabled={isSubmitting}
        className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
      >
         {isSubmitting ? <Loader2 className="animate-spin" /> : "进入质证环节"}
      </button>
    </div>
  );
};

const DisputeDebateStep = ({ data, onSubmit, userRole }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => Promise<void> | void, userRole: UserRole }) => {
    const isPlaintiff = userRole === UserRole.PLAINTIFF;
    const isDefendant = userRole === UserRole.DEFENDANT;

    const handleArgUpdate = (pointId: string, text: string) => {
        const updatedPoints = data.disputePoints.map(p => {
            if (p.id === pointId) {
                return isPlaintiff ? { ...p, plaintiffArg: text } : { ...p, defendantArg: text };
            }
            return p;
        });
        onSubmit({ disputePoints: updatedPoints });
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-purple-50 border border-purple-200 p-6 rounded-xl text-center">
                <div className="inline-flex p-3 bg-white rounded-full mb-3 shadow-sm">
                    <Swords className="text-purple-600" size={32} />
                </div>
                <h2 className="text-xl font-bold text-purple-900 mb-2 font-cute">核心争议焦点辩论</h2>
                <p className="text-purple-700 text-sm">AI 已基于双方陈述提炼出以下核心矛盾。请针对每个焦点进行最后的陈述。</p>
            </div>

            <div className="space-y-6">
                {data.disputePoints.map((point, index) => (
                    <div key={point.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-3">
                            <span className="bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                                {index + 1}
                            </span>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{point.title}</h3>
                                <p className="text-slate-500 text-sm">{point.description}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            {/* Plaintiff Side */}
                            <div className={`p-4 rounded-lg border-l-4 ${isPlaintiff ? 'bg-rose-50 border-rose-500' : 'bg-slate-50 border-slate-300'}`}>
                                <div className="flex items-center gap-2 mb-2 font-bold text-rose-700 text-sm">
                                    <User size={14} /> 原告观点
                                    {!isPlaintiff && !point.plaintiffArg && <span className="text-slate-400 font-normal ml-auto text-xs">等待输入...</span>}
                                </div>
                                {isPlaintiff ? (
                                    <VoiceTextarea 
                                        label=""
                                        placeholder="针对此争议点，你的最终陈述..."
                                        value={point.plaintiffArg || ""}
                                        onChange={(val) => handleArgUpdate(point.id, val)}
                                    />
                                ) : (
                                    <p className="text-sm text-slate-700 italic">{point.plaintiffArg || "暂无陈述"}</p>
                                )}
                            </div>

                            {/* Defendant Side */}
                            <div className={`p-4 rounded-lg border-l-4 ${isDefendant ? 'bg-indigo-50 border-indigo-500' : 'bg-slate-50 border-slate-300'}`}>
                                <div className="flex items-center gap-2 mb-2 font-bold text-indigo-700 text-sm">
                                    <User size={14} /> 被告观点
                                    {!isDefendant && !point.defendantArg && <span className="text-slate-400 font-normal ml-auto text-xs">等待输入...</span>}
                                </div>
                                {isDefendant ? (
                                    <VoiceTextarea 
                                        label=""
                                        placeholder="针对此争议点，你的最终陈述..."
                                        value={point.defendantArg || ""}
                                        onChange={(val) => handleArgUpdate(point.id, val)}
                                    />
                                ) : (
                                    <p className="text-sm text-slate-700 italic">{point.defendantArg || "暂无陈述"}</p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl text-sm text-yellow-800 flex gap-2 items-start">
                <AlertOctagon className="shrink-0 mt-0.5" size={18}/>
                <p>辩论结束后，将直接提交给 AI 法官进行最终裁决。请确保已充分表达。</p>
            </div>

            <button onClick={() => onSubmit({ status: CaseStatus.ADJUDICATING })} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black shadow-lg flex items-center justify-center gap-2">
                <Gavel size={20}/> 辩论结束，申请判决 (Proceed to Verdict)
            </button>
        </div>
    );
};

const AdjudicationStep = ({ data, onSubmit }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => Promise<void> | void }) => {
  const [persona, setPersona] = useState(data.judgePersona);
  const [isDeliberating, setIsDeliberating] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleJudgement = async () => {
    setIsDeliberating(true);
    // Start progress animation
    setTimeout(() => setProgress(100), 100);

    try {
      const verdict = await GeminiService.generateVerdict(
        data.category, data.description, data.demands, data.defenseStatement,
        data.evidence, data.defendantEvidence, 
        data.plaintiffRebuttal, data.plaintiffRebuttalEvidence, 
        data.defendantRebuttal || "", data.defendantRebuttalEvidence || [],
        data.disputePoints || [],
        persona
      );
      onSubmit({ verdict, judgePersona: persona, status: CaseStatus.CLOSED });
    } catch (e) { alert("AI 法官忙碌中"); setIsDeliberating(false); setProgress(0); } 
  };

  const personas = [
    { 
      id: JudgePersona.BORDER_COLLIE, 
      name: "汪汪法官", 
      desc: "重视逻辑，绝对中立，擅长理性分析",
      icon: <Dog size={32} className="text-slate-800" />
    },
    { 
      id: JudgePersona.CAT, 
      name: "喵喵法官", 
      desc: "重视情理，擅长抚慰情绪，调解矛盾",
      icon: <Cat size={32} className="text-rose-600" />
    }
  ];

  if (isDeliberating) {
    const isCat = persona === JudgePersona.CAT;
    return (
       <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-10 animate-fade-in">
          {/* Animated Scene: Reading */}
          <div className="relative flex flex-col items-center justify-center mt-12 mb-12">
             {/* The Judge (Head moving slightly left to right to simulate reading) */}
             {/* Added Graduation Cap floating on head */}
             <div className="relative z-10 transition-transform duration-1000 ease-in-out" style={{ animation: 'readingHead 2s ease-in-out infinite alternate' }}>
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 transform -rotate-6">
                    <GraduationCap size={64} className="text-slate-900 fill-slate-800 drop-shadow-md" strokeWidth={1.5} />
                </div>
                {isCat ? (
                   <Cat size={110} className="text-rose-500 drop-shadow-xl" strokeWidth={1.8} />
                ) : (
                   <Dog size={110} className="text-slate-800 drop-shadow-xl" strokeWidth={1.8} />
                )}
             </div>
             
             {/* Dynamic styles for keyframes since we can't easily add global css here without style tag */}
             <style>{`
               @keyframes readingHead {
                 0% { transform: translateX(-5px) rotate(-2deg); }
                 100% { transform: translateX(5px) rotate(2deg); }
               }
             `}</style>
          </div>

          <div className="text-center space-y-3 max-w-xs mx-auto">
             <h3 className="text-2xl font-bold text-slate-800 font-cute animate-pulse">
               AI 法官正在审理中...
             </h3>
             <p className="text-slate-500 font-medium">
               （预计 1分钟）
             </p>
          </div>

          {/* Progress Bar (60s duration) */}
          <div className="w-full max-w-xs bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner border border-slate-200">
             <div 
               className="h-full rounded-full transition-all ease-linear"
               style={{ 
                 width: `${progress}%`, 
                 backgroundColor: isCat ? '#fb7185' : '#475569', 
                 transitionDuration: '60000ms' // 60 seconds
               }}
             ></div>
          </div>
          
          <p className="text-xs text-slate-400 italic">正在查阅案卷与证据...</p>
       </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <div className="text-center space-y-2 py-4">
        <Gavel size={48} className="text-slate-800 mx-auto" />
        <h2 className="text-2xl font-bold text-slate-800 font-cute">AI 法庭已开庭</h2>
        <p className="text-slate-500">请选择本案的主审法官风格</p>
      </div>
      
      <div className="grid gap-4">
        {personas.map(p => (
          <button 
            key={p.id} 
            onClick={() => setPersona(p.id)} 
            className={`flex items-center p-4 rounded-xl border-2 transition-all text-left group ${
              persona === p.id 
                ? 'border-rose-500 bg-rose-50 shadow-md scale-[1.02]' 
                : 'border-slate-200 bg-white hover:border-rose-200'
            }`}
          >
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mr-4 transition-colors ${
              persona === p.id ? 'bg-white' : 'bg-slate-100 group-hover:bg-slate-50'
            }`}>
              {p.icon}
            </div>
            <div>
              <h3 className={`font-bold text-lg font-cute ${persona === p.id ? 'text-rose-700' : 'text-slate-800'}`}>
                {p.name}
              </h3>
              <p className={`text-xs ${persona === p.id ? 'text-rose-600' : 'text-slate-500'}`}>
                {p.desc}
              </p>
            </div>
          </button>
        ))}
      </div>

      <button onClick={handleJudgement} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-xl flex justify-center items-center gap-2 mt-4 hover:scale-[1.01] transition-transform">
        <><Gavel size={20} /> 召唤 AI 判决</>
      </button>
    </div>
  );
};

const VerdictView = ({ verdict, persona, onReset, onAppeal }: { verdict: Verdict, persona: JudgePersona, onReset: () => void, onAppeal: () => void }) => {
  const isCat = persona === JudgePersona.CAT;
  
  // Styles based on persona
  const headerClass = isCat ? 'bg-rose-400' : 'bg-slate-800';
  
  // Helper to format the final judgment text
  const renderJudgmentText = (text: string) => {
    // 1. Normalize line breaks
    let normalized = text.replace(/\\n/g, '\n');
    
    // 2. If it looks like a list "1. ... 2. ...", insert newlines if missing
    // Match "digit." or "digit、" preceded by space or start of line
    normalized = normalized.replace(/(\s|^)(\d+[.、])/g, '$1\n$2');
    
    // 3. Remove excessive newlines
    normalized = normalized.replace(/\n{2,}/g, '\n');

    return normalized.split('\n').map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      return (
        <p key={index} className={`mb-2 ${/^\d+[.、]/.test(trimmed) ? 'pl-0' : ''}`}>
          {trimmed}
        </p>
      );
    });
  };
  
  return (
    <div className="p-4 pb-20 space-y-6 animate-fade-in font-cute">
      <div className={`${headerClass} text-white p-8 rounded-t-3xl shadow-lg relative overflow-hidden transition-all duration-500`}>
        {/* Background Paws */}
        <PawPrint className="absolute -top-4 -right-4 text-white opacity-10 transform rotate-12" size={120} />
        <PawPrint className="absolute bottom-2 left-4 text-white opacity-10 transform -rotate-12" size={60} />
        <PawPrint className="absolute top-10 left-10 text-white opacity-5 transform rotate-45" size={40} />

        <div className="relative z-10 text-center">
          <div className="flex justify-center mb-2">
             <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm">
                {isCat ? <Cat size={40} className="text-white drop-shadow-md" /> : <Dog size={40} className="text-white drop-shadow-md" />}
             </div>
          </div>
          {/* Added font-normal to avoid synthetic bolding on ZCOOL KuaiLe which breaks some chars like '决' */}
          <h2 className="text-4xl mb-2 tracking-widest drop-shadow-md font-normal">判决书</h2>
          <div className="flex items-center justify-center gap-2 opacity-90 text-sm font-sans bg-black/10 mx-auto w-fit px-3 py-1 rounded-full">
            <PawPrint size={14} />
            <span>{isCat ? '猫猫法庭 · 喵呜裁决' : '边牧法庭 · 汪汪裁决'}</span>
            <PawPrint size={14} />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-b-3xl shadow-xl -mt-6 border-x border-b border-slate-100 relative z-20">
         <div className="flex justify-between mb-2 text-lg font-bold uppercase font-sans">
            <span className="text-rose-500 flex items-center gap-1"><User size={18}/> 原告 {verdict.responsibilitySplit.plaintiff}%</span>
            <span className="text-indigo-500 flex items-center gap-1">被告 {verdict.responsibilitySplit.defendant}% <User size={18}/></span>
         </div>
         <div className="h-6 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
            <div className="bg-rose-500 h-full flex items-center justify-center" style={{ width: `${verdict.responsibilitySplit.plaintiff}%` }}></div>
            <div className="bg-indigo-500 h-full flex items-center justify-center" style={{ width: `${verdict.responsibilitySplit.defendant}%` }}></div>
         </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-slate-100 relative overflow-hidden">
        <h3 className="text-xl text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle2 className={isCat ? "text-rose-500" : "text-slate-800"} /> 
            事实认定
        </h3>
        <ul className="space-y-3 text-slate-600 font-sans">
            {verdict.facts.map((f, i) => (
                <li key={i} className="flex gap-2 items-start text-base">
                    <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                    <span style={{ fontFamily: '"Noto Sans SC", sans-serif' }}>{f}</span>
                </li>
            ))}
        </ul>
      </div>

      {verdict.disputeAnalyses && verdict.disputeAnalyses.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-slate-100 relative overflow-hidden">
          <h3 className="text-xl text-slate-800 mb-4 flex items-center gap-2">
             <Scale className={isCat ? "text-rose-500" : "text-slate-800"} />
             争议焦点分析
          </h3>
          <div className="space-y-4 font-sans">
            {verdict.disputeAnalyses.map((item, idx) => (
              <div key={idx} className={`p-4 rounded-xl ${isCat ? 'bg-rose-50/50 border border-rose-100' : 'bg-slate-50 border border-slate-100'}`}>
                 <h4 className={`font-bold mb-2 ${isCat ? 'text-rose-700' : 'text-slate-700'}`} style={{ fontFamily: '"Noto Sans SC", sans-serif' }}>{item.title}</h4>
                 <p className="text-slate-600 text-base leading-relaxed" style={{ fontFamily: '"Noto Sans SC", sans-serif' }}>{item.analysis}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`${isCat ? 'bg-orange-50 border-orange-100' : 'bg-blue-50 border-blue-100'} p-6 rounded-2xl shadow-sm border-2 relative`}>
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <Gavel size={80} className={isCat ? "text-orange-500" : "text-blue-500"} />
        </div>
        <h3 className={`text-xl mb-3 flex items-center gap-2 ${isCat ? 'text-orange-800' : 'text-blue-800'}`}>
            <Sparkles size={20} /> 法官寄语
        </h3>
        <div className={`text-lg leading-relaxed ${isCat ? 'text-orange-900' : 'text-slate-800'}`}>
            {renderJudgmentText(verdict.finalJudgment)}
        </div>
      </div>
      
      {verdict.penaltyTasks && verdict.penaltyTasks.length > 0 && (
         <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-slate-100">
             <h3 className="text-xl text-slate-800 mb-3 flex items-center gap-2">
                 补偿任务
             </h3>
             <ul className="list-disc list-inside text-slate-600 space-y-1 font-sans">
               {verdict.penaltyTasks.map((t: any, i) => {
                 // Check if it's an object to prevent React Error #31
                 const text = typeof t === 'object' && t !== null 
                    ? (t.taskName && t.description ? `${t.taskName}: ${t.description}` : JSON.stringify(t)) 
                    : String(t);
                 return <li key={i}>{text}</li>;
               })}
             </ul>
         </div>
      )}

      <div className="space-y-3 pt-2 font-sans">
        <button onClick={onReset} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl">结案，新案件</button>
        <button onClick={onAppeal} className="w-full bg-white text-rose-600 border-2 border-rose-100 font-bold py-3 rounded-xl">不服判决？补充</button>
      </div>
    </div>
  )
};

// --- Auth & Dashboard ---

const getStatusText = (status: CaseStatus) => {
  switch (status) {
    case CaseStatus.DRAFTING: return "起草中";
    case CaseStatus.PLAINTIFF_EVIDENCE: return "原告举证";
    case CaseStatus.DEFENSE_PENDING: return "等待应诉";
    case CaseStatus.CROSS_EXAMINATION: return "质证环节";
    case CaseStatus.DEBATE: return "争议辩论";
    case CaseStatus.ADJUDICATING: return "AI审理中";
    case CaseStatus.CLOSED: return "已结案";
    case CaseStatus.CANCELLED: return "已撤诉";
    default: return status;
  }
};

const Dashboard = ({ user, onSelectCase, onLogout }: { user: string, onSelectCase: (id: string) => void, onLogout: () => void }) => {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const refresh = () => setCases(MockDb.getCasesForUser(user));
  useEffect(() => { refresh(); }, [user]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const newCase = await MockDb.createCase(user);
      onSelectCase(newCase.id);
    } catch (e) {
      console.error(e);
      alert("创建案件失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    const res = await MockDb.joinCase(joinCode.trim().toUpperCase(), user);
    if (res.success && res.caseId) onSelectCase(res.caseId);
    else alert(res.error || "加入失败");
  };

  const requestDelete = (e: React.MouseEvent, caseId: string) => {
    // Prevent event from bubbling up to the card click handler
    e.stopPropagation();
    // Prevent default button behavior
    e.preventDefault();
    setDeleteTargetId(caseId);
  };

  const confirmDelete = () => {
    if (deleteTargetId) {
       try {
        MockDb.deleteCase(deleteTargetId);
        // Immediately refresh state
        setCases(MockDb.getCasesForUser(user));
      } catch (err) {
        console.error("Delete failed", err);
      }
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 font-cute">
           <div className="relative w-8 h-8 flex items-center justify-center">
             <Heart className="text-rose-600 fill-rose-600 absolute" size={28} />
             <Gavel className="text-white absolute transform -rotate-12" size={14} />
           </div>
           理清爱
        </h1>
        <button onClick={onLogout} className="text-slate-500"><LogOut size={20} /></button>
      </header>

      <ConfirmDialog 
        isOpen={!!deleteTargetId}
        title="删除确认"
        message="确定要删除这条案件记录吗？删除后数据将永久丢失，无法恢复。"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />

      <div className="space-y-6 max-w-md mx-auto">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-rose-100 text-center">
          <h2 className="text-lg font-bold text-slate-800 mb-4 font-cute">欢迎, {user}</h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleCreate} disabled={isCreating} className="bg-rose-600 text-white p-4 rounded-xl font-bold flex flex-col items-center gap-2 hover:bg-rose-700 disabled:opacity-50">
              {isCreating ? <Loader2 className="animate-spin" /> : <PlusCircle />} 
              发起起诉
            </button>
            <div className="bg-slate-100 p-4 rounded-xl flex flex-col gap-2">
              <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="输入案件码" className="w-full text-center text-sm p-1 rounded bg-white border border-slate-200 uppercase" />
              <button onClick={handleJoin} disabled={!joinCode} className="bg-indigo-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">被告应诉</button>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">我的案件</h3>
          <div className="space-y-3">
            {cases.length === 0 && <p className="text-center text-slate-400 py-4 text-sm">暂无案件</p>}
            {cases.map(c => (
              <div key={c.id} onClick={() => c.status !== CaseStatus.CANCELLED && onSelectCase(c.id)} className={`bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center ${c.status === CaseStatus.CANCELLED ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-rose-300'}`}>
                <div className="flex-1 min-w-0 mr-2">
                  {/* Changed to prioritize title if available, otherwise description (truncated), otherwise category */}
                  <p className="font-bold text-slate-800 text-sm line-clamp-1">{c.title || c.description || c.category}</p>
                  <p className="text-xs text-slate-500">
                    {/* If title exists, show category in subtitle. Else standard behavior */}
                    {c.title ? c.category + ' • ' : (c.description ? c.category + ' • ' : '')} 
                    {new Date(c.createdDate).toLocaleDateString()} • {getStatusText(c.status)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className={`text-xs px-2 py-1 rounded font-bold whitespace-nowrap ${
                    c.status === CaseStatus.CLOSED ? 'bg-green-100 text-green-700' : 
                    c.status === CaseStatus.CANCELLED ? 'bg-slate-200 text-slate-500' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {c.status === CaseStatus.CLOSED ? '已结案' : c.status === CaseStatus.CANCELLED ? '已撤诉' : '进行中'}
                  </div>
                  {c.plaintiffId === user && (
                    <button 
                      type="button"
                      onClick={(e) => requestDelete(e, c.id)}
                      className="text-slate-400 p-2 rounded-full hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all z-10 cursor-pointer"
                      title="删除案件"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Case Manager (Logic & Orchestration) ---

const CaseManager = ({ caseId, user, onBack, onSwitchUser }: { caseId: string, user: string, onBack: () => void, onSwitchUser: () => void }) => {
  const [data, setData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDefaultJudgmentConfirm, setShowDefaultJudgmentConfirm] = useState(false);

  const load = () => {
    const c = MockDb.getCase(caseId);
    setData(c);
    setLoading(false);
  };

  useEffect(() => { load(); const int = setInterval(load, 2000); return () => clearInterval(int); }, [caseId]);

  const update = async (patch: Partial<CaseData>) => {
    if (!data) return;
    // Update local state and sync with Supabase async
    const updated = await MockDb.updateCase(data.id, patch);
    setData(updated);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (data) {
       MockDb.deleteCase(data.id);
       onBack();
    }
  };

  const handleDefaultJudgment = () => {
    update({ 
      defenseStatement: "（被告缺席，放弃答辩）",
      defenseSummary: "被告未出庭应诉，视为放弃答辩权利。",
      status: CaseStatus.ADJUDICATING,
      disputePoints: [] 
    });
    setShowDefaultJudgmentConfirm(false);
  };

  if (loading || !data) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-rose-600" /></div>;

  const isPlaintiff = user === data.plaintiffId;
  const isDefendant = user === data.defendantId;
  const role = isPlaintiff ? UserRole.PLAINTIFF : isDefendant ? UserRole.DEFENDANT : UserRole.SPECTATOR;

  // Handle stepping back through the workflow based on status
  const handleStepBack = () => {
    if (!data) {
      onBack();
      return;
    }

    // Phase 1: Drafting -> Can go back to Dashboard
    if (data.status === CaseStatus.DRAFTING) {
        onBack();
        return;
    }

    // Phase 2: Plaintiff Evidence -> Can go back to Drafting (Un-submit description?)
    if (isPlaintiff && data.status === CaseStatus.PLAINTIFF_EVIDENCE) {
      update({ status: CaseStatus.DRAFTING });
      return;
    }

    // Phase 3: Defense Pending -> Plaintiff can go back to Evidence
    // Allows Plaintiff to modify evidence if they clicked submit too early or want to change something while waiting.
    if (data.status === CaseStatus.DEFENSE_PENDING) {
        if (isPlaintiff) {
            update({ status: CaseStatus.PLAINTIFF_EVIDENCE });
            return;
        }
        onBack();
        return;
    }

    // Phase 4: Cross Examination -> Go back to Defense Pending
    if (data.status === CaseStatus.CROSS_EXAMINATION) {
        update({ status: CaseStatus.DEFENSE_PENDING });
        return;
    }

    // Phase 5: Debate -> Go back to Cross Examination
    if (data.status === CaseStatus.DEBATE) {
        update({ status: CaseStatus.CROSS_EXAMINATION });
        return;
    }

    // Phase: ADJUDICATING -> Go back to previous step
    if (data.status === CaseStatus.ADJUDICATING) {
        // 1. If Default Judgment (detected by specific text), go back to Defense Pending and reset
        if (data.defenseStatement === "（被告缺席，放弃答辩）") {
             update({ 
                 status: CaseStatus.DEFENSE_PENDING,
                 defenseStatement: "", 
                 defenseSummary: undefined 
             });
             return;
        }

        // 2. Otherwise, go back to Debate
        update({ status: CaseStatus.DEBATE });
        return;
    }

    onBack();
  };

  // Render Logic based on Status & Role
  let content = null;
  let title = "";

  // Waiting Screen Helper
  const Waiting = ({ msg }: { msg: string }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="bg-slate-100 p-4 rounded-full mb-4 animate-pulse"><Users size={32} className="text-slate-400" /></div>
      <h3 className="text-lg font-bold text-slate-700 mb-2">{msg}</h3>
      <p className="text-sm text-slate-500 mb-6">您可以刷新页面或稍后回来。</p>
      <button onClick={load} className="flex items-center gap-2 text-rose-600 font-bold bg-white px-4 py-2 rounded-full shadow-sm border border-rose-100"><RefreshCw size={16} /> 刷新状态</button>
    </div>
  );

  switch (data.status) {
    case CaseStatus.DRAFTING:
      title = "原告起诉";
      content = isPlaintiff ? <FilingForm data={data} onSubmit={update} /> : <Waiting msg="等待原告填写起诉状..." />;
      break;
    case CaseStatus.PLAINTIFF_EVIDENCE:
      title = "原告举证";
      content = isPlaintiff ? <PlaintiffEvidenceStep data={data} onSubmit={update} /> : <Waiting msg="等待原告提交证据..." />;
      break;
    case CaseStatus.DEFENSE_PENDING:
      title = "被告答辩";
      if (isDefendant) {
        content = <DefenseStep data={data} onSubmit={update} />;
      } else {
        // Logic for Plaintiff or Spectator waiting
        const isWaitingForJoin = !data.defendantId;
        const msg = isWaitingForJoin 
          ? `等待被告加入... 案件码: ${data.shareCode}` 
          : "等待被告提交答辩...";
        
        content = (
          <div className="flex flex-col gap-6">
            <Waiting msg={msg} />
            {isPlaintiff && (
              <div className="mt-8 relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-50 px-4 text-xs text-slate-400">
                    {isWaitingForJoin ? "被告一直不加入？" : "被告一直不回应？"}
                  </span>
                </div>
              </div>
            )}
            {isPlaintiff && (
               <div className="mt-2 flex justify-center">
                <button 
                  onClick={() => setShowDefaultJudgmentConfirm(true)}
                  className="group relative flex items-center gap-2 px-6 py-3 rounded-full bg-white border-2 border-slate-200 text-slate-600 font-bold text-sm shadow-sm hover:border-rose-400 hover:text-rose-600 hover:shadow-md transition-all active:scale-95"
                >
                  <div className="p-1 bg-slate-100 rounded-full group-hover:bg-rose-100 transition-colors">
                      <UserX size={14} className="text-slate-500 group-hover:text-rose-500" />
                  </div>
                  申请缺席判决
                </button>
              </div>
            )}
          </div>
        );
      }
      break;
    case CaseStatus.CROSS_EXAMINATION: // REBUTTAL_PENDING replaced by CROSS_EXAMINATION
      title = "质证环节";
      // Shared view for both parties
      content = <VerdictSection data={data} onSubmit={update} role={role} />;
      break;
    case CaseStatus.DEBATE: // New Debate Phase
      title = "争议焦点辩论";
      content = <DisputeDebateStep data={data} onSubmit={update} userRole={role} />;
      break;
    case CaseStatus.ADJUDICATING:
      title = "AI 审理中";
      // Any party can theoretically trigger the AI call if the status is here, 
      // but in the code `VerdictSection` sets status to ADJUDICATING, 
      // and here we show the Persona selector.
      // To simplify "Any party can enter judgment", we allow either to see this screen.
      content = (isPlaintiff || isDefendant) ? <AdjudicationStep data={data} onSubmit={update} /> : <Waiting msg="法官正在审理..." />;
      break;
    case CaseStatus.CLOSED:
      title = "最终判决";
      content = <VerdictView 
        verdict={data.verdict!} 
        persona={data.judgePersona} 
        onReset={() => onBack()} 
        onAppeal={() => {
            // Logic to determine where to go back to "Unclose" the case for supplementation
            const isDefaultJudgment = data.defenseStatement === "（被告缺席，放弃答辩）";
            if (isDefaultJudgment) {
                 // Reset default judgment state so users can edit or wait for defendant
                 update({ 
                     status: CaseStatus.DEFENSE_PENDING,
                     defenseStatement: "", 
                     defenseSummary: undefined 
                 });
            } else {
                 // Normal flow: Go back to Debate to allow adding more arguments
                 update({ status: CaseStatus.DEBATE });
            }
        }} 
      />;
      break;
    case CaseStatus.CANCELLED:
      title = "已撤诉";
      content = <div className="text-center p-8 text-slate-500">案件已撤销</div>;
      break;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
       <ConfirmDialog 
        isOpen={showDeleteConfirm}
        title="删除并撤销"
        message="确定要删除当前正在进行的案件吗？所有已提交的证据和记录都将被永久删除。"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog 
        isOpen={showDefaultJudgmentConfirm}
        title="缺席判决确认"
        message="是否要在被告不在场的情况下进行判决？这将跳过后续所有互动环节，直接由 AI 法官根据您单方面的陈述进行裁决。"
        confirmText="是"
        cancelText="否"
        onConfirm={handleDefaultJudgment}
        onCancel={() => setShowDefaultJudgmentConfirm(false)}
      />

      <header className="bg-rose-600 text-white p-4 sticky top-0 z-50 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <button onClick={handleStepBack}><ChevronLeft /></button>
          <span className="font-bold font-cute">{title}</span>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={onBack} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all" title="返回首页">
              <Home size={20} />
           </button>
           {isPlaintiff && (
              <button onClick={handleDeleteClick} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all" title="删除案件">
                <Trash2 size={20} />
              </button>
           )}
           {data.status !== CaseStatus.CLOSED && data.status !== CaseStatus.CANCELLED && (
             <div className="bg-rose-700 px-2 py-1 rounded text-xs flex items-center gap-1 cursor-pointer" onClick={() => {navigator.clipboard.writeText(data.shareCode); alert("已复制");}}>
               <Copy size={12}/> 码: {data.shareCode}
             </div>
           )}
           <button onClick={onSwitchUser} className="text-xs bg-white text-rose-600 px-2 py-1 rounded font-bold">切换账号</button>
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full p-4">{content}</main>
    </div>
  );
};

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<string | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        // Use metadata username or fallback to email
        const u = session.user.user_metadata?.username || session.user.email;
        setUser(u);
      }
      setLoading(false);
    });

    // Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        const u = session.user.user_metadata?.username || session.user.email;
        setUser(u);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-rose-50"><Loader2 className="animate-spin text-rose-600" size={32}/></div>;
  }

  if (!session || !user) {
    return <Auth />;
  }

  if (activeCaseId) {
    return (
      <CaseManager 
        caseId={activeCaseId} 
        user={user} 
        onBack={() => setActiveCaseId(null)}
        onSwitchUser={() => supabase.auth.signOut()}
      />
    );
  }

  return (
    <Dashboard 
      user={user} 
      onSelectCase={setActiveCaseId} 
      onLogout={() => supabase.auth.signOut()} 
    />
  );
};

export default App;