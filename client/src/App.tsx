import ScannerPage from "@/pages/scanner";
import Login from "@/components/Login";
import { OpeningAnimation } from "@/components/OpeningAnimation";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LogOut, User } from "lucide-react";
import "@/pages/scanner.css";

function AppContent() {
  const { user, logout, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={login} />;
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg">
        <User className="h-4 w-4 text-gray-600" />
        <span className="text-sm font-medium text-gray-700">{user.username}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="ml-2 h-8 px-2"
        >
          <LogOut className="h-3 w-3" />
        </Button>
      </div>
      
      <OpeningAnimation />
      <ScannerPage />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
