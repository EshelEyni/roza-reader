const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const ChevronIcon = () => (
  <svg {...iconProps} className="chevron">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const CopyIcon = () => (
  <svg {...iconProps}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...iconProps}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...iconProps}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const SearchIcon = () => (
  <svg {...iconProps} width={16} height={16}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const EditIcon = () => (
  <svg {...iconProps}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const SettingsIcon = () => (
  <svg {...iconProps} width={18} height={18}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

export const CheckIcon = () => (
  <svg {...iconProps} width={16} height={16} strokeWidth={2.5}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const BackIcon = () => (
  <svg {...iconProps}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...iconProps} width={16} height={16}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const RefreshIcon = () => (
  <svg {...iconProps}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5" />
  </svg>
);

export const ExternalIcon = () => (
  <svg {...iconProps} width={12} height={12}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

export const LinkIcon = () => (
  <svg {...iconProps}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);

export const GripIcon = () => (
  <svg {...iconProps} fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);
