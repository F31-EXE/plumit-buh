// email как ключ документа access/{email}
export const emailKey = (email) => String(email || '').trim().toLowerCase();
