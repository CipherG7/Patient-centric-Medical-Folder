import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { historyApi } from '@/lib/api';

export function useFullHistory(historyId: string | undefined) {
  return useQuery({
    queryKey: ['history', 'full', historyId],
    queryFn: () => historyApi.getFullHistory(historyId!),
    enabled: !!historyId,
    refetchInterval: 30_000, // Poll every 30s for updates
  });
}

export function useEntry(historyId: string | undefined, entryId: number | undefined) {
  return useQuery({
    queryKey: ['history', 'entry', historyId, entryId],
    queryFn: () => historyApi.getEntry(historyId!, entryId!),
    enabled: !!historyId && entryId !== undefined,
  });
}

export function useAddEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      historyId,
      ...data
    }: {
      historyId: string;
      issuerAddr: string;
      entryType: number;
      offChainRef: string;
      contentHash: string;
    }) => historyApi.addEntry(historyId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['history', 'full', variables.historyId] });
    },
  });
}

export function useRevokeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ historyId, entryId }: { historyId: string; entryId: number }) =>
      historyApi.revokeEntry(historyId, entryId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['history', 'full', variables.historyId] });
    },
  });
}

