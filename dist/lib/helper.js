"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugDialog = exports.debugConsole = exports.stringifyArgument = exports.tracePublicAPI = exports.unescape = exports.getSitemapUrls = exports.checkDomainMatch = exports.lowerBound = exports.getRobotsUrl = exports.escapeQuotes = exports.resolveUrl = exports.jsonStableReplacer = exports.generateKey = exports.hash = exports.delay = void 0;
const util_1 = require("util");
const url_1 = require("url");
const crypto_1 = __importDefault(require("crypto"));
const pick_1 = __importDefault(require("lodash/pick"));
const trim_1 = __importDefault(require("lodash/trim"));
const startsWith_1 = __importDefault(require("lodash/startsWith"));
const some_1 = __importDefault(require("lodash/some"));
const includes_1 = __importDefault(require("lodash/includes"));
const isPlainObject_1 = __importDefault(require("lodash/isPlainObject"));
const isString_1 = __importDefault(require("lodash/isString"));
const isFunction_1 = __importDefault(require("lodash/isFunction"));
const isRegExp_1 = __importDefault(require("lodash/isRegExp"));
const debug_1 = __importDefault(require("debug"));
const _debugConsole = debug_1.default('hccrawler:console');
const _debugDialog = debug_1.default('hccrawler:dialog');
const PICKED_OPTION_FIELDS = [
    'url',
    'device',
    'userAgent',
    'extraHeaders',
];
const MAX_KEY_LENGTH = 10;
function delay(milliseconds) {
    return new Promise(_resolve => setTimeout(_resolve, milliseconds));
}
exports.delay = delay;
function hash(src) {
    const md5hash = crypto_1.default.createHash('md5');
    md5hash.update(src, 'utf8');
    return md5hash.digest('hex');
}
exports.hash = hash;
/**
 * @param {!Object} options
 * @return {!string}
 */
function generateKey(options) {
    const json = JSON.stringify(pick_1.default(options, PICKED_OPTION_FIELDS), jsonStableReplacer);
    return hash(json).substring(0, MAX_KEY_LENGTH);
}
exports.generateKey = generateKey;
function jsonStableReplacer(key, val) {
    if (!isPlainObject_1.default(val))
        return val;
    return Object.keys(val).sort().reduce((obj, _key) => {
        obj[_key] = val[_key];
        return obj;
    }, {});
}
exports.jsonStableReplacer = jsonStableReplacer;
function resolveUrl(url, baseUrl) {
    url = trim_1.default(url);
    if (!url)
        return null;
    if (startsWith_1.default(url, '#'))
        return null;
    const { protocol } = url_1.parse(url);
    if (includes_1.default(['http:', 'https:'], protocol)) {
        return url.split('#')[0];
    }
    else if (!protocol) { // eslint-disable-line no-else-return
        return url_1.resolve(baseUrl, url).split('#')[0];
    }
    return null;
}
exports.resolveUrl = resolveUrl;
function escapeQuotes(value, separator = ',') {
    if (value === null || value === undefined)
        return '';
    const regExp = new RegExp(`["${separator}\\r\\n]`);
    if (regExp.test(value))
        return `"${value.replace(/"/g, '""')}"`;
    return value;
}
exports.escapeQuotes = escapeQuotes;
function getRobotsUrl(url) {
    const { protocol, host } = url_1.parse(url);
    return url_1.format({ protocol, host, pathname: '/robots.txt' });
}
exports.getRobotsUrl = getRobotsUrl;
// Ported from http://en.cppreference.com/w/cpp/algorithm/lower_bound
function lowerBound(array, value, comp) {
    let first = 0;
    let count = array.length;
    while (count > 0) {
        const step = (count / 2) | 0;
        let it = first + step;
        if (comp(array[it], value) <= 0) {
            it += 1;
            first = it;
            count -= step + 1;
        }
        else {
            count = step;
        }
    }
    return first;
}
exports.lowerBound = lowerBound;
/**
 * @param {!Array<!string|RegExp>} domains
 * @param {!string} hostname
 * @return {!boolean}
 */
function checkDomainMatch(domains, hostname) {
    return some_1.default(domains, domain => {
        if (isRegExp_1.default(domain))
            return domain.test(hostname);
        return domain === hostname;
    });
}
exports.checkDomainMatch = checkDomainMatch;
function getSitemapUrls(sitemapXml) {
    const urls = [];
    sitemapXml.replace(/<loc>([^<]+)<\/loc>/g, (_, url) => {
        const unescapedUrl = unescape(url);
        urls.push(unescapedUrl);
        return null;
    });
    return urls;
}
exports.getSitemapUrls = getSitemapUrls;
function unescape(src) {
    return src
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
exports.unescape = unescape;
/**
 * @param {!Object} classType
 */
function tracePublicAPI(classType) {
    const className = classType.prototype.constructor.name.toLowerCase();
    const debugClass = debug_1.default(`hccrawler:${className}`);
    Reflect.ownKeys(classType.prototype).forEach(methodName => {
        if (methodName === 'constructor' || !isString_1.default(methodName) || startsWith_1.default(methodName, '_'))
            return;
        const method = Reflect.get(classType.prototype, methodName);
        if (!isFunction_1.default(method))
            return;
        Reflect.set(classType.prototype, methodName, function (...args) {
            const argsText = args.map(stringifyArgument).join(', ');
            debugClass(`${methodName}(${argsText})`);
            return method.call(this, ...args);
        });
    });
    if (classType.Events) {
        const method = Reflect.get(classType.prototype, 'emit');
        Reflect.set(classType.prototype, 'emit', function (event, ...args) {
            const argsText = [JSON.stringify(event)].concat(args.map(stringifyArgument)).join(', ');
            debugClass(`emit(${argsText})`);
            return method.call(this, event, ...args);
        });
    }
}
exports.tracePublicAPI = tracePublicAPI;
/**
 * @param {!Object} arg
 * @return {!string}
 */
function stringifyArgument(arg) {
    return util_1.inspect(arg)
        .split('\n')
        .map(line => trim_1.default(line))
        .join(' ');
}
exports.stringifyArgument = stringifyArgument;
function debugConsole(msg) {
    _debugConsole(msg);
}
exports.debugConsole = debugConsole;
function debugDialog(msg) {
    _debugDialog(msg);
}
exports.debugDialog = debugDialog;
//# sourceMappingURL=helper.js.map