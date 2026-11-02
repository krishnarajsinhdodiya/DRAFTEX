import { appInfo } from "@/lib/app-info";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{appInfo.name}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">{appInfo.tagline}</p>
    </main>
  );
}
