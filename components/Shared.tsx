import React, { useState, useRef } from 'react';
import { 
  Loader2, 
  Sparkles, 
  Mic, 
  ShieldAlert, 
  Trash2, 
  Info, 
  X as XIcon,
  ImageIcon,
  FileAudio,
  Music
} from 'lucide-react';
import * as GeminiService from '../services/geminiService';
import { EvidenceItem, EvidenceType, UserRole } from '../types';

// --- Helpers ---

// Compress image to ensure it fits in storage/API limits
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Limit max dimension to 1024px to balance quality and size
        const MAX_DIMENSION = 1024; 
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height *= MAX_DIMENSION / width;
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width *= MAX_DIMENSION / height;
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve(e.target?.result as string);
            return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        // Compress to JPEG with 0.7 quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Mock audio compression/processing helper
const processAudioFile = (file: File): Promise<{ base64: string, compressed: boolean }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      let result = e.target?.result as string;
      // In a real app, we would compress here. For mock, we check if it fits in LocalStorage roughly.
      // If > 2MB, we might need to truncate or warn (but we'll try to keep it for analysis).
      // Since we rely on Gemini for analysis, we return the base64 for that.
      // But for storage, we might return a placeholder if it's too big to avoid crashing the demo.
      
      const isTooBigForStorage = result.length > 3 * 1024 * 1024; // ~3MB limit for safety in localStorage
      
      resolve({
        base64: result,
        compressed: !isTooBigForStorage // Flag to indicate if we can store the file content
      });
    };
    reader.onerror = (err) => reject(err);
  });
};

// --- Confirm Dialog ---
export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "确认删除",
  cancelText = "取消"
}: {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 transform transition-all scale-100 border border-slate-100">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4 ring-8 ring-red-50/50">
            <Trash2 className="text-red-500" size={28} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed px-2">{message}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Three Qualities Info ---
export const ThreeQualitiesInfo = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="flex-1 text-emerald-800">
        质证环节可以对证据的真实性、案件相关性、合法取得性进行质疑。详情参考证据三性。
        <button 
          onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
          className="inline-flex items-center justify-center ml-1 align-bottom hover:opacity-80 transition-opacity"
          title="点击查看详情"
        >
          <Info size={18} className="text-white fill-emerald-600" />
        </button>
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full relative transform transition-all scale-100" 
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsOpen(false)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <XIcon size={20} />
            </button>
            
            <h3 className="font-bold text-lg text-slate-800 mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Info className="text-blue-500" size={24}/> 证据三性说明
            </h3>
            
            <div className="space-y-3 text-sm text-slate-600">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <span className="font-bold text-blue-800 block mb-1 text-base">1. 真实性</span>
                <p className="text-blue-900/80">内容是否客观存在，而非主观臆断。</p>
              </div>
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <span className="font-bold text-indigo-800 block mb-1 text-base">2. 关联性</span>
                <p className="text-indigo-900/80">证据是否能证明本案的争议事实。</p>
              </div>
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                <span className="font-bold text-rose-800 block mb-1 text-base">3. 合法性</span>
                <p className="text-rose-900/80">取证手段是否侵犯他人隐私或违反法律。</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// --- Voice Textarea ---
export const VoiceTextarea = ({ 
  label, 
  value, 
  onChange, 
  placeholder,
  required = false
}: { 
  label: string, 
  value: string, 
  onChange: (val: string) => void, 
  placeholder: string,
  required?: boolean
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) { alert("麦克风权限错误"); }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;
    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        setIsRecording(false);
        setIsTranscribing(true);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          const text = await GeminiService.transcribeAudio(base64data, 'audio/webm');
          onChange(value ? value + " " + text : text);
          setIsTranscribing(false);
          resolve();
        };
      };
      mediaRecorderRef.current!.stop();
      mediaRecorderRef.current!.stream.getTracks().forEach(track => track.stop());
    });
  };

  const handlePolish = async () => {
    if (!value.trim()) return;
    setIsPolishing(true);
    const polished = await GeminiService.polishText(value);
    onChange(polished);
    setIsPolishing(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-medium text-slate-600">{label}</label>
        {value.length > 5 && (
          <button 
            type="button" 
            onClick={handlePolish} 
            disabled={isPolishing}
            className="flex items-center gap-1 text-xs font-bold text-violet-600 bg-violet-50 px-2 py-1 rounded-full hover:bg-violet-100 transition-colors animate-fade-in"
          >
            {isPolishing ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12} />}
            {isPolishing ? "AI 润色中..." : "AI 润色 (Superpower)"}
          </button>
        )}
      </div>
      <div className="relative">
        <textarea 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none min-h-[120px] pb-12 transition-all"
          placeholder={placeholder}
          required={required}
        />
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          className={`absolute bottom-3 right-3 p-2 rounded-full transition-all flex items-center gap-2 shadow-sm ${
            isRecording 
              ? 'bg-red-500 text-white animate-pulse' 
              : isTranscribing 
                ? 'bg-slate-200 text-slate-500' 
                : 'bg-rose-100 text-rose-600 hover:bg-rose-200'
          }`}
        >
          {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
        </button>
      </div>
    </div>
  );
};

