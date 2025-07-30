import * as path from 'path';
import * as fs from 'fs/promises';
import { ModelOperations } from "@vscode/vscode-languagedetection";

import modelJson from '@vscode/vscode-languagedetection/model/model.json' with { type: 'json' };

// @ts-ignore
import modelWeights from '@vscode/vscode-languagedetection/model/group1-shard1of1.bin';

const ExpectedRelativeConfidence = 0.2;

// Language detection service using VS Code's ML models
export class LanguageDetectionService {
  private modelOperations: ModelOperations | null = null;
  private initialized = false;
  private loadFailed = false;

  async initialize() {
    if (this.initialized || this.loadFailed) return;
    
    try {
      // Use custom model loading functions to access VS Code's models
      this.modelOperations = new ModelOperations({
        modelJsonLoaderFunc: async (): Promise<{ [key: string]: any }> => {
          return modelJson as { [key: string]: any };
        },
        weightsLoaderFunc: async () => {
          const buffer = await fs.readFile(path.join(__dirname, modelWeights));
          return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        }
      });
      
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize language detection service:', error);
      this.loadFailed = true;
    }
  }

  async detectLanguage(content: string): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.loadFailed || !this.modelOperations || !content.trim()) {
      return null;
    }

    try {
      const modelResults = await this.modelOperations.runModel(content);
      if (!modelResults || modelResults.length === 0) {
        return null;
      }

      // Check if the highest confidence result meets the threshold (same as VS Code)
      if (modelResults[0].confidence < ExpectedRelativeConfidence) {
        return null;
      }

      // Return the language ID of the highest confidence result
      return modelResults[0].languageId;
    } catch (error) {
      console.warn('Language detection failed:', error);
      return null;
    }
  }

  async detectLanguages(content: string): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.loadFailed || !this.modelOperations || !content.trim()) {
      return [];
    }

    try {
      const modelResults = await this.modelOperations.runModel(content);
      if (!modelResults || modelResults.length === 0) {
        return [];
      }

      const languages: string[] = [];
      const possibleLanguages: typeof modelResults = [modelResults[0]];

      // Check if the highest confidence result meets the threshold
      if (modelResults[0].confidence < ExpectedRelativeConfidence) {
        return [];
      }

      // Process additional results with similar confidence (same logic as VS Code)
      for (let i = 1; i < modelResults.length; i++) {
        const current = modelResults[i];
        const currentHighest = possibleLanguages[possibleLanguages.length - 1];
        
        if (currentHighest.confidence - current.confidence >= ExpectedRelativeConfidence) {
          // Add all possible languages that meet the threshold
          while (possibleLanguages.length) {
            const lang = possibleLanguages.shift()!;
            if (lang.confidence > ExpectedRelativeConfidence) {
              languages.push(lang.languageId);
            }
          }
          
          if (current.confidence > ExpectedRelativeConfidence) {
            possibleLanguages.push(current);
          } else {
            break;
          }
        } else {
          if (current.confidence > ExpectedRelativeConfidence) {
            possibleLanguages.push(current);
          } else {
            break;
          }
        }
      }

      // Add any remaining possible languages
      while (possibleLanguages.length) {
        const lang = possibleLanguages.shift()!;
        if (lang.confidence > ExpectedRelativeConfidence) {
          languages.push(lang.languageId);
        }
      }

      return languages;
    } catch (error) {
      console.warn('Language detection failed:', error);
      return [];
    }
  }
}

