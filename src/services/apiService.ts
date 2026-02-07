import type * as vscode from 'vscode';
import {
  type Logger,
  createSecretStorage,
  retry,
  withProgress,
  toAbortSignal,
  showError,
  showInfo,
  inputText,
  getSetting,
  type SecretStorage,
} from '@kkdev92/vscode-ext-kit';

/**
 * Handles API communication with automatic retry and secure key storage.
 */
export class ApiService {
  private apiKeyStorage: SecretStorage;

  constructor(
    context: vscode.ExtensionContext,
    private logger: Logger
  ) {
    this.apiKeyStorage = createSecretStorage(context, 'quickUtils.apiKey');
  }

  /**
   * Prompts the user to enter an API key and stores it in OS-level secure storage.
   */
  async setApiKey(): Promise<void> {
    const key = await inputText({
      prompt: 'Enter API Key',
      password: true,
      validate: (v: string) => {
        if (!v || v.length < 10) {
          return 'API key must be at least 10 characters';
        }
        return undefined;
      },
    });

    if (key) {
      await this.apiKeyStorage.set(key);
      await showInfo('API key saved securely');
      this.logger.info('API key saved');
    }
  }

  /**
   * Retrieves the stored API key, or `undefined` if not set.
   */
  async getApiKey(): Promise<string | undefined> {
    return this.apiKeyStorage.get();
  }

  /**
   * Removes the stored API key from secure storage.
   */
  async deleteApiKey(): Promise<void> {
    await this.apiKeyStorage.delete();
    this.logger.info('API key deleted');
  }

  /**
   * Sends a request to the given URL with retry logic.
   * Attaches the stored API key as a Bearer token.
   */
  async callApi<T>(endpoint: string, options?: RequestInit): Promise<T | undefined> {
    const apiKey = await this.apiKeyStorage.get();
    if (!apiKey) {
      await showError('API key not set. Use "Set API Key" command.');
      return;
    }

    const autoRetry = getSetting('quickUtils', 'autoRetry', true);

    return withProgress(
      'Calling API...',
      async (progress, token) => {
        progress.report({ message: 'Requesting...' });

        const fetchFn = async (): Promise<T> => {
          const response = await fetch(endpoint, {
            ...options,
            headers: {
              ...options?.headers,
              Authorization: `Bearer ${apiKey}`,
            },
            signal: toAbortSignal(token),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          return response.json() as Promise<T>;
        };

        if (autoRetry) {
          return retry(fetchFn, {
            maxAttempts: 3,
            delay: 1000,
            backoff: 'exponential',
            onRetry: (err, attempt) => {
              this.logger.warn(`Retry ${attempt}`, err);
              progress.report({ message: `Retrying (${attempt}/3)...` });
            },
          });
        } else {
          return fetchFn();
        }
      },
      { cancellable: true }
    );
  }
}