// --- Evidence List ---
export const EvidenceList = ({
  items,
  title,
  emptyMessage = "暂无证据",
  canContest = false,
  contestedIds = new Set(),
  onToggleContest,
  onDelete
}: {
  items: EvidenceItem[],
  title: string,
  emptyMessage?: string,
  canContest?: boolean,
  contestedIds?: Set<string>,
  onToggleContest?: (id: string) => void,
  onDelete?: (id: string) => void
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
  };

  const confirmDelete = () => {
    if (deletingId && onDelete) {
      onDelete(deletingId);
    }
    setDeletingId(null);
  };

  const itemToDelete = items.find(i => i.id === deletingId);

  return (
    <div className="space-y-3">
      <ConfirmDialog 
        isOpen={!!deletingId}
        title="删除证据"
        message={`是否是删除证据 ${itemToDelete?.description || '此项'}?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />

      <h3 className="text-sm font-bold text-slate-500 uppercase">{title}</h3>
      {items.length === 0 && <p className="text-sm text-slate-400 italic">{emptyMessage}</p>}
      {items.map((ev, idx) => {
        const isContested = canContest ? contestedIds?.has(ev.id) : ev.isContested;
        return (
          <div 
            key={ev.id} 
            onClick={() => canContest && onToggleContest && onToggleContest(ev.id)}
            className={`p-3 rounded-lg border transition-all relative group ${
              canContest ? 'cursor-pointer hover:bg-slate-50' : ''
            } ${
              isContested 
                ? 'bg-red-50 border-red-300 ring-1 ring-red-300' 
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex justify-between items-start gap-3">
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded h-fit">#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 font-medium break-words">{ev.description}</p>
                {ev.type === EvidenceType.IMAGE && (
                  <img src={ev.content} alt="Evidence" className="mt-2 rounded-md h-24 object-cover border border-slate-100" />
                )}
                {ev.type === EvidenceType.AUDIO && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs mb-1">
                          <Music size={14} /> 录音转录内容
                      </div>
                      <p className="text-xs text-slate-600 italic line-clamp-3">"{ev.content}"</p>
                  </div>
                )}
                {ev.type === EvidenceType.TEXT && (
                  <p className="text-xs text-slate-500 mt-1 italic line-clamp-3">"{ev.content}"</p>
                )}
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                  {onDelete && (
                      <button 
                          onClick={(e) => handleDelete(e, ev.id)}
                          className="text-slate-400 hover:text-rose-500 p-1 rounded-full hover:bg-rose-50 transition-colors"
                          title="删除证据"
                      >
                          <Trash2 size={18} />
                      </button>
                  )}
                  {isContested && <ShieldAlert size={20} className="text-red-500" />}
              </div>
            </div>
            {isContested && <p className="text-xs text-red-600 mt-2 font-bold ml-10">已提出异议 (Contested)</p>}
            {canContest && !isContested && <p className="text-xs text-slate-400 mt-2 ml-10">点击提出异议</p>}
          </div>
        );
      })}
    </div>
  );
};

