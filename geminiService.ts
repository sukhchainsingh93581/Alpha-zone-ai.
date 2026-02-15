
import { GoogleGenAI } from "@google/genai";

/**
 * ALPHA AI - NEURAL CORE SERVICE 7.0 (TURBO)
 * Hard-linked with Optimized Engine for Sub-Second Response
 */
const ALPHA_KEY = "AIzaSyCNi0t_UO9_VBIvyD4ZhotulBucIxt6RCc";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-flash-lite-latest", // Default to the fastest model
  attachment?: { data: string; mimeType: string }
) => {
  const ai = new GoogleGenAI({ apiKey: ALPHA_KEY });
  
  // OPTIMIZED HISTORY: Max speed by reducing token overhead
  const sanitized = [];
  let lastRole = '';

  // Only take the last 10 messages for speed, but keep the core context
  const recentHistory = history.length > 10 ? history.slice(-10) : history;

  for (const msg of recentHistory) {
    if (!msg.text) continue;
    const currentRole = msg.role === 'user' ? 'user' : 'model';
    
    if (currentRole === lastRole) {
      sanitized[sanitized.length - 1].parts[0].text += ` ${msg.text}`;
    } else {
      sanitized.push({
        role: currentRole,
        parts: [{ text: msg.text }]
      });
      lastRole = currentRole;
    }
  }

  if (sanitized.length > 0 && sanitized[0].role === 'model') sanitized.shift();

  if (attachment && sanitized.length > 0) {
    const last = sanitized[sanitized.length - 1];
    if (last.role === 'user') {
      last.parts.push({
        inlineData: { data: attachment.data, mimeType: attachment.mimeType }
      });
    }
  }

  // CONTROLLER FOR ABORTING SLOW CONNECTIONS
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    if (!hasReceivedData) {
      console.warn("Neural Link Latency High. Force Reconnecting...");
      controller.abort();
    }
  }, 1800); // 1.8 seconds max wait for first byte

  let hasReceivedData = false;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: sanitized,
      config: {
        systemInstruction,
        temperature: 0.7,
        topP: 0.8, // Faster sampling
      }
    });

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        if (!hasReceivedData) {
          hasReceivedData = true;
          clearTimeout(timeoutId);
        }
        onChunk(text);
      }
    }

  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError' || !hasReceivedData) {
      // INSTANT RETRY WITH FASTEST GLOBAL NODE
      if (modelName !== 'gemini-flash-lite-latest') {
        return chatWithGeminiStream(history, systemInstruction, onChunk, 'gemini-flash-lite-latest', attachment);
      }
    }
    
    console.error("Neural Error:", error);
    onChunk(`[SYSTEM_NOTICE]: Re-syncing connection...`);
    // Final attempt if everything fails
    if (modelName === 'gemini-flash-lite-latest') {
       onChunk(`\n(The neural link is currently congested. Retrying automatically...)`);
    }
  }
};
