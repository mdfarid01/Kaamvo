import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getRelatedTools } from "@/lib/tools";

interface ToolLayoutProps {
  slug: string;
  title: string;
  description: string;
  category: string;
  children: ReactNode;
}

export function ToolLayout({ slug, title, description, category, children }: ToolLayoutProps) {
  const related = getRelatedTools(slug);

  return (
    <div className="mx-auto w-full max-w-content px-6 py-10 md:py-14">
      <Breadcrumb category={category} title={title} />

      <header className="mt-6 max-w-2xl">
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.01em] text-ink md:text-[32px]">
          {title}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>
      </header>

      <section className="mt-8">{children}</section>

      {related.length > 0 && (
        <section className="mt-16 border-t border-line-soft pt-8">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted">
            Related tools
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((tool) => (
              <Card key={tool.slug} href={`/tools/${tool.slug}`} className="p-4">
                <CardTitle>{tool.name}</CardTitle>
                <CardDescription className="mt-1">{tool.description}</CardDescription>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Breadcrumb({ category, title }: { category: string; title: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        <li>
          <Link href="/" className="hover:text-ink">
            Home
          </Link>
        </li>
        <Separator />
        <li>
          <Link href={`/?category=${encodeURIComponent(category)}`} className="hover:text-ink">
            {category}
          </Link>
        </li>
        <Separator />
        <li aria-current="page" className="text-ink">
          {title}
        </li>
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <li aria-hidden="true" className="select-none text-line">
      /
    </li>
  );
}
