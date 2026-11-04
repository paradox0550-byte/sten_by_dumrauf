export const normalizeArticle = (value: string): string =>
  String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
