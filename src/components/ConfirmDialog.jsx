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
      className="modal-backdrop"
      onClick={onCancel}
    >
      <div
        className="modal-card glass-panel animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title mb-3">
          <AlertTriangle size={18} style={{ color: danger ? 'var(--accent-red)' : 'var(--accent-amber)' }} />
          {title}
        </h3>

        <p className="modal-message">
          {message}
        </p>

        <div className="modal-actions flex gap-2">
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
