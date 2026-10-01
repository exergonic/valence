/**
 * The vendored emscripten glue (vendor/occ-wasm/occjs.js) is plain ES module
 * JavaScript with no types. Its default export is the module factory.
 *
 * The wasm and data files are NOT bundled: they are served from
 * public/occ-wasm/ and located at runtime through the `locateFile` option.
 */
declare const createOccModule: (options?: {
  locateFile?: (path: string) => string;
  [key: string]: unknown;
}) => Promise<any>;

export default createOccModule;
