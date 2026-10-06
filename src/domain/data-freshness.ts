export type DataFreshnessStatus = {
  status: "current" | "stale" | "missing";
  expectedPositionDate: string;
  message: string;
};

function parseIsoDate(value: string) {
  const [yearValue, monthValue, dayValue] = value.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 12);
}

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function previousBusinessDay(date: Date) {
  let cursor = addDays(date, -1);

  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor = addDays(cursor, -1);
  }

  return cursor;
}

export function expectedPositionDateForToday(today = new Date()) {
  return isoDate(previousBusinessDay(today));
}

export function getPositionFreshness(positionDate?: string, today = new Date()): DataFreshnessStatus {
  const expectedPositionDate = expectedPositionDateForToday(today);

  if (!positionDate) {
    return {
      status: "missing",
      expectedPositionDate,
      message: `Nenhuma data de posição registrada. O esperado é a posição de fechamento de ${expectedPositionDate}.`
    };
  }

  const parsedPositionDate = parseIsoDate(positionDate);
  const parsedExpectedDate = parseIsoDate(expectedPositionDate);

  if (!parsedPositionDate || !parsedExpectedDate || parsedPositionDate < parsedExpectedDate) {
    return {
      status: "stale",
      expectedPositionDate,
      message: `Base desatualizada: posição carregada de ${positionDate}. O esperado é o fechamento de ${expectedPositionDate}.`
    };
  }

  return {
    status: "current",
    expectedPositionDate,
    message: `Base atualizada: posição de ${positionDate}, referente ao fechamento do dia útil anterior.`
  };
}

