const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

export const LogoMark = ({ className = "logo-mark" }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7c5cff" />
        <stop offset="100%" stopColor="#ff6b9d" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#logo-gradient)" />
    <rect x="7" y="8" width="18" height="4" rx="2" fill="#fff" />
    <rect x="7" y="14" width="13" height="4" rx="2" fill="#fff" opacity="0.85" />
    <rect x="7" y="20" width="8" height="4" rx="2" fill="#fff" opacity="0.7" />
  </svg>
);

export const LinkIcon = () => (
  <svg {...baseProps}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const ArticleIcon = () => (
  <svg {...baseProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8M8 17h5" />
  </svg>
);

export const VideoIcon = () => (
  <svg {...baseProps}>
    <rect x="2" y="5" width="20" height="14" rx="3" />
    <path d="m10 9 5 3-5 3z" fill="currentColor" />
  </svg>
);

export const FolderIcon = () => (
  <svg {...baseProps}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const CopyIcon = () => (
  <svg {...baseProps}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const ShareIcon = () => (
  <svg {...baseProps}>
    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    <path d="m16 6-4-4-4 4M12 2v13" />
  </svg>
);

export const ArrowLeftIcon = () => (
  <svg {...baseProps}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export const ArrowRightIcon = () => (
  <svg {...baseProps}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

export const CheckIcon = () => (
  <svg {...baseProps}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...baseProps}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...baseProps}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const ClockIcon = () => (
  <svg {...baseProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const TrophyIcon = () => (
  <svg {...baseProps}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
);
