import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

// NOTE: In a production app, never expose API keys on the client.
// This should be proxied through a backend.
const API_KEY = process.env.GEMINI_API_KEY || ''; 

export const generateQuestionsWithGemini = async (topic: string, count: number, grade: number): Promise<Question[]> => {
  if (!API_KEY) {
    console.warn("No API Key provided for Gemini");
    return [];
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    const prompt = `Buatkan ${count} soal pilihan ganda untuk anak SD kelas ${grade} tentang topik "${topic}". 
    Format JSON harus berisi array soal. Setiap soal memiliki text, array options (4 pilihan), dan correctIndex (0-3).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              options: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              correctIndex: { type: Type.INTEGER },
            },
            required: ['text', 'options', 'correctIndex']
          }
        }
      }
    });

    const rawData = response.text;
    if (!rawData) throw new Error("No data returned");

    const parsedData = JSON.parse(rawData);
    
    // Map to our Question interface adding IDs and points
    return parsedData.map((q: any, idx: number) => ({
      id: `gen-${Date.now()}-${idx}`,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      points: 10 // Default points
    }));

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return [];
  }
};