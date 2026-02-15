
import { GoogleGenAI } from "@google/genai";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-3-flash-preview",
  attachment?: { data: string; mimeType: string }
) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    // Format the history for the Gemini API
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // If there's an attachment in the current turn, add it to the last user message parts
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
    console.error("Gemini AI Error:", error);
    throw error;
  }
};
