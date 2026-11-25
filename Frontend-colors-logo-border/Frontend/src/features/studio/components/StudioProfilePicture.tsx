import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { MediaContainer } from '@/components/media/MediaContainer';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { apiClient } from '@/services/api';
import type { ArtistSummary } from '@/types/models';
import { publicMediaUrl } from '@/utils/url';
import { studioError } from '../workspace';

interface Props {
  storefront: ArtistSummary;
  onSave(profile: ArtistSummary): void;
  disabled: boolean;
}

export function StudioProfilePicture({ storefront, onSave, disabled }: Props) {
  const { t: { studioForms: copy } } = useLanguage();
  const [draft, setDraft] = useState<{ file: File; url: string }>();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const active = useRef(false);

  useEffect(() => () => {
    if (draft) URL.revokeObjectURL(draft.url);
  }, [draft]);

  function choose(file?: File) {
    setMessage('');
    setError('');
    if (!file) return setDraft(undefined);
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024) {
      setError(copy.badPicture);
      setDraft(undefined);
      setFileInputKey((key) => key + 1);
      return;
    }
    setDraft({ file, url: URL.createObjectURL(file) });
  }

  async function save(file?: File) {
    if (active.current || disabled) return;
    const action = file ? 'upload' : 'remove';
    active.current = true;
    setBusy(action);
    setError('');
    setMessage('');
    try {
      const profile = file
        ? await apiClient.uploadProfileImage(storefront.storefrontId, file)
        : await apiClient.removeProfileImage(storefront.storefrontId);
      onSave(profile);
      setDraft(undefined);
      setFileInputKey((key) => key + 1);
      setMessage(action === 'remove' ? copy.pictureRemoved : copy.pictureSaved);
    } catch (failure) {
      setError(studioError(failure, copy));
    } finally {
      active.current = false;
      setBusy(null);
    }
  }

  return (
    <section className="studio-editor__panel">
      <h3>{copy.profilePicture}</h3>
      <p>{copy.pictureHint}</p>
      <div className="studio-editor__picture">
        <MediaContainer src={draft?.url || publicMediaUrl(storefront.profileImageUrl)}
          alt={copy.picturePreview} aspectRatio="1x1" monogram={storefront.displayName} />
        <div>
          <Input key={fileInputKey} type="file" label={copy.choosePicture} accept="image/png,image/jpeg"
            disabled={disabled || busy !== null} onChange={(event) => choose(event.target.files?.[0])} />
          <div className="studio-editor__actions">
            <Button disabled={disabled || !draft || busy !== null} isLoading={busy === 'upload'}
              onClick={() => { if (draft) void save(draft.file); }}>{copy.savePicture}</Button>
            {storefront.profileImageUrl && <Button variant="secondary" disabled={disabled || busy !== null}
              isLoading={busy === 'remove'} onClick={() => void save()}>{copy.removePicture}</Button>}
          </div>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
