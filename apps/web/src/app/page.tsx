export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center py-32 px-16">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          lets-chat — Modern Rebuild
        </h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
          Secure team collaboration platform. Infrastructure bootstrapped.
        </p>
      </main>
    </div>
  );
}
