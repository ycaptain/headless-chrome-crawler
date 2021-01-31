/// <reference types="node" />
export = BaseExporter;
/**
 * @interface
 */
declare class BaseExporter {
    /**
     * @param {!Object=} settings
     */
    constructor(settings?: Object | undefined);
    _settings: {
        encoding: string;
    } & Object;
    _stream: import("fs").WriteStream;
    end(): void;
    /**
     * @return {!Promise}
     */
    onEnd(): Promise<any>;
    /**
     * @param {!Object} result
     */
    writeLine(): void;
    writeHeader(): void;
    writeFooter(): void;
}
