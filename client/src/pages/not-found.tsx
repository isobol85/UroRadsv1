import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-md">
        <CardContent className="pt-8 pb-6 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Page not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has moved.
          </p>
          <Link href="/">
            <Button className="mt-6 rounded-full px-5">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to cases
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
