import { inspect } from 'util';
import { parse, resolve, format } from 'url';
import crypto from 'crypto';
import pick from 'lodash/pick';
import trim from 'lodash/trim';
import startsWith from 'lodash/startsWith';
import some from 'lodash/some';
import includes from 'lodash/includes';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import isFunction from 'lodash/isFunction';
import isRegExp from 'lodash/isRegExp';
import debug from 'debug';

const _debugConsole = debug('hccrawler:console');
const _debugDialog = debug('hccrawler:dialog');

const PICKED_OPTION_FIELDS = [
  'url',
  'device',
  'userAgent',
  'extraHeaders',
];
const MAX_KEY_LENGTH = 10;

export function  delay(milliseconds: number) {
  return new Promise(_resolve => setTimeout(_resolve, milliseconds));
}

export function  hash(src: string) {
  const md5hash = crypto.createHash('md5');
  md5hash.update(src, 'utf8');
  return md5hash.digest('hex');
}

/**
 * @param {!Object} options
 * @return {!string}
 */
export function  generateKey(options: any) {
  const json = JSON.stringify(pick(options, PICKED_OPTION_FIELDS), jsonStableReplacer);
  return hash(json).substring(0, MAX_KEY_LENGTH);
}

export function  jsonStableReplacer(key: string, val: any) {
  if (!isPlainObject(val)) return val;
  return Object.keys(val).sort().reduce((obj: any, _key) => {
    obj[_key] = val[_key];
    return obj;
  }, {});
}

export function  resolveUrl(url: string, baseUrl: string) {
  url = trim(url);
  if (!url) return null;
  if (startsWith(url, '#')) return null;
  const { protocol } = parse(url);
  if (includes(['http:', 'https:'], protocol)) {
    return url.split('#')[0];
  } else if (!protocol) { // eslint-disable-line no-else-return
    return resolve(baseUrl, url).split('#')[0];
  }
  return null;
}

export function  escapeQuotes(value: string, separator = ',') {
  if (value === null || value === undefined) return '';
  const regExp = new RegExp(`["${separator}\\r\\n]`);
  if (regExp.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function  getRobotsUrl(url: string) {
  const { protocol, host } = parse(url);
  return format({ protocol, host, pathname: '/robots.txt' });
}

// Ported from http://en.cppreference.com/w/cpp/algorithm/lower_bound
export function  lowerBound<T = any>(array: Array<T>, value: T, comp: (a: T, b: T) => number) {
  let first = 0;
  let count = array.length;
  while (count > 0) {
    const step = (count / 2) | 0;
    let it = first + step;
    if (comp(array[it], value) <= 0) {
      it += 1;
      first = it;
      count -= step + 1;
    } else {
      count = step;
    }
  }
  return first;
}

/**
 * @param {!Array<!string|RegExp>} domains
 * @param {!string} hostname
 * @return {!boolean}
 */
export function  checkDomainMatch(domains: Array<string|RegExp>, hostname: string) {
  return some(domains, domain => {
    if (isRegExp(domain)) return domain.test(hostname);
    return domain === hostname;
  });
}

export function  getSitemapUrls(sitemapXml: string) {
  const urls: string[] = [];
  sitemapXml.replace(/<loc>([^<]+)<\/loc>/g, (_, url) => {
    const unescapedUrl = unescape(url);
    urls.push(unescapedUrl);
    return null;
  });
  return urls;
}

export function  unescape(src: string) {
  return src
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * @param {!Object} classType
 */
export function  tracePublicAPI(classType: any) {
  const className = classType.prototype.constructor.name.toLowerCase();
  const debugClass = debug(`hccrawler:${className}`);
  Reflect.ownKeys(classType.prototype).forEach(methodName => {
    if (methodName === 'constructor' || !isString(methodName) || startsWith(methodName, '_')) return;
    const method = Reflect.get(classType.prototype, methodName);
    if (!isFunction (method)) return;
    Reflect.set(classType.prototype, methodName, function  (...args: any) {
      const argsText = args.map(stringifyArgument).join(', ');
      debugClass(`${methodName}(${argsText})`);
      return method.call(this, ...args);
    });
  });
  if (classType.Events) {
    const method = Reflect.get(classType.prototype, 'emit');
    Reflect.set(classType.prototype, 'emit', function  (event: any, ...args: any) {
      const argsText = [JSON.stringify(event)].concat(args.map(stringifyArgument)).join(', ');
      debugClass(`emit(${argsText})`);
      return method.call(this, event, ...args);
    });
  }
}

/**
 * @param {!Object} arg
 * @return {!string}
 */
export function  stringifyArgument(arg: any) {
  return inspect(arg)
    .split('\n')
    .map(line => trim(line))
    .join(' ');
}

export function  debugConsole(msg: string) {
  _debugConsole(msg);
}

export function  debugDialog(msg: string) {
  _debugDialog(msg);
}
