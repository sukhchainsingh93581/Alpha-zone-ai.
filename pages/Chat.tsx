
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { UserProfile, ChatMessage, AIAgent } from '../types';
import { ref, onValue, update, push, remove, get } from 'firebase/database';
import { db } from '../firebase';
import { chatWithGeminiStream } from '../geminiService';
import { Send, Trash2, Copy, ExternalLink, Paperclip, ChevronLeft, Bot, Sparkles, Sliders, X, Save, Zap, Cpu, RefreshCw, Play, Lock, FileText, Image as ImageIcon } from 'lucide-react';

interface ChatProps {
  user: UserProfile | null;
}

const Chat: React.FC<ChatProps> = ({ user }) => {
  const { agentId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [chatId, setChatId] = useState<string | null>(searchParams.get('chatId'));
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [showInstructionModal, setShowInstructionModal] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  
  // File Attachment State
  const [attachment, setAttachment] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const STRICT_SYSTEM_RULES = `
  🔒 CUSTOM INSTRUCTION FOR APP & GAME DEVELOPMENT AI
  🎯 ROLE & BEHAVIOR:
  Tum ek professional app & game developer AI ho jo modern web apps, admin panels aur HTML5 games banata hai.
  Strictly follow these rules:

  1️⃣ IDEA HANDLING:
  - User agar basic idea likhe, pehle trending suggestion do.
  - Selected app ke liye complete numbered feature list do (detail me).

  2️⃣ FEATURE FLOW:
  - Wait for user feature selection before writing code.
  - Tech: HTML5, CSS3, Vanilla JS, Font Awesome.

  3️⃣ FILE RULE (STRICT):
  - User Panel = 1 HTML file.
  - Admin + User Panel = 1 HTML for Admin, 1 HTML for User. Max 2 files total.

  4️⃣ FIREBASE:
  - Realtime Database ONLY. No Storage. 
  - Admin ID/Pass Firebase me manually create honge.
  - Images external host hongi (URL based).

  5️⃣ DESIGN:
  - Modern UI, Native Android/Java/Kotlin app look & feel.

  6️⃣ HEAVY CODE:
  - Never shortcut. Use "Continue from last" logic if response is cut.
  `;

  useEffect(() => {
    const agentData: Record<string, AIAgent> = {
      'prompt-gen': { id: 'prompt-gen', name: 'Prompt Generator', description: '', api_type: 'gemini', system_instruction: `You are a master of engineering AI prompts. ${STRICT_SYSTEM_RULES}`, is_enabled: true },
      'html-gen': { id: 'html-gen', name: 'HTML Generator', description: '', api_type: 'gemini', system_instruction: `You are an expert web developer. ${STRICT_SYSTEM_RULES}`, is_enabled: true },
      'pro-ai': { id: 'pro-ai', name: 'Custom Pro AI', description: '', api_type: 'gemini', system_instruction: `You are an advanced neural logical engine. ${STRICT_SYSTEM_RULES}`, is_enabled: true },
      'pro-dev': { id: 'pro-dev', name: 'Pro Developer', description: '', api_type: 'gemini', system_instruction: `You are a world-class senior software architect. ${STRICT_SYSTEM_RULES}`, is_enabled: true },
    };
    setAgent(agentData[agentId || ''] || agentData['prompt-gen']);

    if (user && agentId === 'pro-ai') {
      const instrRef = ref(db, `users/${user.uid}/custom_instructions/${agentId}`);
      get(instrRef).then((snapshot) => {
        if (snapshot.exists()) setCustomInstructions(snapshot.val());
      });
    }
  }, [agentId, user]);

  useEffect(() => {
    if (user && chatId) {
      const msgRef = ref(db, `users/${user.uid}/chats/${chatId}/messages`);
      const unsubscribe = onValue(msgRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const list = Object.entries(data).map(([id, val]: [string, any]) => ({
            msgId: id,
            ...val
          })).sort((a, b) => a.timestamp - b.timestamp);
          setMessages(list);
        }
      });
      return () => unsubscribe();
    }
  }, [user, chatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, isStreaming]);

  const saveInstructions = async () => {
    if (!user || agentId !== 'pro-ai') return;
    try {
      await update(ref(db, `users/${user.uid}/custom_instructions`), { [agentId]: customInstructions });
      setShowInstructionModal(false);
    } catch (err) {
      alert("Failed to sync logic");
    }
  };

  const handleFileClick = () => {
    if (!user?.is_premium) {
      navigate('/premium');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAttachment({
        data: base64,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || input;
    if (!promptToSend.trim() && !attachment) return;
    if (isStreaming) return;
    if (!user) return;

    if (user.remaining_ai_seconds <= 0 && !user.is_premium) {
      alert('AI Balance Exhausted!');
      navigate('/premium');
      return;
    }

    if (!customPrompt) setInput('');
    setIsStreaming(true);
    setStreamingText('');

    let activeChatId = chatId;
    if (!activeChatId) {
      const newChatRef = push(ref(db, `users/${user.uid}/chats`));
      activeChatId = newChatRef.key;
      setChatId(activeChatId);
      update(ref(db, `users/${user.uid}/chats/${activeChatId}`), {
        agentId: agent?.id,
        agentName: agent?.name,
        timestamp: Date.now()
      });
    }

    const userMsg: ChatMessage = { 
      id: Date.now().toString(), 
      role: 'user', 
      text: attachment ? `[Attached File: ${attachment.name}]\n${promptToSend}` : promptToSend, 
      timestamp: Date.now() 
    };
    
    const historyForAI = messages.map(m => ({ role: m.role, text: m.text }));
    if (!customPrompt) {
      historyForAI.push({ role: 'user', text: promptToSend });
      await push(ref(db, `users/${user.uid}/chats/${activeChatId}/messages`), userMsg);
      update(ref(db, `users/${user.uid}/chats/${activeChatId}`), {
        lastMessage: promptToSend,
        timestamp: Date.now()
      });
    }

    const finalInstruction = agentId === 'pro-ai' && customInstructions 
      ? `${agent?.system_instruction}\n\nUSER CUSTOM OVERRIDE (STRICT): ${customInstructions}` 
      : agent?.system_instruction || '';

    const modelToUse = (agentId === 'pro-ai' || agentId === 'pro-dev' || agentId === 'html-gen') 
      ? 'gemini-3-pro-preview' 
      : 'gemini-3-flash-preview';

    try {
      let fullResponse = '';
      await chatWithGeminiStream(
        historyForAI, 
        finalInstruction, 
        (chunk) => {
          setStreamingText(prev => prev + chunk);
          fullResponse += chunk;
        }, 
        modelToUse,
        attachment ? { data: attachment.data, mimeType: attachment.mimeType } : undefined
      );

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: fullResponse, timestamp: Date.now() };
      await push(ref(db, `users/${user.uid}/chats/${activeChatId}/messages`), aiMsg);
      setStreamingText('');
      setAttachment(null); // Clear attachment after sending
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  };

  const regenerateMessage = (index: number) => {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        handleSendMessage(messages[i].text);
        break;
      }
    }
  };

  const deleteMessage = (msgId: string) => {
    if (chatId && user && window.confirm("Delete this message?")) {
      remove(ref(db, `users/${user.uid}/chats/${chatId}/messages/${msgId}`));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const hasHtml = (text: string) => /<html|<!DOCTYPE html|body>/i.test(text);

  return (
    <div className="fixed inset-0 top-20 pb-24 z-10 flex flex-col transition-colors duration-300" style={{ backgroundColor: 'var(--primary-bg)' }}>
      {/* Background AI Agent Photo with Animation */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.03] pointer-events-none transition-all duration-1000 overflow-hidden">
        <div className={`relative w-full h-full max-w-lg transition-all duration-1000 ${isStreaming ? 'opacity-40 scale-110' : 'opacity-10 scale-100'}`}>
          <img 
            src="https://img.freepik.com/premium-photo/futuristic-robot-head-artificial-intelligence-humanoid-cyborg-portrait_756748-4774.jpg" 
            alt="Neural Agent" 
            className={`w-full h-full object-contain filter grayscale invert transition-all ${isStreaming ? 'animate-pulse blur-[1px]' : ''}`}
          />
          {isStreaming && (
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--accent-color)]/20 to-transparent animate-pulse rounded-full blur-3xl"></div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="relative z-10 px-4 py-3 flex items-center justify-between border-b transition-colors" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors" style={{ color: 'var(--text-primary)' }}>
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="font-black text-[10px] tracking-widest uppercase flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              {agent?.name} {user?.is_premium && <Sparkles size={10} className="text-[#ff00c8]" />}
            </h2>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.map((msg, idx) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[88%] md:max-w-[70%]`}>
               <div className={`p-4 rounded-[24px] ${msg.role === 'user' ? 'bg-[#00f2ff] text-black rounded-tr-none shadow-lg' : 'glass rounded-tl-none border shadow-xl'}`} 
                    style={msg.role === 'model' ? { backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' } : {}}>
                 <p className="text-[13px] leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
               </div>
               
               {msg.role === 'model' && (
                 <div className="mt-2 flex items-center gap-2 px-1">
                   {hasHtml(msg.text) && (
                     <button 
                       onClick={() => {
                          const blob = new Blob([msg.text], { type: 'text/html' });
                          window.open(URL.createObjectURL(blob), '_blank');
                       }}
                       className="p-2 bg-[#00ff9d]/10 text-[#00ff9d] rounded-lg hover:bg-[#00ff9d] hover:text-black transition-all border border-[#00ff9d]/20 flex items-center gap-1.5"
                     >
                       <Play size={12} fill="currentColor" />
                       <span className="text-[9px] font-black uppercase">Run</span>
                     </button>
                   )}
                   <button 
                     onClick={() => copyToClipboard(msg.text)} 
                     className="p-2 bg-white/5 text-white/40 rounded-lg hover:text-white transition-all border border-white/5 flex items-center gap-1.5"
                   >
                     <Copy size={12} />
                     <span className="text-[9px] font-black uppercase">Copy</span>
                   </button>
                   <button 
                     onClick={() => regenerateMessage(idx)} 
                     className="p-2 bg-white/5 text-white/40 rounded-lg hover:text-white transition-all border border-white/5 flex items-center gap-1.5"
                   >
                     <RefreshCw size={12} />
                     <span className="text-[9px] font-black uppercase">Retry</span>
                   </button>
                   <button 
                     onClick={() => deleteMessage((msg as any).msgId)} 
                     className="p-2 bg-red-500/5 text-red-500/40 rounded-lg hover:text-red-500 transition-all border border-red-500/10 flex items-center gap-1.5 ml-auto"
                   >
                     <Trash2 size={12} />
                   </button>
                 </div>
               )}

               {msg.role === 'user' && (
                 <div className="mt-1 px-1">
                   <span className="text-[8px] font-bold text-white/20 uppercase">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                 </div>
               )}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[88%] glass p-4 rounded-[24px] rounded-tl-none border animate-pulse relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--accent-color)]/5 to-transparent animate-shimmer"></div>
               {streamingText ? <p className="text-[13px] whitespace-pre-wrap relative z-10">{streamingText}</p> : <div className="flex gap-2 items-center text-[9px] font-black uppercase relative z-10"><Cpu size={14} className="animate-spin" /> Neural Sync...</div>}
            </div>
          </div>
        )}
      </div>

      {/* Input Module */}
      <div className="relative z-10 p-3 bg-transparent border-t transition-colors" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex flex-col max-w-4xl mx-auto gap-2">
          {/* File Preview Chip */}
          {attachment && (
            <div className="flex items-center gap-2 p-2 px-4 rounded-xl glass border border-[#00f2ff]/30 animate-in slide-in-from-bottom-2 self-start max-w-xs">
              {attachment.mimeType.startsWith('image/') ? <ImageIcon size={14} className="text-[#00f2ff]" /> : <FileText size={14} className="text-[#00f2ff]" />}
              <span className="text-[9px] font-black uppercase tracking-widest truncate">{attachment.name}</span>
              <button onClick={() => setAttachment(null)} className="p-1 hover:bg-white/5 rounded-full ml-1">
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*,.pdf,.txt,.js,.html,.css"
            />

            {agentId === 'pro-ai' && user?.is_premium && (
              <button 
                onClick={() => setShowInstructionModal(true)}
                className="w-12 h-12 shrink-0 rounded-2xl bg-[#ff00c8]/10 text-[#ff00c8] border border-[#ff00c8]/30 shadow-lg flex items-center justify-center hover:bg-[#ff00c8]/20 transition-all active:scale-90"
              >
                <Sliders size={18} />
              </button>
            )}
            
            <div className="flex-1 glass rounded-2xl p-1.5 flex items-center gap-2 border transition-all" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
              <textarea 
                rows={1}
                placeholder="COMMAND..."
                className="flex-1 bg-transparent border-none focus:outline-none px-3 py-2 text-[12px] font-bold resize-none max-h-32 uppercase placeholder:text-white/10"
                style={{ color: 'var(--text-primary)' }}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              
              {/* File Attachment Button */}
              <button 
                onClick={handleFileClick}
                className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all relative ${user?.is_premium ? 'text-[var(--accent-color)] hover:bg-white/5' : 'text-white/20'}`}
                title={user?.is_premium ? "Attach File" : "Premium Required"}
              >
                <Paperclip size={18} />
                {!user?.is_premium && <Lock size={10} className="absolute bottom-1 right-1" />}
                {attachment && <div className="absolute top-2 right-2 w-2 h-2 bg-[#00f2ff] rounded-full animate-pulse shadow-[0_0_8px_#00f2ff]"></div>}
              </button>

              <button 
                onClick={() => handleSendMessage()}
                disabled={(!input.trim() && !attachment) || isStreaming}
                className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all ${(!input.trim() && !attachment) || isStreaming ? 'opacity-20' : 'bg-[#00f2ff] text-black shadow-lg shadow-[#00f2ff]/20 active:scale-95'}`}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Neural Override Modal */}
      {showInstructionModal && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="glass p-8 rounded-[40px] w-full max-w-md border border-[#ff00c8]/30 relative animate-in zoom-in-95 overflow-hidden shadow-2xl">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#ff00c8]/20 blur-[60px]"></div>
            <button onClick={() => setShowInstructionModal(false)} className="absolute top-6 right-6 text-white/30 hover:text-white p-2">
              <X size={20} />
            </button>
            <div className="flex items-center gap-4 mb-6">
               <div className="w-12 h-12 bg-[#ff00c8]/20 rounded-2xl flex items-center justify-center text-[#ff00c8]"><Zap size={24} /></div>
               <div>
                  <h2 className="text-xl font-black italic tracking-tighter uppercase text-white">NEURAL <span className="text-[#ff00c8]">OVERRIDE</span></h2>
                  <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Manual Logical Patch</p>
               </div>
            </div>
            <textarea 
              className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-white text-xs font-medium focus:outline-none focus:border-[#ff00c8]/40 min-h-[160px] uppercase"
              placeholder="Define custom logic overrides..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
            />
            <button 
              onClick={saveInstructions}
              className="w-full mt-6 py-4 rounded-2xl bg-[#ff00c8] text-white font-black text-[10px] tracking-[0.3em] uppercase shadow-xl hover:shadow-[#ff00c8]/40 transition-all flex items-center justify-center gap-2"
            >
              <Save size={14} /> SYNC NEURAL LOGIC
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
