"use client";

/** Auth/session hooks. `useUser` drives route guards in the app shell. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getClient } from '../api/client';
import type { RegisterInput } from '../api/client';
import { db } from '../db';

export function useUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await getClient()).auth.me(),
    staleTime: 10 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) =>
      (await getClient()).auth.login(email, password),
    onSuccess: ({ user }) => {
      qc.setQueryData(['auth', 'me'], user);
      void qc.invalidateQueries();
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterInput) => (await getClient()).auth.register(input),
    onSuccess: ({ user }) => {
      qc.setQueryData(['auth', 'me'], user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      await (await getClient()).auth.logout();
      // device cache belongs to the logged-in user — clear on logout
      await Promise.all([db.entries.clear(), db.outbox.clear(), db.conflicts.clear()]);
    },
    onSuccess: () => {
      qc.clear();
      router.push('/login');
    },
  });
}

export function useProfile() {
  const { data: user } = useUser();
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await getClient()).profile.get(),
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
