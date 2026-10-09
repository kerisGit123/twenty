import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { MONTHS } from 'src/shared/months';
import { readValue } from 'src/front-components/shared/read-value';
import { FileDrop, type PickedFile, uploadFile } from 'src/front-components/shared/file-drop';
import { todayIso } from 'src/logic-functions/utils/dates';
import {
  type Audience,
  type CampaignMedia,
  type CampaignRow,
  CAMPAIGN_KINDS,
  EMPTY_AUDIENCE,
  EMPTY_NEWSLETTER,
  isVideo,
  kindOf,
  type Language,
  LANGUAGES,
  MAX_MEDIA_FILES,
  MEDIA_EXTENSIONS,
  messageFor,
  type NewsletterContent,
  newsletterText,
  OCCASIONS,
  occasionOf,
  PERSON_TAGS,
  CAMPAIGN_SOURCES,
  cycleStart,
  DEFAULT_SOURCE_OPTIONS,
  missingFields,
  NO_REPEAT,
  type Repeat,
  type SavedAudienceRow,
  sourceOf,
  type SourceOptions,
} from 'src/shared/campaigns';
import { OUTCOMES } from 'src/shared/contacts';
import { extensionOf, formatBytes } from 'src/shared/documents';

// The campaign editor: five short steps on the left (what, message, photo or
// video, who, when) and a live WhatsApp preview on the right.

type Owner = { id: string; name: string };
type Count = { total: number; noPhone: number; optedOut: number; sample: string[]; byLanguage: Record<string, number>; sampleValues: Record<string, string> | null };

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

// Sensible look-back / look-ahead per source.
const SOURCE_DAYS: Record<string, number[]> = { RECEIPTS: [7, 30, 60], THANK_YOU: [3, 7, 30], RENEWALS: [30, 60, 90], RENT_CHANGE: [30, 60, 90] };

export const repeatLabel = (repeat: Repeat) =>
  repeat.every === 'DAILY'
    ? 'Every day'
    : repeat.every === 'MONTHLY'
      ? `Every month on the ${ordinal(repeat.day ?? 1)}`
      : repeat.every === 'YEARLY'
        ? `Every year on ${repeat.day ?? 1} ${MONTHS[(repeat.month ?? 1) - 1]}`
        : 'Once';

const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const shortDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const daysUntil = (today: string, iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const post = <T,>(body: Record<string, unknown>) => new RestApiClient().post<T & { success: boolean; message?: string }>('/s/campaigns', body);

// "Hi {name}," alone doesn't count as a written message.
const isWritten = (text: string | undefined) => Boolean(text && text.replace(/\{name\}/g, '').replace(/^(Hi|Salam)\s*,?\s*/i, '').replace(/^，/, '').trim());

// WhatsApp-style formatting for the preview: *bold*, _italic_, ~strike~.
const formatted = (text: string): ReactNode[] =>
  text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g).map((part, index) => {
    if (/^\*[^*]+\*$/.test(part)) return <b key={index}>{part.slice(1, -1)}</b>;
    if (/^_[^_]+_$/.test(part)) return <i key={index}>{part.slice(1, -1)}</i>;
    if (/^~[^~]+~$/.test(part)) return <s key={index}>{part.slice(1, -1)}</s>;

    return <span key={index}>{part}</span>;
  });

// ---------------------------------------------------------------- styles

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  accent: 'var(--t-color-blue9)',
  radius: 'var(--t-border-radius-md)',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13.5,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: 10,
  height: 38,
  padding: '0 12px',
  boxSizing: 'border-box',
  minWidth: 0,
  width: '100%',
};

const button = (primary = false): CSSProperties => ({
  ...control,
  width: 'auto',
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  ...(primary ? { background: c.accent, color: '#fff', border: `1px solid ${c.accent}` } : {}),
});

const chip = (active: boolean): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 13,
  fontWeight: 500,
  height: 32,
  padding: '0 12px',
  borderRadius: 16,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  background: active ? 'var(--t-color-blue3)' : c.bg,
  color: active ? 'var(--t-color-blue11)' : c.text,
  border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
});

const tile = (active: boolean): CSSProperties => ({
  all: 'unset',
  cursor: 'pointer',
  boxSizing: 'border-box',
  borderRadius: 12,
  border: `${active ? 2 : 1}px solid ${active ? 'var(--t-color-blue8)' : c.border}`,
  background: active ? 'var(--t-color-blue2)' : c.bg,
  padding: active ? '9px 11px' : '10px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
});

