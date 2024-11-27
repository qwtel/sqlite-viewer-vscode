import { execSync } from 'child_process';
import fs from 'fs';

import URL from 'url';
import path from 'path'

import packageJSON from '../package.json'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

// Get all git tags with their associated commit dates
function getTagsWithDates() {
  const tagsOutput = execSync('git for-each-ref --sort=creatordate --format "%(refname:short) %(creatordate:short)" refs/tags', { encoding: 'utf-8' });
  const tags = tagsOutput.trim().split('\n').map(line => {
    const [tag, ...dateParts] = line.split(' ');
    return { tag, date: new Date(dateParts.join(' ')) };
  });
  return tags;
}

// Update the CHANGELOG.md file
function updateChangelog(tags: { tag: string, date: Date}[]) {
  const changelogPath = resolve('CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    console.error(`Error: ${changelogPath} not found.`);
    process.exit(1);
  }

  let changelogContent = fs.readFileSync(changelogPath, 'utf-8');

  tags.forEach(({ tag, date }) => {
    const regex = new RegExp(`(##\\s*${tag}[^\\n]*\\n)(?!_Released on)`, 'g');

    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedDate = formatter.format(date);

    changelogContent = changelogContent.replace(regex, `$1_Released on ${formattedDate}_\n\n`);
  });

  fs.writeFileSync(changelogPath, changelogContent, 'utf-8');
  console.log('CHANGELOG.md updated successfully!');
}

// Main function
function main() {
  try {
    const tags = getTagsWithDates();
    tags.unshift({ tag: `v${packageJSON.version}`, date: new Date() });
    updateChangelog(tags);
  } catch (error) {
    console.error('Error updating CHANGELOG.md:', error instanceof Error ? error.message : '' + error);
    process.exit(1);
  }
}

main();
