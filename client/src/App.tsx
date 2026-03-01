import ScannerPage from "@/pages/scanner";
import { OpeningAnimation } from "@/components/OpeningAnimation";
import { Toaster } from "@/components/ui/toaster";
import "@/pages/scanner.css";

function App() {
  return (
    <>
      <OpeningAnimation />
      <ScannerPage />
      <Toaster />
    </>
  );
}

export default App;
