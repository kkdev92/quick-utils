// @ts-check

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const patternInput = /** @type {HTMLInputElement} */ (document.getElementById('pattern'));
  const flagsInput = /** @type {HTMLInputElement} */ (document.getElementById('flags'));
  const inputTextarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('input'));
  const resultsDiv = /** @type {HTMLDivElement} */ (document.getElementById('results'));
  const errorDiv = /** @type {HTMLDivElement} */ (document.getElementById('error'));
  const noMatchDiv = /** @type {HTMLDivElement} */ (document.getElementById('noMatch'));
  const highlightedDiv = /** @type {HTMLDivElement} */ (document.getElementById('highlighted'));
  const matchCountSpan = /** @type {HTMLSpanElement} */ (document.getElementById('matchCount'));

  // Restore previous state
  const previousState = vscode.getState();
  if (previousState) {
    patternInput.value = previousState.pattern || '';
    flagsInput.value = previousState.flags || '';
    inputTextarea.value = previousState.input || '';
  }

  // Debounce function
  /**
   * @template {(...args: any[]) => void} T
   * @param {T} fn
   * @param {number} delay
   * @returns {T}
   */
  function debounce(fn, delay) {
    let timeoutId;
    // @ts-ignore
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Send test request to extension
  function sendTestRequest() {
    const pattern = patternInput.value;
    const flags = flagsInput.value;
    const input = inputTextarea.value;

    // Save state
    vscode.setState({ pattern, flags, input });

    // Clear results when pattern is empty
    if (!pattern) {
      errorDiv.style.display = 'none';
      resultsDiv.innerHTML = '';
      noMatchDiv.style.display = 'none';
      highlightedDiv.style.display = 'none';
      matchCountSpan.style.display = 'none';
      return;
    }

    // Send message to extension
    vscode.postMessage({
      type: 'test',
      payload: { pattern, flags, input },
    });
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Renders the test string with matched portions highlighted inline.
   * @param {Array<{ match: string; index: number }>} matches
   */
  function renderHighlightedText(matches) {
    const input = inputTextarea.value;
    if (!input || matches.length === 0) {
      highlightedDiv.style.display = 'none';
      return;
    }

    let html = '';
    let lastIndex = 0;

    for (const m of matches) {
      // Add non-matching text before this match
      if (m.index > lastIndex) {
        html += escapeHtml(input.slice(lastIndex, m.index));
      }
      // Add the highlighted match
      html += `<mark>${escapeHtml(m.match)}</mark>`;
      lastIndex = m.index + m.match.length;
    }

    // Add remaining text after last match
    if (lastIndex < input.length) {
      html += escapeHtml(input.slice(lastIndex));
    }

    highlightedDiv.innerHTML = html;
    highlightedDiv.style.display = 'block';
  }

  // Render results
  /**
   * @param {{ matches: Array<{ match: string; index: number; groups?: Record<string, string> }>; error?: string }} data
   */
  function renderResults(data) {
    if (data.error) {
      errorDiv.textContent = data.error;
      errorDiv.style.display = 'block';
      resultsDiv.innerHTML = '';
      noMatchDiv.style.display = 'none';
      highlightedDiv.style.display = 'none';
      matchCountSpan.style.display = 'none';
      return;
    }

    errorDiv.style.display = 'none';

    if (!data.matches || data.matches.length === 0) {
      resultsDiv.innerHTML = '';
      noMatchDiv.style.display = 'block';
      highlightedDiv.style.display = 'none';
      matchCountSpan.style.display = 'none';
      return;
    }

    noMatchDiv.style.display = 'none';

    // Match count badge
    const count = data.matches.length;
    matchCountSpan.textContent = count >= 100 ? '100+ matches' : `${count} ${count === 1 ? 'match' : 'matches'}`;
    matchCountSpan.style.display = 'inline';

    // Inline highlighted text
    renderHighlightedText(data.matches);

    // Match details list
    const html = data.matches
      .map((m, i) => {
        let groupsHtml = '';
        if (m.groups && Object.keys(m.groups).length > 0) {
          groupsHtml = `<div class="match-groups">Groups: ${Object.entries(m.groups)
            .map(([k, v]) => `<code>${escapeHtml(k)}</code>: "${escapeHtml(v)}"`)
            .join(', ')}</div>`;
        }

        return `
          <div class="match-item">
            <span class="match-index">#${i + 1}</span>
            <span class="match">${escapeHtml(m.match)}</span>
            <span style="color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-left: 8px;">index ${m.index}</span>
            ${groupsHtml}
          </div>
        `;
      })
      .join('');

    resultsDiv.innerHTML = html;
  }

  // Debounced test
  const debouncedTest = debounce(sendTestRequest, 300);

  // Event listeners
  patternInput.addEventListener('input', debouncedTest);
  flagsInput.addEventListener('input', debouncedTest);
  inputTextarea.addEventListener('input', debouncedTest);

  // Listen for messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'result') {
      renderResults(message.payload);
    }
  });

  // Initial test if state exists
  if (previousState && previousState.pattern) {
    sendTestRequest();
  }
})();
