import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

let compileTimeout: NodeJS.Timeout | undefined;
let changeListener: vscode.Disposable | undefined;
let compileOnChangeEnabled = false;

/**
 * Helper: Merge paragraphs for environments (e.g. figure, table).
 */
function mergeEnvironmentParagraphs(paragraphs: string[]): string[] {
  const merged: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    let para = paragraphs[i];
    const envMatch = para.match(/\\begin\{(figure|table)\}/);
    if (envMatch && !para.includes(`\\end{${envMatch[1]}}`)) {
      // Merge subsequent paragraphs until the closing tag is found.
      while (i + 1 < paragraphs.length && !paragraphs[i].includes(`\\end{${envMatch[1]}}`)) {
        i++;
        para += "\n\n" + paragraphs[i];
      }
    }
    merged.push(para);
  }
  return merged;
}

/**
 * Cleanup temporary files stored in the build folder.
 * Deletes the temporary .tex file and all auxiliary files sharing the same prefix,
 * except the PDF.
 */
function cleanupTemporaryFiles(tempFilePath: string, buildDir: string) {
  const prefix = path.basename(tempFilePath, '.tex');
  try {
    fs.unlinkSync(tempFilePath);
  } catch (err) {
    console.error(`Error deleting temp file ${tempFilePath}:`, err);
  }
  try {
    const files = fs.readdirSync(buildDir);
    for (const file of files) {
      const filePrefix = path.basename(file, path.extname(file));
      if (filePrefix === prefix && path.extname(file) !== '.pdf') {
        fs.unlinkSync(path.join(buildDir, file));
      }
    }
  } catch (err) {
    console.error(`Error cleaning build directory ${buildDir}:`, err);
  }
}

/**
 * Compile the current slide in a Beamer document.
 */
const compileCurrentSlide = () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor.');
    return;
  }
  const document = editor.document;
  const fullText = document.getText();
  const cursorPosition = editor.selection.active;

  const beginDocIndex = fullText.indexOf('\\begin{document}');
  if (beginDocIndex === -1) {
    vscode.window.showErrorMessage('No \\begin{document} found.');
    return;
  }
  const header = fullText.substring(0, beginDocIndex);

  const beforeCursor = fullText.substring(0, document.offsetAt(cursorPosition));
  const afterCursor = fullText.substring(document.offsetAt(cursorPosition));
  const frameBeginIndex = beforeCursor.lastIndexOf('\\begin{frame}');
  const frameEndRelative = afterCursor.indexOf('\\end{frame}');
  if (frameBeginIndex === -1 || frameEndRelative === -1) {
    vscode.window.showErrorMessage('Could not find current frame boundaries.');
    return;
  }
  const frameStart = frameBeginIndex;
  const frameEnd = document.offsetAt(cursorPosition) + frameEndRelative + '\\end{frame}'.length;
  const slideContent = fullText.substring(frameStart, frameEnd);

  const tempDocument = `${header}
\\begin{document}
${slideContent}
\\end{document}`;

  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  // Create (or get) the build folder.
  const buildDir = path.join(workspacePath, 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
  // Store the temporary .tex file in the build folder.
  const tempFilePath = path.join(buildDir, 'currentSlide.tex');
  try {
    fs.writeFileSync(tempFilePath, tempDocument);
  } catch (err) {
    vscode.window.showErrorMessage('Error writing temporary file: ' + err);
    return;
  }

  const command = `pdflatex -output-directory="${buildDir}" -interaction=nonstopmode -halt-on-error "${tempFilePath}"`;
  vscode.window.showInformationMessage('Compiling current slide...');
  exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
    if (error) {
      vscode.window.showErrorMessage('Compilation error. See output for details.');
      return;
    }
    vscode.window.showInformationMessage('Current slide compiled successfully!');
    cleanupTemporaryFiles(tempFilePath, buildDir);
  });
};

/**
 * Compile surrounding slides for a Beamer document.
 * Uses user settings for number of slides before and after.
 */
const compileSurroundingSlides = () => {
  const config = vscode.workspace.getConfiguration('latexSlideCompiler');
  const slidesBefore: number = config.get('slidesBefore', 2);
  const slidesAfter: number = config.get('slidesAfter', 2);

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor.');
    return;
  }
  const document = editor.document;
  const fullText = document.getText();
  const cursorOffset = document.offsetAt(editor.selection.active);

  const beginDocIndex = fullText.indexOf('\\begin{document}');
  if (beginDocIndex === -1) {
    vscode.window.showErrorMessage('No \\begin{document} found.');
    return;
  }
  const header = fullText.substring(0, beginDocIndex);

  const frameRegex = /\\begin\{frame\}[\s\S]*?\\end\{frame\}/g;
  const frames: { start: number; end: number; content: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = frameRegex.exec(fullText)) !== null) {
    frames.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0]
    });
  }
  if (frames.length === 0) {
    vscode.window.showErrorMessage('No frames found.');
    return;
  }
  const currentFrameIndex = frames.findIndex(frame => cursorOffset >= frame.start && cursorOffset <= frame.end);
  if (currentFrameIndex === -1) {
    vscode.window.showErrorMessage('Cursor not within a frame.');
    return;
  }
  const startIndex = Math.max(0, currentFrameIndex - slidesBefore);
  const endIndex = Math.min(frames.length - 1, currentFrameIndex + slidesAfter);
  const selectedFrames = frames.slice(startIndex, endIndex + 1)
                                .map(frame => frame.content)
                                .join('\n');

  const tempDocument = `${header}
\\begin{document}
${selectedFrames}
\\end{document}`;

  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const buildDir = path.join(workspacePath, 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
  const tempFilePath = path.join(buildDir, 'currentFiveSlides.tex');
  try {
    fs.writeFileSync(tempFilePath, tempDocument);
  } catch (err) {
    vscode.window.showErrorMessage('Error writing temporary file: ' + err);
    return;
  }

  const command = `pdflatex -output-directory="${buildDir}" -interaction=nonstopmode -halt-on-error "${tempFilePath}"`;
  vscode.window.showInformationMessage('Compiling surrounding slides...');
  exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
    if (error) {
      vscode.window.showErrorMessage('Compilation error. See output for details.');
      return;
    }
    vscode.window.showInformationMessage('Surrounding slides compiled successfully!');
    cleanupTemporaryFiles(tempFilePath, buildDir);
  });
};

