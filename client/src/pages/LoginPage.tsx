import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { setLocalUser } from "@/hooks/use-auth";
import type { User } from "@shared/models/auth";
import { SiGoogle } from "react-icons/si";
import loginBg from "@assets/image_1768855969810.png";

export default function LoginPage() {
  const [displayName, setDisplayName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/auth/username-login", { displayName: name });
      return response.json() as Promise<User>;
    },
    onSuccess: (user: User) => {
      setLocalUser(user);
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

  const handleSSOLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div 
      className="flex flex-col h-full relative"
      style={{
        backgroundImage: `url(${loginBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/55 to-slate-950/80" />

      <header className="relative z-10 flex items-center justify-center px-4 h-14 shrink-0">
        <h1 className="text-lg font-semibold text-white tracking-tight" data-testid="text-login-title">UroRads</h1>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm bg-card/95 backdrop-blur-md shadow-xl border-card-border">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl tracking-tight">Welcome to UroRads</CardTitle>
            <CardDescription>Sign in to add cases to the library</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full h-11 rounded-xl bg-white text-slate-800 hover:bg-white border border-slate-200 shadow-sm font-medium"
              onClick={handleSSOLogin}
              data-testid="button-sso-google"
            >
              <SiGoogle className="w-4 h-4 mr-2" style={{ color: '#4285F4' }} />
              Sign in with Google
            </Button>

            <div className="relative py-2">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase tracking-wider text-muted-foreground">
                or
              </span>
            </div>

            <form onSubmit={handleUsernameLogin} className="space-y-3">
              <Input
                placeholder="Enter your first name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loginMutation.isPending}
                className="h-11 rounded-xl"
                data-testid="input-display-name"
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full h-11 rounded-xl"
                disabled={loginMutation.isPending || displayName.trim().length < 2}
                data-testid="button-username-login"
              >
                {loginMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Continue
              </Button>
            </form>

            <p className="text-[11px] text-center text-muted-foreground pt-2">
              For medical education only. Not for clinical decision-making.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
