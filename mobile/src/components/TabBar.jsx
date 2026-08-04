const TABS = [
  {
    id: "accueil", label: "Entretiens",
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 22 22" fill="none">
        <path d="M4 9.5 11 4l7 5.5V18a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1v-4h-3v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5Z"
          stroke={a ? "#E4B04A" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "corpus", label: "Corpus",
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 22 22" fill="none">
        <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l1.5 1.8h7.5A1.5 1.5 0 0 1 19 8.3v8.2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 16.5v-10Z"
          stroke={a ? "#E4B04A" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "glossaire", label: "Glossaire",
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 22 22" fill="none">
        <path d="M6 3.5h9A1.5 1.5 0 0 1 16.5 5v13.2L11 16l-5.5 2.2V5A1.5 1.5 0 0 1 6 3.5Z"
          stroke={a ? "#E4B04A" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8.3 8h5.4M8.3 10.8h3.6" stroke={a ? "#E4B04A" : "currentColor"} strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "reglages", label: "Réglages",
    icon: (a) => (
      <svg width="21" height="21" viewBox="0 0 20 20" fill="none">
        <path d="M10 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z" stroke={a ? "#E4B04A" : "currentColor"} strokeWidth="1.4" />
        <path d="M16.6 12.2a1.3 1.3 0 0 0 .26 1.44l.05.05a1.58 1.58 0 1 1-2.23 2.23l-.05-.05a1.3 1.3 0 0 0-1.44-.26 1.3 1.3 0 0 0-.79 1.19v.14a1.58 1.58 0 1 1-3.15 0v-.07a1.3 1.3 0 0 0-.85-1.19 1.3 1.3 0 0 0-1.44.26l-.05.05a1.58 1.58 0 1 1-2.23-2.23l.05-.05a1.3 1.3 0 0 0 .26-1.44 1.3 1.3 0 0 0-1.19-.79h-.14a1.58 1.58 0 1 1 0-3.15h.07a1.3 1.3 0 0 0 1.19-.85 1.3 1.3 0 0 0-.26-1.44l-.05-.05a1.58 1.58 0 1 1 2.23-2.23l.05.05a1.3 1.3 0 0 0 1.44.26h.06a1.3 1.3 0 0 0 .79-1.19v-.14a1.58 1.58 0 1 1 3.15 0v.07a1.3 1.3 0 0 0 .79 1.19h.06a1.3 1.3 0 0 0 1.44-.26l.05-.05a1.58 1.58 0 1 1 2.23 2.23l-.05.05a1.3 1.3 0 0 0-.26 1.44v.06a1.3 1.3 0 0 0 1.19.79h.14a1.58 1.58 0 1 1 0 3.15h-.07a1.3 1.3 0 0 0-1.19.79Z"
          stroke={a ? "#E4B04A" : "currentColor"} strokeWidth="1.1" />
      </svg>
    ),
  },
];

export default function TabBar({ active, onChange }) {
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {TABS.map((t) => {
        const a = active === t.id;
        return (
          <button key={t.id} className={"tab" + (a ? " tab-actif" : "")}
            onClick={() => onChange(t.id)} aria-current={a ? "page" : undefined}>
            <span className="tab-icon">{t.icon(a)}</span>
            <span className="tab-label">{t.label}</span>
            <span className="tab-corde" aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
