import { Mail, Shield, ArrowLeft } from 'lucide-react';

const SUPPORT_EMAIL = 'nemeanpartnersptlltd@gmail.com';

export function ContactSupportPage() {
  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#111827] shadow-2xl overflow-hidden">
        <header className="border-b border-slate-800 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Message Backup Support</h1>
            <p className="text-sm text-slate-400">Questions, account help, and app support.</p>
          </div>
        </header>

        <section className="px-6 py-7 space-y-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <p className="text-sm leading-relaxed text-slate-300">
              For support with Message Backup, email Nemean Partners Pty Ltd with your inquiry and include any details that help us understand the issue.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Message%20Backup%20Support%20Inquiry`}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 transition"
            >
              <Mail className="w-4 h-4" />
              {SUPPORT_EMAIL}
            </a>
          </div>

          <div className="grid gap-3 text-sm text-slate-400">
            <p>
              Please include your account email, Mac model, macOS version, and a clear description of the question or issue.
            </p>
            <p>
              Message Backup processes selected message database exports locally on the user&apos;s Mac. Support requests should not include private message contents unless specifically requested.
            </p>
          </div>

          <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200">
            <ArrowLeft className="w-4 h-4" />
            Back to Message Backup
          </a>
        </section>
      </main>
    </div>
  );
}
