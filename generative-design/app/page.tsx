import Sidebar from "@/components/Sidebar";
import Image from "next/image";
import Canvas from "@/components/Canvas";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center font-sans bg-primary-lightgrey">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Canvas/>
        <Sidebar/>
      </main>
    </div>
  );
}
