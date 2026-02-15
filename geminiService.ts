
import { GoogleGenAI } from "@google/genai";

/**
 * ALPHA AI - NEURAL CORE SERVICE 4.0
 * Updated with the provided Active API Key.
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
    const ai = new GoogleGenAI({ apiKey: ALPHA_KEY });
    
    // Gemini 3 strictly requires alternating roles: user -> model -> user
    const sanitizedHistory: any[] = [];
    
    history.forEach((msg) => {
      const role = msg.role === 'user' ? 'user' : 'model';
      // If the last message has the same role, merge it (prevents "user, user" errors)
      if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === role) {
        sanitizedHistory[sanitizedHistory.length - 1].parts[0].text += `\n\n${msg.text}`;
      } else {
        sanitizedHistory.push({
          role: role,
          parts: [{ text: msg.text }]
        });
      }
    });

    // Handle file attachments for the current turn
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

    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: sanitizedHistory,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.9,
        topP: 0.95,
      }
    });

    let hasReceivedData = false;
    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        hasReceivedData = true;
        onChunk(text);
      }
    }

    if (!hasReceivedData) {
      onChunk("[SYSTEM_ALERT]: Neural Link connected but returned empty buffer. Check Quota.");
    }

  } catch (error: any) {
    console.error("Neural Interface Critical Failure:", error);
    const errorMessage = error?.message || "Internal Connection Error";
    onChunk(`[NEURAL_ERROR]: ${errorMessage}\n\nCause: The API key might be restricted or region-locked. Please verify the key status in Google AI Studio.`);
    throw error;
  }
};
