import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsApproved } from "@/hooks/useUserApproval";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function PendingApproval() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isApproved, refetch, isLoading } = useIsApproved();

  // Redirect if approved
  useEffect(() => {
    if (isApproved) {
      navigate("/dashboard", { replace: true });
    }
  }, [isApproved, navigate]);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Pending Approval | nAItive</title>
      </Helmet>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-2xl">Account Pending Approval</CardTitle>
            <CardDescription className="text-base">
              Your account is awaiting administrator approval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Signed in as
              </p>
              <p className="font-medium">{user?.email}</p>
            </div>
            
            <p className="text-sm text-muted-foreground text-center">
              An administrator has been notified of your registration request. 
              You'll receive an email once your account has been approved.
            </p>

            <div className="flex flex-col gap-3">
              <Button 
                variant="outline" 
                onClick={handleRefresh}
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Check Approval Status
              </Button>
              
              <Button 
                variant="ghost" 
                onClick={handleSignOut}
                className="w-full"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
