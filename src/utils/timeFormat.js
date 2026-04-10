function hasMeridiem(value) {
  return /\b(am|pm)\b/i.test(String(value || ''));
}

function toAmPmFromParts(hour, minute = 0) {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function formatSingleTime(value) {
  if (value == null) return '';
  const input = String(value).trim();
  if (!input) return '';

  if (hasMeridiem(input)) {
    return input.replace(/\s+/g, ' ').replace(/(am|pm)/gi, (m) => m.toUpperCase());
  }

  const hhmmMatch = input.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/);
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1]);
    const minutes = Number(hhmmMatch[2] || '0');
    const formatted = toAmPmFromParts(hours, minutes);
    return formatted || input;
  }

  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  return input;
}

export function formatTimeLabel(label) {
  if (label == null) return '';
  const input = String(label).trim();
  if (!input) return '';

  const parts = input.split(/\s*[-–]\s*/);
  if (parts.length === 2) {
    return `${formatSingleTime(parts[0])} - ${formatSingleTime(parts[1])}`;
  }

  return formatSingleTime(input);
}
