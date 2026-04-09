/**
 * Unified Timezone utility for manipulating Jordan time natively.
 */

export function getAmmanDateTimeString(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Amman',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
    
    // sv-SE outputs "YYYY-MM-DD HH:mm:ss"
    const formatted = formatter.format(d).replace(' ', 'T');
    return `${formatted}+03:00`;
}

export function getAmmanDateString(dateInput) {
    return getAmmanDateTimeString(dateInput).split('T')[0];
}

export function getAmmanDate(dateInput) {
    return new Date(getAmmanDateTimeString(dateInput));
}
