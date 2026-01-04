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

// Gemini via Replit AI Integration proxy
const geminiApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

if (!geminiApiKey || !geminiBaseUrl) {
  console.warn("Gemini AI integration environment variables not configured");
}

const MODEL = "gpt-5.1";
const GEMINI_MODEL = "gemini-2.5-flash";

// Helper function to call Gemini generateContent with multiple images
// Uses direct fetch to the Replit proxy endpoint
async function callGeminiMultiImage(
  textPrompt: string,
  images: Array<{ base64: string; mimeType: string }>
): Promise<string> {
  const url = `${geminiBaseUrl}/models/${GEMINI_MODEL}:generateContent`;
  
  // Build parts array with images first, then text
  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
  
  // Add each image as inline data
  for (const img of images) {
    parts.push({
      inline_data: {
        mime_type: img.mimeType,
        data: img.base64,
      },
    });
  }
  
  // Add text prompt at the end
  parts.push({ text: textPrompt });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${geminiApiKey}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

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

const SYSTEM_PROMPT_VIDEO_ANALYSIS = `You are a radiology teaching assistant for urology trainees.
You are viewing a sequence of CT scan frames extracted from a video showing an axial scroll through the scan.
The frames are presented in order from superior to inferior (or as recorded in the video).

Analyze these sequential CT images and provide a comprehensive teaching explanation:

1. OVERVIEW: Describe the scan orientation and what body region is being shown
2. FRAME-BY-FRAME ANALYSIS: Walk through the key anatomical changes as we scroll through the slices
3. KEY FINDINGS: Identify any pathology or abnormalities you observe, noting which frames they appear in
4. TEACHING POINTS: Explain the recognition features that help learners identify these findings
5. DIFFERENTIAL CONSIDERATIONS: If pathology is present, briefly discuss what else might look similar

Write for PGY-2 residents and new APPs learning uro-radiology.
Be thorough but organized - this is a teaching case.`;

export interface FrameImage {
  index: number;
  base64: string;
  mimeType: string;
}

export async function analyzeVideoFrames(
  frames: FrameImage[],
  attendingPrompt?: string
): Promise<string> {
  const prompt = attendingPrompt 
    ? `${SYSTEM_PROMPT_VIDEO_ANALYSIS}\n\nAdditional guidance from the attending: ${attendingPrompt}`
    : SYSTEM_PROMPT_VIDEO_ANALYSIS;

  const textPrompt = `${prompt}\n\nThe following ${frames.length} frames are extracted from a CT scan video, shown in sequence:`;
  
  const images = frames.map(frame => ({
    base64: frame.base64,
    mimeType: frame.mimeType,
  }));

  return await callGeminiMultiImage(textPrompt, images);
}

export async function testMultiImageCapability(
  images: Array<{ base64: string; mimeType: string }>
): Promise<{ success: boolean; response: string; imageCount: number }> {
  try {
    const textPrompt = `You are being sent ${images.length} images. Please confirm you can see all of them by describing what you see in each image briefly (1 sentence each). Number your descriptions.`;

    const response = await callGeminiMultiImage(textPrompt, images);

    return {
      success: true,
      response,
      imageCount: images.length,
    };
  } catch (error) {
    return {
      success: false,
      response: error instanceof Error ? error.message : "Unknown error",
      imageCount: images.length,
    };
  }
}
