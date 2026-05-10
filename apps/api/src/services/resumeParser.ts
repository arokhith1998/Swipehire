interface ParsedResumeData {
  name?: string;
  email?: string;
  phone?: string;
  experience?: string[];
  skills?: string[];
  education?: string[];
  summary?: string;
  originalContent?: string; // Add original content for AI tailoring
}

class ResumeParser {
  async parseResume(fileBuffer: Buffer, filename: string): Promise<ParsedResumeData> {
    try {
      let content: string;
      
      // Handle different file types
      if (filename.toLowerCase().endsWith('.pdf')) {
        // For PDF files, try to extract text (fallback to buffer string)
        try {
          // In production, use pdf-parse library
          content = fileBuffer.toString('utf-8');
        } catch {
          content = fileBuffer.toString('binary');
        }
      } else {
        // For .doc, .docx, .txt files
        content = fileBuffer.toString('utf-8');
      }
      
      const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
      
      const parsed: ParsedResumeData = {
        experience: [],
        skills: [],
        education: [],
        originalContent: content // Store original content for AI tailoring
      };

      // Extract email
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
      const emailMatch = content.match(emailRegex);
      if (emailMatch) {
        parsed.email = emailMatch[0];
      }

      // Extract phone
      const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
      const phoneMatch = content.match(phoneRegex);
      if (phoneMatch) {
        parsed.phone = phoneMatch[0];
      }

      // Extract name (assume first line or line before email)
      if (lines.length > 0) {
        parsed.name = lines[0];
      }

      // Extract skills (look for common skill keywords)
      const skillKeywords = [
        'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'MongoDB',
        'AWS', 'Docker', 'Kubernetes', 'Git', 'TypeScript', 'Angular', 'Vue',
        'C++', 'C#', 'Ruby', 'PHP', 'Go', 'Rust', 'Swift', 'Kotlin',
        'HTML', 'CSS', 'Bootstrap', 'Tailwind', 'PostgreSQL', 'MySQL',
        'Redis', 'GraphQL', 'REST', 'API', 'Machine Learning', 'AI',
        'System Design', 'Microservices', 'DevOps', 'CI/CD'
      ];

      parsed.skills = skillKeywords.filter(skill => 
        content.toLowerCase().includes(skill.toLowerCase())
      );

      // Extract experience (lines that might contain job titles or companies)
      const experienceKeywords = ['engineer', 'developer', 'manager', 'analyst', 'consultant', 'intern'];
      parsed.experience = lines.filter(line => 
        experienceKeywords.some(keyword => 
          line.toLowerCase().includes(keyword)
        )
      ).slice(0, 5); // Limit to 5 items

      // Extract education (look for degree keywords)
      const educationKeywords = ['bachelor', 'master', 'phd', 'university', 'college', 'degree'];
      parsed.education = lines.filter(line => 
        educationKeywords.some(keyword => 
          line.toLowerCase().includes(keyword)
        )
      ).slice(0, 3); // Limit to 3 items

      return parsed;
    } catch (error) {
      console.error('Resume parsing error:', error);
      throw new Error('Failed to parse resume file');
    }
  }
}

export const resumeParser = new ResumeParser();