const Step = ({ n, title, hint, children, right }: { n: number; title: string; hint?: string; children: ReactNode; right?: ReactNode }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 18, borderBottom: `1px solid ${c.border}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--t-color-blue3)', color: 'var(--t-color-blue11)', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {n}
      </span>
      <span style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 15, fontWeight: 650 }}>{title}</span>
        {hint && <span style={{ fontSize: 12, color: c.text3 }}>{hint}</span>}
      </span>
      {right}
    </div>
    {children}
  </section>
);

// ---------------------------------------------------------------- phone preview

const PhonePreview = ({ text, media, pending, recipient }: { text: string; media: CampaignMedia[]; pending: PickedFile[]; recipient: string }) => {
  const first = media[0];
  const pendingFirst = pending[0];

  return (
    <div style={{ borderRadius: 26, border: '8px solid #1f2023', overflow: 'hidden', background: '#efeae2', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxWidth: 340, margin: '0 auto', width: '100%' }}>
      <div style={{ background: '#075e54', color: '#fff', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: c.font }}>
        <span style={{ width: 30, height: 30, borderRadius: 15, background: '#cfd8dc', color: '#37474f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
          {(recipient || '?').charAt(0).toUpperCase()}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{recipient || 'Recipient'}</span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>online</span>
        </span>
      </div>
      <div style={{ padding: '14px 10px 18px', minHeight: 260, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: '88%', background: '#d9fdd3', borderRadius: '10px 10px 2px 10px', padding: 4, boxShadow: '0 1px 1px rgba(0,0,0,0.13)', fontFamily: c.font }}>
          {first ? (
            isVideo(first.extension) ? (
              <video src={first.url} style={{ width: '100%', borderRadius: 8, display: 'block', background: '#000' }} />
            ) : first.extension === 'pdf' ? (
              <div style={{ padding: 12, background: '#c7f0bf', borderRadius: 8, fontSize: 12.5 }}>📄 {first.label}</div>
            ) : (
              <img src={first.url} alt={first.label} style={{ width: '100%', borderRadius: 8, display: 'block', maxHeight: 220, objectFit: 'cover' }} />
            )
          ) : pendingFirst ? (
            <div style={{ padding: '18px 12px', background: '#c7f0bf', borderRadius: 8, fontSize: 12.5, textAlign: 'center' }}>
              {/\.(mp4|mov|3gp)$/i.test(pendingFirst.name) ? '🎬' : '🖼️'} {pendingFirst.name}
              <div style={{ fontSize: 11, color: '#4a6b44' }}>uploads when you save</div>
            </div>
          ) : null}
          {media.length + pending.length > 1 && <div style={{ fontSize: 11, color: '#4a6b44', padding: '2px 6px' }}>+{media.length + pending.length - 1} more</div>}
          <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '4px 6px 2px', color: '#111b21' }}>
            {text ? formatted(text) : <span style={{ color: '#667781' }}>Your message shows here.</span>}
          </div>
          <div style={{ fontSize: 10.5, color: '#667781', textAlign: 'right', padding: '0 6px 2px' }}>9:41 ✓✓</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- editor

export const CampaignEditor = ({
  initial,
  owners,
  canUseTags,
  audiences = [],
  pastCampaigns = [],
  onClose,
  onSaved,
}: {
  initial: Partial<CampaignRow>;
  owners: Owner[];
  canUseTags: boolean;
  audiences?: SavedAudienceRow[];
  pastCampaigns?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const today = todayIso();
  const [kind, setKind] = useState(initial.kind ?? 'GREETING');
  const [occasion, setOccasion] = useState(initial.occasion ?? 'CUSTOM');
  const [name, setName] = useState(initial.name ?? '');
  const [sendOn, setSendOn] = useState(initial.sendOn ?? today);
  const [ownerId, setOwnerId] = useState(initial.ownerId ?? owners[0]?.id ?? '');
  const [audience, setAudience] = useState<Audience>(initial.audience ?? { ...EMPTY_AUDIENCE });
  const [messages, setMessages] = useState<Record<Language, string>>(initial.messages ?? { EN: '', MS: '', ZH: '' });
  const [content, setContent] = useState<NewsletterContent>(initial.content ?? { ...EMPTY_NEWSLETTER });
  const [media, setMedia] = useState<CampaignMedia[]>(initial.media ?? []);
  const [pending, setPending] = useState<PickedFile[]>([]);
  const [lang, setLang] = useState<Language>('EN');
  const [count, setCount] = useState<Count | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Array<{ id: string; name: string; phone: string | null; optedOut: boolean }>>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [source, setSource] = useState(initial.source ?? 'NONE');
  const [sourceOptions, setSourceOptions] = useState<SourceOptions>(initial.sourceOptions ?? { ...DEFAULT_SOURCE_OPTIONS });
  const [repeat, setRepeat] = useState<Repeat>(initial.repeat ?? NO_REPEAT);
  const [saved, setSaved] = useState<SavedAudienceRow[]>(audiences);
  const [audienceName, setAudienceName] = useState<string | null>(null);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smart = kind === 'RENTAL' && source !== 'NONE';
  // Rent & receipts count messages: one tenant can get two receipts.
  const unit = (n: number) => (smart ? (n === 1 ? 'message' : 'messages') : n === 1 ? 'person' : 'people');
  const sourceInfo = sourceOf(smart ? source : 'NONE');

  const occasionInfo = occasionOf(occasion);
  const occasionDate = (value: string) => {
    const o = occasionOf(value);
    const year = Number(today.slice(0, 4));

    return [year, year + 1].map((y) => o.dates[y]).find((d) => d && d >= addDays(today, -3)) ?? null;
  };

  useEffect(() => {
    if (kind === 'NEWSLETTER') setMessages((m) => ({ ...m, EN: newsletterText(content, 'EN') }));
  }, [kind, content]);

  // A new rent & receipts campaign starts on rent reminders.
  useEffect(() => {
    if (kind === 'RENTAL' && source === 'NONE') pickSource('RENT_DUE');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live audience size.
  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(async () => {
      const result = await post<Partial<Count>>({ action: 'count', audience, source: smart ? source : 'NONE', sourceOptions });

      if (result.success) {
        setCount({
          total: result.total ?? 0,
          noPhone: result.noPhone ?? 0,
          optedOut: result.optedOut ?? 0,
          sample: result.sample ?? [],
          byLanguage: result.byLanguage ?? {},
          sampleValues: result.sampleValues ?? null,
        });
      }
    }, 400);
  }, [audience, smart, source, sourceOptions]);

  useEffect(() => {
    const term = search.trim();

    if (term.length < 2) {
      setFound([]);

      return;
    }

    const timer = setTimeout(async () => {
      const result = await post<{ people?: typeof found }>({ action: 'people', query: term });

      if (result.success) setFound(result.people ?? []);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const pickOccasion = (value: string) => {
    const o = occasionOf(value);
    const date = occasionDate(value);

    setOccasion(value);
    setMessages({ ...o.messages });
    if (value !== 'CUSTOM') {
      setName(`${o.label} ${(date ?? today).slice(0, 4)}`);
      if (date) setSendOn(date);
    }
  };

  const pickSource = (value: string) => {
    const s = sourceOf(value);
    const year = Number(today.slice(0, 4));

    setSource(value);
    setMessages({ ...s.messages });
    setRepeat(s.repeat);
    setName(s.label);
    setSourceOptions({
      ...DEFAULT_SOURCE_OPTIONS,
      ownerIds: sourceOptions.ownerIds,
      ...(SOURCE_DAYS[value] ? { days: SOURCE_DAYS[value][1] } : {}),
      ...(value === 'STATEMENTS' ? { year: Number(today.slice(5, 7)) <= 3 ? year - 1 : year } : {}),
    });
    if (s.repeat.every !== 'NONE') setSendOn(cycleStart(s.repeat, today));
  };

  const pickKind = (value: string) => {
    setKind(value);
    if (value === 'RENTAL' && source === 'NONE') pickSource('RENT_DUE');
    if (value !== 'RENTAL') setRepeat(NO_REPEAT);
  };

  const saveAudience = async () => {
    const label = (audienceName ?? '').trim();

    if (!label) return;
    const result = await post<{ id?: string }>({ action: 'saveAudience', name: label, audience, ownerId: ownerId || null });

    await enqueueSnackbar({ message: result.message ?? (result.success ? 'Audience saved.' : 'Could not save.'), variant: result.success ? 'success' : 'error' });
    if (result.success && result.id) {
      setSaved([...saved, { id: result.id, name: label, audience, ownerId: ownerId || null }]);
      setAudienceName(null);
    }
  };

  const insertField = (key: string) => setMessages({ ...messages, [lang]: `${messages[lang]}${messages[lang] && !/\s$/.test(messages[lang]) ? ' ' : ''}{${key}}` });

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const addMedia = async (files: PickedFile[]) => {
    const room = MAX_MEDIA_FILES - media.length - pending.length;
    const picked = files.filter((f) => MEDIA_EXTENSIONS.includes(extensionOf(f.name))).slice(0, Math.max(0, room));

    if (picked.length < files.length) {
      await enqueueSnackbar({ message: `Add up to ${MAX_MEDIA_FILES} photos, videos (MP4, up to 16 MB) or PDFs.`, variant: 'warning' });
    }
    if (!picked.length) return;

    // A saved campaign uploads straight away; a new one when it's saved.
    if (!initial.id) {
      setPending([...pending, ...picked]);

      return;
    }
    setBusy('media');
    for (const file of picked) {
      const result = await uploadFile(file, { campaignId: initial.id }, MEDIA_EXTENSIONS);

      if (!result.success) await enqueueSnackbar({ message: result.message ?? 'Upload failed.', variant: 'error' });
    }
    await refreshMedia();
    setBusy('');
  };

  const refreshMedia = async () => {
    const result = await post<{ campaigns?: CampaignRow[] }>({ action: 'list' });
    const fresh = result.campaigns?.find((x) => x.id === initial.id);

    if (fresh) setMedia(fresh.media);
  };

  const removeMedia = async (fileId: string) => {
    setBusy('media');
    await new RestApiClient().post('/s/files', { action: 'removeCampaignFile', campaignId: initial.id, fileId });
    await refreshMedia();
    setBusy('');
  };

  const save = async (status: 'DRAFT' | 'SCHEDULED' | 'TEMPLATE') => {
    setBusy(status);
    try {
      const copy = status === 'TEMPLATE' && initial.status !== 'TEMPLATE';
      const result = await post<{ id?: string }>({
        action: 'save',
        campaign: {
          id: copy ? undefined : initial.id,
          ...(copy && media.length ? { media } : {}),
          name: name.trim() || (kind === 'GREETING' ? occasionInfo.label : kindOf(kind).label),
          kind,
          occasion: kind === 'GREETING' ? occasion : 'CUSTOM',
          status,
          sendOn: repeat.every !== 'NONE' ? cycleStart(repeat, today) : sendOn,
          ownerId,
          audience,
          source: smart ? source : 'NONE',
          sourceOptions,
          repeat: kind === 'RENTAL' ? repeat : NO_REPEAT,
          // Started from a template (or saved as one): keep its photos.
          ...(!initial.id && media.length ? { media } : {}),
          messages: kind === 'NEWSLETTER' ? { ...messages, EN: newsletterText(content, 'EN') } : messages,
          content: kind === 'NEWSLETTER' ? content : null,
        },
      });

      if (!result.success || !result.id) {
        await enqueueSnackbar({ message: result.message ?? 'Could not save.', variant: 'error' });

        return;
      }

      let failed = 0;

      for (const file of copy ? [] : pending) {
        const upload = await uploadFile(file, { campaignId: result.id }, MEDIA_EXTENSIONS);

        if (!upload.success) failed += 1;
      }
      await enqueueSnackbar({
        message:
          (status === 'TEMPLATE' ? 'Saved as a template — start new campaigns from it.' : status === 'DRAFT' ? 'Saved as a draft.' : repeat.every !== 'NONE' ? `Saved — repeats ${repeatLabel(repeat).toLowerCase()}; each round shows on Today.` : sendOn <= today ? 'Saved — ready to send.' : `Scheduled for ${day(sendOn)} — it shows on Today.`) +
          (failed ? ` ${failed} file${failed === 1 ? '' : 's'} couldn’t be added.` : ''),
        variant: failed ? 'warning' : 'success',
      });
      if (copy) return; // keep editing the campaign itself
      await onSaved();
    } finally {
      setBusy('');
    }
  };

  const built = kind === 'NEWSLETTER' ? newsletterText(content, lang) : '';
  const shownMessages = kind === 'NEWSLETTER' ? { ...messages, EN: newsletterText(content, 'EN') } : messages;
  const sampleName = (count?.sample[0] ?? 'Ahmad Rahman').split(' ')[0];
  const examples = Object.fromEntries(sourceInfo.fields.map((f) => [f.key, f.example]));
  const previewValues = smart ? { ...examples, ...(count?.sampleValues ?? {}) } : {};
  const previewText = messageFor(shownMessages, lang, sampleName, previewValues);
  const usedKeys = [...new Set([...(shownMessages[lang] ?? '').matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];
  const unknownKeys = usedKeys.filter((key) => key !== 'name' && !sourceInfo.fields.some((f) => f.key === key));
  const emptyKeys = smart && count?.sampleValues ? missingFields(shownMessages[lang] ?? '', count.sampleValues).filter((key) => !unknownKeys.includes(key)) : [];
  const writtenAny = LANGUAGES.some((l) => isWritten(shownMessages[l.value]));
  const languageNeeded = (value: Language) => (count?.byLanguage?.[value] ?? 0) > 0;

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text, position: 'relative' }}>
      {previewOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', padding: 14, gap: 10, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 2, gap: 2 }}>
              {LANGUAGES.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLang(l.value)}
                  style={{ ...button(), height: 32, border: 'none', background: lang === l.value ? '#fff' : 'transparent', color: lang === l.value ? '#111' : '#fff' }}
                >
                  {l.short}
                </button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            <button onClick={() => setPreviewOpen(false)} style={{ ...button(), height: 36 }}>
              Close preview
            </button>
          </div>
          <PhonePreview text={previewText} media={media} pending={pending} recipient={count?.sample[0] ?? 'Ahmad Rahman'} />
        </div>
      )}
      {/* Header */}
      <div style={{ padding: '12px clamp(12px, 3cqw, 18px)', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>{kind === 'GREETING' ? occasionInfo.icon : kindOf(kind).icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 15.5, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {name.trim() || (initial.id ? 'Edit campaign' : `New ${kindOf(kind).label.toLowerCase()}`)}
          </div>
          <div style={{ fontSize: 12.5, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {kindOf(kind).label} · {sendOn <= today ? 'today' : shortDay(sendOn)} · {count ? `${count.total} ${unit(count.total)}` : '…'}
          </div>
        </div>
        <button onClick={() => setPreviewOpen(true)} style={{ ...button(), height: 34, padding: '0 10px' }} title="See it as a WhatsApp message">
          👁 Preview
        </button>
        <button onClick={onClose} style={{ ...button(), width: 34, height: 34, padding: 0, border: 'none', fontSize: 18, background: 'transparent' }} aria-label="Close">
          ×
        </button>
      </div>

      {/* Steps + preview */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: 24, padding: 'clamp(12px, 3cqw, 18px)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {/* 1. What */}
            <Step n={1} title="What are you sending?">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, calc(50% - 4px)), 1fr))', gap: 8 }}>
                {CAMPAIGN_KINDS.map((k) => (
                  <button key={k.value} onClick={() => pickKind(k.value)} style={{ ...tile(kind === k.value), flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', textAlign: 'center' }}>
                    <span style={{ fontSize: 20 }}>{k.icon}</span>
                    <span style={{ fontSize: 'clamp(11px, 3.2cqw, 13.5px)', fontWeight: 600, maxWidth: '100%', lineHeight: 1.2, overflowWrap: 'anywhere' }}>{k.label}</span>
                  </button>
                ))}
              </div>
              {kind === 'GREETING' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, calc(50% - 4px)), 1fr))', gap: 8 }}>
                  {OCCASIONS.map((o) => {
                    const date = occasionDate(o.value);
                    const away = date ? daysUntil(today, date) : null;

                    return (
                      <button key={o.value} onClick={() => pickOccasion(o.value)} style={{ ...tile(occasion === o.value), gap: 8, padding: occasion === o.value ? '7px 9px' : '8px 10px' }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{o.icon}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {o.value === 'CUSTOM' ? 'Something else' : o.label}
                          </span>
                          <span style={{ fontSize: 11.5, color: c.text3, whiteSpace: 'nowrap' }}>
                            {date ? `${shortDay(date)}${o.approx ? '*' : ''} · ${away !== null && away <= 0 ? 'now' : `${away}d`}` : 'any day'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {kind === 'RENTAL' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 8 }}>
                  {CAMPAIGN_SOURCES.filter((s) => s.value !== 'NONE').map((s) => (
                    <button key={s.value} onClick={() => pickSource(s.value)} style={{ ...tile(source === s.value), alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                        <span style={{ fontSize: 11.5, color: c.text3, lineHeight: 1.35 }}>{s.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {kind === 'GREETING' && occasionInfo.approx && (
                <span style={{ fontSize: 12, color: c.text3 }}>* {occasionInfo.label} follows the moon — the date can move by a day once officially announced.</span>
              )}
            </Step>

            {/* 2. Message */}
            <Step
              n={2}
              title="Message"
              hint={smart ? 'Tap a field to add it — each tenant’s own numbers are filled in.' : 'Each person gets their language; {name} becomes their first name.'}
              right={
                <div style={{ display: 'flex', background: c.bg2, borderRadius: 10, padding: 2, gap: 2 }}>
                  {LANGUAGES.map((l) => {
                    const written = isWritten(shownMessages[l.value]);

                    return (
                      <button
                        key={l.value}
                        onClick={() => setLang(l.value)}
                        title={written ? `${l.label}: written` : languageNeeded(l.value) ? `${l.label}: ${count?.byLanguage[l.value]} people read this — they’ll get English` : `${l.label}: not written`}
                        style={{
                          ...button(),
                          height: 30,
                          border: 'none',
                          padding: '0 10px',
                          background: lang === l.value ? c.bg : 'transparent',
                          boxShadow: lang === l.value ? `0 0 0 1px ${c.border2}` : 'none',
                          color: lang === l.value ? c.text : c.text3,
                        }}
                      >
                        {l.short}
                        <span style={{ width: 7, height: 7, borderRadius: 4, background: written ? 'var(--t-color-green9)' : languageNeeded(l.value) ? 'var(--t-color-amber9)' : c.border2 }} />
                      </button>
                    );
                  })}
                </div>
              }
            >
              {kind === 'NEWSLETTER' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={content.title} onChange={(e) => setContent({ ...content, title: readValue(e) })} placeholder="Title — e.g. Property update, October" style={{ ...control, fontWeight: 600 }} />
                  <textarea
                    value={content.intro}
                    onChange={(e) => setContent({ ...content, intro: readValue(e) })}
                    placeholder="Intro (optional) — Hi {name}, here’s what’s new this month…"
                    rows={2}
                    style={{ ...control, height: 'auto', padding: '9px 12px', resize: 'vertical' }}
                  />
                  {content.items.map((item, index) => (
                    <div key={index} style={{ borderLeft: '3px solid var(--t-color-blue7)', paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={item.headline}
                          onChange={(e) => setContent({ ...content, items: content.items.map((x, i) => (i === index ? { ...x, headline: readValue(e) } : x)) })}
                          placeholder={`Story ${index + 1} headline`}
                          style={{ ...control, fontWeight: 600 }}
                        />
                        {content.items.length > 1 && (
                          <button onClick={() => setContent({ ...content, items: content.items.filter((_, i) => i !== index) })} style={{ ...button(), width: 38, padding: 0 }} aria-label="Remove story">
                            ×
                          </button>
                        )}
                      </div>
                      <textarea
                        value={item.text}
                        onChange={(e) => setContent({ ...content, items: content.items.map((x, i) => (i === index ? { ...x, text: readValue(e) } : x)) })}
                        placeholder="A line or two — what it means for them"
                        rows={2}
                        style={{ ...control, height: 'auto', padding: '9px 12px', resize: 'vertical' }}
                      />
                      <input
                        value={item.link}
                        onChange={(e) => setContent({ ...content, items: content.items.map((x, i) => (i === index ? { ...x, link: readValue(e) } : x)) })}
                        placeholder="🔗 Link (optional)"
                        style={control}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {content.items.length < 8 && (
                      <button onClick={() => setContent({ ...content, items: [...content.items, { headline: '', text: '', link: '' }] })} style={button()}>
                        ＋ Add a story
                      </button>
                    )}
                    <button onClick={() => setContent({ ...content, optOut: !content.optOut })} style={chip(content.optOut)}>
                      {content.optOut ? '✓ ' : ''}“Reply STOP” line
                    </button>
                  </div>
                  <input value={content.closing} onChange={(e) => setContent({ ...content, closing: readValue(e) })} placeholder="Sign-off (optional) — Have a great week! — Keris" style={control} />
                </div>
              )}
              {kind === 'NEWSLETTER' && lang === 'EN' ? (
                <span style={{ fontSize: 12, color: c.text3 }}>The English message is built from the newsletter above — see it on the right. BM and 中文 are optional.</span>
              ) : (
                <>
                  <textarea
                    value={messages[lang]}
                    onChange={(e) => setMessages({ ...messages, [lang]: readValue(e) })}
                    placeholder={lang === 'EN' ? 'Hi {name}, …' : lang === 'MS' ? 'Salam {name}, …' : '{name}，…'}
                    rows={7}
                    style={{ ...control, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5, fontSize: 14 }}
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {smart ? (
                      sourceInfo.fields.map((f) => (
                        <button key={f.key} onClick={() => insertField(f.key)} title={`e.g. ${f.example}`} style={{ ...chip(false), height: 28, fontSize: 12.5, padding: '0 10px' }}>
                          ＋ {f.label}
                        </button>
                      ))
                    ) : (
                      <button onClick={() => insertField('name')} style={{ ...chip(false), height: 28 }}>
                        ＋ name
                      </button>
                    )}
                    <button onClick={() => setMessages({ ...messages, [lang]: `${messages[lang]}*bold*` })} style={{ ...chip(false), height: 28, fontWeight: 700 }}>
                      B
                    </button>
                    {smart && sourceInfo.messages[lang] !== messages[lang] && (
                      <button onClick={() => setMessages({ ...messages, [lang]: sourceInfo.messages[lang] })} style={{ ...chip(false), height: 28 }}>
                        ↺ Ready-made {LANGUAGES.find((l) => l.value === lang)?.short}
                      </button>
                    )}
                    {kind === 'GREETING' && occasion !== 'CUSTOM' && (
                      <button onClick={() => setMessages({ ...messages, [lang]: occasionInfo.messages[lang] })} style={{ ...chip(false), height: 28 }}>
                        ↺ Ready-made {LANGUAGES.find((l) => l.value === lang)?.short}
                      </button>
                    )}
                    {kind === 'NEWSLETTER' && built.trim() && !isWritten(messages[lang]) && (
                      <button onClick={() => setMessages({ ...messages, [lang]: newsletterText(content, lang) })} style={{ ...chip(false), height: 28 }}>
                        Start from English
                      </button>
                    )}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11.5, color: c.text3 }}>{messages[lang].length} characters</span>
                  </div>
                  {unknownKeys.length > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>
                      {unknownKeys.map((k) => `{${k}}`).join(', ')} {unknownKeys.length === 1 ? 'isn’t' : 'aren’t'} filled in for this campaign — {smart ? 'use the fields above' : 'only {name} works here'}.
                    </span>
                  )}
                  {emptyKeys.includes('pay_to') && (
                    <span style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>
                      {'{pay_to}'} is empty — add “How tenants pay you” in Receipt settings (Rent ledger → ⚙ Receipt settings).
                    </span>
                  )}
                </>
              )}
            </Step>

            {/* 3. Photo or video */}
            <Step
              n={3}
              title="Photo or video"
              hint="Optional — a festive card, a flyer, a short clip."
              right={<span style={{ fontSize: 12, color: c.text3 }}>{media.length + pending.length}/{MAX_MEDIA_FILES}</span>}
            >
              {(media.length > 0 || pending.length > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {media.map((m) => (
                    <div key={m.fileId} style={{ position: 'relative', width: 96, height: 96, borderRadius: 10, overflow: 'hidden', border: `1px solid ${c.border}`, background: c.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                      {isVideo(m.extension) ? '🎬' : m.extension === 'pdf' ? '📄' : <img src={m.url} alt={m.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      <button
                        onClick={() => removeMedia(m.fileId)}
                        disabled={busy !== ''}
                        aria-label="Remove"
                        style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 13, padding: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {pending.map((p, index) => (
                    <div key={`${p.name}-${index}`} style={{ position: 'relative', width: 96, height: 96, borderRadius: 10, border: `1px dashed ${c.border2}`, background: c.bg2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, boxSizing: 'border-box' }}>
                      <span style={{ fontSize: 24 }}>{/\.(mp4|mov|3gp)$/i.test(p.name) ? '🎬' : '🖼️'}</span>
                      <span style={{ fontSize: 10.5, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{p.name}</span>
                      <span style={{ fontSize: 10, color: c.text3 }}>{formatBytes(p.size)}</span>
                      <button
                        onClick={() => setPending(pending.filter((_, i) => i !== index))}
                        aria-label="Remove"
                        style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 13, padding: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {smart && sourceInfo.attachment && (
                <div style={{ borderRadius: 10, background: 'var(--t-color-green2)', border: '1px solid var(--t-color-green6)', padding: '9px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
                  📎 Each tenant’s {sourceInfo.attachment === 'receipt' ? 'receipt' : 'year statement'} PDF goes with their message — no need to add it here.
                  {sourceInfo.attachment === 'receipt' && ' Receipts are marked sent as you tick them off.'}
                </div>
              )}
              {media.length + pending.length < MAX_MEDIA_FILES && (
                <FileDrop
                  compact
                  onFiles={addMedia}
                  disabled={busy === 'media'}
                  accept="image/*,video/mp4,video/quicktime,video/3gpp,application/pdf"
                  title={busy === 'media' ? 'Uploading…' : 'Drop a photo or video'}
                  hint="or tap to choose — JPG / PNG, MP4 up to 16 MB"
                />
              )}
              {(media.length > 0 || pending.length > 0) && (
                <span style={{ fontSize: 12, color: c.text3, lineHeight: 1.5 }}>
                  WhatsApp links carry text only, so photos go with <b>Share</b> on your phone (it attaches the photo and the message), or on a computer: copy the photo, open the chat, paste.
                </span>
              )}
            </Step>

            {/* 4. Who */}
            <Step n={4} title="Who gets it" hint={smart ? 'Worked out from your ledger each time you open it.' : undefined}>
              {smart && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {source === 'RENT_DUE' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => setSourceOptions({ ...sourceOptions, status: 'overdue' })} style={chip(sourceOptions.status !== 'due')}>
                        Overdue only
                      </button>
                      <button onClick={() => setSourceOptions({ ...sourceOptions, status: 'due' })} style={chip(sourceOptions.status === 'due')}>
                        Overdue + due this week
                      </button>
                    </div>
                  )}
                  {SOURCE_DAYS[source] && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: c.text3 }}>{source === 'RENEWALS' ? 'Ending within' : source === 'RENT_CHANGE' ? 'Changing within' : 'Paid in the last'}</span>
                      {SOURCE_DAYS[source].map((d) => (
                        <button key={d} onClick={() => setSourceOptions({ ...sourceOptions, days: d })} style={{ ...chip(sourceOptions.days === d), height: 28 }}>
                          {d} days
                        </button>
                      ))}
                    </div>
                  )}
                  {source === 'STATEMENTS' && repeat.every !== 'NONE' && (
                    <span style={{ fontSize: 12, color: c.text3 }}>Each round sends the year just ended (sent in Jan–Mar: last year’s statement).</span>
                  )}
                  {source === 'STATEMENTS' && repeat.every === 'NONE' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: c.text3 }}>Year</span>
                      {[Number(today.slice(0, 4)) - 1, Number(today.slice(0, 4))].map((y) => (
                        <button key={y} onClick={() => setSourceOptions({ ...sourceOptions, year: y })} style={{ ...chip(sourceOptions.year === y), height: 28 }}>
                          {y}
                        </button>
                      ))}
                    </div>
                  )}
                  {owners.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: c.text3 }}>in</span>
                      <button onClick={() => setSourceOptions({ ...sourceOptions, ownerIds: [] })} style={{ ...chip(sourceOptions.ownerIds.length === 0), height: 28 }}>
                        All workspaces
                      </button>
                      {owners.map((o) => (
                        <button key={o.id} onClick={() => setSourceOptions({ ...sourceOptions, ownerIds: toggle(sourceOptions.ownerIds, o.id) })} style={{ ...chip(sourceOptions.ownerIds.includes(o.id)), height: 28 }}>
                          {o.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!smart && saved.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: c.text3 }}>Saved</span>
                  {saved.map((a) => (
                    <button key={a.id} onClick={() => setAudience({ ...a.audience })} style={{ ...chip(JSON.stringify(a.audience) === JSON.stringify(audience)), height: 28 }}>
                      👥 {a.name}
                    </button>
                  ))}
                </div>
              )}
              {!smart && (
              <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {(
                  [
                    ['active', 'Current tenants', '🏠'],
                    ['all', 'All tenants', '🗂'],
                    ['none', 'No tenants', '—'],
                  ] as const
                ).map(([value, label, icon]) => (
                  <button key={value} onClick={() => setAudience({ ...audience, tenants: value })} style={{ ...tile(audience.tenants === value), justifyContent: 'center' }}>
                    <span>{icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                  </button>
                ))}
              </div>
              {owners.length > 1 && audience.tenants !== 'none' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: c.text3 }}>in</span>
                  <button onClick={() => setAudience({ ...audience, ownerIds: [] })} style={{ ...chip(audience.ownerIds.length === 0), height: 28 }}>
                    All workspaces
                  </button>
                  {owners.map((o) => (
                    <button key={o.id} onClick={() => setAudience({ ...audience, ownerIds: toggle(audience.ownerIds, o.id) })} style={{ ...chip(audience.ownerIds.includes(o.id)), height: 28 }}>
                      {o.name}
                    </button>
                  ))}
                </div>
              )}
              {canUseTags && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: c.text3 }}>plus</span>
                  {PERSON_TAGS.map((t) => (
                    <button key={t.value} onClick={() => setAudience({ ...audience, tags: toggle(audience.tags, t.value) })} style={{ ...chip(audience.tags.includes(t.value)), height: 28 }}>
                      {audience.tags.includes(t.value) ? '✓ ' : ''}
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <input value={search} onChange={(e) => setSearch(readValue(e))} placeholder="🔍  Add someone by name" style={control} />
                {found.length > 0 && (
                  <div style={{ marginTop: 6, border: `1px solid ${c.border}`, borderRadius: 10, maxHeight: 200, overflow: 'auto' }}>
                    {found.map((p) => {
                      const added = audience.include.includes(p.id);

                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setNames({ ...names, [p.id]: p.name });
                            setAudience({ ...audience, include: toggle(audience.include, p.id), exclude: audience.exclude.filter((x) => x !== p.id) });
                          }}
                          style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: '100%', display: 'flex', gap: 8, padding: '9px 12px', borderTop: `1px solid ${c.border}`, fontSize: 13 }}
                        >
                          <span style={{ flex: 1 }}>{p.name}</span>
                          <span style={{ color: c.text3 }}>{p.optedOut ? 'opted out' : p.phone ?? 'no number'}</span>
                          <span style={{ color: added ? 'var(--t-color-green11)' : 'var(--t-color-blue11)', fontWeight: 600 }}>{added ? '✓' : '＋'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {audience.include.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {audience.include.map((id) => (
                    <button key={id} onClick={() => setAudience({ ...audience, include: audience.include.filter((x) => x !== id) })} style={{ ...chip(true), height: 28 }} title="Remove">
                      {names[id] ?? 'Added person'} ×
                    </button>
                  ))}
                </div>
              )}
              {pastCampaigns.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: c.text3 }}>plus people who replied to</span>
                    <select
                      value={audience.fromReplies?.campaignId ?? ''}
                      onChange={(e) => {
                        const v = readValue(e);

                        setAudience({ ...audience, fromReplies: v ? { campaignId: v, outcomes: audience.fromReplies?.outcomes.length ? audience.fromReplies.outcomes : ['INTERESTED'] } : undefined });
                      }}
                      style={{ ...control, width: 'auto', height: 30, flex: '1 1 160px' }}
                    >
                      <option value="">— no campaign —</option>
                      {pastCampaigns.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {audience.fromReplies && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {OUTCOMES.map((o) => (
                        <button
                          key={o.value}
                          onClick={() => audience.fromReplies && setAudience({ ...audience, fromReplies: { ...audience.fromReplies, outcomes: toggle(audience.fromReplies.outcomes, o.value) } })}
                          style={{ ...chip(Boolean(audience.fromReplies?.outcomes.includes(o.value))), height: 28 }}
                        >
                          {o.icon} {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {audienceName === null ? (
                <button onClick={() => setAudienceName('')} style={{ ...button(), alignSelf: 'flex-start', height: 30, border: 'none', background: 'transparent', padding: 0, color: 'var(--t-color-blue11)', fontSize: 12.5 }}>
                  💾 Save this audience
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={audienceName} onChange={(e) => setAudienceName(readValue(e))} placeholder="Name — e.g. Tenants at Residensi Mawar" style={{ ...control, height: 34 }} />
                  <button onClick={saveAudience} disabled={!audienceName.trim()} style={{ ...button(true), height: 34 }}>
                    Save
                  </button>
                  <button onClick={() => setAudienceName(null)} style={{ ...button(), height: 34 }}>
                    Cancel
                  </button>
                </div>
              )}
              </>
              )}
              <div style={{ borderRadius: 12, background: c.bg2, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {count === null ? 'Counting…' : count.total === 0 ? 'Nobody yet' : `${smart ? '💬' : '👥'} ${count.total} ${unit(count.total)}`}
                  {count && count.total > 0 && (
                    <span style={{ fontWeight: 400, color: c.text3 }}>
                      {' '}
                      · {LANGUAGES.filter((l) => count.byLanguage[l.value]).map((l) => `${l.short} ${count.byLanguage[l.value]}`).join(' · ')}
                    </span>
                  )}
                </span>
                {count && count.sample.length > 0 && <span style={{ fontSize: 12, color: c.text3 }}>{count.sample.slice(0, 5).join(', ')}{count.total > 5 ? '…' : ''}</span>}
                {count && (count.noPhone > 0 || count.optedOut > 0) && (
                  <span style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>
                    {count.noPhone ? `${count.noPhone} without a phone number` : ''}
                    {count.noPhone && count.optedOut ? ' · ' : ''}
                    {count.optedOut ? `${count.optedOut} opted out (left out)` : ''}
                  </span>
                )}
              </div>
            </Step>

            {/* 5. When */}
            <Step n={5} title="When & name" hint={repeat.every !== 'NONE' ? `${repeatLabel(repeat)} — it comes back to Today with a fresh list.` : undefined}>
              {kind === 'RENTAL' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(['NONE', 'DAILY', 'MONTHLY', 'YEARLY'] as const).map((every) => (
                    <button
                      key={every}
                      onClick={() => setRepeat(every === 'NONE' ? NO_REPEAT : every === 'MONTHLY' ? { every, day: repeat.day ?? 5 } : every === 'YEARLY' ? { every, month: repeat.month ?? 1, day: repeat.day ?? 5 } : { every })}
                      style={{ ...chip(repeat.every === every), height: 30 }}
                    >
                      {every === 'NONE' ? 'Once' : every === 'DAILY' ? 'Every day' : every === 'MONTHLY' ? 'Monthly' : 'Yearly'}
                    </button>
                  ))}
                  {repeat.every === 'YEARLY' && (
                    <select value={String(repeat.month ?? 1)} onChange={(e) => setRepeat({ ...repeat, month: Number(readValue(e)) })} style={{ ...control, width: 'auto', height: 30 }}>
                      {MONTHS.map((m, i) => (
                        <option key={m} value={String(i + 1)}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                  {(repeat.every === 'MONTHLY' || repeat.every === 'YEARLY') && (
                    <select value={String(repeat.day ?? 1)} onChange={(e) => setRepeat({ ...repeat, day: Number(readValue(e)) })} style={{ ...control, width: 'auto', height: 30 }} title="Day of the month">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={String(d)}>
                          {ordinal(d)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {repeat.every === 'NONE' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => setSendOn(today)} style={chip(sendOn === today)}>
                  Today
                </button>
                {kind === 'GREETING' && occasion !== 'CUSTOM' && occasionDate(occasion) && (
                  <>
                    <button onClick={() => setSendOn(addDays(occasionDate(occasion) as string, -1))} style={chip(sendOn === addDays(occasionDate(occasion) as string, -1))}>
                      Eve · {shortDay(addDays(occasionDate(occasion) as string, -1))}
                    </button>
                    <button onClick={() => setSendOn(occasionDate(occasion) as string)} style={chip(sendOn === occasionDate(occasion))}>
                      On the day · {shortDay(occasionDate(occasion) as string)}
                    </button>
                  </>
                )}
                <input type="date" value={sendOn} onChange={(e) => { const v = readValue(e); if (v) setSendOn(v); }} style={{ ...control, width: 'auto', height: 32 }} />
              </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: owners.length > 1 ? 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' : '1fr', gap: 8 }}>
                <input value={name} onChange={(e) => setName(readValue(e))} placeholder={kind === 'GREETING' ? `${occasionInfo.label} ${sendOn.slice(0, 4)}` : 'Campaign name'} style={control} />
                {owners.length > 1 && (
                  <select value={ownerId} onChange={(e) => setOwnerId(readValue(e))} style={control} title="Workspace it belongs to">
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </Step>
          </div>

          {/* Live preview */}
          <div style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' }}>
              Preview · {LANGUAGES.find((l) => l.value === lang)?.label}
            </span>
            <PhonePreview text={previewText} media={media} pending={pending} recipient={count?.sample[0] ?? 'Ahmad Rahman'} />
            {!isWritten(shownMessages[lang]) && lang !== 'EN' && (
              <span style={{ fontSize: 12, color: c.text3, textAlign: 'center' }}>Not written in {LANGUAGES.find((l) => l.value === lang)?.label} — these people get the English version.</span>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, padding: '10px clamp(12px, 3cqw, 18px)', borderTop: `1px solid ${c.border}`, alignItems: 'center' }}>
        {!writtenAny && <span style={{ flex: '1 1 0', minWidth: 0, fontSize: 12.5, color: 'var(--t-color-amber11)' }}>Write the message first.</span>}
        {writtenAny && initial.status !== 'TEMPLATE' && (
          <button onClick={() => save('TEMPLATE')} disabled={busy !== ''} title="Keep this as a starting point for future campaigns" style={{ ...button(), height: 46, padding: '0 12px', flex: '0 1 auto' }}>
            {busy === 'TEMPLATE' ? 'Saving…' : '☆ Template'}
          </button>
        )}
        <button onClick={() => save(initial.status === 'TEMPLATE' ? 'TEMPLATE' : 'DRAFT')} disabled={busy !== ''} style={{ ...button(), height: 46, padding: '0 14px', flex: '0 1 auto' }}>
          {busy === 'DRAFT' ? 'Saving…' : initial.status === 'TEMPLATE' ? 'Save template' : 'Draft'}
        </button>
        <button onClick={() => save('SCHEDULED')} disabled={busy !== '' || !writtenAny} style={{ ...button(true), height: 46, padding: '0 16px', flex: '1 1 auto', marginLeft: writtenAny ? 'auto' : 0, maxWidth: 320, opacity: writtenAny ? 1 : 0.6 }}>
          {busy === 'SCHEDULED' ? 'Saving…' : repeat.every !== 'NONE' ? 'Save · repeats' : sendOn <= today ? 'Save · ready to send' : `Schedule · ${shortDay(sendOn)}`}
        </button>
      </div>
    </div>
  );
};
