const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
const numberFormat = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 });

export const formatDate = (date: Date) => dateFormat.format(date);
export const formatNumber = (value: number) => numberFormat.format(value);
