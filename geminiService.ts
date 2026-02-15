
import { GoogleGenAI } from "@google/genai";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-3-flash-preview",
  attachment?: { data: string; mimeType: string }
) => {
  try {
    // Defensive check for process and process.env to prevent crashes in ESM/Vite/Netlify
    let apiKey: string | undefined;
    
    try {
      if (typeof process !== 'undefined' && process.env) {
        apiKey = process.env.API_KEY;
      }
    } catch (e) {
      console.warn("Process environment check failed, attempting fallback.");
    }

    if (!apiKey) {
      throw new Error("NEURAL_SYNC_ERROR: API_KEY is missing. Ensure it is set in your environment variables.");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    if (attachment && contents.length > 0) {
      const lastMsg = contents[contents.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.parts.push({
          inlineData: {
            data: attachment.data,
            mimeType: attachment.mimeType
          }
        } as any);
      }
    }

    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }
  } catch (error) {
    console.error("Gemini AI Neural Error:", error);
    const errorMsg = error instanceof Error ? error.message : "Connection Interrupted";
    onChunk(`[SYSTEM_ERROR]: ${errorMsg}`);
    throw error;
  }
};
