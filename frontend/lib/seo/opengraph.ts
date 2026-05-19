import { APP_URL } from './data';

export function ogUrl(path: string) {
  return `${APP_URL}${path}`;
}
