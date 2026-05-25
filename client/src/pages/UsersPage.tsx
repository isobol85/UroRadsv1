import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Users as UsersIcon, ShieldCheck, Shield, Loader2, FolderOpen, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingPearls } from "@/components/LoadingPearls";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/models/auth";

type AdminUser = User & { caseCount: number };

function isUsernameUser(u: User): boolean {
  return u.id.startsWith("username_");
}

function getDisplayName(u: User): string {
  return (
    u.displayName ||
    (u.firstName && u.lastName
      ? `${u.firstName} ${u.lastName}`
      : u.firstName || u.email || "User")
  );
}

export default function UsersPage() {
  const { user: currentUser, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !currentUser?.isAdmin)) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, currentUser, navigate]);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!currentUser?.isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: string; isAdmin: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, { isAdmin });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not update user",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "User deleted" });
      setUserToDelete(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Could not delete user",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  if (authLoading || !currentUser?.isAdmin) {
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center px-4 h-14 border-b border-border shrink-0">
          <UsersIcon className="w-5 h-5 mr-2 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Users</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <LoadingPearls />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center">
          <UsersIcon className="w-5 h-5 mr-2 text-muted-foreground" />
          <h1 className="text-lg font-semibold" data-testid="text-users-title">
            Users
          </h1>
        </div>
        <span className="text-sm text-muted-foreground" data-testid="text-user-count">
          {users.length} {users.length === 1 ? "user" : "users"}
        </span>
      </header>

      <ScrollArea className="flex-1">
        <div className="pb-20">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <LoadingPearls />
            </div>
          ) : users.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No users found.
            </div>
          ) : (
            users.map((u) => {
              const usernameOnly = isUsernameUser(u);
              const isSelf = u.id === currentUser.id;
              const displayName = getDisplayName(u);
              const initials = displayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              const pending =
                updateMutation.isPending &&
                updateMutation.variables?.id === u.id;

              return (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border"
                  data-testid={`user-row-${u.id}`}
                >
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={u.profileImageUrl || undefined} alt={displayName} />
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-medium truncate"
                        data-testid={`text-user-name-${u.id}`}
                      >
                        {displayName}
                      </span>
                      {u.isAdmin && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary"
                          data-testid={`badge-admin-${u.id}`}
                        >
                          Admin
                        </span>
                      )}
                      {usernameOnly && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                          Username
                        </span>
                      )}
                      {isSelf && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.email || (usernameOnly ? "Username-only login" : "No email")}
                    </p>
                    {u.caseCount > 0 ? (
                      <Link
                        href={`/archive?createdBy=${encodeURIComponent(u.id)}`}
                        className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                        data-testid={`link-user-cases-${u.id}`}
                      >
                        <FolderOpen className="w-3 h-3" />
                        {u.caseCount} {u.caseCount === 1 ? "case" : "cases"}
                      </Link>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground"
                        data-testid={`text-user-cases-${u.id}`}
                      >
                        <FolderOpen className="w-3 h-3" />
                        No cases
                      </span>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {usernameOnly ? (
                      <span
                        className="text-xs text-muted-foreground"
                        data-testid={`text-cannot-promote-${u.id}`}
                      >
                        Cannot be admin
                      </span>
                    ) : u.isAdmin ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSelf || pending}
                        onClick={() =>
                          updateMutation.mutate({ id: u.id, isAdmin: false })
                        }
                        data-testid={`button-demote-${u.id}`}
                        title={
                          isSelf
                            ? "You cannot remove your own admin rights"
                            : undefined
                        }
                      >
                        {pending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        ) : (
                          <Shield className="w-4 h-4 mr-1.5" />
                        )}
                        Demote
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          updateMutation.mutate({ id: u.id, isAdmin: true })
                        }
                        data-testid={`button-promote-${u.id}`}
                      >
                        {pending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        ) : (
                          <ShieldCheck className="w-4 h-4 mr-1.5" />
                        )}
                        Promote
                      </Button>
                    )}
                    {!isSelf && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setUserToDelete(u)}
                        data-testid={`button-delete-user-${u.id}`}
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <AlertDialog
        open={!!userToDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setUserToDelete(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-delete-user">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {userToDelete && (
                <>
                  This will permanently remove{" "}
                  <span className="font-medium text-foreground">
                    {getDisplayName(userToDelete)}
                  </span>{" "}
                  and their chat history.
                  {userToDelete.caseCount > 0 && (
                    <>
                      {" "}Their{" "}
                      {userToDelete.caseCount === 1
                        ? "1 case"
                        : `${userToDelete.caseCount} cases`}{" "}
                      will be kept but no longer attributed to anyone.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteMutation.isPending}
              data-testid="button-cancel-delete-user"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (userToDelete) deleteMutation.mutate(userToDelete.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-user"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
