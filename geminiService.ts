
/**
 * ALPHA AI - NEURAL CORE SERVICE 8.0 (OPENROUTER ENGINE)
 * Migrated from Gemini to OpenRouter for enhanced reliability and GLM-4.5 support.
 */
const OPENROUTER_KEY = "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";
const DEFAULT_MODEL = "z-ai/glm-4.5-air:free";

export const chatWithGeminiStream = async (
  history: { role: 'user' | 'model'; text: string }[],
  systemInstruction: string,
  onChunk: (chunk: string) => void,
  modelName: string = DEFAULT_MODEL,
  attachment?: { data: string; mimeType: string }
) => {
  // Use the user-provided model if it's the default, otherwise use what's passed
  const activeModel = modelName === "gemini-flash-lite-latest" || modelName === "gemini-3-pro-preview" 
    ? DEFAULT_MODEL 
    : modelName;

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.map(m => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text
    }))
  ];

  // Handle attachment if it exists and the last message is from the user
  if (attachment && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user') {
      lastMessage.content = [
        { type: 'text', text: lastMessage.content as string },
        { 
          type: 'image_url', 
          image_url: { 
            url: `data:${attachment.mimeType};base64,${attachment.data}` 
          } 
        }
      ] as any;
    }
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "AI Studio Pro"
      },
      body: JSON.stringify({
        model: activeModel,
        messages: messages,
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API Error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("Neural Core: Stream Reader Unavailable");

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === "data: [DONE]") continue;

        if (trimmedLine.startsWith("data: ")) {
          try {
            const json = JSON.parse(trimmedLine.slice(6));
            const content = json.choices[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            // Ignore malformed JSON in stream
          }
        }
      }
    }
  } catch (error: any) {
    console.error("Neural Core Error:", error);
    onChunk(`\n[SYSTEM_NOTICE]: Neural Link Interrupted. ${error.message}`);
  }
};
