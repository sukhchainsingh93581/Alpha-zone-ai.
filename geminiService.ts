
import { GoogleGenAI } from "@google/genai";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-3-flash-preview",
  attachment?: { data: string; mimeType: string }
) => {
  try {
    // Strictly retrieve the API key from process.env.API_KEY as per core requirements
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
      onChunk("[SYSTEM_ERROR]: API_KEY is missing. Please configure it in your environment variables.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    // Construct the contents for the prompt
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Insert attachment into the current user turn if exists
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

    // Call generateContentStream directly as per naming guidelines
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
    const errorMsg = error instanceof Error ? error.message : "Neural Link Interrupted";
    onChunk(`[SYSTEM_ERROR]: ${errorMsg}. Check your API Key and Network connectivity.`);
    throw error;
  }
};
