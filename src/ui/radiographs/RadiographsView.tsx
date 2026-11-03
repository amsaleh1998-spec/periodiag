import { useRef, useState, type DragEvent } from 'react';
import {
  PRESETS,
  assignImage,
  changePreset,
  emptySlotIds,
  emptySurvey,
  removeImage,
  setSlotNote,
  slotsLostByPreset,
  surveyProgress,
  surveySlots,
  swapSlots,
  type ExtraRadiograph,
  type PresetId,
  type RadiographSlot,
  type RadiographSurvey,
} from '../../domain/radiographs';
import { newId, type Exam, type Patient } from '../../domain/records';
import * as db from '../../storage/db';
import { PdfButton } from '../pdf/PdfButton';
import { ImageError, processUpload, useImageUrl } from './images';
import { Viewer, type ViewerItem } from './Viewer';

interface Props {
  exam: Exam;
  patient: Patient | null;
  exams: Exam[];
  updateExam: (fn: (e: Exam) => Exam) => void;
}

type Target = { kind: 'slot'; slotId: string } | { kind: 'extra'; extraId?: string } | { kind: 'fill' };

export function RadiographsView({ exam, patient, exams, updateExam }: Props) {
  const survey = exam.radiographs ?? emptySurvey();
  const slots = surveySlots(survey);
  const progress = surveyProgress(survey);
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);

  const setSurvey = (fn: (s: RadiographSurvey) => RadiographSurvey) =>
    updateExam((e) => ({ ...e, radiographs: fn(e.radiographs ?? emptySurvey()) }));

  const markBusy = (key: string, on: boolean) =>
    setBusy((b) => {
      const n = new Set(b);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  /** Store a file and put it into a slot (replacing and deleting any previous image). */
  const uploadToSlot = async (slotId: string, file: File) => {
    markBusy(slotId, true);
    try {
      const replaced = survey.slots[slotId]?.imageId;
      const im = await processUpload(file, exam.id, exam.patientId);
      await db.saveImage(im);
      setSurvey((s) => assignImage(s, slotId, { imageId: im.id, fileName: file.name, addedAt: im.addedAt }).survey);
      if (replaced) await db.deleteImage(replaced);
    } catch (err) {
      setErrors((e) => [...e, err instanceof ImageError ? err.message : `${file.name}: ${String(err)}`]);
    } finally {
      markBusy(slotId, false);
    }
  };

  const uploadExtra = async (file: File, extraId?: string) => {
    const key = extraId ?? 'extra-new';
    markBusy(key, true);
    try {
      const replaced = extraId ? survey.extras.find((x) => x.id === extraId)?.imageId : undefined;
      const im = await processUpload(file, exam.id, exam.patientId);
      await db.saveImage(im);
      setSurvey((s) => {
        if (extraId) {
          return { ...s, extras: s.extras.map((x) => (x.id === extraId ? { ...x, imageId: im.id, fileName: file.name, addedAt: im.addedAt } : x)) };
        }
        const extra: ExtraRadiograph = { id: newId(), label: file.name.replace(/\.[^.]+$/, ''), imageId: im.id, fileName: file.name, addedAt: im.addedAt };
        return { ...s, extras: [...s.extras, extra] };
      });
      if (replaced) await db.deleteImage(replaced);
    } catch (err) {
      setErrors((e) => [...e, err instanceof ImageError ? err.message : `${file.name}: ${String(err)}`]);
    } finally {
      markBusy(key, false);
    }
  };

  const pick = (t: Target) => {
    setTarget(t);
    const input = fileRef.current!;
    input.multiple = t.kind === 'fill' || (t.kind === 'extra' && !t.extraId);
    input.click();
  };

  const onFiles = async (files: File[]) => {
    const t = target;
    setTarget(null);
    if (!t || files.length === 0) return;
    if (t.kind === 'slot') return uploadToSlot(t.slotId, files[0]);
    if (t.kind === 'extra') {
      if (t.extraId) return uploadExtra(files[0], t.extraId);
      for (const f of files) await uploadExtra(f);
      return;
    }
    // Fill empty slots in mount order; surplus files become extra images.
    const empty = emptySlotIds(survey);
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    await Promise.all(sorted.slice(0, empty.length).map((f, i) => uploadToSlot(empty[i], f)));
    for (const f of sorted.slice(empty.length)) await uploadExtra(f);
  };

  const removeSlot = async (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!confirm(`Remove the ${slot?.label ?? 'radiograph'} image?`)) return;
    const removed = survey.slots[slotId]?.imageId;
    setSurvey((s) => removeImage(s, slotId).survey);
    if (removed) await db.deleteImage(removed);
  };

  const removeExtra = async (extraId: string) => {
    const extra = survey.extras.find((x) => x.id === extraId);
    if (!extra || !confirm(`Remove "${extra.label}"?`)) return;
    setSurvey((s) => ({ ...s, extras: s.extras.filter((x) => x.id !== extraId) }));
    await db.deleteImage(extra.imageId);
  };

  const setPreset = (preset: PresetId, panoramic: boolean) => {
    const lost = slotsLostByPreset(survey, preset, panoramic);
    if (lost.length && !confirm(`${lost.map((s) => s.label).join(', ')} ${lost.length === 1 ? 'is' : 'are'} not part of this layout and will be moved to "Additional images".`)) return;
    setSurvey((s) => changePreset(s, preset, panoramic));
  };

  // ---- drag & drop: files onto a slot, or one slot onto another to swap
  const onDrop = (slotId: string) => (e: DragEvent) => {
    e.preventDefault();
    const from = e.dataTransfer.getData('application/x-periodiag-slot');
    if (from) {
      setSurvey((s) => swapSlots(s, from, slotId));
      return;
    }
    const file = e.dataTransfer.files[0];
    if (file) void uploadToSlot(slotId, file);
  };

  // ---- viewer
  const items: ViewerItem[] = [
    ...slots
      .filter((s) => survey.slots[s.id])
      .map((s) => ({ key: `slot:${s.id}`, title: s.label, subtitle: s.short, imageId: survey.slots[s.id].imageId, fileName: survey.slots[s.id].fileName, note: survey.slots[s.id].note })),
    ...survey.extras.map((x) => ({ key: `extra:${x.id}`, title: x.label, subtitle: 'additional', imageId: x.imageId, fileName: x.fileName, note: x.note })),
  ];
  const openViewer = (key: string) => setViewer(Math.max(0, items.findIndex((i) => i.key === key)));
  const itemTarget = (item: ViewerItem): Target => {
    const [kind, id] = item.key.split(/:(.*)/);
    return kind === 'slot' ? { kind: 'slot', slotId: id } : { kind: 'extra', extraId: id };
  };

  const rows = [0, 1, 2].map((r) => slots.filter((s) => s.row === r)).filter((r) => r.length > 0);

  return (
    <>
      <section className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field">
            Layout
            <select value={survey.preset} onChange={(e) => setPreset(e.target.value as PresetId, survey.panoramic)}>
              {Object.values(PRESETS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}: {p.description}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={survey.panoramic} onChange={(e) => setPreset(survey.preset, e.target.checked)} /> Panoramic
          </label>
          <label className="field">
            Radiographs taken
            <input type="date" value={survey.date ?? exam.date} onChange={(e) => setSurvey((s) => ({ ...s, date: e.target.value || undefined }))} />
          </label>
          <span className="spacer" />
          <span className="chip auto" style={{ fontSize: 13, padding: '4px 10px' }}>
            {progress.filled} / {progress.total} positions
          </span>
          <button className="btn" onClick={() => pick({ kind: 'fill' })} disabled={progress.filled === progress.total} title="Select several files: they fill the empty positions in mount order (sorted by file name)">
            Fill empty positions…
          </button>
          <PdfButton exam={exam} patient={patient} exams={exams} sections={['radiographs']} variant="btn" label="PDF: radiographs" />
        </div>
        <p className="help" style={{ margin: '10px 0 0' }}>
          Tap a position to add its radiograph (or drop a file on it). Tap an image to view it full screen. Drag one image onto another position to swap them. JPEG, PNG and WebP are supported; export DICOM or TIFF from your imaging software as JPEG/PNG first.
        </p>
        {errors.length > 0 && (
          <div className="warning">
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
            <button className="btn sm" onClick={() => setErrors([])} style={{ marginTop: 6 }}>
              Dismiss
            </button>
          </div>
        )}
      </section>

      <section className="card mount-card">
        <div className="mount-side">
          <span>Patient right</span>
          <span>Patient left</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="mount-row">
            {row.map((s) => (
              <SlotTile
                key={s.id}
                slot={s}
                imageId={survey.slots[s.id]?.imageId}
                note={survey.slots[s.id]?.note}
                busy={busy.has(s.id)}
                onAdd={() => pick({ kind: 'slot', slotId: s.id })}
                onOpen={() => openViewer(`slot:${s.id}`)}
                onDrop={onDrop(s.id)}
              />
            ))}
          </div>
        ))}
      </section>

      <section className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Additional images</h2>
          <span className="spacer" />
          <button className="btn" onClick={() => pick({ kind: 'extra' })} disabled={busy.has('extra-new')}>
            {busy.has('extra-new') ? 'Processing…' : 'Add image…'}
          </button>
        </div>
        {survey.extras.length === 0 ? (
          <p className="muted small">Extra periapicals, CBCT slices or clinical photos can be added here.</p>
        ) : (
          <div className="extras">
            {survey.extras.map((x) => (
              <div key={x.id} className="extra">
                <button className="extra-img" onClick={() => openViewer(`extra:${x.id}`)}>
                  <Thumb imageId={x.imageId} alt={x.label} />
                </button>
                <input value={x.label} onChange={(e) => setSurvey((s) => ({ ...s, extras: s.extras.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)) }))} />
              </div>
            ))}
          </div>
        )}
        <label className="field" style={{ marginTop: 12 }}>
          Radiographic findings / notes
          <textarea rows={3} value={survey.notes ?? ''} onChange={(e) => setSurvey((s) => ({ ...s, notes: e.target.value || undefined }))} />
        </label>
      </section>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void onFiles(files);
        }}
      />

      {viewer !== null && items[viewer] && (
        <Viewer
          items={items}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          onReplace={(item) => pick(itemTarget(item))}
          onRemove={(item) => {
            const t = itemTarget(item);
            setViewer(null);
            if (t.kind === 'slot') void removeSlot(t.slotId);
            else if (t.kind === 'extra' && t.extraId) void removeExtra(t.extraId);
          }}
          onNote={(item, note) => {
            const t = itemTarget(item);
            if (t.kind === 'slot') setSurvey((s) => setSlotNote(s, t.slotId, note));
            else if (t.kind === 'extra') setSurvey((s) => ({ ...s, extras: s.extras.map((x) => (x.id === t.extraId ? { ...x, note } : x)) }));
          }}
        />
      )}
    </>
  );
}

