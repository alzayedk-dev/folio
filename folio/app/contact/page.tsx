import { PublicPage } from "@/components/PublicPage";

export const metadata = { title: "Contact · Folio", description: "Get in touch with the Folio team." };

const NAME = "Khaled Alzayed";
const EMAIL = "alzayed.k@yahoo.com";

export default function ContactPage() {
  return (
    <PublicPage title="Contact" subtitle="Questions, feedback or ideas for Folio? Get in touch.">
      <div className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-semibold text-white" aria-hidden="true">
            KA
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Contact</p>
            <p className="text-xl font-semibold">{NAME}</p>
          </div>
        </div>
        <dl className="mt-6 space-y-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Email</dt>
            <dd className="mt-1">
              <a href={`mailto:${EMAIL}?subject=${encodeURIComponent("Folio")}`} className="text-lg font-medium text-brand hover:underline">
                {EMAIL}
              </a>
            </dd>
          </div>
        </dl>
        <a
          href={`mailto:${EMAIL}?subject=${encodeURIComponent("Folio")}`}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-strong"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          Send An Email
        </a>
      </div>
      <p className="mt-6 text-sm text-muted">Folio is a monitoring tool and can&apos;t give personal investment advice.</p>
    </PublicPage>
  );
}
