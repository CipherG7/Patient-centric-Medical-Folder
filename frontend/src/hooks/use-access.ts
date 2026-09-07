import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accessApi } from '@/lib/api';

export function useGrantFullAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      historyId,
      granteeAddr,
      expiryMs = 0,
    }: {
      historyId: string;
      granteeAddr: string;
      expiryMs?: number;
    }) => accessApi.grantFullAccess(historyId, granteeAddr, expiryMs),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['history', 'full', variables.historyId] });
    },
  });
}

export function useGrantPartialAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      historyId,
      granteeAddr,
      entryIds,
      expiryMs = 0,
    }: {
      historyId: string;
      granteeAddr: string;
      entryIds: number[];
      expiryMs?: number;
    }) => accessApi.grantPartialAccess(historyId, granteeAddr, entryIds, expiryMs),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['history', 'full', variables.historyId] });
    },
  });
}

export function useRevokeAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ historyId, granteeAddr }: { historyId: string; granteeAddr: string }) =>
      accessApi.revokeAccess(historyId, granteeAddr),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['history', 'full', variables.historyId] });
    },
  });
}

