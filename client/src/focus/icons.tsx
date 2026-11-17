// Lucide icon shapes for Focus, drawn like the app's other icons. CSS sets the size.

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const BookOpenIcon = () => (
  <svg {...iconProps}>
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...iconProps} fill="currentColor">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...iconProps} fill="currentColor">
    <rect x="14" y="4" width="4" height="16" rx="1" />
    <rect x="6" y="4" width="4" height="16" rx="1" />
  </svg>
);

export const SkipBackIcon = () => (
  <svg {...iconProps}>
    <polygon points="19 20 9 12 19 4 19 20" />
    <line x1="5" x2="5" y1="19" y2="5" />
  </svg>
);

export const SkipForwardIcon = () => (
  <svg {...iconProps}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" x2="19" y1="5" y2="19" />
  </svg>
);

export const RewindIcon = () => (
  <svg {...iconProps}>
    <polygon points="11 19 2 12 11 5 11 19" />
    <polygon points="22 19 13 12 22 5 22 19" />
  </svg>
);

export const FastForwardIcon = () => (
  <svg {...iconProps}>
    <polygon points="13 19 22 12 13 5 13 19" />
    <polygon points="2 19 11 12 2 5 2 19" />
  </svg>
);

export const DownloadIcon = () => (
  <svg {...iconProps}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

export const UploadIcon = () => (
  <svg {...iconProps}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" x2="12" y1="3" y2="15" />
  </svg>
);

export const AudioLinesIcon = () => (
  <svg {...iconProps}>
    <path d="M2 10v3" />
    <path d="M6 6v11" />
    <path d="M10 3v18" />
    <path d="M14 8v7" />
    <path d="M18 5v13" />
    <path d="M22 10v3" />
  </svg>
);

export const ListIcon = () => (
  <svg {...iconProps}>
    <line x1="8" x2="21" y1="6" y2="6" />
    <line x1="8" x2="21" y1="12" y2="12" />
    <line x1="8" x2="21" y1="18" y2="18" />
    <line x1="3" x2="3.01" y1="6" y2="6" />
    <line x1="3" x2="3.01" y1="12" y2="12" />
    <line x1="3" x2="3.01" y1="18" y2="18" />
  </svg>
);

export const FolderIcon = () => (
  <svg {...iconProps}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

export const ChevronLeftIcon = () => (
  <svg {...iconProps}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg {...iconProps}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
