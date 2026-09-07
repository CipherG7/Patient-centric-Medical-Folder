import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientApi } from '@/lib/api';

export function usePatientHistory(addr: string | undefined) {
  return useQuery({
    queryKey: ['patient', 'history', addr],
    queryFn: () => patientApi.lookupHistory(addr!),
    enabled: !!addr,
  });
}

export function usePatientProfile(addr: string | undefined) {
  return useQuery({
    queryKey: ['patient', 'profile', addr],
    queryFn: () => patientApi.getProfile(addr!),
    enabled: !!addr,
  });
}

export function useCreateHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patientAddr: string) => patientApi.createHistory(patientAddr),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient', 'history', data.patientAddr] });
    },
  });
}

export function useUpsertProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ patientAddr, ...data }: { patientAddr: string; displayName?: string; email?: string }) =>
      patientApi.upsertProfile(patientAddr, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['patient', 'profile', variables.patientAddr] });
    },
  });
}

