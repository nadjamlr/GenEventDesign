import Sidebar from "@/components/Sidebar";
import Canvas from "@/components/Canvas";

export default function Home() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-primary-lightgrey">
      <div className="absolute inset-0 left-72 right-72 flex items-center justify-center p-8 overflow-hidden">
        <Canvas />
      </div>
      <Sidebar />
    </div>
  );
}
