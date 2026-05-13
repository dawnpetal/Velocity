const LuaIntelligence = (() => {
  const KEYWORDS = new Set([
    'and',
    'break',
    'do',
    'else',
    'elseif',
    'end',
    'false',
    'for',
    'function',
    'goto',
    'if',
    'in',
    'local',
    'nil',
    'not',
    'or',
    'repeat',
    'return',
    'then',
    'true',
    'until',
    'while',
  ]);
  const KNOWN_GLOBALS = new Set([
    '_G',
    'assert',
    'bit32',
    'collectgarbage',
    'coroutine',
    'debug',
    'error',
    'game',
    'getfenv',
    'getmetatable',
    'ipairs',
    'loadstring',
    'math',
    'next',
    'os',
    'pairs',
    'pcall',
    'print',
    'rawequal',
    'rawget',
    'rawlen',
    'rawset',
    'require',
    'script',
    'select',
    'setfenv',
    'setmetatable',
    'shared',
    'string',
    'table',
    'task',
    'tonumber',
    'tostring',
    'type',
    'typeof',
    'unpack',
    'warn',
    'workspace',
    'xpcall',
    'Instance',
    'Vector2',
    'Vector3',
    'CFrame',
    'Color3',
    'BrickColor',
    'UDim',
    'UDim2',
    'Rect',
    'Ray',
    'NumberRange',
    'NumberSequence',
    'NumberSequenceKeypoint',
    'ColorSequence',
    'ColorSequenceKeypoint',
    'PhysicalProperties',
    'Random',
    'DateTime',
    'Enum',
    'RaycastParams',
    'OverlapParams',
    'TweenInfo',
    'Drawing',
    'request',
    'getgenv',
    'getrenv',
    'getgc',
    'getreg',
    'readfile',
    'writefile',
    'appendfile',
    'isfile',
    'isfolder',
    'makefolder',
    'delfile',
    'delfolder',
    'identifyexecutor',
    'hookfunction',
    'hookmetamethod',
    'newcclosure',
    'getrawmetatable',
    'setrawmetatable',
    'setreadonly',
    'isreadonly',
    'getnamecallmethod',
    'getconnections',
    'firesignal',
  ]);
  const BLOCK_OPENERS = new Set(['function', 'do', 'then', 'repeat']);
  const STATEMENT_OPENERS = new Set(['if', 'for', 'while']);
  const VALUE_TYPES = {
    Vector3: {
      p: [
        ['X', 'number'],
        ['Y', 'number'],
        ['Z', 'number'],
        ['Magnitude', 'number'],
        ['Unit', 'Vector3'],
      ],
      m: [
        ['Dot', 'number', '(other: Vector3)'],
        ['Cross', 'Vector3', '(other: Vector3)'],
        ['Lerp', 'Vector3', '(goal: Vector3, alpha: number)'],
        ['FuzzyEq', 'boolean', '(other: Vector3, epsilon: number)'],
      ],
    },
    Vector2: {
      p: [
        ['X', 'number'],
        ['Y', 'number'],
        ['Magnitude', 'number'],
        ['Unit', 'Vector2'],
      ],
      m: [
        ['Dot', 'number', '(other: Vector2)'],
        ['Cross', 'number', '(other: Vector2)'],
        ['Lerp', 'Vector2', '(goal: Vector2, alpha: number)'],
        ['FuzzyEq', 'boolean', '(other: Vector2, epsilon: number)'],
      ],
    },
    CFrame: {
      p: [
        ['Position', 'Vector3'],
        ['LookVector', 'Vector3'],
        ['RightVector', 'Vector3'],
        ['UpVector', 'Vector3'],
        ['X', 'number'],
        ['Y', 'number'],
        ['Z', 'number'],
      ],
      m: [
        ['Inverse', 'CFrame', '()'],
        ['Lerp', 'CFrame', '(goal: CFrame, alpha: number)'],
        ['ToObjectSpace', 'CFrame', '(cf: CFrame)'],
        ['ToWorldSpace', 'CFrame', '(cf: CFrame)'],
        ['PointToObjectSpace', 'Vector3', '(point: Vector3)'],
        ['PointToWorldSpace', 'Vector3', '(point: Vector3)'],
        ['VectorToObjectSpace', 'Vector3', '(vector: Vector3)'],
        ['VectorToWorldSpace', 'Vector3', '(vector: Vector3)'],
      ],
    },
    Color3: {
      p: [
        ['R', 'number'],
        ['G', 'number'],
        ['B', 'number'],
      ],
      m: [
        ['Lerp', 'Color3', '(goal: Color3, alpha: number)'],
        ['ToHSV', '(number, number, number)', '()'],
        ['ToHex', 'string', '()'],
      ],
    },
    UDim2: {
      p: [
        ['X', 'UDim'],
        ['Y', 'UDim'],
      ],
      m: [['Lerp', 'UDim2', '(goal: UDim2, alpha: number)']],
    },
    UDim: {
      p: [
        ['Scale', 'number'],
        ['Offset', 'number'],
      ],
      m: [],
    },
    TweenInfo: {
      p: [
        ['Time', 'number'],
        ['EasingStyle', 'Enum.EasingStyle'],
        ['EasingDirection', 'Enum.EasingDirection'],
        ['RepeatCount', 'number'],
        ['Reverses', 'boolean'],
        ['DelayTime', 'number'],
      ],
      m: [],
    },
    Random: {
      p: [],
      m: [
        ['NextInteger', 'number', '(min: number, max: number)'],
        ['NextNumber', 'number', '(min: number?, max: number?)'],
        ['NextUnitVector', 'Vector3', '()'],
        ['Clone', 'Random', '()'],
      ],
    },
    DateTime: {
      p: [
        ['UnixTimestamp', 'number'],
        ['UnixTimestampMillis', 'number'],
      ],
      m: [
        ['ToIsoDate', 'string', '()'],
        ['ToUniversalTime', 'DateTimeParts', '()'],
        ['ToLocalTime', 'DateTimeParts', '()'],
        ['FormatUniversalTime', 'string', '(format: string, locale: string)'],
        ['FormatLocalTime', 'string', '(format: string, locale: string)'],
      ],
    },
    Drawing: {
      p: [
        ['Visible', 'boolean'],
        ['ZIndex', 'number'],
        ['Transparency', 'number'],
        ['Color', 'Color3'],
        ['Position', 'Vector2'],
        ['Size', 'number'],
        ['Radius', 'number'],
        ['Thickness', 'number'],
        ['Filled', 'boolean'],
        ['Text', 'string'],
        ['Font', 'number'],
        ['Center', 'boolean'],
        ['Outline', 'boolean'],
        ['NumSides', 'number'],
        ['Data', 'string'],
      ],
      m: [
        ['Destroy', '()', '()'],
        ['Remove', '()', '()'],
      ],
    },
  };
  const CACHE = new WeakMap();
  const MAX_INTELLIGENCE_LENGTH = 1_500_000;
  const MAX_INTELLIGENCE_LINES = 20000;
  let _monaco = null;
  let _diagTimer = null;

  function register(monaco, editorInstance) {
    _monaco = monaco;
    monaco.languages.registerCompletionItemProvider('lua', {
      triggerCharacters: ['.', ':'],
      provideCompletionItems(model, position) {
        const intelligence = analyze(model);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const context = _memberContext(model, position);
        if (context) return { suggestions: _memberSuggestions(context, range) };
        if (_isMemberAccess(model, position)) return { suggestions: [] };
        return { suggestions: _scopeSuggestions(intelligence, position, range, model) };
      },
    });

    monaco.languages.registerHoverProvider('lua', {
      provideHover(model, position) {
        const sym = symbolAt(model, position);
        if (!sym) return null;
        return {
          range: sym.range,
          contents: [
            { value: '```lua\n' + _symbolSignature(sym) + '\n```' },
            { value: sym.detail || _symbolDoc(sym) },
          ],
        };
      },
    });

    monaco.languages.registerDefinitionProvider('lua', {
      provideDefinition(model, position) {
        const sym = symbolAt(model, position);
        if (!sym) return null;
        return {
          uri: model.uri,
          range: sym.range,
        };
      },
    });

    monaco.languages.registerReferenceProvider('lua', {
      provideReferences(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return [];
        const sym = symbolAt(model, position);
        if (!sym && !KNOWN_GLOBALS.has(word.word)) return [];
        return sym ? _symbolLocations(model, sym) : _wordLocations(model, word.word);
      },
    });

    monaco.languages.registerRenameProvider?.('lua', {
      prepareRename(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word || KEYWORDS.has(word.word) || KNOWN_GLOBALS.has(word.word))
          throw new Error('This symbol cannot be renamed.');
        const sym = symbolAt(model, position);
        if (!sym) throw new Error('No renameable symbol found.');
        return sym.range;
      },
      provideRenameEdits(model, position, newName) {
        if (!/^[A-Za-z_]\w*$/.test(newName) || KEYWORDS.has(newName))
          return { edits: [], rejectReason: 'Invalid Luau identifier.' };
        const word = model.getWordAtPosition(position);
        const sym = word ? symbolAt(model, position) : null;
        if (!word || !sym || KEYWORDS.has(word.word) || KNOWN_GLOBALS.has(word.word))
          return { edits: [], rejectReason: 'No renameable symbol found.' };
        return {
          edits: _symbolLocations(model, sym).map((loc) => ({
            resource: model.uri,
            edit: { range: loc.range, text: newName },
          })),
        };
      },
    });

    monaco.languages.registerDocumentHighlightProvider('lua', {
      provideDocumentHighlights(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return [];
        return _wordLocations(model, word.word).map((loc) => ({
          range: loc.range,
          kind: monaco.languages.DocumentHighlightKind.Text,
        }));
      },
    });

    monaco.languages.registerFoldingRangeProvider('lua', {
      provideFoldingRanges(model) {
        return analyze(model).folds;
      },
    });

    monaco.languages.registerCodeActionProvider('lua', {
      provideCodeActions(model, range) {
        const line = model.getLineContent(range.startLineNumber);
        const actions = [];
        const fixes = [
          ['wait', 'task.wait'],
          ['spawn', 'task.spawn'],
          ['delay', 'task.delay'],
        ];
        for (const [oldName, newName] of fixes) {
          const re = new RegExp('\\b' + oldName + '\\s*\\(');
          const m = line.match(re);
          if (!m) continue;
          const col = line.indexOf(oldName) + 1;
          actions.push({
            title: `Replace ${oldName} with ${newName}`,
            kind: 'quickfix',
            diagnostics: [],
            edit: {
              edits: [
                {
                  resource: model.uri,
                  edit: {
                    range: new monaco.Range(
                      range.startLineNumber,
                      col,
                      range.startLineNumber,
                      col + oldName.length,
                    ),
                    text: newName,
                  },
                },
              ],
            },
          });
        }
        return { actions, dispose() {} };
      },
    });

    for (const model of monaco.editor.getModels()) _wireModel(model);
    monaco.editor.onDidCreateModel(_wireModel);
    editorInstance?.onDidChangeModel(() => _scheduleDiagnostics(editorInstance.getModel()));
    _scheduleDiagnostics(editorInstance?.getModel?.());
  }

  function _wireModel(model) {
    if (model.getLanguageId() !== 'lua') return;
    _scheduleDiagnostics(model);
    model.onDidChangeContent(() => _scheduleDiagnostics(model));
  }

  function _scheduleDiagnostics(model) {
    clearTimeout(_diagTimer);
    _diagTimer = setTimeout(() => {
      if (!model || model.isDisposed?.() || model.getLanguageId() !== 'lua') return;
      if (_isHeavyModel(model)) {
        _monaco.editor.setModelMarkers(model, 'velocityui-luau', []);
        return;
      }
      const info = analyze(model, true);
      _monaco.editor.setModelMarkers(model, 'velocityui-luau', info.markers);
    }, 220);
  }

  function analyze(model, force = false) {
    if (!model || _isHeavyModel(model)) return _emptyInfo();
    const cached = CACHE.get(model);
    const version = model.getVersionId();
    if (!force && cached?.version === version) return cached.info;
    const text = model.getValue();
    const stripped = strip(text);
    const lines = stripped.split('\n');
    const symbols = [];
    const byName = new Map();
    const tableMembers = new Map();
    const objectMembers = new Map();
    const folds = [];
    const markers = [];
    _collectSymbols(model, stripped, symbols, byName);
    _collectTableMembers(model, text, stripped, tableMembers);
    _collectObjectMembers(model, stripped, objectMembers);
    _collectDocClassMembers(model, text, objectMembers);
    _collectFolds(model, lines, folds, markers);
    _collectDiagnostics(model, stripped, lines, symbols, byName, markers);
    const info = { symbols, byName, tableMembers, objectMembers, folds, markers };
    CACHE.set(model, { version, info });
    return info;
  }

  function _emptyInfo() {
    return {
      symbols: [],
      byName: new Map(),
      tableMembers: new Map(),
      objectMembers: new Map(),
      folds: [],
      markers: [],
    };
  }

  function _isHeavyModel(model) {
    if (!model || model.isDisposed?.()) return true;
    const length = Number(model.getValueLength?.() ?? 0);
    return length > MAX_INTELLIGENCE_LENGTH || model.getLineCount() > MAX_INTELLIGENCE_LINES;
  }

  function strip(text) {
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '-' && next === '-') {
        if (text.slice(i + 2, i + 4) === '[[') {
          out += '    ';
          i += 4;
          while (i < text.length && text.slice(i, i + 2) !== ']]') {
            out += text[i] === '\n' ? '\n' : ' ';
            i++;
          }
          if (i < text.length) {
            out += '  ';
            i++;
          }
        } else {
          out += '  ';
          i += 2;
          while (i < text.length && text[i] !== '\n') {
            out += ' ';
            i++;
          }
          if (i < text.length) out += '\n';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        out += ' ';
        i++;
        while (i < text.length) {
          if (text[i] === '\\') {
            out += ' ';
            i++;
            if (i < text.length) out += text[i] === '\n' ? '\n' : ' ';
          } else if (text[i] === quote) {
            out += ' ';
            break;
          } else {
            out += text[i] === '\n' ? '\n' : ' ';
          }
          i++;
        }
        continue;
      }
      if (text.slice(i, i + 2) === '[[') {
        out += '  ';
        i += 2;
        while (i < text.length && text.slice(i, i + 2) !== ']]') {
          out += text[i] === '\n' ? '\n' : ' ';
          i++;
        }
        if (i < text.length) {
          out += '  ';
          i++;
        }
        continue;
      }
      out += ch;
    }
    return out;
  }

  function _collectSymbols(model, stripped, symbols, byName) {
    const patterns = [
      { re: /\blocal\s+function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g, kind: 'function', local: true },
      { re: /\bfunction\s+([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*\(([^)]*)\)/g, kind: 'function' },
      {
        re: /\blocal\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?::\s*([A-Za-z_]\w*))?\s*(?:=|$)/g,
        kind: 'variable',
        local: true,
      },
      {
        re: /\bfor\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?:=|in)\b/g,
        kind: 'variable',
        local: true,
      },
    ];
    for (const pat of patterns) {
      let match;
      while ((match = pat.re.exec(stripped))) {
        if (pat.kind === 'variable') {
          const names = match[1]
            .split(',')
            .map((n) => n.trim())
            .filter(Boolean);
          for (const name of names)
            _pushSymbol(
              model,
              stripped,
              symbols,
              byName,
              name,
              match.index + match[0].indexOf(name),
              pat.kind,
              match[2] || '',
              pat.local,
            );
        } else {
          _pushSymbol(
            model,
            stripped,
            symbols,
            byName,
            match[1],
            match.index + match[0].indexOf(match[1]),
            pat.kind,
            match[2] || '',
            pat.local,
          );
          const params = (match[2] || '')
            .split(',')
            .map((p) => p.trim().replace(/:.*/, ''))
            .filter(Boolean);
          const bodyStart = model.getPositionAt(match.index).lineNumber;
          for (const param of params)
            if (param !== '...')
              _pushSymbol(
                model,
                stripped,
                symbols,
                byName,
                param,
                match.index + match[0].lastIndexOf(param),
                'parameter',
                '',
                true,
                bodyStart,
              );
        }
      }
    }
  }

  function _pushSymbol(
    model,
    stripped,
    symbols,
    byName,
    name,
    offset,
    kind,
    detail = '',
    local = false,
    scopeLine = null,
  ) {
    if (!name || KEYWORDS.has(name)) return;
    const pos = model.getPositionAt(offset);
    const range = new _monaco.Range(
      pos.lineNumber,
      pos.column,
      pos.lineNumber,
      pos.column + name.length,
    );
    const symbol = {
      name,
      kind,
      detail,
      local,
      range,
      line: pos.lineNumber,
      offset,
      scopeLine: scopeLine ?? pos.lineNumber,
    };
    symbols.push(symbol);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(symbol);
  }

  function _collectTableMembers(model, text, stripped, tableMembers) {
    const re = /(?:^|[^.:A-Za-z0-9_])(?:local\s+)?([A-Za-z_]\w*)\s*=\s*\{/g;
    let match;
    while ((match = re.exec(stripped))) {
      const name = match[1];
      if (KEYWORDS.has(name)) continue;
      const brace = match.index + match[0].lastIndexOf('{');
      const close = _findMatchingBrace(stripped, brace);
      if (close < 0) continue;
      const members = _parseTableFields(
        text.slice(brace + 1, close),
        stripped.slice(brace + 1, close),
        model,
        brace + 1,
      );
      if (members.length) {
        const offset = match.index + match[0].indexOf(name);
        if (!tableMembers.has(name)) tableMembers.set(name, []);
        tableMembers.get(name).push({
          members,
          offset,
          closeOffset: close,
          line: model.getPositionAt(offset).lineNumber,
        });
      }
      re.lastIndex = close + 1;
    }
  }

  function _collectObjectMembers(model, stripped, objectMembers) {
    const assignmentRe =
      /(?:^|[^A-Za-z0-9_])([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*=\s*([^\n;]*)/g;
    let match;
    while ((match = assignmentRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      const name = match[3];
      if (!owner || KEYWORDS.has(owner) || KEYWORDS.has(name)) continue;
      if (/^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const propOffset = match.index + match[0].lastIndexOf(name);
      const pos = model.getPositionAt(propOffset);
      const member = {
        name,
        offset: propOffset,
        detail: _tableFieldDetail((match[4] || '').trim()),
        isMethod: match[2] === ':',
        range: new _monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + name.length,
        ),
      };
      if (!objectMembers.has(owner)) objectMembers.set(owner, []);
      objectMembers.get(owner).push(member);
    }

    const functionRe =
      /(?:^|[^A-Za-z0-9_])function\s+([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
    while ((match = functionRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      const name = match[3];
      if (!owner || KEYWORDS.has(owner) || KEYWORDS.has(name)) continue;
      if (/^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const nameOffset = match.index + match[0].lastIndexOf(name);
      const pos = model.getPositionAt(nameOffset);
      const member = {
        name,
        offset: nameOffset,
        detail: 'function',
        isMethod: match[2] === ':',
        signature: `(${match[4] || ''})`,
        range: new _monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + name.length,
        ),
      };
      if (!objectMembers.has(owner)) objectMembers.set(owner, []);
      objectMembers.get(owner).push(member);
    }
  }

  function _collectDocClassMembers(model, text, objectMembers) {
    const lines = text.split('\n');
    let currentClass = null;
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cls = line.match(/^\s*---\s*@class\s+([A-Za-z_]\w*)/);
      if (cls) currentClass = cls[1];
      const field = line.match(/^\s*---\s*@field\s+([A-Za-z_]\w*)\s*([^\s]+)?/);
      if (currentClass && field) {
        const name = field[1];
        const fieldOffset = offset + line.indexOf(name);
        const pos = model.getPositionAt(fieldOffset);
        if (!objectMembers.has(currentClass)) objectMembers.set(currentClass, []);
        objectMembers.get(currentClass).push({
          name,
          offset: fieldOffset,
          detail: field[2] || 'field',
          isMethod: /^fun\(/.test(field[2] || ''),
          range: new _monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column + name.length,
          ),
        });
      }
      if (line.trim() && !line.trim().startsWith('---')) currentClass = null;
      offset += line.length + 1;
    }
  }

  function _findMatchingBrace(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function _parseTableFields(body, strippedBody, model, baseOffset) {
    const members = [];
    const seen = new Set();
    let start = 0;
    let depth = 0;
    for (let i = 0; i <= strippedBody.length; i++) {
      const ch = strippedBody[i] || ',';
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';' || i === strippedBody.length) && depth === 0) {
        const member = _tableField(
          body.slice(start, i),
          strippedBody.slice(start, i),
          model,
          baseOffset + start,
        );
        if (member && !seen.has(member.name)) {
          seen.add(member.name);
          members.push(member);
        }
        start = i + 1;
      }
    }
    return members;
  }

  function _tableField(segment, strippedSegment, model, offset) {
    const trimmed = strippedSegment.trimStart();
    const leading = strippedSegment.length - trimmed.length;
    const key =
      trimmed.match(/^([A-Za-z_]\w*)\s*=/) ||
      segment.trimStart().match(/^\[\s*["']([A-Za-z_]\w*)["']\s*\]\s*=/);
    if (!key || KEYWORDS.has(key[1])) return null;
    const name = key[1];
    const nameIndex = segment.indexOf(name);
    const fieldOffset = offset + (nameIndex >= 0 ? nameIndex : leading);
    const pos = model.getPositionAt(fieldOffset);
    const value = segment.slice(segment.indexOf('=') + 1).trim();
    return {
      name,
      offset: fieldOffset,
      detail: _tableFieldDetail(value),
      range: new _monaco.Range(
        pos.lineNumber,
        pos.column,
        pos.lineNumber,
        pos.column + name.length,
      ),
    };
  }

  function _tableFieldDetail(value) {
    if (!value) return 'table field';
    const instance = value.match(/Instance\.new\(\s*["'](\w+)["']/);
    if (instance) return instance[1];
    const ctor = value.match(/^([A-Z][A-Za-z0-9_]*)\s*(?:[.:]\s*new|\.)/);
    if (ctor) return ctor[1];
    if (/^function\b/.test(value)) return 'function';
    if (/^\{/.test(value)) return 'table';
    if (/^["']/.test(value)) return 'string';
    if (/^\d/.test(value)) return 'number';
    if (/^(true|false)\b/.test(value)) return 'boolean';
    return 'table field';
  }

  function _collectFolds(model, lines, folds, markers) {
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) continue;
      const first = line.match(/^[A-Za-z_]+/)?.[0];
      if (line.includes('--[[')) stack.push({ token: 'comment', line: i + 1 });
      if (STATEMENT_OPENERS.has(first) && /\b(do|then)\b/.test(line))
        stack.push({ token: first, line: i + 1 });
      else if (BLOCK_OPENERS.has(first)) stack.push({ token: first, line: i + 1 });
      else if (/\bfunction\b/.test(line) && !/^end\b/.test(line))
        stack.push({ token: 'function', line: i + 1 });
      if (/\bend\b/.test(line))
        _closeFold(
          model,
          folds,
          markers,
          stack,
          i + 1,
          new Set(['function', 'do', 'then', 'if', 'for', 'while']),
        );
      if (/\buntil\b/.test(line))
        _closeFold(model, folds, markers, stack, i + 1, new Set(['repeat']));
      if (line.includes(']]'))
        _closeFold(
          model,
          folds,
          markers,
          stack,
          i + 1,
          new Set(['comment']),
          _monaco.languages.FoldingRangeKind.Comment,
        );
    }
    for (const item of stack) {
      if (item.token === 'comment') continue;
      markers.push(
        _marker(
          model,
          item.line,
          1,
          item.line,
          model.getLineMaxColumn(item.line),
          `Missing closing '${item.token === 'repeat' ? 'until' : 'end'}'`,
          _monaco.MarkerSeverity.Warning,
        ),
      );
    }
  }

  function _closeFold(model, folds, markers, stack, endLine, accepted, kind = undefined) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const item = stack.pop();
      if (!item) break;
      if (accepted.has(item.token)) {
        if (endLine > item.line) folds.push({ start: item.line, end: endLine, kind });
        return;
      }
    }
    markers.push(
      _marker(
        model,
        endLine,
        1,
        endLine,
        model.getLineMaxColumn(endLine),
        'Unmatched block closer',
        _monaco.MarkerSeverity.Warning,
      ),
    );
  }

  function _collectDiagnostics(model, stripped, lines, symbols, byName, markers) {
    _bracketDiagnostics(model, stripped, markers);
    _modernLuauHints(model, stripped, markers);
    if (model.getLineCount() > 8000) return;
    const declared = new Set([...KNOWN_GLOBALS, ...byName.keys()]);
    const seenUnknown = new Set();
    const re = /\b([A-Za-z_]\w*)\b/g;
    let match;
    while ((match = re.exec(stripped))) {
      const name = match[1];
      if (declared.has(name) || KEYWORDS.has(name) || seenUnknown.has(name)) continue;
      const prev = stripped[match.index - 1];
      const next = stripped[match.index + name.length];
      if (prev === '.' || prev === ':' || next === ':' || /^[A-Z]/.test(name)) continue;
      const pos = model.getPositionAt(match.index);
      const line = lines[pos.lineNumber - 1] ?? '';
      if (/^\s*(local|function|for)\b/.test(line)) continue;
      if (!/\b[A-Za-z_]\w*\s*[=(]/.test(line)) continue;
      seenUnknown.add(name);
      markers.push(
        _marker(
          model,
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + name.length,
          `Unknown identifier '${name}'`,
          _monaco.MarkerSeverity.Hint,
        ),
      );
      if (seenUnknown.size > 80) break;
    }
  }

  function _bracketDiagnostics(model, stripped, markers) {
    const pairs = { '(': ')', '[': ']', '{': '}' };
    const closers = new Set(Object.values(pairs));
    const stack = [];
    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i];
      if (pairs[ch]) {
        stack.push({ ch, offset: i });
      } else if (closers.has(ch)) {
        const top = stack.pop();
        if (!top || pairs[top.ch] !== ch) {
          const pos = model.getPositionAt(i);
          markers.push(
            _marker(
              model,
              pos.lineNumber,
              pos.column,
              pos.lineNumber,
              pos.column + 1,
              `Unmatched '${ch}'`,
              _monaco.MarkerSeverity.Warning,
            ),
          );
        }
      }
    }
    for (const item of stack.slice(-20)) {
      const pos = model.getPositionAt(item.offset);
      markers.push(
        _marker(
          model,
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + 1,
          `Missing '${pairs[item.ch]}'`,
          _monaco.MarkerSeverity.Warning,
        ),
      );
    }
  }

  function _modernLuauHints(model, stripped, markers) {
    const hints = [
      ['wait', 'Prefer task.wait for scheduler consistency.'],
      ['spawn', 'Prefer task.spawn for scheduler consistency.'],
      ['delay', 'Prefer task.delay for scheduler consistency.'],
    ];
    for (const [name, message] of hints) {
      const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
      let match;
      while ((match = re.exec(stripped))) {
        const pos = model.getPositionAt(match.index);
        markers.push(
          _marker(
            model,
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column + name.length,
            message,
            _monaco.MarkerSeverity.Hint,
          ),
        );
      }
    }
  }

  function _marker(
    model,
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn,
    message,
    severity,
  ) {
    return {
      severity,
      message,
      source: 'VelocityUI Luau',
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
    };
  }

  function _scopeSuggestions(info, position, range, model = null) {
    const K = _monaco.languages.CompletionItemKind;
    const localLine = position.lineNumber;
    const cursorOffset = _positionOffset(model, position);
    const suggestions = [];
    const seen = new Set();
    const ordered = [...info.symbols].sort(
      (a, b) => Math.abs(a.line - localLine) - Math.abs(b.line - localLine),
    );
    for (const sym of ordered) {
      if (seen.has(sym.name) || sym.offset >= cursorOffset || sym.line > localLine + 200) continue;
      seen.add(sym.name);
      suggestions.push({
        label: sym.name,
        kind:
          sym.kind === 'function' ? K.Function : sym.kind === 'parameter' ? K.Variable : K.Variable,
        detail: _symbolSignature(sym),
        documentation: { value: _symbolDoc(sym) },
        insertText: sym.kind === 'function' ? `${sym.name}($0)` : sym.name,
        insertTextRules:
          sym.kind === 'function'
            ? _monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
        sortText: (sym.local ? '0_' : '1_') + sym.name,
        range,
      });
    }
    return suggestions;
  }

  function _memberContext(model, position) {
    const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    const match = line.match(/([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*([.:])\s*\w*$/);
    if (!match) return null;
    const tableMembers = _resolveTableMembers(match[1], model, position);
    const objectMembers = _resolveObjectMembers(match[1], model, position);
    const localMembers = _mergeLocalMembers(tableMembers, objectMembers);
    if (localMembers.length)
      return {
        kind: 'object',
        tableName: match[1],
        members: localMembers,
        sep: match[2],
      };
    const valueType = _resolveValueType(match[1], model, position.lineNumber);
    if (valueType) return { kind: 'value', typeName: valueType, sep: match[2] };
    const className = _resolveType(match[1], model, position.lineNumber);
    return className ? { kind: 'class', className, sep: match[2] } : null;
  }

  function _mergeLocalMembers(...groups) {
    const byName = new Map();
    for (const group of groups) {
      for (const member of group || []) {
        if (!member?.name) continue;
        byName.set(member.name, member);
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function _isMemberAccess(model, position) {
    const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    return /[A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*\s*[.:]\s*\w*$/.test(line);
  }

  function _memberSuggestions(context, range) {
    const K = _monaco.languages.CompletionItemKind;
    if (context.kind === 'table') {
      return _dedupeSuggestions(
        context.members.map((member) => ({
          label: member.name,
          kind: member.detail === 'function' ? K.Function : K.Property,
          detail: member.detail || `field of ${context.tableName}`,
          documentation: { value: `Field from ${context.tableName}.` },
          insertText: member.name,
          range,
          sortText: '0_' + member.name,
        })),
      );
    }
    if (context.kind === 'object') {
      return _dedupeSuggestions(
        context.members
          .filter((member) => context.sep !== ':' || _isCallableMember(member))
          .map((member) => ({
            label: member.name,
            kind: _isCallableMember(member)
              ? member.isMethod
                ? K.Method
                : K.Function
              : K.Property,
            detail: member.signature || member.detail || `member of ${context.tableName}`,
            documentation: { value: `Assigned on line ${member.range.startLineNumber}.` },
            insertText: member.name,
            range,
            sortText:
              (context.sep === ':' && member.isMethod
                ? '0_'
                : context.sep === ':' && _isCallableMember(member)
                  ? '1_'
                  : _isCallableMember(member)
                    ? '1_'
                    : '0_') + member.name,
          })),
      );
    }
    if (context.kind === 'value') return _valueTypeSuggestions(context, range);
    if (typeof RobloxAPI === 'undefined') return [];
    const cls = RobloxAPI.getClass(context.className);
    if (!cls) return [];

    const InsertAsSnippet = _monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
    const suggestions = [];
    if (context.sep === '.') {
      for (const [name, type] of cls.p)
        suggestions.push({
          label: name,
          kind: K.Property,
          detail: type,
          insertText: name,
          range,
          sortText: '0_' + name,
        });
      for (const [name, sig] of cls.e)
        suggestions.push({
          label: name,
          kind: K.Event,
          detail: 'RBXScriptSignal ' + sig,
          insertText: name,
          range,
          sortText: '2_' + name,
        });
    }
    for (const [name, ret, args] of cls.m) {
      suggestions.push({
        label: name,
        kind: K.Method,
        detail: `${args || '()'} -> ${ret}`,
        insertText: args ? `${name}(${_snippetArgs(args)})` : `${name}()`,
        insertTextRules: args ? InsertAsSnippet : undefined,
        range,
        sortText: '1_' + name,
      });
    }
    return _dedupeSuggestions(suggestions);
  }

  function _dedupeSuggestions(suggestions) {
    const seen = new Set();
    return suggestions.filter((item) => {
      const key = String(item.label ?? item.insertText ?? '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function _isCallableMember(member) {
    return member?.detail === 'function' || member?.isMethod || /^fun\(/.test(member?.detail || '');
  }

  function symbolAt(model, position) {
    const word = model.getWordAtPosition(position);
    if (!word) return null;
    const candidates = analyze(model).byName.get(word.word) ?? [];
    if (!candidates.length) return null;
    const cursorOffset = _positionOffset(model, position);
    return candidates.filter((sym) => sym.offset <= cursorOffset).at(-1) ?? null;
  }

  function _wordLocations(model, word) {
    const stripped = strip(model.getValue());
    const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
    const locations = [];
    let match;
    while ((match = re.exec(stripped))) {
      const pos = model.getPositionAt(match.index);
      locations.push({
        uri: model.uri,
        range: new _monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + word.length,
        ),
      });
      if (locations.length > 500) break;
    }
    return locations;
  }

  function _symbolLocations(model, sym) {
    const candidates = analyze(model).byName.get(sym.name) ?? [];
    const next = candidates
      .filter((candidate) => candidate.offset > sym.offset)
      .sort((a, b) => a.offset - b.offset)[0];
    const endOffset = next?.offset ?? Number.POSITIVE_INFINITY;
    return _wordLocations(model, sym.name).filter((loc) => {
      const offset = _positionOffset(model, {
        lineNumber: loc.range.startLineNumber,
        column: loc.range.startColumn,
      });
      return offset >= sym.offset && offset < endOffset;
    });
  }

  function _symbolSignature(sym) {
    if (sym.kind === 'function')
      return `${sym.local ? 'local ' : ''}function ${sym.name}(${sym.detail || ''})`;
    if (sym.kind === 'parameter') return `${sym.name}: parameter`;
    return `${sym.local ? 'local ' : ''}${sym.name}${sym.detail ? ': ' + sym.detail : ''}`;
  }

  function _symbolDoc(sym) {
    if (sym.kind === 'function') return `Defined on line ${sym.line}.`;
    if (sym.kind === 'parameter') return `Function parameter near line ${sym.scopeLine}.`;
    return `Defined on line ${sym.line}.`;
  }

  function _valueTypeSuggestions(context, range) {
    const type = VALUE_TYPES[context.typeName];
    if (!type) return [];
    const K = _monaco.languages.CompletionItemKind;
    const InsertAsSnippet = _monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
    const suggestions = [];
    if (context.sep === '.') {
      for (const [name, detail] of type.p)
        suggestions.push({
          label: name,
          kind: K.Property,
          detail,
          insertText: name,
          range,
          sortText: '0_' + name,
        });
    }
    for (const [name, ret, args] of type.m) {
      suggestions.push({
        label: name,
        kind: K.Method,
        detail: `${args || '()'} -> ${ret}`,
        insertText: args && args !== '()' ? `${name}(${_snippetArgs(args)})` : `${name}()`,
        insertTextRules: args && args !== '()' ? InsertAsSnippet : undefined,
        range,
        sortText: '1_' + name,
      });
    }
    return _dedupeSuggestions(suggestions);
  }

  function _resolveValueType(expr, model, lineNumber, depth = 0) {
    if (!expr || depth > 4) return null;
    const value = expr.trim();
    const directCtor = value.match(
      /^([A-Za-z_]\w*)\s*[.:]\s*(?:new|from\w+|Angles|lookAt|now|palette|random)\s*\(/,
    );
    if (directCtor && VALUE_TYPES[directCtor[1]]) return directCtor[1];
    if (/^Drawing\s*\.\s*new\s*\(/.test(value)) return 'Drawing';
    const local = _resolveLocalValueType(value, model, lineNumber, depth);
    if (local) return local;
    return null;
  }

  function _resolveLocalValueType(name, model, lineNumber, depth) {
    if (!/^[A-Za-z_]\w*$/.test(name)) return null;
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let lineNo = lineNumber; lineNo >= Math.max(1, lineNumber - 240); lineNo--) {
      const line = model.getLineContent(lineNo);
      const annotation = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*:\\s*([A-Za-z_]\\w*)'),
      );
      if (annotation && VALUE_TYPES[annotation[1]]) return annotation[1];
      const ctor = line.match(
        new RegExp(
          '(?:local\\s+)?' +
            safe +
            '\\s*=\\s*([A-Za-z_]\\w*)\\s*[.:]\\s*(?:new|from\\w+|Angles|lookAt|now|palette|random)\\s*\\(',
        ),
      );
      if (ctor && VALUE_TYPES[ctor[1]]) return ctor[1];
      const drawing = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*Drawing\\s*\\.\\s*new\\s*\\('),
      );
      if (drawing) return 'Drawing';
      const alias = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*([A-Za-z_]\\w*)\\b'));
      if (!alias || alias[1] === name) continue;
      const resolved = _resolveValueType(alias[1], model, lineNo, depth + 1);
      if (resolved) return resolved;
    }
    return null;
  }

  function _resolveTableMembers(expr, model, position, depth = 0) {
    if (!expr || depth > 4) return null;
    const value = expr.trim();
    if (!/^[A-Za-z_]\w*$/.test(value)) return null;
    const info = analyze(model);
    const cursorOffset = _positionOffset(model, position);
    const direct = _latestTableRecord(info.tableMembers.get(value), cursorOffset);
    if (direct) {
      const members = direct.members.filter(
        (member) => direct.closeOffset < cursorOffset || member.offset < cursorOffset,
      );
      return members.length ? members : null;
    }
    const safe = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (
      let lineNo = position.lineNumber;
      lineNo >= Math.max(1, position.lineNumber - 240);
      lineNo--
    ) {
      const raw = model.getLineContent(lineNo);
      const line =
        lineNo === position.lineNumber ? raw.slice(0, Math.max(0, position.column - 1)) : raw;
      const alias = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*([A-Za-z_]\\w*)\\b'));
      if (!alias || alias[1] === value) continue;
      const resolved = _resolveTableMembers(
        alias[1],
        model,
        { lineNumber: lineNo, column: line.length + 1 },
        depth + 1,
      );
      if (resolved) return resolved;
    }
    return null;
  }

  function _resolveObjectMembers(expr, model, position, depth = 0) {
    if (!expr || depth > 4) return null;
    const value = expr.trim().replace(/\s*([.:])\s*/g, '$1');
    const info = analyze(model);
    const cursorOffset = _positionOffset(model, position);
    const direct = _visibleObjectMembers(info.objectMembers.get(value), cursorOffset);
    if (direct.length) return direct;
    const constructed = _constructedObjectOwner(value);
    if (constructed && constructed !== value) {
      const members = _resolveObjectMembers(constructed, model, position, depth + 1);
      if (members?.length) return members;
    }
    if (!/^[A-Za-z_]\w*$/.test(value)) return null;
    const safe = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (
      let lineNo = position.lineNumber;
      lineNo >= Math.max(1, position.lineNumber - 240);
      lineNo--
    ) {
      const raw = model.getLineContent(lineNo);
      const line =
        lineNo === position.lineNumber ? raw.slice(0, Math.max(0, position.column - 1)) : raw;
      const alias = line.match(
        new RegExp(
          '(?:local\\s+)?' +
            safe +
            '\\s*=\\s*([A-Za-z_]\\w*(?:\\s*[.:]\\s*[A-Za-z_]\\w*)*(?:\\s*\\([^\\n)]*\\))?|setmetatable\\s*\\([^\\n)]*\\))',
        ),
      );
      if (!alias || alias[1] === value) continue;
      const target = _constructedObjectOwner(alias[1]) || alias[1];
      const resolved = _resolveObjectMembers(
        target,
        model,
        { lineNumber: lineNo, column: line.length + 1 },
        depth + 1,
      );
      if (resolved?.length) return resolved;
    }
    return null;
  }

  function _constructedObjectOwner(expr) {
    const value = expr.trim().replace(/\s*([.:])\s*/g, '$1');
    const setmeta = value.match(/setmetatable\s*\([^,]+,\s*([A-Za-z_]\w*)\s*\)/);
    if (setmeta) return setmeta[1];
    const ctor = value.match(/^([A-Za-z_]\w*)[.:](?:new|create|init|New|Create)\s*(?:\(|$)/);
    if (ctor) return ctor[1];
    return null;
  }

  function _visibleObjectMembers(records, cursorOffset) {
    if (!records?.length) return [];
    const byName = new Map();
    for (const member of records) {
      if (member.offset < cursorOffset) byName.set(member.name, member);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function _latestTableRecord(records, cursorOffset) {
    if (!records?.length) return null;
    return (
      records
        .filter((record) => record.offset < cursorOffset)
        .sort((a, b) => b.offset - a.offset)[0] || null
    );
  }

  function _resolveType(expr, model, lineNumber, depth = 0) {
    if (!expr || depth > 6 || typeof RobloxAPI === 'undefined') return null;
    const value = expr.trim();
    const global = RobloxAPI.resolveGlobal(value);
    if (global) return global;
    const instance = value.match(/Instance\.new\(\s*["'](\w+)["']/);
    if (instance) return instance[1];
    const service = value.match(/(?:game|Game)\s*:\s*GetService\(\s*["'](\w+)["']/);
    if (service) return RobloxAPI.resolveService(service[1]) || service[1];
    const gameDot = value.match(/(?:game|Game)\.(\w+)$/);
    if (gameDot) return RobloxAPI.resolveService(gameDot[1]);
    const local = _resolveLocalType(value, model, lineNumber);
    if (local) return local;
    const chain = value.match(/^(.+?)[.:](\w+)(?:\([^)]*\))?$/);
    if (!chain) return null;
    const lhs = _resolveType(chain[1], model, lineNumber, depth + 1);
    const cls = lhs ? RobloxAPI.getClass(lhs) : null;
    if (!cls) return null;
    const method = cls.m.find((m) => m[0] === chain[2]);
    if (method) return _cleanType(method[1]);
    const prop = cls.p.find((p) => p[0] === chain[2]);
    if (prop) return _cleanType(prop[1]);
    return null;
  }

  function _resolveLocalType(name, model, lineNumber) {
    if (!/^[A-Za-z_]\w*$/.test(name) || typeof RobloxAPI === 'undefined') return null;
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let lineNo = lineNumber; lineNo >= Math.max(1, lineNumber - 240); lineNo--) {
      const line = model.getLineContent(lineNo);
      const annotation = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*:\\s*(\\w+)'));
      if (annotation && RobloxAPI.getClass(annotation[1])) return annotation[1];
      const instance = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*Instance\\.new\\(["\'](\\w+)["\']'),
      );
      if (instance) return instance[1];
      const service = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*game\\s*:\\s*GetService\\(["\'](\\w+)["\']'),
      );
      if (service) return RobloxAPI.resolveService(service[1]) || service[1];
      const global = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*(game|workspace|script)\\b'),
      );
      if (global) return RobloxAPI.resolveGlobal(global[1]);
      const gameDot = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*game\\.(\\w+)'));
      if (gameDot) return RobloxAPI.resolveService(gameDot[1]);
    }
    return null;
  }

  function _cleanType(type) {
    if (!type || type.startsWith('(')) return null;
    const clean = type.replace(/[?{}]/g, '').trim();
    if (typeof RobloxAPI !== 'undefined' && RobloxAPI.getClass(clean)) return clean;
    return clean === 'Instance' ? 'Instance' : null;
  }

  function _snippetArgs(args) {
    const inner = args.replace(/^\(|\)$/g, '').trim();
    if (!inner) return '';
    return inner
      .split(',')
      .map(
        (param, index) =>
          '${' + (index + 1) + ':' + param.trim().split(':')[0].replace(/[?]/g, '').trim() + '}',
      )
      .join(', ');
  }

  function _lineOffsets(text) {
    const offsets = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') offsets.push(i + 1);
    return offsets;
  }

  function _positionOffset(model, position, text = null) {
    if (model?.getOffsetAt) return model.getOffsetAt(position);
    const value = text ?? model?.getValue?.() ?? '';
    let line = 1;
    let column = 1;
    for (let i = 0; i < value.length; i++) {
      if (line === position.lineNumber && column === position.column) return i;
      if (value[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return value.length;
  }

  return { register, analyze };
})();
