
import { GoogleGenAI } from "@google/genai";

/**
 * NEURAL CORE SERVICE
 * Using direct hardlink for API Key to ensure immediate functionality on Netlify Free Tier.
 */
const INTERNAL_KEY = "AIzaSyA3DuvOwAWRhPBTd94ivuEME78QPiHHhaQ";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = "gemini-3-flash-preview",
  attachment?: { data: string; mimeType: string }
) => {
  try {
    // Priority: 1. Environment Variable, 2. Hardcoded Key
    const apiKey = process.env.API_KEY || INTERNAL_KEY;
    
    if (!apiKey) {
      onChunk("[CRITICAL_ERROR]: Neural interface offline. Key verification failed.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    // Constructing the interaction payload
    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    // Handle multimodal inputs (Images/Files) if present
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

    // Call the Gemini 3 streaming interface
    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      }
    });

    // Stream the neural response chunks to the UI
    for await (const chunk of responseStream) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }
  } catch (error) {
    console.error("Neural Interface Crash:", error);
    const errorMsg = error instanceof Error ? error.message : "Neural link dropped";
    onChunk(`[NEURAL_ERROR]: ${errorMsg}. Please ensure your API key has remaining quota.`);
    throw error;
  }
};
