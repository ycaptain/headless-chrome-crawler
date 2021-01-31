"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Puppeteer = void 0;
// @ts-nocheck
const events_1 = __importDefault(require("events"));
const url_1 = require("url");
const pick_1 = __importDefault(require("lodash/pick"));
const omit_1 = __importDefault(require("lodash/omit"));
const extend_1 = __importDefault(require("lodash/extend"));
const map_1 = __importDefault(require("lodash/map"));
const each_1 = __importDefault(require("lodash/each"));
const includes_1 = __importDefault(require("lodash/includes"));
const isString_1 = __importDefault(require("lodash/isString"));
const isArray_1 = __importDefault(require("lodash/isArray"));
const request_promise_1 = __importDefault(require("request-promise"));
const robots_parser_1 = __importDefault(require("robots-parser"));
const puppeteer_extra_1 = __importDefault(require("puppeteer-extra"));
exports.Puppeteer = puppeteer_extra_1.default;
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const DeviceDescriptors_1 = __importDefault(require("puppeteer/DeviceDescriptors"));
const helper_1 = require("./helper");
const priority_queue_1 = __importDefault(require("./priority-queue"));
const crawler_1 = __importDefault(require("./crawler"));
const session_1 = __importDefault(require("../cache/session"));
puppeteer_extra_1.default.use(puppeteer_extra_plugin_stealth_1.default());
const CONNECT_OPTIONS = [
    'browserWSEndpoint',
    'ignoreHTTPSErrors',
    'slowMo',
];
const LAUNCH_OPTIONS = [
    'ignoreHTTPSErrors',
    'headless',
    'executablePath',
    'slowMo',
    'args',
    'ignoreDefaultArgs',
    'handleSIGINT',
    'handleSIGTERM',
    'handleSIGHUP',
    'dumpio',
    'userDataDir',
    'env',
    'devtools',
];
const CONSTRUCTOR_OPTIONS = CONNECT_OPTIONS.concat(LAUNCH_OPTIONS).concat([
    'maxConcurrency',
    'maxRequest',
    'cache',
    'exporter',
    'persistCache',
    'preRequest',
    'onSuccess',
    'onError',
    'customizeCrawl',
]);
const EMPTY_TXT = '';
const deviceNames = Object.keys(DeviceDescriptors_1.default);
class HCCrawler extends events_1.default {
    /**
     * @param {!Object=} options
     * @return {!Promise<!HCCrawler>}
     */
    static async connect(options) {
        const browser = await puppeteer_extra_1.default.connect(pick_1.default(options, CONNECT_OPTIONS));
        const crawler = new HCCrawler(browser, omit_1.default(options, CONNECT_OPTIONS));
        await crawler.init();
        return crawler;
    }
    /**
     * @param {!Object=} options
     * @return {!Promise<!HCCrawler>}
     */
    static async launch(options) {
        const browser = await puppeteer_extra_1.default.launch(pick_1.default(options, LAUNCH_OPTIONS));
        const crawler = new HCCrawler(browser, omit_1.default(options, LAUNCH_OPTIONS));
        await crawler.init();
        return crawler;
    }
    /**
     * @return {!string}
     */
    static executablePath() {
        return puppeteer_extra_1.default.executablePath();
    }
    /**
     * @return {!Array<!string>}
     */
    static defaultArgs() {
        return puppeteer_extra_1.default.defaultArgs();
    }
    /**
     * @param {!Puppeteer.Browser} browser
     * @param {!Object} options
     */
    constructor(browser, options) {
        super();
        this._browser = browser;
        this._options = extend_1.default({
            maxDepth: 1,
            maxConcurrency: 10,
            maxRequest: 0,
            priority: 0,
            delay: 0,
            retryCount: 3,
            retryDelay: 10000,
            timeout: 30000,
            jQuery: true,
            browserCache: true,
            persistCache: false,
            skipDuplicates: true,
            depthPriority: true,
            obeyRobotsTxt: true,
            followSitemapXml: false,
            skipRequestedRedirect: false,
            cookies: null,
            screenshot: null,
            viewport: null,
        }, options);
        this._cache = options.cache || new session_1.default();
        this._queue = new priority_queue_1.default({
            maxConcurrency: this._options.maxConcurrency,
            cache: this._cache,
        });
        this._exporter = options.exporter || null;
        this._requestedCount = 0;
        this._preRequest = options.preRequest || null;
        this._onSuccess = options.onSuccess || null;
        this._onError = options.onError || null;
        this._customCrawl = options.customCrawl || null;
        this._exportHeader();
        this._queue.on('pull', (_options, depth, previousUrl) => this._startRequest(_options, depth, previousUrl));
        this._browser.on('disconnected', () => void this.emit(HCCrawler.Events.Disconnected));
    }
    /**
     * @return {!Promise}
     */
    async init() {
        await this._cache.init();
        this._queue.init();
    }
    /**
     * @param {?Object|?Array<!string>|?string} options
     * @return {!Promise}
     */
    async queue(options) {
        await Promise.all(map_1.default(isArray_1.default(options) ? options : [options], async (_options) => {
            const queueOptions = isString_1.default(_options) ? { url: _options } : _options;
            each_1.default(CONSTRUCTOR_OPTIONS, option => {
                if (queueOptions && queueOptions[option])
                    throw new Error(`Overriding ${option} is not allowed!`);
            });
            const mergedOptions = extend_1.default({}, this._options, queueOptions);
            if (mergedOptions.evaluatePage)
                mergedOptions.evaluatePage = `(${mergedOptions.evaluatePage})()`;
            if (!mergedOptions.url)
                throw new Error('Url must be defined!');
            if (mergedOptions.device && !includes_1.default(deviceNames, mergedOptions.device))
                throw new Error('Specified device is not supported!');
            if (mergedOptions.delay > 0 && mergedOptions.maxConcurrency !== 1)
                throw new Error('Max concurrency must be 1 when delay is set!');
            mergedOptions.url = url_1.parse(mergedOptions.url).href;
            await this._push(omit_1.default(mergedOptions, CONSTRUCTOR_OPTIONS), 1, null);
        }));
    }
    /**
     * @return {!Promise}
     */
    async close() {
        this._queue.end();
        await this._browser.close();
        await this._endExporter();
        await this._clearCacheOnEnd();
        await this._closeCache();
    }
    /**
     * @return {!Promise}
     */
    async disconnect() {
        this._queue.end();
        await this._browser.disconnect();
        await this._endExporter();
        await this._clearCacheOnEnd();
        await this._closeCache();
    }
    /**
     * @return {!Promise<!string>}
     */
    version() {
        return this._browser.version();
    }
    /**
     * @return {!Promise<!string>}
     */
    userAgent() {
        return this._browser.userAgent();
    }
    /**
     * @return {!string}
     */
    wsEndpoint() {
        return this._browser.wsEndpoint();
    }
    /**
     * @return {!Promise}
     */
    async onIdle() {
        await this._queue.onIdle();
    }
    /**
     * @param {!number} maxRequest
     */
    setMaxRequest(maxRequest) {
        this._options.maxRequest = maxRequest;
    }
    pause() {
        this._queue.pause();
    }
    resume() {
        this._queue.resume();
    }
    /**
     * @return {!Promise}
     */
    async clearCache() {
        await this._cache.clear();
    }
    /**
     * @return {!boolean}
     */
    isPaused() {
        return this._queue.isPaused();
    }
    /**
     * @return {!Promise<!number>}
     */
    queueSize() {
        return this._queue.size();
    }
    /**
     * @return {!number}
     */
    pendingQueueSize() {
        return this._queue.pending();
    }
    /**
     * @return {!number}
     */
    requestedCount() {
        return this._requestedCount;
    }
    /**
     * @param {!Object} options
     * @param {!number} depth
     * @param {string} previousUrl
     * @return {!Promise}
     */
    async _push(options, depth, previousUrl) {
        let { priority } = options;
        if (!priority && options.depthPriority)
            priority = depth;
        await this._queue.push(options, depth, previousUrl, priority);
    }
    /**
     * @param {!Object} options
     * @param {!number} depth
     * @param {string} previousUrl
     * @return {!Promise}
     * @private
     */
    async _startRequest(options, depth, previousUrl) {
        const skip = await this._skipRequest(options);
        if (skip) {
            this.emit(HCCrawler.Events.RequestSkipped, options);
            await this._markRequested(options);
            return;
        }
        const allowed = await this._checkAllowedRobots(options, depth, previousUrl);
        if (!allowed) {
            this.emit(HCCrawler.Events.RequestDisallowed, options);
            await this._markRequested(options);
            return;
        }
        await this._followSitemap(options, depth, previousUrl);
        const links = await this._request(options, depth, previousUrl);
        this._checkRequestCount();
        await this._followLinks(links, options, depth);
        await helper_1.delay(options.delay);
    }
    /**
     * @param {!Object} options
     * @return {!Promise<!boolean>}
     * @private
     */
    async _skipRequest(options) {
        const allowedDomain = this._checkAllowedDomains(options);
        if (!allowedDomain)
            return true;
        const requested = await this._checkRequested(options);
        if (requested)
            return true;
        const shouldRequest = await this._shouldRequest(options);
        if (!shouldRequest)
            return true;
        return false;
    }
    /**
     * @param {!Object} options
     * @param {!number} depth
     * @param {string} previousUrl
     * @param {!number=} retryCount
     * @return {!Promise<!Array<!string>>}
     * @private
     */
    async _request(options, depth, previousUrl, retryCount = 0) {
        this.emit(HCCrawler.Events.RequestStarted, options);
        const crawler = await this._newCrawler(options, depth, previousUrl);
        try {
            const res = await this._crawl(crawler);
            await crawler.close();
            this.emit(HCCrawler.Events.RequestFinished, options);
            const requested = await this._checkRequestedRedirect(options, res.response);
            await this._markRequested(options);
            await this._markRequestedRedirects(options, res.redirectChain, res.response);
            if (requested)
                return [];
            this._exportLine(res);
            await this._success(res);
            return res.links;
        }
        catch (error) {
            await crawler.close();
            extend_1.default(error, { options, depth, previousUrl });
            if (retryCount >= options.retryCount) {
                this.emit(HCCrawler.Events.RequestFailed, error);
                await this._error(error);
                return [];
            }
            this.emit(HCCrawler.Events.RequestRetried, options);
            await helper_1.delay(options.retryDelay);
            return this._request(options, depth, previousUrl, retryCount + 1);
        }
    }
    /**
     * @param {!Object} options
     * @param {!number} depth
     * @param {string} previousUrl
     * @return {!Promise<!boolean>}
     * @private
     */
    async _checkAllowedRobots(options, depth, previousUrl) {
        if (!options.obeyRobotsTxt)
            return true;
        const robot = await this._getRobot(options, depth, previousUrl);
        const userAgent = await this._getUserAgent(options);
        return robot.isAllowed(options.url, userAgent);
    }
    /**
     * @param {!Object} options
     * @param {!number} depth
     * @param {string} previousUrl
     * @return {!Promise}
     * @private
     */
    async _followSitemap(options, depth, previousUrl) {
        if (!options.followSitemapXml)
            return;
        const robot = await this._getRobot(options, depth, previousUrl);
        const sitemapUrls = robot.getSitemaps();
        await Promise.resolve(map_1.default(sitemapUrls, async (sitemapUrl) => {
            const sitemapXml = await this._getSitemapXml(sitemapUrl, options, depth, previousUrl);
            const urls = helper_1.getSitemapUrls(sitemapXml);
            await Promise.all(map_1.default(urls, async (url) => {
                await this._push(extend_1.default({}, options, { url }), depth, options.url);
            }));
        }));
    }
    /**
     * @param {!string} sitemapUrl
     * @param {!Object} options
     * @param {!number} depth
     * @param {string} previousUrl
     * @return {!Promise<!string>}
     */
    async _getSitemapXml(sitemapUrl, options, depth, previousUrl) {
        let sitemapXml = await this._cache.get(sitemapUrl);
        if (!sitemapXml) {
            try {
                sitemapXml = await request_promise_1.default(sitemapUrl);
            }
            catch (error) {
                extend_1.default(error, { options, depth, previousUrl });
                this.emit(HCCrawler.Events.SitemapXmlRequestFailed, error);
                sitemapXml = EMPTY_TXT;
            }
            finally {
                await this._cache.set(sitemapUrl, '1');
            }
        }
        return sitemapXml;
    }
    /**
     * @param {!Object} options
     * @param {!number} depth
     * @param {string} previousUrl
     * @return {!Promise}
     * @private
     */
    async _getRobot(options, depth, previousUrl) {
        const robotsUrl = helper_1.getRobotsUrl(options.url);
        let robotsTxt = await this._cache.get(robotsUrl);
        if (!robotsTxt) {
            try {
                robotsTxt = await request_promise_1.default(robotsUrl);
            }
            catch (error) {
                extend_1.default(error, { options, depth, previousUrl });
                this.emit(HCCrawler.Events.RobotsTxtRequestFailed, error);
                robotsTxt = EMPTY_TXT;
            }
            finally {
                await this._cache.set(robotsUrl, robotsTxt);
            }
        }
        return robots_parser_1.default(robotsUrl, robotsTxt);
    }
    /**
     * @param {!Object} options
     * @return {!Promise<!string>}
     * @private
     */
    async _getUserAgent(options) {
        if (options.userAgent)
            return options.userAgent;
        if (DeviceDescriptors_1.default[options.device])
            return DeviceDescriptors_1.default[options.device].userAgent;
        return this.userAgent();
    }
    /**
     * @param {!Object} options
     * @return {!boolean}
     * @private
     */
    _checkAllowedDomains(options) {
        const { hostname } = url_1.parse(options.url);
        if (options.deniedDomains && helper_1.checkDomainMatch(options.deniedDomains, hostname))
            return false;
        if (options.allowedDomains && !helper_1.checkDomainMatch(options.allowedDomains, hostname))
            return false;
        return true;
    }
    /**
     * @param {!Object} options
     * @return {!Promise<!boolean>}
     * @private
     */
    async _checkRequested(options) {
        if (!options.skipDuplicates)
            return false;
        const key = helper_1.generateKey(options);
        const value = await this._cache.get(key);
        return !!value;
    }
    /**
     * @param {!Object} options
     * @param {!Object} response
     * @return {!Promise<!boolean>}
     * @private
     */
    async _checkRequestedRedirect(options, response) {
        if (!options.skipRequestedRedirect)
            return false;
        const requested = await this._checkRequested(extend_1.default({}, options, { url: response.url }));
        return requested;
    }
    /**
     * @param {!Object} options
     * @return {!Promise}
     * @private
     */
    async _markRequested(options) {
        if (!options.skipDuplicates)
            return;
        const key = helper_1.generateKey(options);
        await this._cache.set(key, '1');
    }
    /**
     * @param {!Object} options
     * @param {!Array<!Object>} redirectChain
     * @param {!Object} response
     * @return {!Promise}
     * @private
     */
    async _markRequestedRedirects(options, redirectChain, response) {
        if (!options.skipRequestedRedirect)
            return;
        await Promise.all(map_1.default(redirectChain, async (request) => {
            await this._markRequested(extend_1.default({}, options, { url: request.url }));
        }));
        await this._markRequested(extend_1.default({}, options, { url: response.url }));
    }
    /**
     * @param {!Object} options
     * @return {!Promise<?boolean>}
     * @private
     */
    async _shouldRequest(options) {
        if (!this._preRequest)
            return true;
        return this._preRequest(options);
    }
    /**
     * @param {!Object} result
     * @return {!Promise}
     * @private
     */
    async _success(result) {
        if (!this._onSuccess)
            return;
        await this._onSuccess(result);
    }
    /**
     * @param {!Error} error
     * @return {!Promise}
     * @private
     */
    async _error(error) {
        if (!this._onError)
            return;
        await this._onError(error);
    }
    /**
     * @param {!Object} options
     * @return {!Promise<!Crawler>}
     * @param {!number} depth
     * @param {string} previousUrl
     * @private
     */
    async _newCrawler(options, depth, previousUrl) {
        const page = await this._browser.newPage();
        return new crawler_1.default(page, options, depth, previousUrl);
    }
    /**
     * @param {!Crawler} crawler
     * @return {!Promise<!Object>}
     */
    async _crawl(crawler) {
        if (!this._customCrawl)
            return crawler.crawl();
        const crawl = () => crawler.crawl.call(crawler);
        return this._customCrawl(crawler.page(), crawl);
    }
    /**
     * @param {!Array<!string>} urls
     * @param {!Object} options
     * @param {!number} depth
     * @return {!Promise}
     * @private
     */
    async _followLinks(urls, options, depth) {
        if (depth >= options.maxDepth) {
            this.emit(HCCrawler.Events.MaxDepthReached);
            return;
        }
        await Promise.all(map_1.default(urls, async (url) => {
            const _options = extend_1.default({}, options, { url });
            const skip = await this._skipRequest(_options);
            if (skip)
                return;
            await this._push(_options, depth + 1, options.url);
        }));
    }
    /**
     * @private
     */
    _checkRequestCount() {
        this._requestedCount += 1;
        if (this._options.maxRequest && this._requestedCount >= this._options.maxRequest) {
            this.emit(HCCrawler.Events.MaxRequestReached);
            this.pause();
        }
    }
    /**
     * @private
     */
    _exportHeader() {
        if (!this._exporter)
            return;
        this._exporter.writeHeader();
    }
    /**
     * @param {!Object} res
     * @private
     */
    _exportLine(res) {
        if (!this._exporter)
            return;
        this._exporter.writeLine(res);
    }
    /**
     * @return {!Promise}
     * @private
     */
    async _endExporter() {
        if (!this._exporter)
            return;
        await new Promise((resolve, reject) => {
            this._exporter.onEnd().then(resolve).catch(reject);
            this._exporter.writeFooter();
            this._exporter.end();
        });
    }
    /**
     * @return {!Promise}
     * @private
     */
    async _clearCacheOnEnd() {
        if (this._options.persistCache)
            return;
        await this.clearCache();
    }
    /**
     * @return {!Promise}
     * @private
     */
    async _closeCache() {
        await this._cache.close();
    }
}
HCCrawler.Events = {
    RequestStarted: 'requeststarted',
    RequestSkipped: 'requestskipped',
    RequestDisallowed: 'requestdisallowed',
    RequestFinished: 'requestfinished',
    RequestRetried: 'requestretried',
    RequestFailed: 'requestfailed',
    RobotsTxtRequestFailed: 'robotstxtrequestfailed',
    SitemapXmlRequestFailed: 'sitemapxmlrequestfailed',
    MaxDepthReached: 'maxdepthreached',
    MaxRequestReached: 'maxrequestreached',
    Disconnected: 'disconnected',
};
helper_1.tracePublicAPI(HCCrawler);
// module.exports = HCCrawler;
exports.default = HCCrawler;
//# sourceMappingURL=hccrawler.js.map