// --- Evidence Creator ---
export const EvidenceCreator = ({ 
  onAdd, 
  userRole 
}: { 
  onAdd: (e: EvidenceItem) => void,
  userRole: UserRole
}) => {
  const [textInput, setTextInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) { alert("麦克风权限错误"); }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;
    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          const text = await GeminiService.transcribeAudio(base64data, 'audio/webm');
          setTextInput(prev => prev + " " + text);
          setIsProcessing(false);
          resolve();
        };
      };
      mediaRecorderRef.current!.stop();
      mediaRecorderRef.current!.stream.getTracks().forEach(track => track.stop());
    });
  };

  const handleAddText = () => {
    if (!textInput.trim()) return;
    onAdd({
      id: Date.now().toString(),
      type: EvidenceType.TEXT,
      content: textInput,
      description: "文字/语音证据",
      isContested: false,
      submittedBy: userRole
    });
    setTextInput("");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert("请上传小于 10MB 的图片");
      return;
    }

    setIsCompressing(true);

    try {
        const compressedDataUrl = await compressImage(file);
        onAdd({
            id: Date.now().toString(),
            type: EvidenceType.IMAGE,
            content: compressedDataUrl,
            description: textInput.trim() || file.name,
            isContested: false,
            submittedBy: userRole
        });
        setTextInput(""); // Clear text input after use if intended, though typically separate for images
    } catch (error) {
        console.error("Image compression failed", error);
        alert("图片处理失败，请重试");
    } finally {
        setIsCompressing(false);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 50MB limit check
    if (file.size > 50 * 1024 * 1024) {
      alert("录音文件最大支持 50MB");
      return;
    }

    setIsCompressing(true); // Re-use compressing state for "Analysis & Compression"

    try {
      const { base64, compressed } = await processAudioFile(file);
      const rawBase64 = base64.split(',')[1];
      
      // Transcribe first (Analyze)
      // Note: Passing huge base64 might hit API limits depending on the file, handled in service gracefully hopefully
      const transcript = await GeminiService.transcribeAudio(rawBase64, file.type || 'audio/mp3');

      // Decide what to store. If we couldn't compress enough for localStorage, we store a placeholder + transcript.
      // If we could, we would store the base64 (but we avoid that here to prevent crashing the demo app).
      // For this demo, we prioritize the Transcript as the "Content" for the AI Judge.
      
      onAdd({
        id: Date.now().toString(),
        type: EvidenceType.AUDIO,
        content: transcript || "（语音转录失败，音频已存档）", // We store the transcript as the primary content for the AI to read
        description: `${textInput.trim() || file.name} (已上传录音)`,
        isContested: false,
        submittedBy: userRole
      });
      
      setTextInput("");
    } catch (error) {
      console.error("Audio upload failed", error);
      alert("录音分析失败，请重试");
    } finally {
      setIsCompressing(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
      <label className="text-xs font-bold text-slate-500 uppercase">添加新证据</label>
      <div className="relative">
        <textarea 
           value={textInput}
           onChange={e => setTextInput(e.target.value)}
           className="w-full p-3 pr-12 text-sm border border-slate-300 rounded-lg h-24"
           placeholder="输入文字或证据描述..."
        />
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`absolute bottom-2 right-2 p-2 rounded-full ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 text-slate-600'}`}
        >
          {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <Mic size={16} />}
        </button>
      </div>

      {/* Hidden File Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={audioInputRef} 
        onChange={handleAudioUpload} 
        accept="audio/mpeg,audio/mp3,audio/wav,audio/m4a" 
        className="hidden" 
      />

      <div className="flex gap-2">
        <button onClick={handleAddText} disabled={!textInput.trim() || isProcessing || isCompressing} className="flex-1 bg-slate-800 text-white py-2 rounded-lg text-sm font-bold">
           添加文字
        </button>
        
        <button onClick={() => audioInputRef.current?.click()} disabled={isCompressing} className="px-3 bg-slate-200 text-slate-700 py-2 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-slate-300 transition-colors disabled:opacity-50">
           {isCompressing ? <Loader2 size={16} className="animate-spin" /> : <FileAudio size={16} />} 
           {isCompressing ? "分析中..." : "上传录音"}
        </button>

        <button onClick={() => fileInputRef.current?.click()} disabled={isCompressing} className="px-3 bg-slate-200 text-slate-700 py-2 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-slate-300 transition-colors disabled:opacity-50">
           {isCompressing ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />} 
           {isCompressing ? "处理中..." : "上传图片"}
        </button>
      </div>
    </div>
  );
};