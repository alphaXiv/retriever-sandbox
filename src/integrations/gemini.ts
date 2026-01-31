import { GoogleGenAI } from "@google/genai";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
