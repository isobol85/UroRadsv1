import OpenAI from "openai";

const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

if (!baseUrl || !apiKey) {
  console.warn("OpenAI AI integration environment variables not configured");
}

const openai = new OpenAI({
  apiKey: apiKey || "",
  baseURL: baseUrl || "",
});

const MODEL = "gpt-5.1";

const SYSTEM_PROMPT_EXPLANATION = `You are a radiology teaching assistant for urology trainees.
Analyze this CT image and provide a teaching explanation.

Include:
1. What the image shows (anatomical orientation, structures visible)
2. Key finding identification (the pathology or abnormality)
3. Recognition features that help learners identify this in future
4. Relevant radiology first principles

Keep the explanation concise but educational (2-3 paragraphs).
Write for PGY-2 residents and new APPs learning uro-radiology.`;

const SYSTEM_PROMPT_TITLE = `Based on this radiology case explanation, generate a short descriptive title (3-4 words maximum).

Format: [Pathology] [Location/Qualifier]
Examples: "Staghorn Calculus Left Kidney", "Grade 3 Hydronephrosis", "Renal Cell Carcinoma Upper Pole"

Return ONLY the title, no other text.`;

const SYSTEM_PROMPT_CATEGORY = `Based on this radiology case explanation, assign ONE category from this list:

- Stones
- Hydronephrosis
- Mass/Tumor
- Infection
- Trauma
- Congenital
- Vascular
- Bladder
- Prostate
- Other

Return ONLY the category name, no other text.`;

const SYSTEM_PROMPT_CHAT = `You are a radiology teaching assistant. The learner is viewing a uro-radiology case and has a follow-up question.

Answer their question in a helpful, educational manner.
Stay focused on the specific case and radiology concepts.
If they ask something unrelated to the case, gently redirect.`;

function extractBase64Data(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: "image/jpeg", data: dataUrl };
}

export async function generateExplanation(imageBase64: string, attendingPrompt?: string): Promise<string> {
  const prompt = attendingPrompt 
    ? `${SYSTEM_PROMPT_EXPLANATION}\n\nAdditional guidance from the attending: ${attendingPrompt}`
    : SYSTEM_PROMPT_EXPLANATION;

  const { mimeType, data } = extractBase64Data(imageBase64);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${data}`,
            },
          },
        ],
      },
    ],
    max_completion_tokens: 1024,
  });

  return response.choices[0]?.message?.content || "";
}

export async function generateTitle(explanation: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `${SYSTEM_PROMPT_TITLE}\n\nExplanation:\n${explanation}`,
      },
    ],
    max_completion_tokens: 50,
  });

  return (response.choices[0]?.message?.content || "Untitled Case").trim();
}

export async function generateCategory(explanation: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `${SYSTEM_PROMPT_CATEGORY}\n\nExplanation:\n${explanation}`,
      },
    ],
    max_completion_tokens: 20,
  });

  const category = (response.choices[0]?.message?.content || "Other").trim();
  const validCategories = ["Stones", "Hydronephrosis", "Mass/Tumor", "Infection", "Trauma", "Congenital", "Vascular", "Bladder", "Prostate", "Other"];
  return validCategories.includes(category) ? category : "Other";
}

export async function generateChatResponse(
  explanation: string,
  chatHistory: Array<{ role: string; content: string }>,
  userMessage: string
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT_CHAT}\n\nCase Explanation:\n${explanation}`,
    },
  ];

  for (const msg of chatHistory) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  messages.push({
    role: "user",
    content: userMessage,
  });

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    max_completion_tokens: 512,
  });

  return response.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try again.";
}

export async function refineExplanation(
  imageBase64: string,
  currentExplanation: string,
  userFeedback: string
): Promise<string> {
  const prompt = `You are a radiology teaching assistant. The attending has provided feedback on the current explanation.

Current explanation:
${currentExplanation}

Attending's feedback/request:
${userFeedback}

Please update the explanation based on this feedback. Keep the same educational format but incorporate the requested changes.`;

  const { mimeType, data } = extractBase64Data(imageBase64);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${data}`,
            },
          },
        ],
      },
    ],
    max_completion_tokens: 1024,
  });

  return response.choices[0]?.message?.content || currentExplanation;
}
