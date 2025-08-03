const Anthropic = require('@anthropic-ai/sdk');
const { getDatabase } = require('../database/init');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class AnthropicService {
  constructor() {
    this.model = 'claude-3-5-sonnet-20241022';
    this.maxTokens = 4000;
  }
  
  /**
   * Analyze health diary transcript and extract structured information
   */
  async analyzeHealthDiary(transcript, userPreferences = {}) {
    const { subjects = [], interactionStyle = 'friendly' } = userPreferences;
    
    const systemPrompt = this.buildSystemPrompt(subjects, interactionStyle);
    const userPrompt = this.buildAnalysisPrompt(transcript);
    
    try {
      const response = await anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      });
      
      const analysis = response.content[0].text;
      
      // Parse the JSON response
      try {
        const structuredData = JSON.parse(analysis);
        return {
          success: true,
          analysis: structuredData,
          rawResponse: analysis,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens
          }
        };
      } catch (parseError) {
        console.error('Failed to parse Anthropic response as JSON:', parseError);
        return {
          success: false,
          error: 'Failed to parse analysis response',
          rawResponse: analysis
        };
      }
      
    } catch (error) {
      console.error('Anthropic API error:', error);
      return {
        success: false,
        error: error.message || 'Failed to analyze transcript'
      };
    }
  }
  
  /**
   * Generate follow-up questions based on missing health topics
   */
  async generateFollowUpQuestions(transcript, missingSubjects, interactionStyle = 'friendly') {
    const prompt = this.buildFollowUpPrompt(transcript, missingSubjects, interactionStyle);
    
    try {
      const response = await anthropic.messages.create({
        model: this.model,
        max_tokens: 1000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      
      const questions = response.content[0].text;
      
      try {
        const parsedQuestions = JSON.parse(questions);
        return {
          success: true,
          questions: parsedQuestions,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens
          }
        };
      } catch (parseError) {
        // If JSON parsing fails, return as plain text
        return {
          success: true,
          questions: { general: questions.split('\n').filter(q => q.trim()) },
          rawResponse: questions
        };
      }
      
    } catch (error) {
      console.error('Anthropic follow-up questions error:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate follow-up questions'
      };
    }
  }
  
  /**
   * Build system prompt based on user preferences
   */
  buildSystemPrompt(subjects, interactionStyle) {
    const toneMap = {
      minimal: 'Be concise and direct. Use brief, factual language.',
      friendly: 'Be warm and supportive. Use encouraging language while remaining professional.',
      reassuring: 'Be gentle and comforting. Use supportive, calming language that reduces anxiety.'
    };
    
    const tone = toneMap[interactionStyle] || toneMap.friendly;
    
    return `You are a health diary analysis assistant. Your role is to analyze voice diary entries and extract structured health information.

TONE: ${tone}

SUBJECTS TO TRACK: ${subjects.length > 0 ? subjects.join(', ') : 'sleep, food, exercise, wellness, mood, symptoms'}

ANALYSIS GUIDELINES:
1. Extract information about the specified health subjects from the transcript
2. Provide confidence scores (0-1) for each extracted piece of information
3. Identify any concerning symptoms or patterns that may need medical attention
4. Note any missing subjects that the user typically tracks
5. Maintain privacy and medical confidentiality
6. Do not provide medical diagnoses or treatment recommendations

OUTPUT FORMAT: Return valid JSON only, with this structure:
{
  "summary": "Brief overall summary of the entry",
  "subjects": {
    "sleep": {
      "mentioned": boolean,
      "data": {
        "duration": "X hours",
        "quality": "good/fair/poor",
        "notes": "any additional details"
      },
      "confidence": 0.0-1.0
    },
    "food": {
      "mentioned": boolean,
      "data": {
        "meals": ["breakfast: X", "lunch: Y"],
        "water_intake": "amount",
        "notes": "dietary observations"
      },
      "confidence": 0.0-1.0
    },
    "exercise": {
      "mentioned": boolean,
      "data": {
        "activities": ["activity type and duration"],
        "intensity": "low/moderate/high",
        "notes": "exercise observations"
      },
      "confidence": 0.0-1.0
    },
    "mood": {
      "mentioned": boolean,
      "data": {
        "overall": "positive/neutral/negative",
        "specific_emotions": ["happy", "anxious", "stressed"],
        "energy_level": "low/moderate/high",
        "notes": "mood observations"
      },
      "confidence": 0.0-1.0
    },
    "symptoms": {
      "mentioned": boolean,
      "data": {
        "physical": ["symptom1", "symptom2"],
        "severity": "mild/moderate/severe",
        "notes": "symptom details"
      },
      "confidence": 0.0-1.0
    },
    "wellness": {
      "mentioned": boolean,
      "data": {
        "overall_feeling": "description",
        "stress_level": "low/moderate/high",
        "notes": "general wellness observations"
      },
      "confidence": 0.0-1.0
    }
  },
  "missing_subjects": ["list of tracked subjects not mentioned"],
  "health_flags": {
    "concerning_symptoms": ["symptoms that may need attention"],
    "positive_trends": ["encouraging health patterns"],
    "recommendations": ["gentle suggestions for user consideration"]
  },
  "metadata": {
    "word_count": number,
    "key_themes": ["main topics discussed"],
    "emotional_tone": "overall emotional state"
  }
}`;
  }
  
  /**
   * Build analysis prompt for transcript
   */
  buildAnalysisPrompt(transcript) {
    return `Please analyze this health diary entry transcript and extract structured health information:

TRANSCRIPT:
"${transcript}"

Return the analysis as JSON following the specified format. Focus on extracting factual health information while being sensitive to the user's emotional state and privacy.`;
  }
  
  /**
   * Build follow-up questions prompt
   */
  buildFollowUpPrompt(transcript, missingSubjects, interactionStyle) {
    const toneMap = {
      minimal: 'Keep questions brief and direct.',
      friendly: 'Ask questions in a warm, conversational way.',
      reassuring: 'Ask questions gently and supportively.'
    };
    
    const tone = toneMap[interactionStyle] || toneMap.friendly;
    
    return `Based on this health diary transcript, generate 2-3 brief follow-up questions about the missing health topics.

TRANSCRIPT: "${transcript}"

MISSING SUBJECTS: ${missingSubjects.join(', ')}

TONE: ${tone}

Generate questions that:
1. Are easy to answer briefly
2. Feel natural and conversational
3. Don't feel invasive or medical
4. Encourage the user to share more about their day

Return as JSON:
{
  "questions": [
    "Question about first missing subject?",
    "Question about second missing subject?"
  ]
}`;
  }
  
  /**
   * Process completed transcriptions and start analysis (called by scheduled task)
   */
  async processCompletedTranscriptions() {
    const db = getDatabase();
    
    // Get entries with completed transcription but pending analysis
    const entries = await new Promise((resolve, reject) => {
      db.all(
        `SELECT de.*, u.interaction_style, u.id as user_id
         FROM diary_entries de 
         JOIN users u ON de.user_id = u.id 
         WHERE de.transcription_status = 'completed' 
         AND de.analysis_status = 'pending'
         AND de.raw_transcript_s3_key IS NOT NULL`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    for (const entry of entries) {
      try {
        // Update status to processing
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE diary_entries SET analysis_status = ? WHERE id = ?',
            ['processing', entry.id],
            function(err) {
              if (err) reject(err);
              else resolve(this);
            }
          );
        });
        
        // Get user subjects
        const subjects = await new Promise((resolve, reject) => {
          db.all(
            'SELECT subject FROM user_subjects WHERE user_id = ? AND enabled = 1',
            [entry.user_id],
            (err, rows) => {
              if (err) reject(err);
              else resolve((rows || []).map(r => r.subject));
            }
          );
        });
        
        // Get transcript from S3
        const s3Service = require('./s3');
        const transcriptContent = await s3Service.getFileContent(entry.raw_transcript_s3_key);
        
        // Extract transcript text from markdown
        const transcriptMatch = transcriptContent.match(/## Transcript\n([\s\S]*?)\n\n## Metadata/);
        const transcript = transcriptMatch ? transcriptMatch[1].trim() : transcriptContent;
        
        // Analyze with Anthropic
        const analysisResult = await this.analyzeHealthDiary(transcript, {
          subjects,
          interactionStyle: entry.interaction_style
        });
        
        if (analysisResult.success) {
          // Save analysis to S3
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const summaryKey = `users/${entry.user_id}/structured-summaries/${timestamp}-summary.json`;
          
          const summaryData = {
            ...analysisResult.analysis,
            metadata: {
              ...analysisResult.analysis.metadata,
              processed_at: new Date().toISOString(),
              anthropic_usage: analysisResult.usage
            }
          };
          
          await s3Service.uploadTextFile(
            entry.user_id, 
            JSON.stringify(summaryData, null, 2), 
            `structured-summaries/${timestamp}-summary.json`,
            'application/json'
          );
          
          // Update database
          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE diary_entries 
               SET analysis_status = 'completed',
                   structured_summary_s3_key = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [summaryKey, entry.id],
              function(err) {
                if (err) reject(err);
                else resolve(this);
              }
            );
          });
          
          console.log(`Analysis completed for entry ${entry.id}`);
          
        } else {
          // Mark as failed
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE diary_entries SET analysis_status = ? WHERE id = ?',
              ['failed', entry.id],
              function(err) {
                if (err) reject(err);
                else resolve(this);
              }
            );
          });
          
          console.error(`Analysis failed for entry ${entry.id}: ${analysisResult.error}`);
        }
        
      } catch (error) {
        console.error(`Error processing analysis for entry ${entry.id}:`, error);
        
        // Mark as failed
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE diary_entries SET analysis_status = ? WHERE id = ?',
            ['failed', entry.id],
            function(err) {
              if (err) reject(err);
              else resolve(this);
            }
          );
        });
      }
    }
    
    db.close();
  }
}

module.exports = new AnthropicService();