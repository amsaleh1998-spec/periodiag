import { useEffect, useState } from 'react';
import { useImageUrl } from './images';

export interface ViewerItem {
  key: string;
  title: string;
  subtitle?: string;
  imageId: string;
  fileName?: string;
  note?: string;
}

interface Props {
  items: ViewerItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onReplace: (item: ViewerItem) => void;
  onRemove: (item: ViewerItem) => void;
  onNote: (item: ViewerItem, note: string | undefined) => void;
}

/** Full-screen radiograph viewer with zoom, brightness, contrast and invert (view only, not saved). */
export function Viewer({ items, index, onIndex, onClose, onReplace, onRemove, onNote }: Props) {
  const item = items[index];
  const url = useImageUrl(item?.imageId, 'full');
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [invert, setInvert] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      // Arrow and +/- keys edit text while typing a note.
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(5, z + 0.5));
      if (e.key === '-') setZoom((z) => Math.max(1, z - 0.5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onIndex]);

  if (!item) return null;
  const reset = () => {
    setZoom(1);
    setBrightness(100);
    setContrast(100);
    setInvert(false);
  };

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="viewer-bar">
        <div>
          <b>{item.title}</b> {item.subtitle && <span className="muted-light">· {item.subtitle}</span>}
          <span className="muted-light">
            {' '}
            · {index + 1} / {items.length}
          </span>
        </div>
        <span className="spacer" />
        <button className="vbtn" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="Previous">
          ←
        </button>
        <button className="vbtn" disabled={index === items.length - 1} onClick={() => onIndex(index + 1)} aria-label="Next">
          →
        </button>
        <button className="vbtn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="viewer-stage">
        {url === null ? (
          <p className="muted-light">This image is not stored on this device (imported without images?). Use Replace to add it again.</p>
        ) : url ? (
          <img
            src={url}
            alt={item.title}
            style={{
              width: zoom === 1 ? 'auto' : `${zoom * 100}%`,
              maxWidth: zoom === 1 ? '100%' : 'none',
              maxHeight: zoom === 1 ? '100%' : 'none',
              objectFit: 'contain',
              filter: `brightness(${brightness}%) contrast(${contrast}%)${invert ? ' invert(1)' : ''}`,
            }}
          />
        ) : (
          <p className="muted-light">Loading…</p>
        )}
      </div>
      <div className="viewer-tools">
        <label>
          Zoom <input type="range" min={1} max={5} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
        <label>
          Brightness <input type="range" min={40} max={200} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
        </label>
        <label>
          Contrast <input type="range" min={40} max={300} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> Invert
        </label>
        <button className="vbtn" onClick={reset}>
          Reset view
        </button>
        <span className="spacer" />
        <input
          className="vnote"
          placeholder="Note for this image (e.g. vertical defect distal 36)"
          value={item.note ?? ''}
          onChange={(e) => onNote(item, e.target.value || undefined)}
        />
        <button className="vbtn" onClick={() => onReplace(item)}>
          Replace…
        </button>
        <button className="vbtn danger" onClick={() => onRemove(item)}>
          Remove
        </button>
      </div>
    </div>
  );
}
