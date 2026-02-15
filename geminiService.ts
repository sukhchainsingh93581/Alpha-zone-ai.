
import { GoogleGenAI } from "@google/genai";

/**
 * ALPHA AI - NEURAL CORE SERVICE 5.0
 * Hard-linked with User Key: AIzaSyCNi0t_UO9_VBIvyD4ZhotulBucIxt6RCc
 */
const ALPHA_KEY = "AIzaSyCNi0t_UO9_VBIvyD4ZhotulBucIxt6RCc";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-3-flash-preview",
  attachment?: { data: string; mimeType: string }
) => {
  try {
    // Priority 1: Use hardcoded key for stability in this environment
    const ai = new GoogleGenAI({ apiKey: ALPHA_KEY });
    
    // NORMALIZE ROLES & MERGE ADJACENT MESSAGES
    // Gemini API throws errors if roles don't alternate User -> Model -> User
    const sanitizedContents: any[] = [];
    
    history.forEach((msg) => {
      if (!msg.text || msg.text.trim() === "") return;
      
      const role = msg.role === 'user' ? 'user' : 'model';
      
      if (sanitizedContents.length > 0 && sanitizedContents[sanitizedContents.length - 1].role === role) {
        // Merge text if role is the same as the previous one
        sanitizedContents[sanitizedContents.length - 1].parts[0].text += `\n\n${msg.text}`;
      } else {
        sanitizedContents.push({
          role: role,
          parts: [{ text: msg.text }]
        });
      }
    });

    // Ensure we start with a 'user' message if history is somehow broken
    if (sanitizedContents.length > 0 && sanitizedContents[0].role === 'model') {
      sanitizedContents.shift();
    }

    // Attach media to the very last user part
    if (attachment && sanitizedContents.length > 0) {
      const last = sanitizedContents[sanitizedContents.length - 1];
      if (last.role === 'user') {
        last.parts.push({
          inlineData: {
            data: attachment.data,
            mimeType: attachment.mimeType
          }
        });
      }
    }

    // PRIMARY GENERATION ATTEMPT
    try {
      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: sanitizedContents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.8,
          topP: 0.9,
        }
      });

      let receivedAnyData = false;
      for await (const chunk of responseStream) {
        if (chunk.text) {
          receivedAnyData = true;
          onChunk(chunk.text);
        }
      }

      if (!receivedAnyData) {
        throw new Error("EMPTY_STREAM_DETECTED");
      }
    } catch (innerError: any) {
      console.warn("Primary Model Failed or Blocked. Attempting Emergency Fallback...", innerError);
      
      // EMERGENCY FALLBACK: If Gemini 3 Pro/Flash fails, use Flash Lite (most stable)
      if (modelName !== 'gemini-flash-lite-latest') {
        return chatWithGeminiStream(history, systemInstruction, onChunk, 'gemini-flash-lite-latest', attachment);
      }
      throw innerError;
    }

  } catch (error: any) {
    console.error("Critical Neural Interface Error:", error);
    const msg = error?.message || "Connection Interrupted";
    
    if (msg.includes("API_KEY_INVALID")) {
      onChunk(`[AUTH_ERROR]: Your API key is invalid or expired. Please provide a fresh key from Google AI Studio.`);
    } else if (msg.includes("User location is not supported")) {
      onChunk(`[REGION_ERROR]: Gemini 3 is not available in your region. Switching to global legacy core...`);
    } else {
      onChunk(`[NEURAL_SYNC_ERROR]: ${msg}\n\nREASON: The model is taking too long to think or the message was blocked by safety filters.`);
    }
    throw error;
  }
};
