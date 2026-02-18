
import React, { useState, useEffect } from 'react';
import { 
  Scale, 
  User, 
  Loader2, 
  Swords, 
  AlertOctagon, 
  BookOpen,
  Info,
  PenTool,
  RefreshCw
} from 'lucide-react';
import { 
  CaseData, 
  CaseStatus, 
  UserRole 
} from './types';
import * as GeminiService from './services/geminiService';
import { VoiceTextarea, EvidenceList, ThreeQualitiesInfo } from './components/Shared';

interface VerdictSectionProps {
  data: CaseData;
  onSubmit: (patch: Partial<CaseData>) => void;
  role: UserRole;
}

export const VerdictSection: React.FC<VerdictSectionProps> = ({ data, onSubmit, role }) => {
  // Local state for edits
  const [plRebuttal, setPlRebuttal] = useState(data.plaintiffRebuttal);
  const [defRebuttal, setDefRebuttal] = useState(data.defendantRebuttal || "");
  
  // Loading state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // Handlers for "Save Draft / Update State"
  const handleUpdate = (patch: Partial<CaseData>) => {
    onSubmit(patch); 
  };

  const isPlaintiff = role === UserRole.PLAINTIFF;
  const isDefendant = role === UserRole.DEFENDANT;
  const isSpectator = role === UserRole.SPECTATOR;

  // Toggle contest logic
  const togglePlaintiffEvidenceContest = (id: string) => {
    const updated = data.evidence.map(e => e.id === id ? { ...e, isContested: !e.isContested } : e);
    handleUpdate({ evidence: updated });
  };

  const toggleDefendantEvidenceContest = (id: string) => {
    const updated = data.defendantEvidence.map(e => e.id === id ? { ...e, isContested: !e.isContested } : e);
    handleUpdate({ defendantEvidence: updated });
  };

  // Helper: Generate a "fingerprint" of the current case content that affects the AI analysis
  const computeContentHash = () => {
    // We combine all fields that the AI reads to generate dispute points.
    // If any of these change, the hash changes.
    const relevantContent = {
        desc: data.description,
        defStmt: data.defenseStatement,
        plReb: data.plaintiffRebuttal, // Note: Use data.* not local state to ensure sync
        defReb: data.defendantRebuttal || "",
        // For evidence, we track ID, description and contested status.
        // We assume IDs are unique and description changes capture edits.
        ev: data.evidence.map(e => `${e.id}-${e.description}-${e.isContested}`).join('|'),
        defEv: data.defendantEvidence.map(e => `${e.id}-${e.description}-${e.isContested}`).join('|')
    };
    return JSON.stringify(relevantContent);
  };

  const handleFinishCrossExam = async () => {
    const currentHash = computeContentHash();
    const hasDisputePoints = data.disputePoints && data.disputePoints.length > 0;
    
    // CONDITION CHECK:
    // If we have existing points AND the content hasn't changed since the last analysis...
    if (hasDisputePoints && data.lastAnalyzedHash === currentHash) {
        // ... Skip AI analysis and go directly to Debate.
        // This preserves the user's previous inputs in the Debate phase.
        onSubmit({ status: CaseStatus.DEBATE });
        return;
    }

    // Otherwise (New case OR Content modified), run AI analysis.
    setIsAnalyzing(true);
    setProgress(0);
    setErrorMsg(""); 

    const timer = setInterval(() => {
      setProgress(old => {
        if (old >= 99) return 99; 
        return old + 0.333; 
      });
    }, 100);

    try {
        const points = await GeminiService.analyzeDisputeFocus(
            data.category,
            data.description,
            data.defenseStatement,
            data.plaintiffRebuttal,
            data.defendantRebuttal || "",
            data.evidence 
        );
        
        clearInterval(timer);
        setProgress(100);

        setTimeout(() => {
            onSubmit({ 
                status: CaseStatus.DEBATE,
                disputePoints: points,
                lastAnalyzedHash: currentHash // Save the new fingerprint
            });
        }, 800);

    } catch (e: any) {
        clearInterval(timer);
        console.error(e);
        setErrorMsg(e.message || "AI 分析遇到问题，请检查网络后重试。");
    }
  };

  // --- Render Helpers (Moved inline or checks to avoid nesting components) ---

  const renderOpposingStatement = () => {
    if (isPlaintiff) {
        return (
            <div className="bg-white p-6 rounded-xl border-l-4 border-indigo-400 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><User size={100} className="text-indigo-500" /></div>
                <h4 className="font-bold text-indigo-800 mb-3 text-lg border-b border-indigo-100 pb-2 flex items-center gap-2 font-cute">
                   被告答辩 (对方观点)
                </h4>
                <p className="text-slate-700 leading-relaxed text-base relative z-10">{data.defenseSummary || data.defenseStatement}</p>
            </div>
        );
    }
    if (isDefendant) {
        return (
            <div className="bg-white p-6 rounded-xl border-l-4 border-rose-400 shadow-sm relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><User size={100} className="text-rose-500" /></div>
                <h4 className="font-bold text-rose-800 mb-3 text-lg border-b border-rose-100 pb-2 flex items-center gap-2 font-cute">
                   原告起诉 (对方观点)
                </h4>
                <p className="text-slate-700 leading-relaxed text-base relative z-10">{data.plaintiffSummary || data.description}</p>
            </div>
        );
    }
    return null; 
  };

  const renderMyRebuttal = () => {
    if (isPlaintiff) {
        return (
          <div className="bg-rose-50/50 p-5 rounded-2xl border-2 border-rose-100">
            <h3 className="font-bold text-rose-700 mb-4 flex items-center gap-2 text-lg font-cute">
              <User size={20}/> 我的质证 (原告)
            </h3>
            <div className="space-y-5">
                {/* Attack Defendant's Evidence */}
                <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                    <EvidenceList 
                      items={data.defendantEvidence} 
                      title="【点击】被告证据 (如认为虚假/无效请点击)" 
                      canContest={true} 
                      contestedIds={new Set(data.defendantEvidence.filter(e => e.isContested).map(e => e.id))}
                      onToggleContest={toggleDefendantEvidenceContest}
                    />
                </div>
                {/* Input Rebuttal */}
                <div className="bg-white p-1 rounded-xl shadow-sm">
                  <VoiceTextarea 
                    label="质证说明" 
                    placeholder="针对被告的说法或证据，你有什么反驳？(例如：证据是伪造的...)" 
                    value={plRebuttal} 
                    onChange={(val) => { setPlRebuttal(val); handleUpdate({ plaintiffRebuttal: val }); }} 
                  />
                </div>
            </div>
          </div>
        );
    }

    if (isDefendant) {
        return (
          <div className="bg-indigo-50/50 p-5 rounded-2xl border-2 border-indigo-100">
            <h3 className="font-bold text-indigo-700 mb-4 flex items-center gap-2 text-lg font-cute">
              <User size={20}/> 我的质证 (被告)
            </h3>
            <div className="space-y-5">
                {/* Attack Plaintiff's Evidence */}
                <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-sm">
                    <EvidenceList 
                      items={data.evidence} 
                      title="【点击】原告证据 (如认为虚假/无效请点击)" 
                      canContest={true} 
                      contestedIds={new Set(data.evidence.filter(e => e.isContested).map(e => e.id))}
                      onToggleContest={togglePlaintiffEvidenceContest}
                    />
                </div>
                {/* Input Rebuttal */}
                <div className="bg-white p-1 rounded-xl shadow-sm">
                  <VoiceTextarea 
                    label="质证说明" 
                    placeholder="针对原告的说法或证据，你有什么反驳？(例如：这并不属实...)" 
                    value={defRebuttal} 
                    onChange={(val) => { setDefRebuttal(val); handleUpdate({ defendantRebuttal: val }); }} 
                  />
                </div>
            </div>
          </div>
        );
    }
    
    return <div className="p-4 text-center text-slate-500 italic">观众模式：等待双方质证...</div>;
  };

  // --- Loading Screen (Full View) ---
  if (isAnalyzing) {
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 animate-fade-in text-center">
            {/* Animation Scene: Book & Pen */}
            <div className="relative w-32 h-32 mb-8 mx-auto">
                <BookOpen size={100} className="text-slate-200 mx-auto" strokeWidth={1.5} />
                <div className={`absolute -top-4 -right-4 origin-bottom-left ${errorMsg ? '' : 'animate-writing'}`}>
                    <PenTool size={48} className={`fill-rose-100 drop-shadow-lg ${errorMsg ? 'text-slate-400' : 'text-rose-600'}`} />
                </div>
                <style>{`
                  @keyframes writing {
                    0% { transform: translate(0, 0) rotate(0deg); }
                    25% { transform: translate(-10px, 15px) rotate(-10deg); }
                    50% { transform: translate(-25px, 5px) rotate(-5deg); }
                    75% { transform: translate(-10px, 15px) rotate(-10deg); }
                    100% { transform: translate(0, 0) rotate(0deg); }
                  }
                  .animate-writing {
                    animation: writing 2s ease-in-out infinite;
                  }
                `}</style>
            </div>

            <h3 className="text-2xl font-bold text-slate-800 font-cute mb-3 animate-pulse">
                {errorMsg ? "分析中断" : "法官正在努力总结案件争议焦点中..."}
            </h3>
            
            <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
                {errorMsg ? errorMsg : "AI 法官正在仔细阅读双方的陈述与证据，耗时大概 30 秒，请耐心等待..."}
            </p>

            <div className="w-full max-w-xs bg-slate-100 h-5 rounded-full overflow-hidden shadow-inner border border-slate-200 relative mb-2">
                <div 
                    className={`h-full rounded-full transition-all ease-linear relative overflow-hidden ${errorMsg ? 'bg-slate-300' : 'bg-gradient-to-r from-rose-400 to-rose-600'}`}
                    style={{ width: `${progress}%` }}
                >
                     {!errorMsg && <div className="absolute inset-0 bg-white/30 animate-pulse w-full h-full"></div>}
                </div>
            </div>
            
            <div className="flex justify-center w-full max-w-xs text-xs text-slate-400 font-bold px-1">
                <span className={errorMsg ? 'text-slate-500' : 'text-rose-500'}>{Math.floor(progress)}%</span>
            </div>

            {!errorMsg && progress >= 99 && (
                 <p className="mt-4 text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full animate-bounce">
                    案件比较复杂，法官还在思考中，请稍候...
                 </p>
            )}

            {errorMsg && (
                <button 
                  onClick={handleFinishCrossExam}
                  className="mt-6 bg-slate-800 text-white px-6 py-2 rounded-full font-bold hover:bg-black transition-colors"
                >
                  <RefreshCw size={16} className="inline mr-2" />
                  重试
                </button>
            )}
        </div>
    );
  }

  // --- Normal Render ---
  return (
    <div className="space-y-6">
      {/* 0. Instruction Header */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-sm text-blue-800 flex gap-2 items-start shadow-sm">
         <Info className="shrink-0 mt-0.5" size={18}/>
         <p>本环节为<strong>纯质证环节</strong>。仅允许针对对方已提交的证据进行反驳说明。<strong>如需补充新的证据，请点击左上角返回上一步骤。</strong></p>
      </div>

      {/* 1. Review Phase: Context */}
      <div className="space-y-4">
         {renderOpposingStatement()}
      </div>

      {/* 2. Action Phase: Input */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 font-cute">
          <Scale className="text-slate-600" /> 质证环节
        </h2>
        {renderMyRebuttal()}
      </div>

      {/* 3. Educational Tooltip (Three Qualities) */}
      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-sm text-emerald-800 flex gap-2 items-start relative shadow-sm">
         <BookOpen className="shrink-0 mt-0.5" size={18}/>
         <ThreeQualitiesInfo />
      </div>

      {/* 4. Next Step Warning */}
      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl text-sm text-yellow-800 flex gap-2 items-start shadow-sm">
         <AlertOctagon className="shrink-0 mt-0.5" size={18}/>
         <p>下一步将由 AI 总结核心争议焦点，双方可针对焦点进行最后一轮辩论。</p>
      </div>

      {/* 5. Submit Button */}
      <button onClick={handleFinishCrossExam} disabled={isAnalyzing} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black shadow-lg flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform">
        <Swords size={20}/> 结束质证，进入争议焦点辩论
      </button>
    </div>
  );
};
