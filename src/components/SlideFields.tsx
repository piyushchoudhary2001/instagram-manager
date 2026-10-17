"use client";

import { TEMPLATES, TONES, type Slide, type Template, type Tone, newSlide } from "@/lib/schema";
import { ImagePicker } from "./ImagePicker";
import { Field, SelectField, TextArea, TextField } from "./fields";

const TEMPLATE_HINT: Record<Template, string> = {
  cover: "The first slide. Big hook, one line of what they get.",
  statement: "One idea, set large. Good for the thing people screenshot.",
  point: "A numbered step with a short explanation and an optional callout.",
  bullets: "Three to six short rows with icons, numbers or checks.",
  compare: "Two columns — this against that.",
  stat: "One number, large, with a line of context.",
  photo: "Your own photo with text over it.",
  cta: "The closing card: save, send, follow.",
};

function IconPicker({
  label,
  value,
  onChange,
  names,
}: {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  names: string[];
}) {
  const iconOptions = [{ value: "", label: "— none —" }, ...names.map((name) => ({ value: name, label: name }))];
  return (
    <Field
      label={label}
      hint={
        value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/brand/icon/${value}?size=18`} width={18} height={18} alt="" />
        ) : null
      }
    >
      <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        {iconOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function SlideFields({
  slide,
  onChange,
  iconNames,
  postId,
}: {
  slide: Slide;
  onChange: (slide: Slide) => void;
  iconNames: string[];
  postId: string;
}) {
  const set = (patch: Partial<Slide>) => onChange({ ...slide, ...patch });
  const t = slide.template;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SelectField
          label="Template"
          value={t}
          hint={TEMPLATE_HINT[t]}
          options={TEMPLATES.map((name) => ({ value: name, label: name }))}
          onChange={(value) => {
            const fresh = newSlide(value as Template);
            // keep whatever still makes sense when switching
            onChange({ ...fresh, kicker: slide.kicker ?? fresh.kicker, title: slide.title ?? fresh.title, tone: slide.tone });
          }}
        />
        <SelectField
          label="Tone"
          value={slide.tone ?? ""}
          hint="Default: paper inside, gradient on the cover and closing card."
          options={[{ value: "", label: "default" }, ...TONES.map((tone) => ({ value: tone, label: tone }))]}
          onChange={(value) => set({ tone: (value || undefined) as Tone | undefined })}
        />
      </div>

      <TextField label="Kicker" value={slide.kicker ?? ""} onChange={(value) => set({ kicker: value || undefined })} hint="The small pill at the top" />

      {t !== "stat" ? (
        <TextArea label="Title" rows={2} value={slide.title ?? ""} onChange={(value) => set({ title: value || undefined })} />
      ) : null}

      {t === "point" ? (
        <TextField label="Step" value={slide.step ?? ""} onChange={(value) => set({ step: value || undefined })} hint="Leave empty to drop the number and the route line" />
      ) : null}

      {["cover", "statement", "point", "stat", "photo", "cta"].includes(t) ? (
        <TextArea label="Body" rows={3} value={slide.body ?? ""} onChange={(value) => set({ body: value || undefined })} />
      ) : null}

      {t === "stat" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <TextField label="Number" value={slide.stat?.value ?? ""} onChange={(value) => set({ stat: { value, label: slide.stat?.label } })} />
          <TextField
            label="What it covers"
            value={slide.stat?.label ?? ""}
            onChange={(label) => set({ stat: { value: slide.stat?.value ?? "", label } })}
          />
        </div>
      ) : null}

      {t === "point" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <TextField
            label="Callout label"
            value={slide.callout?.label ?? ""}
            onChange={(label) => set({ callout: { label, text: slide.callout?.text ?? "" } })}
          />
          <TextField
            label="Callout text"
            value={slide.callout?.text ?? ""}
            onChange={(text) => set({ callout: text ? { label: slide.callout?.label, text } : undefined })}
          />
        </div>
      ) : null}

      {t === "bullets" ? (
        <>
          <SelectField
            label="List style"
            value={slide.listStyle ?? "icons"}
            options={[
              { value: "icons", label: "icons" },
              { value: "numbers", label: "numbers" },
              { value: "checks", label: "checks" },
            ]}
            onChange={(value) => set({ listStyle: value as Slide["listStyle"] })}
          />
          <div className="field__label">Rows</div>
          {(slide.items ?? []).map((item, i) => (
            <div key={i} className="panel" style={{ marginBottom: 10, padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12 }}>
                <IconPicker
                  names={iconNames}
                  label={`Icon ${i + 1}`}
                  value={item.icon}
                  onChange={(icon) => {
                    const items = [...(slide.items ?? [])];
                    items[i] = { ...item, icon };
                    set({ items });
                  }}
                />
                <TextField
                  label="Row title"
                  value={item.title}
                  onChange={(title) => {
                    const items = [...(slide.items ?? [])];
                    items[i] = { ...item, title };
                    set({ items });
                  }}
                />
              </div>
              <TextField
                label="Detail"
                value={item.detail ?? ""}
                onChange={(detail) => {
                  const items = [...(slide.items ?? [])];
                  items[i] = { ...item, detail: detail || undefined };
                  set({ items });
                }}
              />
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => set({ items: (slide.items ?? []).filter((_, index) => index !== i) })}
              >
                Remove row
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--small"
            onClick={() => set({ items: [...(slide.items ?? []), { title: "New row", detail: "" }] })}
          >
            Add row
          </button>
        </>
      ) : null}

      {t === "compare"
        ? (["left", "right"] as const).map((side) => (
            <div key={side} className="panel" style={{ marginBottom: 10, padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12 }}>
                <IconPicker
                  names={iconNames}
                  label={`${side} icon`}
                  value={slide[side]?.icon}
                  onChange={(icon) => set({ [side]: { heading: slide[side]?.heading ?? "", icon, items: slide[side]?.items ?? [] } } as Partial<Slide>)}
                />
                <TextField
                  label={`${side} heading`}
                  value={slide[side]?.heading ?? ""}
                  onChange={(heading) =>
                    set({ [side]: { heading, icon: slide[side]?.icon, items: slide[side]?.items ?? [] } } as Partial<Slide>)
                  }
                />
              </div>
              <TextArea
                label={`${side} items`}
                rows={4}
                hint="one per line"
                value={(slide[side]?.items ?? []).join("\n")}
                onChange={(value) =>
                  set({
                    [side]: {
                      heading: slide[side]?.heading ?? "",
                      icon: slide[side]?.icon,
                      items: value.split("\n").filter((line) => line.trim()),
                    },
                  } as Partial<Slide>)
                }
              />
            </div>
          ))
        : null}

      {t === "cta" ? (
        <TextArea
          label="Actions"
          rows={3}
          hint="one per line, as icon: label"
          value={(slide.actions ?? []).map((a) => `${a.icon ?? "bookmark"}: ${a.label}`).join("\n")}
          onChange={(value) =>
            set({
              actions: value
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => {
                  const [icon, ...rest] = line.split(":");
                  return rest.length ? { icon: icon.trim(), label: rest.join(":").trim() } : { label: line.trim() };
                }),
            })
          }
        />
      ) : null}

      {["cover", "statement", "photo", "cta"].includes(t) ? (
        <ImagePicker postId={postId} value={slide.image} onChange={(image) => set({ image })} />
      ) : null}

      {t !== "bullets" && t !== "compare" ? <IconPicker names={iconNames} label="Icon" value={slide.icon} onChange={(icon) => set({ icon })} /> : null}

      <TextField label="Footnote" value={slide.footnote ?? ""} onChange={(value) => set({ footnote: value || undefined })} />
      <TextField label="Alt text for this slide" value={slide.alt ?? ""} onChange={(value) => set({ alt: value || undefined })} />
    </div>
  );
}
