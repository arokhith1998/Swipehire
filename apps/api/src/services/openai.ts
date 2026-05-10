import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_SECRET_KEY || "default_key" 
});

interface ResumeData {
  name?: string;
  email?: string;
  phone?: string;
  experience?: string[];
  skills?: string[];
  education?: string[];
  summary?: string;
  originalContent?: string;
}

interface TailoredResume {
  content: string;
  changes: string[];
  keywords: string[];
}

class OpenAIService {
  async tailorResume(resumeData: ResumeData, jobDescription: string, requirements: string[]): Promise<TailoredResume> {
    try {
      const resumeContent = resumeData.originalContent || JSON.stringify(resumeData, null, 2);
      
      const prompt = `
You are a professional resume optimizer. Your task is to PRESERVE the original resume template, layout, and formatting while making minimal content adjustments.

ORIGINAL RESUME:
${resumeContent}

JOB DESCRIPTION:
${jobDescription}

JOB REQUIREMENTS:
${requirements.join(', ')}

CRITICAL INSTRUCTIONS:
1. PRESERVE the original template, layout, and formatting structure exactly
2. PRESERVE ALL original skills, keywords, experience, and achievements - DO NOT remove or change them
3. DO NOT rewrite content - only make strategic highlighting and minor reordering
4. If resume is longer than 1 page, condense by shortening bullet points while keeping ALL key information
5. Reorder sections or bullet points to highlight most job-relevant experience first
6. Only emphasize existing skills/keywords that match job requirements - don't add new ones
7. Maintain the person's authentic voice, experience, and qualifications completely
8. Keep all technical skills, certifications, education, and contact information unchanged
9. Focus on strategic reordering and condensing rather than content changes
10. The resume should look like the same template with slightly reorganized content

Goal: Make it fit 1 page while highlighting job-relevant content from the original resume. Preserve authenticity and template structure.

Return response as JSON:
{
  "content": "the same template with strategically reordered content condensed to 1 page",
  "changes": ["specific reordering and condensing changes made - emphasize preservation"],
  "keywords": ["original keywords from resume that match job requirements"]
}
`;

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert resume optimizer focused on preservation and minimal enhancement. Your primary goal is to maintain the integrity of the original resume while making strategic improvements. Always respond with valid JSON format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 2500
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        content: result.content || "Unable to tailor resume automatically",
        changes: result.changes || ["No changes specified"],
        keywords: result.keywords || []
      };
    } catch (error) {
      console.error('OpenAI resume tailoring error:', error);
      throw new Error('Failed to tailor resume with AI');
    }
  }

  async generateJobMatchExplanation(userSkills: string[], jobRequirements: string[]): Promise<string> {
    try {
      const prompt = `
Analyze the match between user skills and job requirements:

USER SKILLS: ${userSkills.join(', ')}
JOB REQUIREMENTS: ${jobRequirements.join(', ')}

Provide a brief explanation of how well the user matches the job requirements.
Focus on strengths and any gaps. Keep it under 100 words.
`;

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 150
      });

      return response.choices[0].message.content || "Unable to generate match explanation";
    } catch (error) {
      console.error('OpenAI match explanation error:', error);
      return "Match analysis temporarily unavailable";
    }
  }
}

export const openaiService = new OpenAIService();
