import { OP_TYPES } from '../format.js';

// Выгрузка операций в CSV, который корректно открывается в Excel (BOM + «;»)
export function downloadCsv(operations, filename = 'plumit-operations.csv') {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Дата', 'Тип', 'Проект', 'Сумма', 'Кому', 'От кого', 'Категория', 'Аванс', 'Комментарий'].map(esc).join(';')];
  for (const o of operations) {
    lines.push([o.date, OP_TYPES[o.type]?.label, o.project_name, String(o.amount).replace('.', ','), o.member_name,
      o.from_member_name, o.category, o.is_advance ? 'да' : '', o.comment].map(esc).join(';'));
  }
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
