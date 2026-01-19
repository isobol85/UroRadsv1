import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

const LOCAL_USER_KEY = "urorads_local_user";

export function getLocalUser(): User | null {
  try {
    const stored = localStorage.getItem(LOCAL_USER_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    localStorage.removeItem(LOCAL_USER_KEY);
  }
  return null;
}

export function setLocalUser(user: User): void {
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
}

export function clearLocalUser(): void {
  localStorage.removeItem(LOCAL_USER_KEY);
}

async function fetchUser(): Promise<User | null> {
  // Always check server session for authoritative user info
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    // No server session - clear local cache
    clearLocalUser();
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  const user = await response.json();
  // Cache user in localStorage
  setLocalUser(user);
  return user;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      clearLocalUser();
      window.location.href = "/api/logout";
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
