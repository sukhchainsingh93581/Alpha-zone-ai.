
import { GoogleGenAI } from "@google/genai";

/**
 * ALPHA AI - NEURAL CORE SERVICE 6.0
 * Verified Active Key: AIzaSyCNi0t_UO9_VBIvyD4ZhotulBucIxt6RCc
 */
const ALPHA_KEY = "AIzaSyCNi0t_UO9_VBIvyD4ZhotulBucIxt6RCc";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-3-flash-preview",
  attachment?: { data: string; mimeType: string }
) => {
  const ai = new GoogleGenAI({ apiKey: ALPHA_KEY });
  
  // NORMALIZE HISTORY: Strictly alternate User -> Model
  const sanitized = [];
  let lastRole = '';

  for (const msg of history) {
    if (!msg.text) continue;
    const currentRole = msg.role === 'user' ? 'user' : 'model';
    
    if (currentRole === lastRole) {
      // Merge same-role messages
      sanitized[sanitized.length - 1].parts[0].text += `\n\n${msg.text}`;
    } else {
      sanitized.push({
        role: currentRole,
        parts: [{ text: msg.text }]
      });
      lastRole = currentRole;
    }
  }

  // Ensure first message is 'user'
  if (sanitized.length > 0 && sanitized[0].role === 'model') {
    sanitized.shift();
  }

  // Add attachment to last user message
  if (attachment && sanitized.length > 0) {
    const last = sanitized[sanitized.length - 1];
    if (last.role === 'user') {
      last.parts.push({
        inlineData: {
          data: attachment.data,
          mimeType: attachment.mimeType
        }
      });
    }
  }

  try {
    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: sanitized,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    let hasData = false;
    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        hasData = true;
        onChunk(text);
      }
    }

    if (!hasData) throw new Error("NO_RESPONSE_CONTENT");

  } catch (error: any) {
    console.error("Neural Error:", error);
    
    // AUTO-FALLBACK: If primary fails, try the most stable global model
    if (modelName !== 'gemini-flash-lite-latest') {
      console.log("Switching to Stable Core Fallback...");
      return chatWithGeminiStream(history, systemInstruction, onChunk, 'gemini-flash-lite-latest', attachment);
    }
    
    const errText = error?.message || "Internal Neural Failure";
    onChunk(`[NEURAL_ALERT]: ${errText}\n\nThe system is currently experiencing high latency. Please try a shorter message.`);
  }
};
