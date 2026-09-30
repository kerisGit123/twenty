import { useEffect } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import {
  enqueueSnackbar,
  unmountFrontComponent,
  updateProgress,
  useRecordId,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';

type ActionResponse = { success: boolean; message?: string };

// Builds a headless command component: takes the selected record, POSTs it to
// an app route as { recordId }, shows the route's message, then closes.
export const makeRecordActionEffect = ({
  routePath,
  emptySelectionMessage,
  fallbackSuccess,
  fallbackError,
}: {
  routePath: string;
  emptySelectionMessage: string;
  fallbackSuccess: string;
  fallbackError: string;
}) => {
  const RecordActionEffect = () => {
    // Commands launched from a selection get selectedRecordIds; commands
    // launched from a record page may only get recordId. Accept either.
    const selectedRecordIds = useSelectedRecordIds();
    const recordId = useRecordId();
    const targetId = selectedRecordIds?.[0] ?? recordId ?? null;

    useEffect(() => {
      const run = async () => {
        try {
          if (!targetId) {
            await enqueueSnackbar({ message: emptySelectionMessage, variant: 'error' });

            return;
          }

          await updateProgress(0.2);

          const result = await new RestApiClient().post<ActionResponse>(routePath, {
            recordId: targetId,
          });

          await enqueueSnackbar({
            message: result.message ?? (result.success ? fallbackSuccess : fallbackError),
            variant: result.success ? 'success' : 'error',
          });
        } catch (error) {
          await enqueueSnackbar({
            message: error instanceof Error ? error.message : fallbackError,
            variant: 'error',
          });
        } finally {
          await unmountFrontComponent();
        }
      };

      run();
    }, [targetId]);

    return null;
  };

  return RecordActionEffect;
};
