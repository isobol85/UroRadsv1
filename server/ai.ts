import { MODELS, openaiText, openaiWithImages, openaiChat } from "./openai";

const SYSTEM_PROMPT_EXPLANATION = `You are a urology radiology teaching assistant.
Analyze this CT image focusing ONLY on genitourinary (GU) findings.

Provide:
1. GU structures visible and their appearance
2. Any urologic pathology or abnormality
3. Key recognition features for learners

Ignore non-GU findings unless directly relevant to the urologic diagnosis.
Keep your response under 200 words. Be direct and focused.
Write for PGY-2 urology residents.`;

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

Answer their question in a helpful, educational manner. Keep responses under 200 words.
Stay focused on the specific case and radiology concepts.
If they ask something unrelated to the case, gently redirect.`;

const SYSTEM_PROMPT_CHAT_TITLE = `Generate a very short (3-4 word maximum) title that summarizes what this chat conversation is about.
The title should capture the main topic or question being discussed.
Return ONLY the title, no quotes, no punctuation, no other text.

Examples:
- "Stent placement timing"
- "Hydronephrosis grading criteria"
- "Calculus vs mass differentiation"`;

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

function extractBase64Data(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: "image/jpeg", data: dataUrl };
}

export async function generateExplanation(imageBase64: string, attendingPrompt?: string): Promise<string> {
  const systemPrompt = attendingPrompt
    ? `${SYSTEM_PROMPT_EXPLANATION}\n\nAdditional guidance from the attending: ${attendingPrompt}`
    : SYSTEM_PROMPT_EXPLANATION;

  const { mimeType, data } = extractBase64Data(imageBase64);
  return await openaiWithImages(
    systemPrompt,
    "Please analyze this CT image.",
    [{ base64: data, mimeType }],
    MODELS.VISION,
  );
}

export async function generateTitle(explanation: string): Promise<string> {
  const title = await openaiText(SYSTEM_PROMPT_TITLE, `Explanation:\n${explanation}`, MODELS.SMALL);
  return title.trim() || "Untitled Case";
}

export async function generateCategory(explanation: string): Promise<string> {
  const category = (await openaiText(SYSTEM_PROMPT_CATEGORY, `Explanation:\n${explanation}`, MODELS.SMALL)).trim();
  const validCategories = ["Stones", "Hydronephrosis", "Mass/Tumor", "Infection", "Trauma", "Congenital", "Vascular", "Bladder", "Prostate", "Other"];
  return validCategories.includes(category) ? category : "Other";
}

export async function generateChatTitle(userMessage: string): Promise<string> {
  try {
    const title = await openaiText(SYSTEM_PROMPT_CHAT_TITLE, `User's question:\n${userMessage}`, MODELS.SMALL);
    return title.trim().slice(0, 50) || "General discussion";
  } catch (error) {
    console.error("Failed to generate chat title:", error);
    return "General discussion";
  }
}

export async function generateChatResponse(
  explanation: string,
  chatHistory: Array<{ role: string; content: string }>,
  userMessage: string,
): Promise<string> {
  const filteredHistory = chatHistory.filter(msg =>
    !(msg.role === "ai" && msg.content.includes("I'm sorry, I couldn't generate a response"))
  );

  const systemContext = `${SYSTEM_PROMPT_CHAT}\n\nCase Explanation:\n${explanation}`;

  try {
    const response = await openaiChat(systemContext, filteredHistory, userMessage, MODELS.CHAT);
    return response || "I'm sorry, I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("Chat API error:", error);
    throw error;
  }
}

export async function refineExplanation(
  imageBase64: string,
  currentExplanation: string,
  userFeedback: string,
): Promise<string> {
  const systemPrompt = `You are a radiology teaching assistant. The attending has provided feedback on the current explanation. Update the explanation based on this feedback. Keep the same educational format but incorporate the requested changes. Keep response under 200 words.`;

  const userText = `Current explanation:
${currentExplanation}

Attending's feedback/request:
${userFeedback}

Please update the explanation based on this feedback.`;

  const { mimeType, data } = extractBase64Data(imageBase64);

  const refined = await openaiWithImages(
    systemPrompt,
    userText,
    [{ base64: data, mimeType }],
    MODELS.VISION,
  );
  return refined || currentExplanation;
}

export interface FrameImage {
  index: number;
  base64: string;
  mimeType: string;
}

export async function analyzeVideoFrames(
  frames: FrameImage[],
  attendingPrompt?: string,
): Promise<string> {
  const systemPrompt = attendingPrompt
    ? `${SYSTEM_PROMPT_VIDEO_ANALYSIS}\n\nAdditional guidance from the attending: ${attendingPrompt}`
    : SYSTEM_PROMPT_VIDEO_ANALYSIS;

  const userText = `The following ${frames.length} frames are extracted from a CT scan video, shown in sequence:`;

  const images = frames.map(frame => ({
    base64: frame.base64,
    mimeType: frame.mimeType,
  }));

  return await openaiWithImages(systemPrompt, userText, images, MODELS.VISION);
}

export async function testMultiImageCapability(
  images: Array<{ base64: string; mimeType: string }>,
): Promise<{ success: boolean; response: string; imageCount: number }> {
  try {
    const userText = `You are being sent ${images.length} images. Please confirm you can see all of them by describing what you see in each image briefly (1 sentence each). Number your descriptions.`;
    const response = await openaiWithImages("You are a helpful vision assistant.", userText, images, MODELS.VISION);
    return { success: true, response, imageCount: images.length };
  } catch (error) {
    return {
      success: false,
      response: error instanceof Error ? error.message : "Unknown error",
      imageCount: images.length,
    };
  }
}

export { SYSTEM_PROMPT_VIDEO_ANALYSIS };
