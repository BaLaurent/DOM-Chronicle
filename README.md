# DOM Chronicle

A Chrome extension that records DOM mutations and user interactions, producing LLM-optimized Markdown exports with automatic PII redaction.

## Features

- **DOM Mutation Capture** - Records all DOM changes using MutationObserver
- **User Event Tracking** - Captures clicks, inputs, focus, scroll, and navigation events
- **Automatic PII Redaction** - Removes passwords, emails, phone numbers, SSNs, and credit card numbers before storage
- **LLM-Ready Export** - Generates structured Markdown with semantic element descriptions
- **Session Management** - List, view, and delete past recording sessions
- **Sensitive Domain Warnings** - Alerts when recording on banking, healthcare, or auth sites
- **Totally local** - No data leave your system, you can delete it whenever you want

  
## Installation

### From Source

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## Usage

1. Click the extension icon to open the popup
2. Click "Start Recording" to begin capturing DOM events
3. Interact with the page as normal
4. Click "Stop Recording" when finished
5. Export the session to Markdown for use with LLMs

## Project Structure

```
src/
├── background.ts           # Service worker
├── content.ts              # Injected capture script
├── popup/                  # Extension popup UI
├── options/                # Settings page
└── lib/
    ├── capture/            # DOM & event capture
    │   ├── mutation-observer.ts
    │   ├── event-listener.ts
    │   └── semantic-extractor.ts
    ├── redaction/          # PII removal
    │   ├── engine.ts
    │   ├── patterns.ts
    │   └── sanitizer.ts
    ├── storage/            # IndexedDB layer
    │   ├── indexeddb.ts
    │   └── session-manager.ts
    ├── export/             # Markdown generation
    │   ├── markdown-exporter.ts
    │   └── templates.ts
    └── utils/
        ├── constants.ts
        └── debounce.ts
```

## Development

```bash
# Build once
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Clean build artifacts
npm run clean
```

## Export Format

The Markdown export includes:

- Session metadata (URL, duration, event count)
- Timeline of events with timestamps
- Semantic element descriptions (role, label, selectors)
- DOM fragments for context
- Reproduction steps for bug reports

Example:
```markdown
### 00:02.341 [ACTION] Click
User clicked **"Submit" button** (`button#submit-btn`)

### 00:02.512 [MUTATION] Element Added
New element appeared in `form#contact-form`:
```

## Security

- PII is redacted at capture time, before storage
- DOM content is sanitized with DOMPurify
- No data leaves the browser unless explicitly exported
- Sensitive domain detection warns before recording

## Permissions

- `storage` - IndexedDB for session data
- `activeTab` - Access to the current tab
- `scripting` - Inject content script
- `<all_urls>` - Record on any website

## License

Source Available - Non-Commercial

Free for personal, educational, and research use. Commercial use requires a license agreement. See [LICENSE](LICENSE) for details.
