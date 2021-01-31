export = BaseCache;
/**
 * @interface
 */
declare class BaseCache {
    /**
     * @param {!Object=} settings
     */
    constructor(settings?: Object | undefined);
    _settings: Object;
    /**
     * @return {!Promise}
     */
    init(): Promise<any>;
    /**
     * @return {!Promise}
     */
    close(): Promise<any>;
    /**
     * @return {!Promise}
     */
    clear(): Promise<any>;
    /**
     * @param {!string} key
     * @return {!Promise}
     */
    get(key: string): Promise<any>;
    /**
     * @param {!string} key
     * @param {!string} value
     * @return {!Promise}
     */
    set(key: string, value: string): Promise<any>;
    /**
     * @param {!string} key
     * @param {!string} value
     * @param {!number=} priority
     * @return {!Promise}
     */
    enqueue(key: string, value: string, priority?: number | undefined): Promise<any>;
    /**
     * @param {!string} key
     * @return {!Promise}
     */
    dequeue(key: string): Promise<any>;
    /**
     * @param {!string} key
     * @return {!Promise<!number>}
     */
    size(key: string): Promise<number>;
    /**
     * @param {!string} key
     * @return {!Promise}
     */
    remove(key: string): Promise<any>;
}
