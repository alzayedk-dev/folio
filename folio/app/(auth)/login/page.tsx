import { LoginForm } from "./LoginForm";
import { safeNext } from "@/lib/validation";

export const metadata = { title: "Log In · Folio" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  return <LoginForm next={safeNext(next)} justReset={reset === "1"} />;
}
