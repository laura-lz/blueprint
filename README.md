# Nexhacks - Codebase Documentation Agent

A codebase documentation agent that scans your code and generates:
- **Wiki-style markdown documentation** for each file
- **Mermaid diagrams** showing component relationships
- **AI-powered summaries** (with OpenRouter integration)

## Quick Start

```bash
# Install dependencies
npm install

# Run the agent on the sample calculator
npm run agent:sample

# Run on your own codebase
npm run agent -- --target /path/to/your/codebase --output ./docs
```

## Features

- 🔍 **File Scanner** - Recursively scans codebase, filters code files
- 🌳 **AST Parser** - Extracts imports/exports without feeding full context
- 🔗 **Relationship Analyzer** - Builds dependency graph between components
- 📝 **Wiki Generator** - Creates wiki-style markdown summaries
- 📊 **Mermaid Diagrams** - Upper-level component relationship diagrams
- 🤖 **AI Summaries** - Optional OpenRouter integration for intelligent summaries

## Project Structure

```
nexhacks/
├── samples/calculator/    # Sample Next.js app for testing
├── src/core/              # Core agent logic
│   ├── openrouter.ts      # OpenRouter API client
│   ├── scanner.ts         # File system scanner
│   ├── parser.ts          # AST parser (Babel)
│   ├── analyzer.ts        # Dependency graph builder
│   └── generator.ts       # Wiki/Mermaid generator
├── cli/                   # CLI interface
└── output/                # Generated documentation
```

## AI-Powered Summaries

To enable AI-powered summaries, add your OpenRouter API key:

```bash
# In .env file
OPENROUTER_API_KEY=your_key_here
```

Get your key at [https://openrouter.ai/keys](https://openrouter.ai/keys)

## Output Example

Running the agent generates:
- `output/wiki.md` - Complete wiki documentation
- `output/diagram.mmd` - Mermaid diagram file
- `output/summaries.json` - JSON export of file summaries

## CLI Options

```bash
npx tsx cli/index.ts --help

Options:
  -t, --target <path>   Target directory to scan (required)
  -o, --output <path>   Output directory (default: ./output)
  -m, --model <model>   OpenRouter model (default: claude-3.5-sonnet)
  --no-ai               Disable AI summaries
  --no-diagrams         Disable Mermaid diagrams
  -v, --verbose         Verbose logging
```

## VS Code Extension (Coming Soon)

The project is structured for easy extension integration with:
- `src/extension.ts` - Extension entry point (TBD)
- Reusable core logic in `src/core/`

## License

MIT
