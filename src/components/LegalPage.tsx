type LegalPageProps = {
  title: string;
  intro: string;
  sections: Array<{ heading: string; body: string }>;
};

export function LegalPage({ title, intro, sections }: LegalPageProps) {
  return (
    <main className="legal-page">
      <a href="/" className="back-link">← Zurück zur App</a>
      <section className="legal-card">
        <p className="eyebrow">Rechtsdokument</p>
        <h1>{title}</h1>
        <p className="lead">{intro}</p>
        {sections.map((section) => (
          <article key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
