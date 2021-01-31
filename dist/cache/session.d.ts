export = SessionCache;
/**
 * @implements {BaseCache}
 */
declare class SessionCache extends BaseCache implements BaseCache {
    constructor(settings?: Object);
    _storage: Map<any, any>;
}
import BaseCache = require("./base");
