import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findPolicy, POLICIES } from "@/components/shop/policies";
import { Breadcrumbs, Container } from "@/components/shop/section";
import { serverApi } from "@/lib/server-api";

export async function generateMetadata(props: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const policy = findPolicy((await props.params).slug);
  return policy ? { title: policy.title, description: policy.summary } : {};
}

export default async function PolicyPage(props: PageProps<"/policies/[slug]">) {
  const policy = findPolicy((await props.params).slug);
  if (!policy) notFound();
  const config = await serverApi.config();

  return (
    <Container className="py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: policy.title }]} className="mb-6" />
      <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Policies" className="order-last lg:order-first">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-900">Store policies</p>
          <ul className="mt-4 space-y-2 text-sm">
            {POLICIES.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/policies/${p.slug}`}
                  aria-current={p.slug === policy.slug ? "page" : undefined}
                  className={p.slug === policy.slug ? "font-medium text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}
                >
                  {p.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/contact" className="text-zinc-600 hover:text-zinc-900">
                Contact us
              </Link>
            </li>
          </ul>
        </nav>

        <article className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{policy.title}</h1>
          <p className="mt-3 text-base text-zinc-600">{policy.summary}</p>
          <div className="mt-10 space-y-8">
            {policy.sections(config).map((s) => (
              <section key={s.heading}>
                <h2 className="text-lg font-semibold text-zinc-900">{s.heading}</h2>
                <div className="mt-2 text-sm leading-7 text-zinc-700">{s.body}</div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </Container>
  );
}
