import type { ReactNode } from 'react';

interface StudioPageIntroProps {
  eyebrow?: string;
  title: string;
  description: string;
  aside?: ReactNode;
}

export function StudioPageIntro({
  eyebrow,
  title,
  description,
  aside,
}: StudioPageIntroProps) {
  return (
    <section className="studio-page-intro">
      <div>
        {eyebrow && <span className="studio-page-intro__eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {aside && <div className="studio-page-intro__aside">{aside}</div>}
    </section>
  );
}
