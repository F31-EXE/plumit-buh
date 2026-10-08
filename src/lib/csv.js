import { OP_TYPES } from '../format.js';

// Ячейки, начинающиеся с = + - @ (а также табуляции или перевода строки), Excel выполняет как формулы.
// Такие текстовые значения экранируем апострофом — защита от «CSV injection».
const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const esc = (v) => `"${String(safe(v) ?? '').replace(/"/g, '""')}"`;

// Текст CSV, который корректно открывается в Excel (BOM + разделитель «;»)
export function csvContent(operations) {
  const lines = [['Дата', 'Тип', 'Проект', 'Сумма', 'Кому', 'От кого', 'Категория', 'Аванс', 'Комментарий'].map(esc).join(';')];
  for (const o of operations) {
    lines.push([o.date, OP_TYPES[o.type]?.label, o.project_name, String(o.amount).replace('.', ','), o.member_name,
      o.from_member_name, o.category, o.is_advance ? 'да' : '', o.comment].map(esc).join(';'));
  }
  return `﻿${lines.join('\r\n')}`;
}

export function downloadCsv(operations, filename = 'plumit-operations.csv') {
  const blob = new Blob([csvContent(operations)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
