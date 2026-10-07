const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export const money = (v) => `${rub.format(Math.round(Number(v || 0) * 100) / 100)} ₽`;
export const num = (v) => rub.format(Number(v || 0));
export const compact = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e6) return `${rub.format(Math.round(n / 1e5) / 10)} млн`;
  if (Math.abs(n) >= 1e3) return `${rub.format(Math.round(n / 100) / 10)} тыс`;
  return rub.format(n);
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const thisMonth = () => today().slice(0, 7);

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const s = MONTHS[m - 1];
  return `${s[0].toUpperCase()}${s.slice(1)} ${y}`;
};
export const monthShort = (ym) => MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];
export const dateLabel = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS_GEN[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};
export const shiftMonth = (ym, delta) => {
  let [y, m] = ym.split('-').map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
export const daysInMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const OP_TYPES = {
  income: { label: 'Поступление', short: 'Приход', sign: '+', tone: 'pos' },
  payout: { label: 'Выплата команде', short: 'Выплата', sign: '−', tone: 'neg' },
  expense: { label: 'Расход', short: 'Расход', sign: '−', tone: 'neg' },
  tax: { label: 'Налоги / взносы', short: 'Налог', sign: '−', tone: 'neg' },
  penalty: { label: 'Штраф', short: 'Штраф', sign: '', tone: 'muted' },
  transfer: { label: 'Перевод внутри команды', short: 'Перевод', sign: '', tone: 'muted' },
};

export const PROJECT_STATUS = { active: 'В работе', paused: 'На паузе', done: 'Завершён' };
export const ITERATION_STATUS = { planned: 'В плане', in_work: 'В работе', done: 'Сдано', cancelled: 'Отменено' };

export const memberLabel = (m) => (m ? `${m.name}${m.role ? ` (${m.role})` : ''}` : '');
