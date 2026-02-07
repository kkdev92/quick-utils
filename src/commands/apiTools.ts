import { type Logger, showInfo, confirm, t } from '@kkdev92/vscode-ext-kit';

import type { HistoryService } from '../services/historyService.js';
import type { ApiService } from '../services/apiService.js';

/**
 * Prompts the user to set their API key via the API service.
 */
export async function setApiKeyCommand(
  logger: Logger,
  apiService: ApiService
): Promise<void> {
  await apiService.setApiKey();
}

/**
 * Clears all stored operation history.
 */
export async function clearHistoryCommand(
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  const confirmed = await confirm(t('Clear all history?'), {
    detail: t('This action cannot be undone.'),
    yesText: t('Clear'),
    noText: t('Cancel'),
  });

  if (confirmed) {
    await historyService.clear();
    await showInfo(t('History cleared'));
    logger.info('History cleared');
  }
}
