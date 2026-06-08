import fs from 'fs';
import path from 'path';

const inputPath = 'src/index.css';
const outputDir = 'src/styles';

const files = {
  variables: 'variables.css',
  base: 'base.css',
  layout: 'layout.css',
  components: 'components.css',
  map: 'map.css',
  views: 'views.css'
};

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read the index.css file
const content = fs.readFileSync(inputPath, 'utf8');

// We split the CSS content into blocks of rule declarations.
// We also want to preserve the @import statements at the very beginning.
let imports = [];
let variablesContent = '';
let baseContent = '';
let layoutContent = '';
let componentsContent = '';
let mapContent = '';
let viewsContent = '';

// Regular expression to match CSS rule blocks (handling nested media queries is simple since there are few or none here)
// Or we can parse by brackets. Let's do a stateful bracket-based parser to be extremely robust!

let currentBlock = '';
let bracketDepth = 0;
let commentsBuffer = '';

let inComment = false;

// Simple state machine parser
for (let i = 0; i < content.length; i++) {
  const char = content[i];
  const nextChar = content[i + 1];

  if (inComment) {
    commentsBuffer += char;
    if (char === '*' && nextChar === '/') {
      commentsBuffer += '/';
      inComment = false;
      i++; // skip '/'
    }
    continue;
  }

  if (char === '/' && nextChar === '*') {
    // Start of comment
    inComment = true;
    commentsBuffer += '/*';
    i++; // skip '*'
    continue;
  }

  currentBlock += char;

  if (char === '{') {
    bracketDepth++;
  } else if (char === '}') {
    bracketDepth--;
    if (bracketDepth === 0) {
      // End of block, classify and append
      const blockText = commentsBuffer + currentBlock;
      commentsBuffer = '';
      currentBlock = '';
      classifyAndAppend(blockText);
    }
  } else if (bracketDepth === 0 && char === ';' && currentBlock.trim().startsWith('@import')) {
    // Import statement
    imports.push(commentsBuffer + currentBlock.trim());
    commentsBuffer = '';
    currentBlock = '';
  }
}

// Flush remaining text
if (commentsBuffer.trim() || currentBlock.trim()) {
  classifyAndAppend(commentsBuffer + currentBlock);
}

function classifyAndAppend(block) {
  const trimmed = block.trim();
  if (!trimmed) return;

  // Extract selector before the first '{'
  const firstBrace = trimmed.indexOf('{');
  const selector = firstBrace !== -1 ? trimmed.substring(0, firstBrace).trim().toLowerCase() : trimmed.toLowerCase();

  // Classification rules:
  if (selector.startsWith('@import')) {
    imports.push(trimmed);
  } else if (selector.includes(':root')) {
    variablesContent += trimmed + '\n\n';
  } else if (
    selector.includes('canvas') ||
    selector.includes('map') ||
    selector.includes('tooltip') ||
    selector.includes('sky') ||
    selector.includes('ground') ||
    selector.includes('scene') ||
    selector.includes('river') ||
    selector.includes('waypoint') ||
    selector.includes('timetravel')
  ) {
    mapContent += trimmed + '\n\n';
  } else if (
    selector.includes('dialog') ||
    selector.includes('.modal') ||
    selector.includes('.event-dialog') ||
    selector.includes('.quick-actions')
  ) {
    componentsContent += trimmed + '\n\n';
  } else if (
    selector.includes('.view') ||
    selector.includes('.shop') ||
    selector.includes('.prestige') ||
    selector.includes('.tree') ||
    selector.includes('.dogma') ||
    selector.includes('.myth') ||
    selector.includes('.archive') ||
    selector.includes('.log') ||
    selector.includes('.doctrine') ||
    selector.includes('tension') ||
    selector.includes('scarcity') ||
    selector.includes('inequality') ||
    selector.includes('complexity') ||
    selector.includes('dissent') ||
    selector.includes('structural') ||
    selector.includes('outcome')
  ) {
    viewsContent += trimmed + '\n\n';
  } else if (
    selector.includes('.topbar') ||
    selector.includes('.resource') ||
    selector.includes('.buy-toolbar') ||
    selector.includes('.buy-mode') ||
    selector.includes('.villager') ||
    selector.includes('.instability') ||
    selector.includes('.wear-gauge') ||
    selector.includes('.rupture-gauge') ||
    selector.includes('.legitimite-gauge') ||
    selector.includes('.state-bar')
  ) {
    componentsContent += trimmed + '\n\n';
  } else if (
    selector.includes('.app') ||
    selector.includes('.sidebar') ||
    selector.includes('.brand') ||
    selector.includes('.tabs') ||
    selector.includes('.tab') ||
    selector.includes('.mark')
  ) {
    layoutContent += trimmed + '\n\n';
  } else if (
    selector === '*' ||
    selector.includes('html') ||
    selector.includes('body') ||
    selector.includes('button') ||
    selector.includes('h1') ||
    selector.includes('h2') ||
    selector.includes('h3') ||
    selector.includes('p') ||
    selector.includes('ol') ||
    selector.includes('li') ||
    selector.includes('small') ||
    selector.includes('span') ||
    selector.includes('menu') ||
    selector.includes('dialog') ||
    selector.includes('article') ||
    selector.includes('header') ||
    selector.includes('.hidden') ||
    selector.includes('.chip') ||
    selector.includes('.body-copy') ||
    selector.includes('.label')
  ) {
    baseContent += trimmed + '\n\n';
  } else {
    // Default fallback to components or views
    if (selector.includes('.') || selector.includes('#')) {
      componentsContent += trimmed + '\n\n';
    } else {
      baseContent += trimmed + '\n\n';
    }
  }
}

// Write the files
fs.writeFileSync(path.join(outputDir, files.variables), variablesContent);
fs.writeFileSync(path.join(outputDir, files.base), baseContent);
fs.writeFileSync(path.join(outputDir, files.layout), layoutContent);
fs.writeFileSync(path.join(outputDir, files.components), componentsContent);
fs.writeFileSync(path.join(outputDir, files.map), mapContent);
fs.writeFileSync(path.join(outputDir, files.views), viewsContent);

console.log('CSS files split successfully!');
console.log('Imports found:', imports);
