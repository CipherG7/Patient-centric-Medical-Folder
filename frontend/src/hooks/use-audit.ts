import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';

export function useAuditLog(historyId: string | undefined) {
  return useQuery({
    queryKey: ['audit', historyId],
    queryFn: () => auditApi.getAuditLog(historyId!),
    enabled: !!historyId,
    refetchInterval: 15_000, // Poll for new audit events
  });
}

