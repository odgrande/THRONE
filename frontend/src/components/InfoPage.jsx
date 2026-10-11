import Header from './Header.jsx';
import Footer from './Footer.jsx';
import Shape from './Shape.jsx';

// Shared shell for the information pages (Safety, FAQ, Contact, Partners):
// a coloured title band, then content in one readable column on phones.
export default function InfoPage({ kicker, title, intro, tone = 'bg-bh-blue text-white', children }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-canvas">
      <Header />
      <section className={`relative overflow-hidden border-b-4 border-ink ${tone}`}>
        <Shape kind="circle" color="yellow" className="absolute -right-16 -top-16 hidden h-48 w-48 border-4 border-ink sm:block" />
        <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <p className="label">{kicker}</p>
          <h1 className="display mt-2 text-4xl sm:text-6xl">{title}</h1>
          {intro && <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed opacity-90 sm:text-lg">{intro}</p>}
        </div>
      </section>
      <main className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">{children}</main>
      <Footer />
    </div>
  );
}

export function SectionTitle({ children, id }) {
  return (
    <h2 id={id} className="scroll-mt-6 text-2xl font-black uppercase tracking-tight sm:text-3xl">
      {children}
    </h2>
  );
}