/**
 * Compile paragraph context for non-Beamer documents.
 * Compiles the current paragraph plus a configurable number of paragraphs before and after.
 */
const compileParagraphContext = () => {
  const config = vscode.workspace.getConfiguration('latexSlideCompiler');
  const paragraphsBefore: number = config.get('paragraphsBefore', 10);
  const paragraphsAfter: number = config.get('paragraphsAfter', 10);

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor.');
    return;
  }
  const document = editor.document;
  const fullText = document.getText();
  const cursorOffset = document.offsetAt(editor.selection.active);

  const beginDocIndex = fullText.indexOf('\\begin{document}');
  if (beginDocIndex === -1) {
    vscode.window.showErrorMessage('No \\begin{document} found.');
    return;
  }
  const header = fullText.substring(0, beginDocIndex);
  const body = fullText.substring(beginDocIndex + '\\begin{document}'.length);

  let rawParagraphs = body.split(/\n\s*\n/);
  rawParagraphs = rawParagraphs.map(p => p.trim()).filter(p => p.length > 0);
  const paragraphs = mergeEnvironmentParagraphs(rawParagraphs);

  let cumulative = 0;
  let currentIndex = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    cumulative += paragraphs[i].length + 2;
    if (cursorOffset < beginDocIndex + '\\begin{document}'.length + cumulative) {
      currentIndex = i;
      break;
    }
  }
  if (currentIndex === -1) {
    vscode.window.showErrorMessage('Could not determine current paragraph.');
    return;
  }
  const startIndex = Math.max(0, currentIndex - paragraphsBefore);
  const endIndex = Math.min(paragraphs.length - 1, currentIndex + paragraphsAfter);
  const selectedParagraphs = paragraphs.slice(startIndex, endIndex + 1).join('\n\n');

  const tempDocument = `${header}
\\begin{document}
${selectedParagraphs}
\\end{document}`;

  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const buildDir = path.join(workspacePath, 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
  const tempFilePath = path.join(buildDir, 'currentParagraphContext.tex');
  try {
    fs.writeFileSync(tempFilePath, tempDocument);
  } catch (err) {
    vscode.window.showErrorMessage('Error writing temporary file: ' + err);
    return;
  }
  const command = `pdflatex -output-directory="${buildDir}" -interaction=nonstopmode -halt-on-error "${tempFilePath}"`;
  vscode.window.showInformationMessage('Compiling paragraph context...');
  exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
    if (error) {
      vscode.window.showErrorMessage('Compilation error. See output for details.');
      return;
    }
    vscode.window.showInformationMessage('Paragraph context compiled successfully!');
    cleanupTemporaryFiles(tempFilePath, buildDir);
  });
};

/**
 * Toggle compile-on-change for both Beamer and non-Beamer documents.
 */
const toggleCompileOnChange = () => {
  compileOnChangeEnabled = !compileOnChangeEnabled;
  if (compileOnChangeEnabled) {
    vscode.window.showInformationMessage('Compile on change enabled.');
    changeListener = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'latex') {
        if (compileTimeout) {
          clearTimeout(compileTimeout);
        }
        compileTimeout = setTimeout(() => {
          const fullText = event.document.getText();
          if (fullText.includes('\\documentclass{beamer}')) {
            compileCurrentSlide();
          } else {
            compileParagraphContext();
          }
        }, 1000);
      }
    });
  } else {
    vscode.window.showInformationMessage('Compile on change disabled.');
    if (changeListener) {
      changeListener.dispose();
      changeListener = undefined;
    }
  }
};

/**
 * Activation: Register commands.
 */
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('extension.compileCurrentSlide', compileCurrentSlide));
  context.subscriptions.push(vscode.commands.registerCommand('extension.compileSurroundingSlides', compileSurroundingSlides));
  context.subscriptions.push(vscode.commands.registerCommand('extension.compileParagraphContext', compileParagraphContext));
  context.subscriptions.push(vscode.commands.registerCommand('extension.toggleCompileOnChange', toggleCompileOnChange));
}

/**
 * Deactivation.
 */
export function deactivate() {
  if (changeListener) {
    changeListener.dispose();
  }
  if (compileTimeout) {
    clearTimeout(compileTimeout);
  }
}
