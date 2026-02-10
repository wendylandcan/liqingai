
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
  Sparkles, 
  Home, 
  Heart, 
  Dog, 
  Cat, 
  PawPrint, 
  UserX
} from 'lucide-react';
import { 
  CaseData, 
  CaseStatus, 
  UserRole, 
  Verdict, 
  JudgePersona 
} from './types';
import * as GeminiService from './services/geminiService';
import { CaseService } from './services/mockDb';
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

const FilingForm = ({ data, onSubmit }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => void }) => {
  const [desc, setDesc] = useState(data.description);
  const [demands, setDemands] = useState(data.demands);
  const [isChecking, setIsChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return alert("请填写陈述");
    setIsChecking(true);
    
    // Parallel execution: Check sentiment, generate title AND generate summary
    const [sentiment, title, summary] = await Promise.all([
      GeminiService.analyzeSentiment(desc),
      GeminiService.generateCaseTitle(desc),
      GeminiService.summarizeStatement(desc, "Plaintiff")
    ]);

    setIsChecking(false);
    
    if (sentiment.isToxic) return alert(`⚠️ 需要冷静！\n\n${sentiment.reason}`);
    
    onSubmit({ 
      description: desc, 
      demands,
      title: title || undefined, // Save the AI generated title
      plaintiffSummary: summary // Save the AI generated summary
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-rose-100 space-y-4">
      <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2 font-cute"><FileText className="text-rose-500" />原告起诉</h2>
      <VoiceTextarea label="事实陈述" placeholder="请具体描述..." value={desc} onChange={setDesc} required />
      <VoiceTextarea label="诉请" placeholder="诉请 (如: 道歉)..." value={demands} onChange={setDemands} required />
      <button onClick={handleSubmit} disabled={isChecking} className="w-full bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2">
        {isChecking ? <><Loader2 className="animate-spin" size={20}/> 正在进入举证环节...</> : '下一步：举证'}
      </button>
    </div>
  );
};

const PlaintiffEvidenceStep = ({ data, onSubmit }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => void }) => (
  <div className="space-y-6">
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

const DefenseStep = ({ data, onSubmit }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => void }) => {
  const [stmt, setStmt] = useState(data.defenseStatement);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Removed contesting logic as per requirement: only display statement summary without cross-examination

  const handleSubmit = async () => {
      if (!stmt.trim()) return alert("请填写答辩理由");
      setIsSubmitting(true);
      try {
          // Generate summary for defense statement
          const summary = await GeminiService.summarizeStatement(stmt, "Defendant");
          onSubmit({ 
              defenseStatement: stmt, 
              defenseSummary: summary,
              status: CaseStatus.CROSS_EXAMINATION 
          });
      } catch (e) {
          // Fallback if summary fails
          console.error("Summary generation failed", e);
           onSubmit({ 
              defenseStatement: stmt, 
              status: CaseStatus.CROSS_EXAMINATION 
          });
      }
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
      <button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2">
         {isSubmitting ? <><Loader2 className="animate-spin" size={20} /> 正在生成摘要并提交...</> : '进入质证环节'}
      </button>
    </div>
  );
};

const AdjudicationStep = ({ data, onSubmit }: { data: CaseData, onSubmit: (d: Partial<CaseData>) => void }) => {
  const [persona, setPersona] = useState(data.judgePersona);
  const [isDeliberating, setIsDeliberating] = useState(false);

  const handleJudgement = async () => {
    setIsDeliberating(true);
    try {
      const verdict = await GeminiService.generateVerdict(
        data.category, data.description, data.demands, data.defenseStatement,
        data.evidence, data.defendantEvidence, 
        data.plaintiffRebuttal, data.plaintiffRebuttalEvidence, 
        data.defendantRebuttal || "", data.defendantRebuttalEvidence || [],
        persona
      );
      onSubmit({ verdict, judgePersona: persona, status: CaseStatus.CLOSED });
    } catch (e) { alert("AI 法官忙碌中"); } 
    finally { setIsDeliberating(false); }
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

      <button onClick={handleJudgement} disabled={isDeliberating} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-xl flex justify-center items-center gap-2 mt-4 hover:scale-[1.01] transition-transform">
        {isDeliberating ? (
          <><Loader2 className="animate-spin" /> 正在审理中...</>
        ) : (
          <><Gavel size={20} /> 召唤 AI 判决</>
        )}
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
               {verdict.penaltyTasks.map((t, i) => <li key={i}>{t}</li>)}
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
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
       const userCases = await CaseService.getCasesForUser(user);
       setCases(userCases);
    } catch (e) {
       console.error(e);
    } finally {
       setLoading(false);
    }
  };
  
  useEffect(() => { refresh(); }, [user]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
       const newCase = await CaseService.createCase(user);
       if (newCase) {
         onSelectCase(newCase.id);
       } else {
         alert("创建失败：未返回案件信息");
       }
    } catch (e: any) {
       console.error("Create Case Failed", e);
       alert(`创建案件失败，请检查网络\n\n错误信息: ${e.message || '未知错误'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    const res = await CaseService.joinCase(joinCode.trim().toUpperCase(), user);
    if (res.success && res.caseId) onSelectCase(res.caseId);
    else alert(res.error || "加入失败");
  };

  const requestDelete = (e: React.MouseEvent, caseId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTargetId(caseId);
  };

  const confirmDelete = async () => {
    if (deleteTargetId) {
       try {
        await CaseService.deleteCase(deleteTargetId);
        refresh();
      } catch (err) {
        console.error("Delete failed", err);
        alert("删除失败");
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
            <button 
              onClick={handleCreate} 
              disabled={isCreating}
              className="bg-rose-600 text-white p-4 rounded-xl font-bold flex flex-col items-center gap-2 hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {isCreating ? <Loader2 className="animate-spin" /> : <PlusCircle />} 
              {isCreating ? "创建中..." : "发起起诉"}
            </button>
            <div className="bg-slate-100 p-4 rounded-xl flex flex-col gap-2">
              <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="输入案件码" className="w-full text-center text-sm p-1 rounded bg-white border border-slate-200 uppercase" />
              <button onClick={handleJoin} disabled={!joinCode} className="bg-indigo-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">被告应诉</button>
            </div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
             <h3 className="text-sm font-bold text-slate-500 uppercase">我的案件</h3>
             <button onClick={refresh} className="text-slate-400 hover:text-rose-500"><RefreshCw size={16}/></button>
          </div>
          <div className="space-y-3">
            {loading && <div className="text-center py-4"><Loader2 className="animate-spin text-rose-500 mx-auto"/></div>}
            {!loading && cases.length === 0 && <p className="text-center text-slate-400 py-4 text-sm">暂无案件</p>}
            {!loading && cases.map(c => (
              <div key={c.id} onClick={() => c.status !== CaseStatus.CANCELLED && onSelectCase(c.id)} className={`bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center ${c.status === CaseStatus.CANCELLED ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-rose-300'}`}>
                <div className="flex-1 min-w-0 mr-2">
                  <p className="font-bold text-slate-800 text-sm line-clamp-1">{c.title || c.description || c.category}</p>
                  <p className="text-xs text-slate-500">
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

  const load = async () => {
    // Silent load for polling, explicit loading for initial
    try {
       const c = await CaseService.getCase(caseId);
       setData(c);
       setLoading(false);
    } catch (e) {
       console.error(e);
    }
  };

  useEffect(() => { 
     load(); 
     const int = setInterval(load, 3000); // Poll every 3s
     return () => clearInterval(int); 
  }, [caseId]);

  const update = async (patch: Partial<CaseData>) => {
    if (!data) return;
    try {
       // Optimistic update
       setData({ ...data, ...patch });
       // DB update
       const updated = await CaseService.updateCase(data.id, patch);
       if (updated) setData(updated);
    } catch (e) {
       console.error("Update failed", e);
       alert("保存失败，请检查网络");
       load(); // Revert
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (data) {
       await CaseService.deleteCase(data.id);
       onBack();
    }
  };

  const handleDefaultJudgment = () => {
    update({ 
      defenseStatement: "（被告缺席，放弃答辩）",
      defenseSummary: "被告未出庭应诉，视为放弃答辩权利。",
      status: CaseStatus.ADJUDICATING,
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

    if (isPlaintiff) {
      if (data.status === CaseStatus.PLAINTIFF_EVIDENCE) {
        update({ status: CaseStatus.DRAFTING });
        return;
      }
      if (data.status === CaseStatus.DEFENSE_PENDING) {
        // Plaintiff wants to go back and add more evidence while waiting
        update({ status: CaseStatus.PLAINTIFF_EVIDENCE });
        return;
      }
    } 
    
    // For both parties, if in Cross-Examination, go back to Defense Pending
    if (data.status === CaseStatus.CROSS_EXAMINATION) {
       update({ status: CaseStatus.DEFENSE_PENDING });
       return;
    }

    // New: If in Adjudicating (Judge Selection) step
    if (data.status === CaseStatus.ADJUDICATING) {
       update({ status: CaseStatus.CROSS_EXAMINATION });
       return;
    }

    // Default exit
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
      content = isPlaintiff ? <FilingForm data={data} onSubmit={(d) => update({ ...d, status: CaseStatus.PLAINTIFF_EVIDENCE })} /> : <Waiting msg="等待原告填写起诉状..." />;
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
      content = <VerdictView verdict={data.verdict!} persona={data.judgePersona} onReset={() => onBack()} onAppeal={() => update({ status: CaseStatus.ADJUDICATING })} />;
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
  const [user, setUser] = useState<string | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Prefer username from metadata, fallback to email part, fallback to email
        const name = session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User';
        setUser(name);
      }
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const name = session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User';
        setUser(name);
      } else {
        setUser(null);
        setActiveCaseId(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // User state will be cleared by the onAuthStateChange listener
  };

  if (loading) {
     return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-rose-600" /></div>;
  }

  if (!user) return <Auth />;
  
  if (activeCaseId) {
    return (
      <CaseManager 
        caseId={activeCaseId} 
        user={user} 
        onBack={() => setActiveCaseId(null)} 
        onSwitchUser={handleLogout} 
      />
    );
  }

  return <Dashboard user={user} onSelectCase={setActiveCaseId} onLogout={handleLogout} />;
};

export default App;
