import React, { useState } from 'react';
import { 
  Scale, 
  User, 
  Loader2, 
  Swords, 
  AlertOctagon, 
  BookOpen,
  Info
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
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

  const handleFinishCrossExam = async () => {
    setIsAnalyzing(true);
    // Analyze and generate dispute points
    try {
        const points = await GeminiService.analyzeDisputeFocus(
            data.category,
            data.description,
            data.defenseStatement,
            data.plaintiffRebuttal,
            data.defendantRebuttal || ""
        );
        // Move to DEBATE phase
        onSubmit({ 
            status: CaseStatus.DEBATE,
            disputePoints: points
        });
    } catch (e) {
        alert("AI 分析争议焦点失败，请重试");
    } finally {
        setIsAnalyzing(false);
    }
  };

  // --- Render Helpers for Strict Isolation ---

  // 1. Context Card: What are we arguing against?
  const OpposingStatementCard = () => {
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
    return null; // Spectators see full view handled separately if needed, or default logic
  };

  // 2. Action Card: Evidence Contest & Rebuttal Input
  const MyRebuttalSection = () => {
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
    
    // Spectator View (Simplified)
    return <div className="p-4 text-center text-slate-500 italic">观众模式：等待双方质证...</div>;
  };

  return (
    <div className="space-y-6">
      {/* 0. Instruction Header */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-sm text-blue-800 flex gap-2 items-start shadow-sm">
         <Info className="shrink-0 mt-0.5" size={18}/>
         <p>本环节为<strong>纯质证环节</strong>。仅允许针对对方已提交的证据进行反驳说明。<strong>如需补充新的证据，请点击左上角返回上一步骤。</strong></p>
      </div>

      {/* 1. Review Phase: Context */}
      <div className="space-y-4">
         <OpposingStatementCard />
      </div>

      {/* 2. Action Phase: Input */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 font-cute">
          <Scale className="text-slate-600" /> 质证环节
        </h2>
        <MyRebuttalSection />
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
        {isAnalyzing ? (
            <><Loader2 className="animate-spin" size={20}/> AI 正在分析争议焦点...</>
        ) : (
            <><Swords size={20}/> 结束质证，进入争议焦点辩论</>
        )}
      </button>
    </div>
  );
};
