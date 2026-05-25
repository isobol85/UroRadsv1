const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

if (!apiKey || !baseUrl) {
  console.warn("OpenAI AI integration environment variables not configured");
}

export const MODELS = {
  VISION: "gpt-5",
  CHAT: "gpt-5",
  SMALL: "gpt-5-nano",
} as const;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

function authHeaders() {
  if (!apiKey || !baseUrl) {
    throw new Error("OpenAI AI integration not configured");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function chatCompletion(
  messages: ChatMessage[],
  model: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function openaiText(
  systemPrompt: string,
  userPrompt: string,
  model: string = MODELS.SMALL,
): Promise<string> {
  return chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model,
  );
}

export async function openaiWithImages(
  systemPrompt: string,
  userText: string,
  images: Array<{ base64: string; mimeType: string }>,
  model: string = MODELS.VISION,
): Promise<string> {
  const parts: ContentPart[] = [{ type: "text", text: userText }];
  for (const img of images) {
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high",
      },
    });
  }
  return chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: parts },
    ],
    model,
  );
}

export async function openaiChat(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  model: string = MODELS.CHAT,
): Promise<string> {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];
  for (const m of history) {
    messages.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    });
  }
  messages.push({ role: "user", content: userMessage });
  return chatCompletion(messages, model);
}

export async function* openaiStreamWithImages(
  systemPrompt: string,
  userText: string,
  images: Array<{ base64: string; mimeType: string }>,
  model: string = MODELS.VISION,
): AsyncGenerator<string, void, unknown> {
  const parts: ContentPart[] = [{ type: "text", text: userText }];
  for (const img of images) {
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high",
      },
    });
  }
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: parts },
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${text}`);
  }
  if (!res.body) {
    throw new Error("No response body for streaming");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;
      try {
        const data = JSON.parse(jsonStr);
        const delta = data.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // skip malformed
      }
    }
  }
}
