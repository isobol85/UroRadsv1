import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [displayName, setDisplayName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/auth/username-login", { displayName: name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/add";
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Could not log in. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleUsernameLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2) {
      toast({
        title: "Name too short",
        description: "Please enter at least 2 characters.",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate(displayName.trim());
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-center px-4 h-14 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold" data-testid="text-login-title">Sign In</h1>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to add cases to the database</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              className="w-full" 
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-sso-login"
            >
              Sign in with Google / Replit
            </Button>
            
            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                or
              </span>
            </div>

            <form onSubmit={handleUsernameLogin} className="space-y-3">
              <Input
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loginMutation.isPending}
                data-testid="input-display-name"
              />
              <Button 
                type="submit" 
                variant="outline" 
                className="w-full"
                disabled={loginMutation.isPending || displayName.trim().length < 2}
                data-testid="button-username-login"
              >
                {loginMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Continue with Name
              </Button>
            </form>

            <p className="text-xs text-muted-foreground text-center">
              Using your name is quick, but SSO provides better identity verification.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