function Thumb({ imageId, alt }: { imageId: string; alt: string }) {
  const url = useImageUrl(imageId);
  if (url === null) return <span className="slot-missing">image missing</span>;
  if (!url) return <span className="slot-missing">…</span>;
  return <img src={url} alt={alt} draggable={false} />;
}

function SlotTile(props: {
  slot: RadiographSlot;
  imageId?: string;
  note?: string;
  busy: boolean;
  onAdd: () => void;
  onOpen: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  const { slot, imageId } = props;
  const [over, setOver] = useState(false);
  const style = { gridColumn: `${slot.col + 1} / span ${slot.span ?? 1}` };
  return (
    <div
      className={`slot ${slot.orientation} ${slot.kind} ${imageId ? 'filled' : ''} ${over ? 'over' : ''}`}
      style={style}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        props.onDrop(e);
      }}
    >
      <button
        className="slot-frame"
        onClick={imageId ? props.onOpen : props.onAdd}
        draggable={!!imageId}
        onDragStart={(e) => e.dataTransfer.setData('application/x-periodiag-slot', slot.id)}
        title={imageId ? `${slot.label}: tap to view` : `${slot.label}: tap to add`}
      >
        {props.busy ? <span className="slot-missing">Processing…</span> : imageId ? <Thumb imageId={imageId} alt={slot.label} /> : <span className="slot-add">+</span>}
      </button>
      <div className="slot-label">
        <b>{slot.short}</b> <span>{slot.kind === 'bw' ? 'BW' : slot.kind === 'pano' ? '' : 'PA'}</span>
        {props.note && <span title={props.note}> ✎</span>}
      </div>
    </div>
  );
}
