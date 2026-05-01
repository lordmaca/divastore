import Link from "next/link";
import { getNavCategories } from "@/lib/catalog/navigation";
import { getSetting } from "@/lib/settings";

function whatsappUrl(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("http")) return raw;
  if (!digits) return "#";
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
}

function instagramUrl(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("http")) return t;
  return `https://instagram.com/${t.replace(/^@/, "")}`;
}

function youtubeUrl(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("http")) return t;
  return `https://www.youtube.com/${t.startsWith("@") ? t : `@${t}`}`;
}

export async function Footer() {
  const [navCategories, about] = await Promise.all([
    getNavCategories(),
    getSetting("about.page"),
  ]);
  const c = about.contact;
  const hasSocial = Boolean(c.instagram || c.youtube || c.whatsapp);
  return (
    <footer className="mt-16 border-t border-white/60 bg-white/35 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-4 text-sm">
        <div>
          <p className="font-display text-2xl text-[color:var(--pink-600)]">Brilho de Diva</p>
          <p className="mt-2 text-[color:var(--foreground)]/75">
            Realce sua Beleza, Brilhe como uma Diva!
          </p>
          {about.enabled ? (
            <p className="mt-3">
              <Link
                href="/sobre"
                className="text-[color:var(--pink-600)] hover:underline font-medium"
              >
                Sobre nós →
              </Link>
            </p>
          ) : null}
        </div>
        <div>
          <p className="font-semibold mb-2">Loja</p>
          <ul className="space-y-1 text-[color:var(--foreground)]/75">
            <li><Link href="/loja">Tudo</Link></li>
            {navCategories.map((c) => (
              <li key={c.slug}><Link href={c.href}>{c.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold mb-2">Atendimento</p>
          <ul className="space-y-1 text-[color:var(--foreground)]/75">
            {about.enabled ? <li><Link href="/sobre">Sobre nós</Link></li> : null}
            <li><Link href="/minha-conta/pedidos">Meus pedidos</Link></li>
            <li><Link href="/trocas-e-devolucoes">Trocas e devoluções</Link></li>
            {c.email ? (
              <li>
                <a href={`mailto:${c.email}`}>{c.email}</a>
              </li>
            ) : (
              <li>contato@brilhodediva.com.br</li>
            )}
          </ul>
        </div>
        {hasSocial ? (
          <div>
            <p className="font-semibold mb-2">Siga a gente</p>
            <ul className="space-y-2 text-[color:var(--foreground)]/75">
              {c.instagram ? (
                <li>
                  <a
                    href={instagramUrl(c.instagram)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 hover:text-[color:var(--pink-600)]"
                  >
                    <span aria-hidden>📸</span> Instagram
                  </a>
                </li>
              ) : null}
              {c.youtube ? (
                <li>
                  <a
                    href={youtubeUrl(c.youtube)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 hover:text-[color:var(--pink-600)]"
                  >
                    <span aria-hidden>▶</span> YouTube
                  </a>
                </li>
              ) : null}
              {c.whatsapp ? (
                <li>
                  <a
                    href={whatsappUrl(c.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 hover:text-emerald-600"
                  >
                    <span aria-hidden>💬</span> WhatsApp
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
      {about.enabled && about.visit.storeName ? (
        <div className="border-t border-white/40 bg-white/30 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 text-[11px] text-[color:var(--foreground)]/65 text-center">
            <span className="font-medium text-[color:var(--foreground)]/80">
              {about.visit.storeName}
            </span>
            {about.visit.address ? (
              <>
                {" · "}
                <span>{about.visit.address}</span>
              </>
            ) : null}
            {about.visit.city ? (
              <>
                {" · "}
                <span>
                  {about.visit.city}
                  {about.visit.state ? `/${about.visit.state}` : ""}
                </span>
              </>
            ) : null}
            {about.visit.hours ? (
              <>
                {" · "}
                <span>{about.visit.hours}</span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="text-center text-xs text-[color:var(--foreground)]/60 pb-6 pt-3">
        © {new Date().getFullYear()} Brilho de Diva. Todos os direitos reservados.
      </div>
    </footer>
  );
}
