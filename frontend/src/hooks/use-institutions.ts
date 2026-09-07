import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { institutionApi } from '@/lib/api';

export function useInstitutions() {
  return useQuery({
    queryKey: ['institutions'],
    queryFn: () => institutionApi.list(),
  });
}

export function useInstitution(addr: string | undefined) {
  return useQuery({
    queryKey: ['institutions', addr],
    queryFn: () => institutionApi.get(addr!),
    enabled: !!addr,
  });
}

export function useRegisterInstitution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      institutionAddr,
      name,
      licenseNumber,
      adminCapId,
    }: {
      institutionAddr: string;
      name: string;
      licenseNumber: string;
      adminCapId: string;
    }) => institutionApi.register(institutionAddr, name, licenseNumber, adminCapId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] });
    },
  });
}

export function useRevokeInstitution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ institutionAddr, adminCapId }: { institutionAddr: string; adminCapId: string }) =>
      institutionApi.revoke(institutionAddr, adminCapId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] });
    },
  });
}

export function useReinstateInstitution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ institutionAddr, adminCapId }: { institutionAddr: string; adminCapId: string }) =>
      institutionApi.reinstate(institutionAddr, adminCapId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] });
    },
  });
}

