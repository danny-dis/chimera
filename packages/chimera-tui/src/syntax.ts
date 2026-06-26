type Color = string;

export interface SyntaxToken {
  value: string;
  color: Color;
}

type LanguageRule = {
  pattern: RegExp;
  color: Color;
};

const tsKeywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|implements|interface|type|enum|import|export|from|default|as|async|await|try|catch|finally|throw|new|typeof|instanceof|in|of|void|null|undefined|true|false|this|super|static|public|private|protected|readonly|abstract|get|set|yield|delete|with|debugger)\b/;
const pyKeywords = /\b(def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|yield|lambda|and|or|not|in|is|True|False|None|self|del|global|nonlocal|assert|async|await|print)\b/;
const rustKeywords = /\b(fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|crate|self|super|where|match|if|else|for|while|loop|break|continue|return|move|ref|async|await|dyn|type|as|in|ref|static|unsafe|extern|crate|box)\b/;
const goKeywords = /\b(func|var|const|type|struct|interface|package|import|return|if|else|for|range|switch|case|default|break|continue|go|select|chan|map|make|new|defer|fallthrough|len|cap|append|copy|delete|error|true|false|nil|any)\b/;
const shellKeywords = /\b(echo|cd|ls|pwd|mkdir|rmdir|rm|cp|mv|cat|grep|sed|awk|find|sort|uniq|wc|head|tail|chmod|chown|sudo|apt|npm|pnpm|yarn|git|docker|curl|wget|tar|zip|unzip|exit|export|source|alias|if|then|else|fi|for|do|done|while|case|esac|function|in)\b/;

const jsRules: LanguageRule[] = [
  { pattern: /\/\/.*$/gm, color: 'gray' },
  { pattern: /\/\*[\s\S]*?\*\//g, color: 'gray' },
  { pattern: /`(?:\\[\s\S]|[^`])*`/g, color: 'green' },
  { pattern: /"(?:\\[\s\S]|[^"\\])*"/g, color: 'green' },
  { pattern: /'(?:\\[\s\S]|[^'\\])*'/g, color: 'green' },
  { pattern: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, color: 'yellow' },
  { pattern: tsKeywords, color: 'magenta' },
  { pattern: /\b[A-Z][a-zA-Z0-9]*\b/g, color: 'blue' },
  { pattern: /\b[a-zA-Z_]\w*(?=\s*\()/g, color: 'cyan' },
];

const pyRules: LanguageRule[] = [
  { pattern: /#.*$/gm, color: 'gray' },
  { pattern: /"""[\s\S]*?"""/g, color: 'green' },
  { pattern: /'''[\s\S]*?'''/g, color: 'green' },
  { pattern: /f"(?:\\[\s\S]|[^"\\])*"/g, color: 'green' },
  { pattern: /f'(?:\\[\s\S]|[^'\\])*'/g, color: 'green' },
  { pattern: /"(?:\\[\s\S]|[^"\\])*"/g, color: 'green' },
  { pattern: /'(?:\\[\s\S]|[^'\\])*'/g, color: 'green' },
  { pattern: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?j?\b/gi, color: 'yellow' },
  { pattern: pyKeywords, color: 'magenta' },
  { pattern: /\b[A-Z][a-zA-Z0-9]*\b/g, color: 'blue' },
  { pattern: /\b[a-zA-Z_]\w*(?=\s*\()/g, color: 'cyan' },
];

const rustRules: LanguageRule[] = [
  { pattern: /\/\/.*$/gm, color: 'gray' },
  { pattern: /\/\*[\s\S]*?\*\//g, color: 'gray' },
  { pattern: /"(?:\\[\s\S]|[^"\\])*"/g, color: 'green' },
  { pattern: /b"(?:\\[\s\S]|[^"\\])*"/g, color: 'green' },
  { pattern: /\b\d+(?:\.\d+)?(?:_\d+)*(?:f32|f64|i32|i64|u32|u64|usize|isize)?\b/g, color: 'yellow' },
  { pattern: rustKeywords, color: 'magenta' },
  { pattern: /\b[A-Z][a-zA-Z0-9]*\b/g, color: 'blue' },
  { pattern: /\b[a-zA-Z_]\w*(?=\s*[!(])/g, color: 'cyan' },
];

const goRules: LanguageRule[] = [
  { pattern: /\/\/.*$/gm, color: 'gray' },
  { pattern: /\/\*[\s\S]*?\*\//g, color: 'gray' },
  { pattern: /`[\s\S]*?`/g, color: 'green' },
  { pattern: /"(?:\\[\s\S]|[^"\\])*"/g, color: 'green' },
  { pattern: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, color: 'yellow' },
  { pattern: goKeywords, color: 'magenta' },
  { pattern: /\b[A-Z][a-zA-Z0-9]*\b/g, color: 'blue' },
  { pattern: /\b[a-zA-Z_]\w*(?=\s*\()/g, color: 'cyan' },
];

const shellRules: LanguageRule[] = [
  { pattern: /#.*$/gm, color: 'gray' },
  { pattern: /"(?:\\[\s\S]|[^"\\])*"/g, color: 'green' },
  { pattern: /'(?:\\[\s\S]|[^'\\])*'/g, color: 'green' },
  { pattern: /\$\{[^}]+\}/g, color: 'yellow' },
  { pattern: /\$\w+/g, color: 'yellow' },
  { pattern: /\b\d+\b/g, color: 'yellow' },
  { pattern: shellKeywords, color: 'magenta' },
  { pattern: /\|/g, color: 'cyan' },
  { pattern: />|>>|<|<<|&&|\|\|/g, color: 'cyan' },
];

const languageRules: Record<string, LanguageRule[]> = {
  javascript: jsRules,
  js: jsRules,
  jsx: jsRules,
  typescript: jsRules,
  ts: jsRules,
  tsx: jsRules,
  python: pyRules,
  py: pyRules,
  rust: rustRules,
  rs: rustRules,
  go: goRules,
  shell: shellRules,
  bash: shellRules,
  sh: shellRules,
  zsh: shellRules,
};

export function tokenizeCode(code: string, lang: string): SyntaxToken[] {
  if (!code) return [];

  const rules = languageRules[lang.toLowerCase()];
  if (!rules) {
    return [{ value: code, color: 'white' }];
  }

  const tokens: SyntaxToken[] = [];
  const matches: Array<{ start: number; end: number; color: Color }> = [];

  for (const rule of rules) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(code)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, color: rule.color });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number; color: Color }> = [];
  for (const m of matches) {
    if (merged.length > 0 && m.start < merged[merged.length - 1]!.end) {
      continue;
    }
    merged.push(m);
  }

  let pos = 0;
  for (const m of merged) {
    if (m.start > pos) {
      tokens.push({ value: code.slice(pos, m.start), color: 'white' });
    }
    tokens.push({ value: code.slice(m.start, m.end), color: m.color });
    pos = m.end;
  }

  if (pos < code.length) {
    tokens.push({ value: code.slice(pos), color: 'white' });
  }

  return tokens;
}
