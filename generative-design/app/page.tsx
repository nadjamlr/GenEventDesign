"use client";

import Sidebar from "@/components/Sidebar";
import Canvas from "@/components/Canvas";
import Button from "@/components/Button";
import useDesignStore from "@/store/designStore";

export default function Home() {
  const regenerate = useDesignStore((state) => state.regenerate);

  return (
    <div className="h-screen w-screen overflow-hidden bg-primary-lightgrey">
      <div className="absolute inset-0 right-72 px-6 flex items-center justify-center p-8 overflow-hidden">
        <Canvas />
        <div className="absolute bottom-6 right-12">
          <Button size="md" text="Shuffle" color="colored" onClick={regenerate} />
        </div>
      </div>
      <Sidebar />
    </div>
  );
}
