
import { GoogleGenAI } from "@google/genai";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-3-flash-preview",
  attachment?: { data: string; mimeType: string }
) => {
  try {
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
      onChunk("[SYSTEM_RECOVERY]: Neural Key not found in context. Retrying neural sync...");
      return;
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    if (attachment && contents.length > 0) {
      const lastTurn = contents[contents.length - 1];
      if (lastTurn.role === 'user') {
        lastTurn.parts.push({
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
    console.error("Gemini SDK Interface Failure:", error);
    const errorMsg = error instanceof Error ? error.message : "Neural link dropped";
    onChunk(`[NEURAL_ERROR]: ${errorMsg}. Please verify your API Key quota.`);
    throw error;
  }
};
