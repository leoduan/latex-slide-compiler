# LaTeX Compiler Extension

This VS Code extension allows you to compile individual parts of your LaTeX documents. It supports two workflows:

- **Beamer Documents:**  
  Compile individual slides (frames) from your Beamer presentations. You can compile just the current slide or a group of slides (the current slide plus a configurable number of slides before and after).

- **Standard LaTeX Documents:**  
  Compile a context of paragraphs from a non-Beamer document. The extension compiles the current paragraph along with a configurable number of paragraphs before and after the current one.

After compilation, the extension stores all generated temporary and auxiliary files in a dedicated `build` folder and cleans up the temporary files, leaving only the final PDF.

## Features

- **Compile Current Slide (Beamer):**  
  Compile the slide (frame) where your cursor is currently located.

- **Compile Surrounding Slides (Beamer):**  
  Compile the current slide plus a configurable number of slides before and after (by default, two before and two after; up to five slides total).

- **Compile Paragraph Context (Standard LaTeX):**  
  Compile the current paragraph along with a configurable number of surrounding paragraphs (by default, 10 before and 10 after, up to 21 paragraphs total).

- **Toggle Compile on Change:**  
  Automatically compile on document changes (with a 1-second debounce). The extension detects whether the document is a Beamer presentation or a standard LaTeX file and uses the appropriate compile mode.

- **Output Management:**  
  All temporary files (the generated `.tex` file and auxiliary files) are stored in the workspace's `build` folder. After a successful compilation, these files are cleaned up automatically, leaving only the generated PDF.

## Installation

1. Clone or download this repository.
2. Open the extension folder in VS Code.
3. Run `npm install` to install dependencies.
4. Compile the extension with `npm run compile`.
5. (Optional) Install `vsce` globally with `npm install -g vsce`.
6. Package the extension with `vsce package`.
7. Install the resulting VSIX package in VS Code.

## Commands

- **Compile Current Slide (Beamer):**  
  - *Command ID:* `extension.compileCurrentSlide`  
  - *Keybinding (default):* `Ctrl+Shift+C`  
  Compiles the current slide (frame) where the cursor is located.

- **Compile Surrounding Slides (Beamer):**  
  - *Command ID:* `extension.compileSurroundingSlides`  
  - *Keybinding (default):* `Ctrl+Shift+F`  
  Compiles the current slide along with a configurable number of surrounding slides.

- **Compile Paragraph Context (Non-Beamer):**  
  - *Command ID:* `extension.compileParagraphContext`  
  - *Keybinding (default):* `Ctrl+Shift+P`  
  Compiles the current paragraph along with a configurable number of surrounding paragraphs.

- **Toggle Compile on Change:**  
  - *Command ID:* `extension.toggleCompileOnChange`  
  - *Keybinding (default):* `Ctrl+Shift+T`  
  Toggles auto-compilation on document changes. The extension automatically detects if the document is Beamer-based or not.

## Configuration

This extension exposes settings to let you customize how many slides or paragraphs are compiled around the current one. In your VS Code settings, you can configure:

- **Beamer Documents:**
  - `latexSlideCompiler.slidesBefore`: Number of slides before the current slide (default: 2).
  - `latexSlideCompiler.slidesAfter`: Number of slides after the current slide (default: 2).

- **Standard LaTeX Documents:**
  - `latexSlideCompiler.paragraphsBefore`: Number of paragraphs before the current paragraph (default: 10).
  - `latexSlideCompiler.paragraphsAfter`: Number of paragraphs after the current paragraph (default: 10).

Also, ensure you have `pdflatex` installed and available in your system's PATH.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
