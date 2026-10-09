export function Privacy() {
  return (
    <main className="min-h-screen bg-[#f7faf8] px-6 py-12 text-slate-800 sm:px-10">
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm sm:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-600">MediChain</p>
        <h1 className="mt-3 text-3xl font-bold text-[#12343b]">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Version 1.0 · Effective October 9, 2026</p>
        <div className="mt-8 space-y-6 text-sm leading-7">
          <section><h2 className="font-bold">Information we process</h2><p>MediChain may process account identifiers, profile information, authentication records, audit events, and medical information that you choose to store or share.</p></section>
          <section><h2 className="font-bold">How information is used</h2><p>We use information to authenticate users, provide record-management features, enforce access controls, maintain auditability, and protect the service.</p></section>
          <section><h2 className="font-bold">Your choices</h2><p>You are responsible for deciding what information to submit and who may access it through the service. Contact the service operator to request access, correction, or deletion where applicable.</p></section>
          <section><h2 className="font-bold">Security and retention</h2><p>We use reasonable technical and organizational safeguards. No service can guarantee absolute security. Information may be retained where needed for legal, security, backup, or record-keeping purposes.</p></section>
          <section><h2 className="font-bold">Contact</h2><p>Contact the service operator through the support channel provided with your deployment for privacy requests or concerns.</p></section>
        </div>
      </article>
    </main>
  );
}
