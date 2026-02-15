
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { UserProfile, ChatMessage, AIAgent } from '../types';
import { ref, onValue, update, push, remove, get } from 'firebase/database';
import { db } from '../firebase';
import { chatWithGeminiStream } from '../geminiService';
import { Send, Trash2, Copy, Paperclip, ChevronLeft, Sparkles, X, Cpu, Play, Lock, Image as ImageIcon, FileArchive, RefreshCw } from 'lucide-react';

interface ChatProps { user: UserProfile | null; }

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
  const [customInstructions, setCustomInstructions] = useState('');
  const [attachment, setAttachment] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // USER'S STRICT CUSTOM INSTRUCTIONS - FULL VERSION
  const DEVELOPER_STRICT_RULES = `
  🔒 CUSTOM INSTRUCTION FOR APP & GAME DEVELOPMENT AI
  🎯 ROLE & BEHAVIOR
  Tum ek professional app & game developer AI ho jo modern web apps, admin panels aur HTML5 games banata hai.
  Tumhe strictly niche diye gaye sabhi rules follow karne honge, bina shortcut ke.

  1️⃣ APP / GAME IDEA HANDLING RULE
  Jab user sirf app/game ka naam ya basic idea likhe, tab AI mandatory flow follow kare:
  - Pehle trending apps/games ideas suggest kare
  - Phir user ke selected app ke liye complete feature list de (numbered format me, detail ke sath)

  2️⃣ FEATURE SELECTION FLOW (STRICT)
  User feature list me se kuch numbers select kare ya ALL select bole.
  👉 Usse pehle AI code ya final prompt kabhi na likhe.
  User ke selection ke baad hi: AI professional & detailed PROMPT/CODE likhe.
  Tech stack: HTML5, CSS3, Vanilla JavaScript, Font Awesome Icons.

  3️⃣ SINGLE FILE RULE (VERY STRICT)
  - Sirf User Panel ho → ✔️ 1 single HTML file only
  - Admin + User Panel ho → ✔️ Admin panel = 1 HTML, ✔️ User panel = 1 HTML
  ❌ 2 se zyada files allowed nahi.

  4️⃣ ADMIN / USER PANEL & FIREBASE RULES
  Agar app me Admin + User panel ho:
  - ✔️ Firebase Realtime Database ONLY
  - ❌ Firebase Storage kabhi use nahi hogi
  - 🔐 Admin Login: Admin ID & Password Firebase me manually create honge. Logic simple hoga.
  - 🖼 Images: Externally hosted hongi (Direct image URL usage).

  5️⃣ SINGLE HTML & MULTIPLAYER GAME RULE
  - Normal single-file HTML app → ❌ Firebase allowed nahi.
  - Single-file ONLINE multiplayer game → ✔️ Firebase RTDB allowed.

  6️⃣ PROMPT & TOOLS REQUIREMENT
  Code/Prompt me saare selected features, required tools aur functional logic clear mention ho.
  Code Sketchware, HopWeb, InfinityFree me easily convert ho sake.

  7️⃣ UI / DESIGN RULES
  UI highly modern honi chahiye (Native Android feel, Java/Kotlin look & UX).

  8️⃣ THEME & FONT RULE
  AI pehle latest UI themes aur font combinations suggest kare. User jo select kare usi pe final prompt base ho.

  9️⃣ HEAVY CODE & CONTINUE RULE
  Code bada ho to 2-3 parts me likho. Quality compromise nahi karni. User bole "continue from last" to wahi se start karo.

  ✅ FINAL STRICT RULE: Ek bhi rule break nahi hona chahiye. Structure, flow aur discipline mandatory hai.
  `;

  useEffect(() => {
    const agentData: Record<string, AIAgent> = {
      'prompt-gen': { id: 'prompt-gen', name: 'Prompt Generator', description: '', api_type: 'gemini', system_instruction: `${DEVELOPER_STRICT_RULES}\nFocus: Prompt Engineering & Logical Flow.`, is_enabled: true },
      'html-gen': { id: 'html-gen', name: 'HTML Generator', description: '', api_type: 'gemini', system_instruction: `${DEVELOPER_STRICT_RULES}\nFocus: Full-Stack HTML Code & Design.`, is_enabled: true },
      'pro-ai': { id: 'pro-ai', name: 'Custom Pro AI', description: '', api_type: 'gemini', system_instruction: `${DEVELOPER_STRICT_RULES}\nFocus: Advanced Problem Solving.`, is_enabled: true },
      'pro-dev': { id: 'pro-dev', name: 'Pro Developer', description: '', api_type: 'gemini', system_instruction: `${DEVELOPER_STRICT_RULES}\nFocus: System Architecture & Android-like UI.`, is_enabled: true },
    };
    setAgent(agentData[agentId || ''] || agentData['prompt-gen']);

    if (user && agentId === 'pro-ai') {
      get(ref(db, `users/${user.uid}/custom_instructions/${agentId}`)).then((snap) => {
        if (snap.exists()) setCustomInstructions(snap.val());
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

  const handleSendMessage = async () => {
    if ((!input.trim() && !attachment) || isStreaming || !user) return;

    if (user.remaining_ai_seconds <= 0 && !user.is_premium) {
      alert('AI Balance Exhausted! Please upgrade to continue.');
      navigate('/premium');
      return;
    }

    const prompt = input.trim();
    setInput('');
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
      text: attachment ? `[FILE: ${attachment.name}]\n${prompt}` : prompt, 
      timestamp: Date.now() 
    };
    
    await push(ref(db, `users/${user.uid}/chats/${activeChatId}/messages`), userMsg);
    update(ref(db, `users/${user.uid}/chats/${activeChatId}`), { lastMessage: prompt, timestamp: Date.now() });

    const history = [...messages, userMsg].map(m => ({ role: m.role, text: m.text }));
    const system = agentId === 'pro-ai' && customInstructions 
      ? `${agent?.system_instruction}\n\nUSER_CONFIG: ${customInstructions}` 
      : agent?.system_instruction || '';

    const startTime = Date.now();

    try {
      let fullResponse = '';
      await chatWithGeminiStream(
        history, 
        system, 
        (chunk) => {
          setStreamingText(prev => prev + chunk);
          fullResponse += chunk;
        }, 
        (agentId === 'pro-dev' || agentId === 'html-gen') ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
        attachment ? { data: attachment.data, mimeType: attachment.mimeType } : undefined
      );

      const endTime = Date.now();
      const usedSeconds = Math.ceil((endTime - startTime) / 1000);

      if (fullResponse) {
        const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: fullResponse, timestamp: Date.now() };
        await push(ref(db, `users/${user.uid}/chats/${activeChatId}/messages`), aiMsg);

        // Deduct time for non-premium users
        if (!user.is_premium) {
          const currentSeconds = user.remaining_ai_seconds || 0;
          const newSeconds = Math.max(0, currentSeconds - usedSeconds);
          update(ref(db, `users/${user.uid}`), { remaining_ai_seconds: newSeconds });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStreamingText('');
      setIsStreaming(false);
      setAttachment(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAttachment({ data: base64, mimeType: file.type || 'application/octet-stream', name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const containsHTML = (text: string) => {
    const lower = text.toLowerCase();
    return lower.includes('<!doctype html>') || 
           lower.includes('<html') ||
           lower.includes('```html') ||
           (lower.includes('<head>') && lower.includes('<body>'));
  };

  return (
    <div className="fixed inset-0 top-20 pb-24 z-10 flex flex-col transition-colors duration-300" style={{ backgroundColor: 'var(--primary-bg)' }}>
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
        <div className={`relative w-full h-full max-w-lg transition-all duration-1000 ${isStreaming ? 'scale-110 opacity-30' : 'opacity-10'}`}>
          <img src="https://img.freepik.com/premium-photo/futuristic-robot-head-artificial-intelligence-humanoid-cyborg-portrait_756748-4774.jpg" className="w-full h-full object-contain filter grayscale invert" alt="bg" />
        </div>
      </div>

      {/* Header */}
      <div className="relative z-10 px-4 py-3 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-white/5 rounded-full" style={{ color: 'var(--text-primary)' }}><ChevronLeft size={20} /></button>
          <div className="flex flex-col">
            <h2 className="font-black text-[10px] tracking-widest uppercase flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              {agent?.name} {user?.is_premium && <Sparkles size={10} className="text-pink-500" />}
            </h2>
            {!user?.is_premium && (
              <span className="text-[7px] font-black uppercase text-[#00f2ff] opacity-60">
                AI Balance: {Math.floor((user?.remaining_ai_seconds || 0) / 60)}m {(user?.remaining_ai_seconds || 0) % 60}s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="max-w-[88%] md:max-w-[75%]">
               <div className={`p-4 rounded-[24px] ${msg.role === 'user' ? 'bg-[#00f2ff] text-black rounded-tr-none shadow-lg' : 'glass rounded-tl-none border shadow-xl'}`} 
                    style={msg.role === 'model' ? { backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' } : {}}>
                 <p className="text-[13px] leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
               </div>
               {msg.role === 'model' && (
                 <div className="mt-2 flex items-center gap-2 px-1">
                   {containsHTML(msg.text) && (
                     <button onClick={() => { 
                       const code = msg.text.includes('```html') ? msg.text.split('```html')[1].split('```')[0] : msg.text;
                       const b = new Blob([code], {type:'text/html'}); 
                       window.open(URL.createObjectURL(b)); 
                     }} className="p-2 bg-[#00ff9d]/10 text-[#00ff9d] rounded-lg border border-[#00ff9d]/20 flex items-center gap-1.5 transition-all active:scale-90 shadow-lg">
                       <Play size={10} fill="currentColor" /> <span className="text-[9px] font-black uppercase">Run Browser</span>
                     </button>
                   )}
                   <button onClick={() => navigator.clipboard.writeText(msg.text)} className="p-2 bg-white/5 text-white/40 rounded-lg flex items-center gap-1.5 transition-all active:scale-90">
                     <Copy size={10} /> <span className="text-[9px] font-black uppercase">Copy</span>
                   </button>
                   <button onClick={() => chatId && user && remove(ref(db, `users/${user.uid}/chats/${chatId}/messages/${(msg as any).msgId}`))} className="p-2 bg-red-500/5 text-red-500/40 rounded-lg ml-auto">
                     <Trash2 size={10} />
                   </button>
                 </div>
               )}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[88%] glass p-4 rounded-[24px] rounded-tl-none border border-[#00f2ff]/30 shadow-2xl shadow-[#00f2ff]/5">
               {streamingText ? (
                 <>
                   <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{streamingText}</p>
                   {containsHTML(streamingText) && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <button onClick={() => { 
                          const code = streamingText.includes('```html') ? streamingText.split('```html')[1].split('```')[0] : streamingText;
                          const b = new Blob([code], {type:'text/html'}); 
                          window.open(URL.createObjectURL(b)); 
                        }} className="p-2 bg-[#00ff9d] text-black rounded-lg flex items-center gap-1.5 font-black text-[9px] uppercase shadow-lg active:scale-95">
                          <Play size={10} fill="currentColor" /> Preview Live
                        </button>
                      </div>
                   )}
                 </>
               ) : (
                 <div className="flex gap-2 items-center text-[9px] font-black uppercase text-[#00f2ff]">
                    <Cpu size={14} className="animate-spin" /> TRANSMITTING...
                 </div>
               )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="relative z-10 p-3 bg-transparent border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex flex-col max-w-4xl mx-auto gap-2">
          {attachment && (
            <div className="flex items-center gap-2 p-2 px-4 rounded-xl glass border border-[#00f2ff]/30 self-start animate-in slide-in-from-bottom-2">
              <ImageIcon size={14} className="text-[#00f2ff]" />
              <span className="text-[9px] font-black uppercase tracking-widest truncate max-w-[150px]">{attachment.name}</span>
              <button onClick={() => setAttachment(null)} className="p-1 hover:bg-white/5 rounded-full transition-colors hover:text-red-500"><X size={12} /></button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <div className="flex-1 glass rounded-2xl p-1.5 flex items-center gap-2 border transition-all" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
              <textarea 
                rows={1}
                placeholder="COMMAND NEURAL CORE..."
                className="flex-1 bg-transparent border-none focus:outline-none px-3 py-2 text-[12px] font-bold resize-none max-h-32 uppercase placeholder:text-white/10"
                style={{ color: 'var(--text-primary)' }}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              />
              <button onClick={() => user?.is_premium ? fileInputRef.current?.click() : navigate('/premium')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${user?.is_premium ? 'text-[#00f2ff] hover:bg-white/5' : 'opacity-20 cursor-not-allowed'}`}>
                <Paperclip size={18} />
              </button>
              <button 
                onClick={handleSendMessage} 
                disabled={isStreaming || (!input.trim() && !attachment)} 
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isStreaming || (!input.trim() && !attachment) ? 'opacity-20' : 'bg-[#00f2ff] text-black shadow-lg shadow-[#00f2ff]/30 active:scale-95 hover:brightness-110'}`}
              >
                {isStreaming ? <RefreshCw size={18} className="animate-spin text-black" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
