export = RedisCache;
/**
 * @implements {BaseCache}
 */
declare class RedisCache extends BaseCache implements BaseCache {
    constructor(settings?: Object);
    _client: any;
}
import BaseCache = require("./base");
