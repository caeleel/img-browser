import { Dispatch, SetStateAction } from 'react';
import { S3Credentials, ImageMetadata } from "@/lib/types";
import { updateMetadata } from "@/lib/db";

function formatExposure(exposure?: number) {
  if (!exposure) return '';
  return exposure < 1 ? `1/${Math.round(1 / exposure)}` : exposure.toString();
}

function parseExposure(formatted: string): number | undefined {
  if (formatted.includes('/')) {
    const denom = formatted.split('/')[1];
    return 1 / parseInt(denom);
  }
  const parsed = parseFloat(formatted);
  return isNaN(parsed) ? undefined : parsed;
}

const FIELDS = ['camera_make', 'camera_model', 'lens_model', 'taken_at', 'city', 'state', 'country', 'iso', 'aperture', 'shutter_speed', 'focal_length', 'notes'];

export function MetadataEditor({ metadata, credentials, editing, setEditing, showFilmstrip }: {
  metadata?: ImageMetadata,
  credentials: S3Credentials,
  editing: string | null,
  setEditing: Dispatch<SetStateAction<string | null>>,
  showFilmstrip: boolean,
}) {
  const EditableField = ({ field, value, label, handleSave, width = 'w-40' }: {
    field: string,
    value: string,
    label: string,
    width?: string,
    handleSave: (field: string, editValue: string) => void
  }
  ) => {
    return (
      <div className="text-gray-300 w-full flex items-center justify-between mb-1">
        <div>{label}</div>
        {editing === field ? (
          <input
            type="text"
            defaultValue={value}
            onBlur={(e) => handleSave(field, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave(field, (e.target as HTMLInputElement).value);
              } else if (e.key === 'Escape') {
                setEditing(null);
              } else if (e.key === 'Tab') {
                e.preventDefault();
                const newValue = (e.target as HTMLInputElement).value;
                const nextField = FIELDS[(FIELDS.indexOf(field) + (e.shiftKey ? FIELDS.length - 1 : 1)) % FIELDS.length];
                // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                (metadata as any)[field] = newValue;
                handleSave(field, newValue);
                setEditing(nextField);
              }
            }}
            className={`bg-black bg-opacity-50 px-2 rounded ${width} min-h-6`}
            autoFocus
          />
        ) : (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setEditing(field)}
            className={`cursor-pointer hover:text-white bg-white/10 hover:bg-white/10 ${width} rounded px-2 py-1 min-h-6 text-xs`}
          >
            {value}
          </div>
        )}
      </div>
    )
  }

  const TextAreaEditableField = ({ field, value }: { field: string, value: string }) => {
    const handleSave = async (field: string, newValue: string) => {
      try {
        if (!metadata?.id) {
          return;
        }
        await updateMetadata([metadata.id], { [field]: newValue }, credentials);
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        (metadata as any)[field] = newValue;
      } finally {
        setTimeout(() => setEditing(prev => (prev === field ? null : prev)), 200);
      }
    }

    return editing === field ? <textarea
      defaultValue={value}
      onBlur={(e) => handleSave(field, e.target.value)}
      onFocus={(e) => {
        (e.target as HTMLTextAreaElement).setSelectionRange(e.target.value.length, e.target.value.length);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          handleSave(field, (e.target as HTMLTextAreaElement).value);
          e.preventDefault();
        } else if (e.key === 'Escape') {
          setEditing(null);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          const newValue = (e.target as HTMLTextAreaElement).value;
          const nextField = FIELDS[(FIELDS.indexOf(field) + 1) % FIELDS.length];
          // eslint-disable-next-line  @typescript-eslint/no-explicit-any
          (metadata as any)[field] = newValue;
          handleSave(field, newValue);
          setEditing(nextField);
        }
      }}
      className="bg-black bg-opacity-50 px-2 py-1 rounded w-full h-24"
      autoFocus
    /> : <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => setEditing(field)}
      className="w-full h-24 text-gray-300 text-xs bg-white/10 rounded px-2 py-1 hover:bg-white/10 whitespace-pre-wrap"
    >
      {value}
    </div>
  }

  const NumberEditableField = ({ field, value, label, format = (v?: number) => v?.toString() || '' }: {
    field: string,
    value?: number | null,
    label: string,
    format?: (value?: number) => string
  }) => {
    const formattedValue = format(value || undefined);
    const handleSave = async (field: string, editValue: string) => {
      try {
        if (!metadata?.id) {
          return;
        }
        let newValue: number | undefined;

        // Parse numbers appropriately
        switch (field) {
          case 'iso':
          case 'focal_length':
            newValue = parseInt(editValue) || undefined;
            break;
          case 'aperture':
            newValue = parseFloat(editValue) || undefined;
            break;
          case 'shutter_speed':
            newValue = parseExposure(editValue) || undefined;
            break;
        }

        if (newValue !== undefined && newValue !== value) {
          await updateMetadata([metadata.id], { [field]: newValue }, credentials);
          // eslint-disable-next-line  @typescript-eslint/no-explicit-any
          (metadata as any)[field] = newValue;
        }
      } finally {
        setTimeout(() => setEditing(prev => (prev === field ? null : prev)), 200);
      }
    };

    return <EditableField field={field} value={formattedValue} label={label} width="w-16" handleSave={handleSave} />;
  }

  const StringEditableField = ({ field, value, label, format = (v: string) => v }: { field: string, value: string | null, label: string, format?: (v: string) => string }) => {
    const handleSave = async (field: string, editValue: string) => {
      try {
        if (!metadata?.id) {
          return;
        }
        if (editValue == value) {
          return;
        }

        await updateMetadata([metadata.id], { [field]: editValue }, credentials);
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        (metadata as any)[field] = editValue;
      } finally {
        setTimeout(() => setEditing(prev => (prev === field ? null : prev)), 200);
      }
    };

    return <EditableField field={field} value={format(value || '')} label={label} handleSave={handleSave} />;
  }

  return <div className={`z-10 w-64 backdrop-blur-lg text-white overflow-y-auto rounded-lg absolute top-12 mt-1 shadow-lg ${showFilmstrip ? 'right-2' : '-right-64'}`} style={{
    background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.7) 30%)',
    transition: 'right 0.3s ease-in-out'
  }}>
    <div className="p-4 text-xs">
      {metadata ? (
        <div className="space-y-4">
          {(metadata.camera_make || metadata.camera_model) && (
            <div>
              <h4 className="font-semibold mb-1">Camera</h4>
              <StringEditableField field="camera_make" value={metadata.camera_make} label="Make" />
              <StringEditableField field="camera_model" value={metadata.camera_model} label="Model" />
              <StringEditableField field="lens_model" value={metadata.lens_model} label="Lens" />
            </div>
          )}

          {(metadata.taken_at || metadata.city || metadata.state || metadata.country) && (
            <div>
              <h4 className="font-semibold mb-1">Photo Properties</h4>
              <StringEditableField
                field="taken_at"
                label="Date"
                value={metadata.taken_at}
                format={(v: string) => new Date(v).toLocaleString()}
              />
              {metadata.latitude && metadata.longitude && (
                <div>
                  <div className="rounded overflow-hidden my-2">
                    <iframe
                      width="100%"
                      height="150"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${metadata.latitude},${metadata.longitude}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                    />
                  </div>
                  <div className="text-xs text-gray-400">
                    Coordinates: {metadata.latitude.toFixed(6)}, {metadata.longitude.toFixed(6)}
                  </div>
                </div>
              )}
            </div>
          )}

          {(metadata.iso || metadata.aperture || metadata.shutter_speed || metadata.focal_length) && (
            <div>
              <h4 className="font-semibold mb-1">Camera Settings</h4>
              <div className="text-gray-300 space-y-1">
                <NumberEditableField field="iso" value={metadata?.iso} label="ISO" />
                <NumberEditableField field="aperture" value={metadata?.aperture} label="ƒ-Stop" />
                <NumberEditableField field="shutter_speed" value={metadata?.shutter_speed} label="Shutter" format={formatExposure} />
                <NumberEditableField field="focal_length" value={metadata?.focal_length} label="Focal Length" />
              </div>
            </div>
          )}
          <div>
            <h4 className="font-semibold mb-1">Notes</h4>
            <TextAreaEditableField field="notes" value={metadata?.notes || ''} />
          </div>
        </div>
      ) : (
        <p className="text-gray-300">No metadata available</p>
      )}
    </div>
  </div>;
}