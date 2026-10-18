import type { Metadata } from "next";
import { Container } from "@/components/shop/section";
import { safeNextPath } from "@/components/shop/utils";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <LoginForm next={safeNextPath(next)} />
        <p className="mt-6 text-center text-xs leading-5 text-zinc-500">
          By continuing you agree to receive a one-time password by SMS. Standard messaging rates may apply.
        </p>
      </div>
    </Container>
  );
}
