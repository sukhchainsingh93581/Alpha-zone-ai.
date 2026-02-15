
import { GoogleGenAI } from "@google/genai";

/**
 * ALPHA AI - NEURAL CORE SERVICE 3.0
 * Direct hardlink with strict history sanitization.
 */
const ALPHA_KEY = "AIzaSyA3DuvOwAWRhPBTd94ivuEME78QPiHHhaQ";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-3-flash-preview",
  attachment?: { data: string; mimeType: string }
) => {
  try {
    const ai = new GoogleGenAI({ apiKey: ALPHA_KEY });
    
    // SANITIZE HISTORY: Gemini requires strict alternating user/model roles.
    // If two user messages are together, we merge them.
    const sanitizedHistory: any[] = [];
    history.forEach((msg, idx) => {
      const role = msg.role === 'user' ? 'user' : 'model';
      if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === role) {
        // Merge with previous part if role is the same
        sanitizedHistory[sanitizedHistory.length - 1].parts[0].text += `\n${msg.text}`;
      } else {
        sanitizedHistory.push({
          role: role,
          parts: [{ text: msg.text }]
        });
      }
    });

    // Handle attachments on the last user message
    if (attachment && sanitizedHistory.length > 0) {
      const lastItem = sanitizedHistory[sanitizedHistory.length - 1];
      if (lastItem.role === 'user') {
        lastItem.parts.push({
          inlineData: {
            data: attachment.data,
            mimeType: attachment.mimeType
          }
        });
      }
    }

    // PRIMARY ATTEMPT
    try {
      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: sanitizedHistory,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.8,
          topP: 0.95,
        }
      });

      let received = false;
      for await (const chunk of responseStream) {
        if (chunk.text) {
          received = true;
          onChunk(chunk.text);
        }
      }
      if (!received) onChunk("[SYSTEM]: Neural core returned empty buffer. Retrying...");
    } catch (modelErr: any) {
      // FALLBACK: If Pro model fails (common for new keys), switch to Flash immediately
      if (modelName !== 'gemini-3-flash-preview') {
        console.warn("Pro model failed, falling back to Flash...");
        return chatWithGeminiStream(history, systemInstruction, onChunk, 'gemini-3-flash-preview', attachment);
      }
      throw modelErr;
    }

  } catch (error: any) {
    console.error("Neural Interface Error:", error);
    const msg = error?.message || "Connection Interrupted";
    onChunk(`[NEURAL_ERROR]: ${msg}\n\nACTION: Check if your API key has billing enabled or if the Gemini 3 model is available in your region.`);
    throw error;
  }
};
