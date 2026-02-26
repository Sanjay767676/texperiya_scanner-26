import { useEffect, useState } from "react";
import skeletonImg from "@assets/skeleton.png";
import "./opening-animation.css";

export function OpeningAnimation() {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-black flex items-center justify-center transition-opacity duration-1000 ${
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="relative flex items-center justify-center overflow-hidden p-10">
        <img
          src={skeletonImg}
          alt="Skeleton"
          className="max-w-[150px] sm:max-w-[200px] md:max-w-[250px] h-auto object-contain animate-glitch logo-shadow"
        />
      </div>
    </div>
  );
}
