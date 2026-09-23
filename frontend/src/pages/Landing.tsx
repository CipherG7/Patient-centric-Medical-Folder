import { ArrowRight, Check, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const stackImages = [
  {
    src: '/images/care-team.jpeg',
    fallback: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=85',
    alt: 'Care team reviewing a patient record',
    className: 'left-[4%] top-[16%] rotate-[-9deg] sm:left-[8%]',
  },
  {
    src: '/images/patient-care.jpeg',
    fallback: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=900&q=85',
    alt: 'Patient receiving thoughtful care',
    className: 'left-[24%] top-[6%] rotate-[4deg] sm:left-[28%]',
  },
  {
    src: '/images/medical-record.jpeg',
    fallback: 'https://images.unsplash.com/photo-1584982751601-97dcc096659c?auto=format&fit=crop&w=900&q=85',
    alt: 'Doctor holding a medical record',
    className: 'left-[45%] top-[18%] rotate-[12deg] sm:left-[48%]',
  },
  {
    src: '/images/doc-read.jpeg',
    fallback: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=900&q=85',
    alt: 'Doctor reading a medical record',
    className: 'left-[27%] top-[30%] rotate-[-4deg] sm:left-[34%]',
  },
];

function StackImage({ image }: { image: (typeof stackImages)[number] }) {
  return (
    <img
      src={image.src}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = image.fallback;
      }}
      alt={image.alt}
      className={`absolute aspect-[3/4] w-[47%] max-w-[250px] rounded-[1.25rem] border-[7px] border-teal-200 object-cover shadow-[0_22px_45px_rgba(15,35,45,0.2)] transition-transform duration-500 hover:z-20 hover:rotate-0 hover:scale-105 ${image.className}`}
    />
  );
}

export function Landing() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7faf8] text-slate-900">
      <nav className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 sm:px-10 lg:px-14">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-3 text-left">
          <img src="/Medichain.svg" alt="MediChain logo" className="h-10 w-10 object-contain" />
          <span>
            <span className="block text-base font-bold tracking-tight">MediChain</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-teal-700">Care, connected</span>
          </span>
        </button>
        <button onClick={() => navigate('/login')} className="btn-ghost text-sm">
          Sign in <ArrowRight className="h-4 w-4" />
        </button>
      </nav>

      <section className="relative mx-auto grid min-h-[calc(100vh-88px)] w-full max-w-7xl items-center gap-12 px-6 pb-16 pt-8 sm:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-14 lg:pb-20 lg:pt-0">
        <div className="relative z-10 max-w-2xl">
          <h1 className="max-w-xl text-5xl font-bold leading-[0.98] tracking-[-0.04em] text-[#12343b] sm:text-6xl lg:text-7xl">
            Healthcare that remembers <span className="text-teal-600">you.</span>
          </h1>
          <p className="mt-7 max-w-lg text-base leading-8 text-slate-600 sm:text-lg">
            A private, portable home for your medical history. Share the right information with the right people, while keeping ownership in your hands.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => navigate('/login')} className="btn-primary px-6 py-3">
              Get started <ArrowRight className="h-4 w-4" />
            </button>
            <a href="#how-it-works" className="btn-outline px-6 py-3">
              See how it works
            </a>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-600" /> Patient-owned</span>
            <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-600" /> Verifiable records</span>
            <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-600" /> Consent-first sharing</span>
          </div>
        </div>

        <div className="relative mx-auto h-[390px] w-full max-w-[560px] sm:h-[500px]" aria-label="Moments of care">
          <div className="absolute left-[14%] top-[16%] h-[68%] w-[68%] rounded-[40%] bg-[#d9f0e7] blur-[1px]" />
          {stackImages.map((image) => <StackImage key={image.src} image={image} />)}
          <div className="absolute bottom-[7%] right-[3%] z-10 w-48 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_35px_rgba(15,35,45,0.14)] backdrop-blur sm:right-[4%]">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-teal-700"><ShieldCheck className="h-5 w-5" /></div>
            <p className="text-sm font-bold text-slate-800">Always in your hands</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">You choose what to share and when.</p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-slate-200/80 bg-white/70 px-6 py-16 sm:px-10 lg:px-14 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-600">A better way to care</p>
            <h2 className="mt-3 max-w-md text-3xl font-bold leading-tight tracking-tight text-[#12343b] sm:text-4xl">One clear story, wherever care takes you.</h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              ['01', 'Collect', 'Bring your health records together in one private place.'],
              ['02', 'Choose', 'Give trusted providers only the access they need.'],
              ['03', 'Carry', 'Keep your history with you as life and care change.'],
            ].map(([number, title, description]) => (
              <div key={number}>
                <p className="text-xs font-bold text-teal-600">{number}</p>
                <h3 className="mt-3 text-lg font-bold text-slate-800">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-14 flex max-w-7xl items-center gap-3 border-t border-slate-200 pt-5 text-xs font-semibold text-slate-500">
          <LockKeyhole className="h-4 w-4 text-teal-600" />
          Protected access built around your consent
        </div>
      </section>
    </main>
  );
}
