import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title = 'Confirm action',
  message = 'Are you sure?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onCancel}
    >
      <div
        className="glass-panel animate-in"
        style={{ width: '100%', maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} style={{ color: danger ? 'var(--accent-red)' : 'var(--accent-amber)' }} />
          {title}
        </h3>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
          {message}
        </p>

        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
