import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';

// Paths
const L10N_DIR = path.resolve(process.cwd(), 'l10n');
const ENGLISH_BUNDLE = path.resolve(L10N_DIR, 'bundle.l10n.json');

// Helper function to read and parse a JSON file
function readJsonFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    process.exit(1);
  }
}

// Helper function to write a JSON file with proper formatting
function writeJsonFile(filePath: string, data: Record<string, string>): void {
  try {
    const content = JSON.stringify(data, null, 2);
    writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Updated ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
  }
}

// Main function
function reorderLanguageBundles(): void {
  console.log('Reordering language bundles to match English order...');
  
  // Read the English bundle to get the reference ordering
  const englishBundle = readJsonFile(ENGLISH_BUNDLE);
  const englishKeys = Object.keys(englishBundle);
  
  // Get all l10n files
  const l10nFiles = readdirSync(L10N_DIR)
    .filter(file => file.startsWith('bundle.l10n.') && file !== 'bundle.l10n.json');
  
  // Process each language file
  for (const fileName of l10nFiles) {
    const filePath = path.resolve(L10N_DIR, fileName);
    const langBundle = readJsonFile(filePath);
    
    // Create a new ordered object
    const orderedBundle: Record<string, string> = {};
    
    // Add keys in the same order as the English bundle
    for (const key of englishKeys) {
      if (key in langBundle) {
        orderedBundle[key] = langBundle[key];
      } else {
        // If the key is missing in the translation file, use the English version
        // and mark it for attention
        orderedBundle[key] = `[UNTRANSLATED] ${englishBundle[key]}`;
        console.warn(`Warning: Missing translation for "${key}" in ${fileName}`);
      }
    }
    
    // Check for extra keys not in English bundle
    const extraKeys = Object.keys(langBundle).filter(key => !englishKeys.includes(key));
    if (extraKeys.length > 0) {
      console.warn(`Warning: Found ${extraKeys.length} extra keys in ${fileName} that are not in the English bundle`);
    }
    
    // Write the reordered bundle back to the file
    writeJsonFile(filePath, orderedBundle);
  }
  
  console.log('All language bundles have been reordered successfully!');
}

reorderLanguageBundles();
