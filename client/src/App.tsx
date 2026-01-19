import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { UserMenu } from "@/components/UserMenu";
import CasePage from "@/pages/CasePage";
import ArchivePage from "@/pages/ArchivePage";
import AddCasePage from "@/pages/AddCasePage";
import EditCasePage from "@/pages/EditCasePage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={CasePage} />
      <Route path="/case/:id" component={CasePage} />
      <Route path="/archive" component={ArchivePage} />
      <Route path="/add" component={AddCasePage} />
      <Route path="/edit/:id" component={EditCasePage} />
      <Route path="/login" component={LoginPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div 
          className="flex flex-col h-[100dvh] w-full bg-background"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <Router />
          </main>
          <BottomNav />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
